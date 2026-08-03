import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getTournamentById,
  getEntries as getEntriesApi,
  saveEntries,
  deleteEntryRow,
  createEntryRowsBulk,
} from "../api";

import * as XLSX from 'xlsx';
import { FaPlusCircle, FaShareAlt, FaInbox } from 'react-icons/fa';

import EntryHeader from '../components/Entry/EntryHeader';
import EntryTable from '../components/Entry/EntryTable';
import ExceededPlayers from '../components/Entry/ExceededPlayers';
import ImportModal from '../components/Entry/ImportModal';
import ImageImport from '../components/import/ImageImport';
import AddTeamEntriesModal from '../components/Team/AddTeamEntriesModal';
import useEntrySync from '../hooks/useEntrySync';
import toast, { Toaster } from "react-hot-toast";
import {
  buildMedalCategoryKey,
  hasCompleteMedalCategory,
  MEDAL_CATEGORY_FIELDS,
  reconcileCompletedCategoryMedals,
} from "../utils/entrySyncUtils";

import { baseColumnsDef, optionalColumnsDef } from '../components/Entry/constants';

import styles from './Entry.module.css';

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

const ENABLE_IMAGE_IMPORT = false;
const ENTRY_SYNC_V2_ENABLED =
  import.meta.env.VITE_ENABLE_ENTRY_SYNC_V2 !== "false";

const resolveApiBaseUrl = () => {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim()
      : '';

  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    const host = window.location.hostname || '';
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (origin && !isLocal) return origin.replace(/\/+$/, '');
  }

  return 'http://localhost:5000';
};

const getTextWidth = (text = '', font = '16px "Helvetica Neue", Arial, sans-serif') => {
  if (typeof document === 'undefined') return 100;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 100;
  context.font = font;
  const metrics = context.measureText(text);
  return Math.ceil(metrics.width) + 20;
};

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const createEmptyEntryState = () => ({
  sorting: [],
  filters: {},
  columnWidths: [],
  searchTerm: '',
});

const extractEntryRows = (payload) => {
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload)) return payload;
  return [];
};

const createEntryId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const ensureEntryId = (row = {}) => ({
  ...row,
  entryId: String(row.entryId || "").trim() || createEntryId(),
});
 
const normalizeEntryCategoryValue = (value = "", fieldId = "") => {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[–—−]/g, "-")
    .trim();

  if (!raw) return "";

  let normalized = raw
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .trim();

  if (fieldId === "ageCategory") {
    normalized = normalized.replace(/^under\s*-?\s*(\d+)$/i, "Under - $1");
    normalized = normalized.replace(/^over\s*-?\s*(\d+)$/i, "Over - $1");

    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\s-\s/g, " - ")
      .trim();
  }

  if (fieldId === "weightCategory") {
    normalized = normalized
      .replace(/^under\s*-?\s*(\d+)\s*kg$/i, "Under - $1 KG")
      .replace(/^over\s*-?\s*(\d+)\s*kg$/i, "Over - $1 KG")
      .replace(/\bkg\b/gi, "KG");

    return normalized
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, " - ")
      .trim();
  }

  if (["event", "subEvent"].includes(fieldId)) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  return normalized;
};

const Entry = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();

  if (!id || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return (
      <div className={styles.invalidId}>
        Invalid Tournament ID
        <small>Please go back to the dashboard and select a tournament again.</small>
      </div>
    );
  }

  const navigate = useNavigate();
  const { token, user, loading: authLoading } = useAuth();
    const outletContext = useOutletContext() || {};
  const access = outletContext.access || outletContext.tournament?.access || {};

  const contextIsAdminUser = outletContext.isAdminUser === true;
  const adminEditMode = outletContext.adminEditMode === true;
  const isArchivedReadOnly = access?.isReadOnly === true;
  const isAdminReadOnly = outletContext.isAdminReadOnly === true;
  const isTournamentReadOnly = isArchivedReadOnly;
  const isPageReadOnly = isAdminReadOnly || isTournamentReadOnly || access?.canEdit === false;
  const requestAdminSaveConfirmation = outletContext.requestAdminSaveConfirmation;
  const setAdminEditMode = outletContext.setAdminEditMode;

  const [data, setData] = useState([]);
  const [tournamentData, setTournamentData] = useState(null);
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(`visibleColumns_${id}`);
    return saved ? JSON.parse(saved) : { fathersName: false, school: false, class: false };
  });
  const [columnWidths, setColumnWidths] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState([]);
  const [filterColumn, setFilterColumn] = useState(null);
  const [filters, setFilters] = useState(() => ({}));
  const [loadError, setLoadError] = useState(null);
  const [entryPage, setEntryPage] = useState(1);
  
const [entryPagination, setEntryPagination] = useState({
  page: 1,
  limit: 500,
  total: 0,
  totalPages: 1,
  hasMore: false,
});
const [isLoadingMoreEntries, setIsLoadingMoreEntries] = useState(false);


const entryTableRef = useRef(null);
const dataRef = useRef(data);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showImageImportModal, setShowImageImportModal] = useState(false);
  const [showAddTeamEntriesModal, setShowAddTeamEntriesModal] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [history, setHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);

    const isOrganizer = user?.role === 'organizer';
  const isAdminUser = contextIsAdminUser || ['admin', 'superadmin'].includes(user?.role);
  const canManageTournament = Boolean(access?.canAccessEntry || isAdminUser || isOrganizer);
  const canEditTournament = Boolean(!isPageReadOnly && (!isAdminUser || adminEditMode));
  const {
    queueUpserts,
    queueDelete,
    flush: flushEntrySync,
    retry: retryEntrySync,
    hydratePendingChanges,
    restoreLocalSnapshot,
    persistSnapshot,
    syncStatus,
    pendingCount,
    isOnline,
    lastError: entrySyncError,
  } = useEntrySync({
    tournamentId: id,
    userId: user?._id || user?.id || "",
    enabled:
      ENTRY_SYNC_V2_ENABLED &&
      Boolean(token && (user?._id || user?.id)) &&
      !isPageReadOnly,
  });

  useEffect(() => {
  const toastId = `entry-sync-${id}`;

  if (!isOnline) {
    toast(
      `Offline — ${pendingCount} change${
        pendingCount === 1 ? "" : "s"
      } pending`,
      {
        id: toastId,
        duration: Infinity,
        icon: "⚠️",
      }
    );

    return;
  }

  if (syncStatus === "saving") {
    toast.loading(
      `Saving ${pendingCount} change${
        pendingCount === 1 ? "" : "s"
      }...`,
      {
        id: toastId,
        duration: Infinity,
      }
    );

    return;
  }

  if (syncStatus === "error") {
    toast.error(
      entrySyncError || "Save failed — retry required",
      {
        id: toastId,
        duration: 6000,
      }
    );

    return;
  }

  if (pendingCount > 0) {
    toast.loading(
      `${pendingCount} change${
        pendingCount === 1 ? "" : "s"
      } pending...`,
      {
        id: toastId,
        duration: Infinity,
      }
    );

    return;
  }

  if (syncStatus === "saved") {
    toast.success("All changes saved", {
      id: toastId,
      duration: 2500,
    });

    return;
  }

  toast.dismiss(toastId);
}, [
  id,
  syncStatus,
  pendingCount,
  isOnline,
  entrySyncError,
]);

  const columnsDef = useMemo(() => {
    const activeOptional = optionalColumnsDef.filter((col) => visibleColumns[col.id]);
    const teamIndex = baseColumnsDef.findIndex((col) => col.id === 'team');
    return [...baseColumnsDef.slice(0, teamIndex + 1), ...activeOptional, ...baseColumnsDef.slice(teamIndex + 1)];
  }, [visibleColumns]);

  const guardAdminReadOnly = useCallback(() => {
    if (isTournamentReadOnly) {
      alert("This tournament is archived and read-only. Editing is no longer allowed.");
      return true;
    }

    if (access?.canEdit === false) {
      alert("Editing is not allowed for this tournament lifecycle.");
      return true;
    }

    if (!isAdminReadOnly) return false;

    alert("Admin read-only mode is active. Click Edit first to make changes.");
    return true;
  }, [isAdminReadOnly, isTournamentReadOnly, access?.canEdit]);

  const confirmAdminSaveIfNeeded = useCallback(() => {
    if (!isAdminUser) return true;

    if (typeof requestAdminSaveConfirmation === 'function') {
      return requestAdminSaveConfirmation();
    }

    return window.confirm('Are you sure, you want to save these changes?');
  }, [isAdminUser, requestAdminSaveConfirmation]);

  const exitAdminEditModeIfNeeded = useCallback(() => {
    if (isAdminUser && typeof setAdminEditMode === 'function') {
      setAdminEditMode(false);
    }
  }, [isAdminUser, setAdminEditMode]);

  const regenerateSrNumbers = useCallback((rows) => {
    return rows.map((row, index) => ({
      ...row,
      sr: (index + 1).toString(),
    }));
  }, []);

  const recalculateColumnWidths = useCallback(() => {
    const newWidths = columnsDef.map((col) => {
      let maxWidth = getTextWidth(col.header || '');
      data.forEach((row) => {
        const val = row[col.id] || '';
        maxWidth = Math.max(maxWidth, getTextWidth(val));
      });
      return Math.max(maxWidth, 100);
    });
    setColumnWidths(newWidths);
  }, [data, columnsDef]);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const response = await getTournamentById(id);
        setTournamentData(response);
        setLoadError(null);
      } catch (error) {
        console.error('Failed to load tournament:', error);
        setLoadError('Failed to load tournament details. Please try again.');
      }
    };
    fetchTournament();
  }, [id]);

  useEffect(() => {
    if (authLoading) return;

    const loadEntries = async () => {
      const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);

      let serverEntries = [];
      let serverState = null;
      let usedSource = 'none';

      if (token && id) {
        try {
const payload = await getEntriesApi(id, {
  page: 1,
  limit: 1000,
});

setEntryPage(1);
setEntryPagination(
  payload.pagination || {
    page: 1,
    limit: 500,
    total: serverEntries.length,
    totalPages: 1,
    hasMore: false,
  }
);

          serverEntries = Array.isArray(payload.entries) ? payload.entries : [];
          serverState = payload.userState && typeof payload.userState === 'object' ? payload.userState : null;
          usedSource = 'server';

          if (isDev) {
            console.log('[Entry.jsx][LOAD] server success', {
              count: serverEntries.length,
              lastUpdated: payload.lastUpdated,
            });
          }
        } catch (err) {
          console.error('[Entry.jsx][LOAD] server fetch failed:', err);
          setLoadError('Failed to load entries from server. Using local backup if available.');
        }
      }

      let localEntries = [];
      let localParsedOk = false;

      if (usedSource !== 'server') {
        const saved = localStorage.getItem(`entryData_${id}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            localEntries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
            localParsedOk = true;
            if (isDev) console.log('[Entry.jsx][LOAD] local fallback found', { count: localEntries.length });
          } catch (err) {
            console.error('[Entry.jsx][LOAD] localStorage parse error:', err);
          }
        }
      }

      let finalEntries = [];
      let finalState = {};

      if (usedSource === 'server') {
        finalEntries = serverEntries;
        finalState = serverState || {};
      } else if (localParsedOk && localEntries.length > 0) {
        finalEntries = localEntries;
      }

      if (ENTRY_SYNC_V2_ENABLED) {
        try {
          if (usedSource !== "server") {
            const snapshot = await restoreLocalSnapshot();
            if (Array.isArray(snapshot?.entries) && snapshot.entries.length > 0) {
              finalEntries = snapshot.entries;
            }
          }
          finalEntries = await hydratePendingChanges(finalEntries);
        } catch (error) {
          console.error("[Entry Sync V2] Local recovery failed:", error);
          setLoadError(
            "Local pending-entry recovery failed. Do not close this page until the issue is resolved."
          );
        }
      }

     let hasServerRows = usedSource === "server" && finalEntries.length > 0;

if (!finalEntries || finalEntries.length === 0) {
  finalEntries = [emptyRow];
  hasServerRows = false;
}

finalEntries = regenerateSrNumbers(
  finalEntries.map((row) => ({
    ...ensureEntryId(row),
    entrySource: hasServerRows ? "server" : row.entrySource || "local",
  }))
);

      React.startTransition(() => {
        setData(finalEntries);

        if (usedSource === 'server' && finalState) {
          setSorting(finalState.sorting || []);
          const stableFilters = finalState.filters ? { ...finalState.filters } : {};
          setFilters(stableFilters);
          setSearchTerm('');
        }
      });

      localStorage.setItem(`entryData_${id}`, JSON.stringify(finalEntries));

      if (isDev) {
        console.log('[Entry.jsx][LOAD] final source:', usedSource, 'finalCount:', finalEntries.length);
      }
    };

    loadEntries();
  }, [
    id,
    token,
    authLoading,
    columnsDef,
    regenerateSrNumbers,
    hydratePendingChanges,
    restoreLocalSnapshot,
  ]);

  
  useEffect(() => {
    dataRef.current = data;
    if (ENTRY_SYNC_V2_ENABLED && data.length > 0) {
      persistSnapshot(data).catch((error) => {
        console.error("[Entry Sync V2] Snapshot persistence failed:", error);
        setLoadError(
          "Local safety backup failed. Keep this page open and retry before continuing."
        );
      });
    }
  }, [data, persistSnapshot]);

  useEffect(() => {
  if (!id || authLoading) return;

  const refreshAfterTieSheetMedals = async () => {
    if (!token || !id) return;

    try {
      const payload = await getEntriesApi(id, {
        page: 1,
        limit: 1000,
        ts: Date.now(),
      });

      const serverEntries = Array.isArray(payload.entries) ? payload.entries : [];

      const finalEntries = regenerateSrNumbers(
        serverEntries.map((row) => ({
          ...ensureEntryId(row),
          entrySource: "server",
        }))
      );

      dataRef.current = finalEntries;
      setData(finalEntries);
      localStorage.setItem(`entryData_${id}`, JSON.stringify(finalEntries));

      setEntryPage(1);
      setEntryPagination(
        payload.pagination || {
          page: 1,
          limit: 500,
          total: finalEntries.length,
          totalPages: 1,
          hasMore: false,
        }
      );

      if (isDev) {
        console.log("[Entry.jsx] refreshed after TieSheet medal sync", {
          count: finalEntries.length,
        });
      }
    } catch (error) {
      console.error("Failed to refresh entries after TieSheet medal sync:", error);
    }
  };

  window.addEventListener(`tiesheetMedalsUpdated_${id}`, refreshAfterTieSheetMedals);

  return () => {
    window.removeEventListener(`tiesheetMedalsUpdated_${id}`, refreshAfterTieSheetMedals);
  };
}, [id, token, authLoading, regenerateSrNumbers]);

  useEffect(() => {
    localStorage.setItem(`entryData_${id}`, JSON.stringify(dataRef.current));
    localStorage.setItem(`visibleColumns_${id}`, JSON.stringify(visibleColumns));
  }, [id, visibleColumns]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = setTimeout(() => setCopyMessage(''), 2200);
    return () => clearTimeout(timer);
  }, [copyMessage]);

  const debouncedRecalculate = useMemo(() => debounce(recalculateColumnWidths, 300), [recalculateColumnWidths]);

  useEffect(() => {
    debouncedRecalculate();
  }, [data, columnsDef, debouncedRecalculate]);

  const saveToHistory = useCallback(() => {
    if (isAdminReadOnly) return;

    setHistory((prev) => {
      const newHistory = [...prev, structuredClone(data)];
      if (newHistory.length > 5) newHistory.shift();
      return newHistory;
    });
    setRedoHistory([]);
  }, [data, isAdminReadOnly]);

  const queueStateTransition = useCallback(
    async (previousRows, nextRows) => {
      if (!ENTRY_SYNC_V2_ENABLED || !token) return;

      const previousById = new Map(
        (previousRows || []).filter((row) => row?.entryId).map((row) => [row.entryId, row])
      );
      const nextById = new Map(
        (nextRows || []).filter((row) => row?.entryId).map((row) => [row.entryId, row])
      );

      const deletedIds = [...previousById.keys()].filter((entryId) => !nextById.has(entryId));
      const changedRows = [...nextById.values()].filter((row) => {
        const previous = previousById.get(row.entryId);
        return !previous || JSON.stringify(previous) !== JSON.stringify(row);
      });

      await Promise.all(deletedIds.map((entryId) => queueDelete(entryId)));
      if (changedRows.length > 0) await queueUpserts(changedRows);
    },
    [token, queueDelete, queueUpserts]
  );

  const undo = useCallback(() => {
    if (guardAdminReadOnly()) return;
    if (history.length === 0) return;
    setRedoHistory((prev) => [...prev, structuredClone(data)]);
    const previous = history[history.length - 1];
    setData(previous);
    queueStateTransition(dataRef.current, previous).catch((error) => {
      console.error("[Entry Sync V2] Failed to queue undo:", error);
      setLoadError("Undo was applied locally but could not be stored in the sync queue.");
    });
    setHistory((prev) => prev.slice(0, -1));
    debouncedRecalculate();
  }, [history, data, debouncedRecalculate, guardAdminReadOnly, queueStateTransition]);

  const redo = useCallback(() => {
    if (guardAdminReadOnly()) return;
    if (redoHistory.length === 0) return;
    setHistory((prev) => [...prev, structuredClone(data)]);
    const next = redoHistory[redoHistory.length - 1];
    setData(next);
    queueStateTransition(dataRef.current, next).catch((error) => {
      console.error("[Entry Sync V2] Failed to queue redo:", error);
      setLoadError("Redo was applied locally but could not be stored in the sync queue.");
    });
    setRedoHistory((prev) => prev.slice(0, -1));
    debouncedRecalculate();
  }, [redoHistory, data, debouncedRecalculate, guardAdminReadOnly, queueStateTransition]);

  const updateData = useCallback(
    (rowIndex, columnId, value) => {
      if (guardAdminReadOnly()) return;

      let finalValue = value;
      const committedUpdates =
        columnId && typeof columnId === "object" ? { ...columnId } : null;

      if (!committedUpdates && columnId === "gender") {
        const v = String(value || "").trim().toLowerCase();
        if (["m", "male"].includes(v)) finalValue = "Male";
        else if (["f", "female"].includes(v)) finalValue = "Female";
      }

      if (!committedUpdates && columnId === "weight") {
        finalValue = String(value || "").replace(/[^0-9.]/g, "");
      }

      if (
        !committedUpdates &&
        ["event", "subEvent", "ageCategory", "weightCategory"].includes(columnId)
      ) {
        finalValue = normalizeEntryCategoryValue(finalValue, columnId);
      }

      saveToHistory();

      const newData = [...dataRef.current];
      const currentRow = ensureEntryId(newData[rowIndex] || {});
      let nextRow = {
        ...currentRow,
        ...(committedUpdates || { [columnId]: finalValue }),
      };

      const changedFields = Object.keys(
        committedUpdates || { [columnId]: finalValue }
      );
      const medalWasCommitted = changedFields.includes("medal");

      if (medalWasCommitted && currentRow.medalSource === "tiesheet") {
        nextRow = {
          ...nextRow,
          medal: currentRow.medal,
          medalSource: "tiesheet",
          medalUpdatedAt: currentRow.medalUpdatedAt,
        };
      } else if (medalWasCommitted) {
        const committedMedal = String(nextRow.medal || "").trim();
        nextRow = {
          ...nextRow,
          medalSource: committedMedal ? "manual" : "",
          medalUpdatedAt: committedMedal ? new Date().toISOString() : null,
        };
      }

      newData[rowIndex] = nextRow;

      const shouldReconcileMedals = changedFields.some(
        (field) => field === "medal" || MEDAL_CATEGORY_FIELDS.includes(field)
      );
      let finalData = newData;
      let autoChangedRows = [];

      if (shouldReconcileMedals) {
        const affectedCategoryKeys = new Set();
        if (hasCompleteMedalCategory(currentRow)) {
          affectedCategoryKeys.add(buildMedalCategoryKey(currentRow));
        }
        if (hasCompleteMedalCategory(nextRow)) {
          affectedCategoryKeys.add(buildMedalCategoryKey(nextRow));
        }

        const reconciliation = reconcileCompletedCategoryMedals(newData, [
          ...affectedCategoryKeys,
        ]);
        finalData = reconciliation.entries;
        autoChangedRows = reconciliation.changedRows;
      }

      dataRef.current = finalData;
      setData(finalData);

      if (ENTRY_SYNC_V2_ENABLED) {
        const primaryRow = finalData[rowIndex] || nextRow;
        const rowsToQueue = new Map([[primaryRow.entryId, primaryRow]]);
        autoChangedRows.forEach((row) => rowsToQueue.set(row.entryId, row));

        const queuedRows = [...rowsToQueue.values()].map((row) => {
          const index = finalData.findIndex(
            (candidate) => candidate.entryId === row.entryId
          );
          return {
            ...row,
            srNo: index >= 0 ? index + 1 : rowIndex + 1,
            entrySource:
              row.entrySource === "import"
                ? "import"
                : row.entrySource === "teamSubmission"
                  ? "teamSubmission"
                  : "manual",
          };
        });

        queueUpserts(queuedRows).catch((error) => {
          console.error("[Entry Sync V2] Failed to queue row update:", error);
          setLoadError(
            "This change could not be stored locally. Keep the page open and retry."
          );
        });
      }
    },
    [saveToHistory, guardAdminReadOnly, queueUpserts]
  );

  const handleSearchChange = useCallback((value) => {
    // Filtering changes TanStack's visible row indexes. Keeping an old
    // row-index based editing cell makes the matching result receive focus.
    setEditingCell(null);
    setSearchTerm(value);
  }, []);

  const addNewRow = useCallback(() => {
    if (guardAdminReadOnly()) return;

    saveToHistory();
    const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);
    setData((prev) => regenerateSrNumbers([...prev, emptyRow]));
  }, [columnsDef, saveToHistory, regenerateSrNumbers, guardAdminReadOnly]);

  const addRowBelow = useCallback(
    (index) => {
      if (guardAdminReadOnly()) return;

      saveToHistory();
      const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);
      setData((prev) => {
        const newData = [...prev.slice(0, index + 1), emptyRow, ...prev.slice(index + 1)];
        return regenerateSrNumbers(newData);
      });
    },
    [columnsDef, saveToHistory, regenerateSrNumbers, guardAdminReadOnly]
  );

  const deleteRow = useCallback(
    (index) => {
      if (guardAdminReadOnly()) return;

      saveToHistory();

      const rowToDelete = dataRef.current?.[index];

if (token && rowToDelete?.entryId) {
  if (ENTRY_SYNC_V2_ENABLED) {
    queueDelete(rowToDelete.entryId).catch((error) => {
      console.error("[Entry Sync V2] Failed to queue delete:", error);
      setLoadError("Row deletion could not be stored locally.");
    });
  } else {
    deleteEntryRow(id, rowToDelete.entryId).catch((error) => {
      console.error("Entry row DELETE failed:", error);
    });
  }
}

      setData((prev) => {
        if (prev.length === 1) {
          const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);
          return regenerateSrNumbers([emptyRow]);
        }
        const newData = prev.filter((_, i) => i !== index);
        return regenerateSrNumbers(newData);
      });
    },
    [saveToHistory, columnsDef, regenerateSrNumbers, guardAdminReadOnly, token, id, queueDelete]
  );

  const updateColumnWidth = useCallback((colIndex, value) => {
    if (isAdminReadOnly) return;

    setColumnWidths((prev) => {
      const currentWidth = prev[colIndex] || 120;
      const textWidth = getTextWidth(value || '') + 10;
      const minWidth = 100;

      if (Math.abs(textWidth - currentWidth) > 20) {
        const newWidth = Math.max(minWidth, textWidth);
        if (newWidth !== currentWidth) {
          const newWidths = [...prev];
          newWidths[colIndex] = newWidth;
          return newWidths;
        }
      }
      return prev;
    });
  }, [isAdminReadOnly]);

  const handleToggleColumn = useCallback(
    (columnId) => {
      if (guardAdminReadOnly()) return;

      setVisibleColumns((prev) => {
        const newVisible = { ...prev, [columnId]: !prev[columnId] };
        localStorage.setItem(`visibleColumns_${id}`, JSON.stringify(newVisible));
        return newVisible;
      });
    },
    [id, guardAdminReadOnly]
  );

const handleClearAll = useCallback(async () => {
  if (guardAdminReadOnly()) return;

  const confirmed = window.confirm(
    "Are you sure you want to delete ALL entries? This cannot be undone."
  );

  if (!confirmed) return;

  if (isAdminUser && !confirmAdminSaveIfNeeded()) {
    return;
  }

  saveToHistory();

  const emptyRow = ensureEntryId(
    Object.fromEntries(
      columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""])
    )
  );

  try {
    if (token && id && ENTRY_SYNC_V2_ENABLED) {
      await Promise.all(
        dataRef.current
          .filter((row) => row?.entryId)
          .map((row) => queueDelete(row.entryId))
      );
      await flushEntrySync();
    } else if (token && id) {
      await saveEntries(id, {
        entries: [],
        userState: createEmptyEntryState(),
        isFullSnapshot: true,
      });

      window.dispatchEvent(new Event(`entryDataUpdated_${id}`));
    }

    localStorage.removeItem(`entryData_${id}`);

const finalRows = regenerateSrNumbers([emptyRow]);

localStorage.setItem(`entryData_${id}`, JSON.stringify(finalRows));
setData(finalRows);
    setSorting([]);
    setFilters({});
    setSearchTerm("");

    exitAdminEditModeIfNeeded();
  } catch (error) {
    console.error("Clear all entries failed:", error);
    alert("Failed to clear entries from server. Please try again.");
  }
}, [
  id,
  token,
  columnsDef,
  saveToHistory,
  regenerateSrNumbers,
  guardAdminReadOnly,
  isAdminUser,
  confirmAdminSaveIfNeeded,
  exitAdminEditModeIfNeeded,
  queueDelete,
  flushEntrySync,
]);

const handleCleanEmptyRows = useCallback(() => {
  if (guardAdminReadOnly()) return;

  saveToHistory();

  const previousRows = dataRef.current;
  const ignoredKeys = new Set([
    "sr",
    "actions",
    "entryId",
    "entrySource",
    "sourceSubmissionId",
    "sourcePlayerId",
    "_id",
    "__v",
  ]);
  const filtered = previousRows.filter((row) =>
    Object.entries(row || {}).some(([key, value]) => {
      if (ignoredKeys.has(key)) return false;
      return typeof value === "string"
        ? value.trim() !== ""
        : value !== null && value !== undefined;
    })
  );
  const final = regenerateSrNumbers(
    filtered.length > 0
      ? filtered
      : [ensureEntryId(Object.fromEntries(columnsDef.map((col) => [col.id, ""])))]
  );
  setData(final);
  queueStateTransition(previousRows, final).catch((error) => {
    console.error("[Entry Sync V2] Failed to queue empty-row cleanup:", error);
    setLoadError("Rows were cleaned locally but the deletions were not persisted.");
  });
}, [
  columnsDef,
  saveToHistory,
  regenerateSrNumbers,
  guardAdminReadOnly,
  queueStateTransition,
]);

  const handleFileUpload = useCallback((e) => {
    if (guardAdminReadOnly()) return;

    const file = e.target?.files?.[0];
    if (!file) return;

    setShowImportModal(true);
    setSelectedImportFile(file);
  }, [guardAdminReadOnly]);

  const handleImportedRows = useCallback(
    (importedRows) => {
      if (guardAdminReadOnly()) return;

      saveToHistory();

      const cleanedRows = importedRows.map((row) => {
        const cleaned = { ...row };

        if (cleaned.name) cleaned.name = String(cleaned.name).trim().toUpperCase();
        if (cleaned.team) cleaned.team = String(cleaned.team).trim().toUpperCase();

        const titleCaseFields = ['coach', 'manager'];
const categoryFields = ['event', 'subEvent', 'ageCategory', 'weightCategory'];

        if (cleaned.medal) {
          const medalValue = String(cleaned.medal).trim().toLowerCase();

          if (medalValue === 'g' || medalValue === 'gold') cleaned.medal = 'Gold';
          else if (medalValue === 's' || medalValue === 'silver') cleaned.medal = 'Silver';
          else if (medalValue === 'b' || medalValue === 'bronze') cleaned.medal = 'Bronze';
          else if (medalValue === 'x' || medalValue === 'x-x-x-x' || medalValue === 'xxxx') {
            cleaned.medal = 'X-X-X-X';
          } else {
            cleaned.medal = '';
          }
        }

      titleCaseFields.forEach((field) => {
  if (cleaned[field]) {
    cleaned[field] = String(cleaned[field])
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
  }
});

categoryFields.forEach((field) => {
  if (cleaned[field]) {
    cleaned[field] = normalizeEntryCategoryValue(cleaned[field], field);
  }
});

        if (cleaned.gender) {
          const g = String(cleaned.gender).trim().toLowerCase();
          cleaned.gender = ['male', 'boy', 'boys', 'm'].includes(g)
            ? 'Male'
            : ['female', 'girl', 'girls', 'f'].includes(g)
              ? 'Female'
              : '';
        }

        if (cleaned.weight) {
          cleaned.weight = String(cleaned.weight).trim().replace(/[^0-9.]/g, '') || '';
        }

        return cleaned;
      });

    const numberedRows = cleanedRows.map((row, idx) => ({
  ...ensureEntryId(row),
  entrySource: row.entrySource || "import",
  sr: (data.length + idx + 1).toString(),
}));

      let newData = [...data, ...numberedRows];
      newData = newData.filter((row) =>
        Object.entries(row).some(([key, val]) => key !== 'sr' && key !== 'actions' && val !== '' && val !== undefined && val !== null)
      );

      if (newData.length === 0) {
       const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);
newData = [emptyRow];
      }

      setData(regenerateSrNumbers(newData));
      if (ENTRY_SYNC_V2_ENABLED) {
        queueUpserts(numberedRows).catch((error) => {
          console.error("[Entry Sync V2] Failed to queue imported rows:", error);
          setLoadError("Imported rows could not be stored in the local sync queue.");
        });
      }
      debouncedRecalculate();
      setSelectedImportFile(null);
    },
    [data, columnsDef, saveToHistory, regenerateSrNumbers, debouncedRecalculate, guardAdminReadOnly, queueUpserts]
  );

  const handleCopyShareLink = async () => {
    try {
      const link = `${window.location.origin}/team-entry/${id}`;
      await navigator.clipboard.writeText(link);
      setCopyMessage('Share link copied');
    } catch (error) {
      console.error('Failed to copy share link:', error);
      setCopyMessage('Failed to copy link');
    }
  };

  const handleTeamEntriesSubmit = async (preparedRows) => {
  if (guardAdminReadOnly()) return;

  const cleanRows = Array.isArray(preparedRows)
    ? preparedRows
        .filter((row) =>
          Object.entries(row || {}).some(
            ([key, value]) =>
              key !== "sr" &&
              key !== "actions" &&
              value !== "" &&
              value !== null &&
              value !== undefined
          )
        )
        .map((row, index) => ({
          ...ensureEntryId(row),
          srNo: Number(row.srNo || row.sr || index + 1),
          entrySource: row.entrySource || "manual",
        }))
    : [];

  if (cleanRows.length === 0) {
    throw new Error("No valid player rows to submit.");
  }

  if (isAdminUser && !confirmAdminSaveIfNeeded()) {
    return;
  }

  if (token && ENTRY_SYNC_V2_ENABLED) {
    await queueUpserts(cleanRows);
    setData((prev) =>
      regenerateSrNumbers([...prev.map(ensureEntryId), ...cleanRows])
    );
    await flushEntrySync();
  } else if (token) {
    const response = await createEntryRowsBulk(id, {
      entries: cleanRows,
    });

    const createdRows = Array.isArray(response?.entries)
      ? response.entries.map(ensureEntryId)
      : cleanRows;

    setData((prev) =>
      regenerateSrNumbers([...prev.map(ensureEntryId), ...createdRows])
    );
  } else {
    const mergedEntries = [...dataRef.current.map(ensureEntryId), ...cleanRows].map(
      (row, index) => ({
        ...row,
        sr: String(index + 1),
      })
    );

    localStorage.setItem(`entryData_${id}`, JSON.stringify(mergedEntries));
    setData(regenerateSrNumbers(mergedEntries));
  }

  window.dispatchEvent(new Event(`entryDataUpdated_${id}`));
  setShowAddTeamEntriesModal(false);
  exitAdminEditModeIfNeeded();
};

  const handleLoadMoreEntries = useCallback(async () => {
  if (!token || !id || isLoadingMoreEntries || !entryPagination.hasMore) return;

  try {
    setIsLoadingMoreEntries(true);

    const nextPage = entryPage + 1;

    const payload = await getEntriesApi(id, {
      page: nextPage,
      limit: entryPagination.limit || 500,
    });

    const nextRows = extractEntryRows(payload).map(ensureEntryId);

    setData((prev) =>
      regenerateSrNumbers([...prev, ...nextRows])
    );

    setEntryPage(nextPage);
    setEntryPagination(
      payload.pagination || {
        page: nextPage,
        limit: entryPagination.limit || 500,
        total: dataRef.current.length + nextRows.length,
        totalPages: nextPage,
        hasMore: false,
      }
    );
  } catch (error) {
    console.error("Failed to load more entries:", error);
    setLoadError("Failed to load more entries. Please try again.");
  } finally {
    setIsLoadingMoreEntries(false);
  }
}, [
  token,
  id,
  entryPage,
  entryPagination,
  isLoadingMoreEntries,
  regenerateSrNumbers,
]);

  const handleExport = useCallback(() => {
    try {
      const wb = XLSX.utils.book_new();
      const headers = columnsDef.filter((c) => c.id !== 'actions').map((c) => c.header);
      const rows = data.map((row) =>
        headers.map((h) => {
          const col = columnsDef.find((c) => c.header === h);
          return row[col?.id] || '';
        })
      );
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Entries');
      XLSX.writeFile(wb, `Tournament_${id}_Entries_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export. Please try again.');
    }
  }, [data, id, columnsDef]);

  const handleGenerateTieSheets = useCallback(async () => {
    try {
      const flush = ENTRY_SYNC_V2_ENABLED
        ? flushEntrySync
        : entryTableRef.current?.flushSaveNow;
      if (typeof flush === 'function' && !isAdminReadOnly) {
        if (isDev) console.log('[Entry.jsx] Flushing save before TieSheet navigation...');
        const result = await flush('generate-tiesheets');
        if (result?.ok === false && !result?.persistedLocally) {
          throw result.error || new Error("Pending entry changes could not be saved");
        }
      }
    } catch (err) {
      console.error('[Entry.jsx] Flush save before navigation failed:', err);
    }

    localStorage.setItem(`entryData_${id}`, JSON.stringify(data));
    navigate(`/tournaments/${id}/tie-sheet`, { state: { players: data } });
  }, [data, id, navigate, isAdminReadOnly, flushEntrySync]);

  return (
     <>
    <Toaster
      position="bottom-right"
      reverseOrder={false}
      gutter={12}
      containerStyle={{
        right: 20,
        bottom: 20,
        zIndex: 9999,
      }}
      toastOptions={{
        duration: 2500,
        style: {
          borderRadius: "10px",
          background: "#333",
          color: "#fff",
          padding: "12px 18px",
          fontSize: "14px",
          fontWeight: 600,
          maxWidth: "380px",
        },
        success: {
          style: {
            background: "#15803d",
            color: "#fff",
          },
        },
        error: {
          style: {
            background: "#dc2626",
            color: "#fff",
          },
        },
        loading: {
          style: {
            background: "#2563eb",
            color: "#fff",
          },
        },
      }}
    />

    <div className={styles.entryContainer}>
      {loadError && (
        <div
          style={{
            background: '#ffebee',
            color: '#d32f2f',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        >
          {loadError}
        </div>
      )}

      {isAdminReadOnly && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            color: '#334155',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontWeight: 700,
          }}
        >
          Admin read-only mode is active. Click Edit in the tournament navbar to make changes.
        </div>
      )}

            {isTournamentReadOnly && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            color: "#92400e",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontWeight: 700,
          }}
        >
          This tournament is archived and read-only. You can view, print, and export records, but editing is blocked.
        </div>
      )}

      <EntryHeader
        tournamentData={tournamentData}
        isLoading={isLoading}
        visibleColumns={visibleColumns}
        onAddTeamEntries={() => {
          if (guardAdminReadOnly()) return;
          setShowAddTeamEntriesModal(true);
        }}
        onShareEntryForm={handleCopyShareLink}
        onViewTeamSubmissions={() => navigate(`/tournaments/${id}/team-submissions`)}
        showOrganizerActions={canManageTournament}
        actionsDisabled={isPageReadOnly}
        readOnly={isPageReadOnly}
        onToggleColumn={handleToggleColumn}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        onClearAll={handleClearAll}
        onCleanEmptyRows={handleCleanEmptyRows}
        onUndo={undo}
        onRedo={redo}
        historyLength={history.length}
        redoHistoryLength={redoHistory.length}
        filters={filters}
        setFilters={setFilters}
        filterColumn={filterColumn}
        setFilterColumn={setFilterColumn}
        onImport={handleFileUpload}
        onExport={handleExport}
        onGenerateTieSheets={handleGenerateTieSheets}
        showImportModal={showImportModal}
       
      />

      {copyMessage ? <p className={styles.copyMessage}>{copyMessage}</p> : null}

      {ENABLE_IMAGE_IMPORT && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            margin: '8px 0 14px',
          }}
        >
          <button
            type="button"
            disabled={isPageReadOnly}
            onClick={() => {
              if (guardAdminReadOnly()) return;
              setShowImageImportModal(true);
            }}
            style={{
              background: '#111827',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isPageReadOnly ? 'not-allowed' : 'pointer',
              opacity: isPageReadOnly ? 0.55 : 1,
              boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
            }}
          >
            Import Data From Image
          </button>
        </div>
      )}

      <ExceededPlayers
        filteredData={data}
        tournamentData={tournamentData}
        scrollToRow={(sr) => {
          if (entryTableRef.current) {
            entryTableRef.current.scrollToRow(sr);
          } else {
            navigate(`?highlight=${sr}`, { replace: true });
          }
        }}
      />

      <div className={styles.autofillHints}>
        <div className={styles.hintGrid}>
          <div>
            <strong>Gender:</strong> M → Male, F → Female
          </div>
          <div>
            <strong>Medal:</strong> G → Gold, S → Silver, B → Bronze, X → X-X-X-X
          </div>
          <div>
            <strong>Event:</strong> K → Kyorugi, P → Poomsae
          </div>
          <div>
            <strong>Sub Event (Kyorugi):</strong> K → Kyorugi, F → Fresher, T → Tag Team
          </div>
          <div>
            <strong>Sub Event (Poomsae):</strong> I → Individual, P → Pair, T → Team
          </div>
        </div>
      </div>

      <EntryTable
        ref={entryTableRef}
        data={data}
        tournamentData={tournamentData}
        visibleColumns={visibleColumns}
        editingCell={isPageReadOnly ? null : editingCell}
        setEditingCell={isPageReadOnly ? () => {} : setEditingCell}
        searchTerm={searchTerm}
        setSearchTerm={handleSearchChange}
        sorting={sorting}
        setSorting={setSorting}
        filterColumn={filterColumn}
        setFilterColumn={setFilterColumn}
        filters={filters}
        setFilters={setFilters}
        addNewRow={addNewRow}
        addRowBelow={addRowBelow}
        deleteRow={deleteRow}
        updateData={updateData}
        updateColumnWidth={updateColumnWidth}
        recalculateColumnWidths={debouncedRecalculate}
        columnWidths={columnWidths}
       token={token}
        tournamentId={id}
        apiBaseUrl={resolveApiBaseUrl()}
        readOnly={isPageReadOnly}
        disabled={isPageReadOnly}
        entrySyncEnabled={ENTRY_SYNC_V2_ENABLED}
        flushEntrySync={flushEntrySync}
        syncStatus={syncStatus}
      />

{entryPagination.hasMore && (
  <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
    <button
      type="button"
      onClick={handleLoadMoreEntries}
      disabled={isLoadingMoreEntries}
      style={{
        padding: "10px 18px",
        borderRadius: "8px",
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        fontWeight: 700,
        cursor: isLoadingMoreEntries ? "not-allowed" : "pointer",
      }}
    >
      {isLoadingMoreEntries
        ? "Loading..."
        : `Load More Entries (${data.length}/${entryPagination.total})`}
    </button>
  </div>
)}

      <AddTeamEntriesModal
        show={showAddTeamEntriesModal && !isPageReadOnly}
        onClose={() => setShowAddTeamEntriesModal(false)}
        onSubmit={handleTeamEntriesSubmit}
        tournamentData={tournamentData}
        visibleColumns={visibleColumns}
      />

      <ImportModal
        show={showImportModal && !isPageReadOnly}
        onClose={() => {
          if (isLoading) return;
          setShowImportModal(false);
          setSelectedImportFile(null);
        }}
        onImportSuccess={handleImportedRows}
        tournamentData={tournamentData}
        columnsDef={columnsDef}
        saveToHistory={saveToHistory}
        updateSerialNumbers={(rows) => rows.map((r, i) => ({ ...r, sr: (i + 1).toString() }))}
        recalculateColumnWidths={debouncedRecalculate}
        selectedFile={selectedImportFile}
      />

      {ENABLE_IMAGE_IMPORT && (
        <ImageImport
          show={showImageImportModal && !isPageReadOnly}
          onClose={() => setShowImageImportModal(false)}
          onImportSuccess={handleImportedRows}
          columnsDef={columnsDef}
        />
      )}

      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner}></div>
          <p>Processing...</p>
        </div>
      )}
    </div>
     </>
  );
};

export default Entry;
