import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTournamentById, getEntries as getEntriesApi, saveEntries } from '../api';
import * as XLSX from 'xlsx';
import { FaPlusCircle, FaShareAlt, FaInbox } from 'react-icons/fa';

import EntryHeader from '../components/Entry/EntryHeader';
import EntryTable from '../components/Entry/EntryTable';
import ExceededPlayers from '../components/Entry/ExceededPlayers';
import ImportModal from '../components/Entry/ImportModal';
import ImageImport from '../components/import/ImageImport';
import AddTeamEntriesModal from '../components/Team/AddTeamEntriesModal';

import { baseColumnsDef, optionalColumnsDef } from '../components/Entry/constants';

import styles from './Entry.module.css';

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

const ENABLE_IMAGE_IMPORT = false;

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

  const contextIsAdminUser = outletContext.isAdminUser === true;
  const adminEditMode = outletContext.adminEditMode === true;
  const isAdminReadOnly = outletContext.isAdminReadOnly === true;
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
  const canManageTournament = isOrganizer || isAdminUser;
  const canEditTournament = !isAdminUser || adminEditMode;

  const columnsDef = useMemo(() => {
    const activeOptional = optionalColumnsDef.filter((col) => visibleColumns[col.id]);
    const teamIndex = baseColumnsDef.findIndex((col) => col.id === 'team');
    return [...baseColumnsDef.slice(0, teamIndex + 1), ...activeOptional, ...baseColumnsDef.slice(teamIndex + 1)];
  }, [visibleColumns]);

  const guardAdminReadOnly = useCallback(() => {
    if (!isAdminReadOnly) return false;
    alert('Admin read-only mode is active. Click Edit first to make changes.');
    return true;
  }, [isAdminReadOnly]);

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
          const payload = await getEntriesApi(id);
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

      if (usedSource !== 'server' || serverEntries.length === 0) {
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

      if (!finalEntries || finalEntries.length === 0) {
        finalEntries = [emptyRow];
      }

      finalEntries = regenerateSrNumbers(finalEntries.map(ensureEntryId));

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
  }, [id, token, authLoading, columnsDef, regenerateSrNumbers]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

  const undo = useCallback(() => {
    if (guardAdminReadOnly()) return;
    if (history.length === 0) return;
    setRedoHistory((prev) => [...prev, structuredClone(data)]);
    const previous = history[history.length - 1];
    setData(previous);
    setHistory((prev) => prev.slice(0, -1));
    debouncedRecalculate();
  }, [history, data, debouncedRecalculate, guardAdminReadOnly]);

  const redo = useCallback(() => {
    if (guardAdminReadOnly()) return;
    if (redoHistory.length === 0) return;
    setHistory((prev) => [...prev, structuredClone(data)]);
    const next = redoHistory[redoHistory.length - 1];
    setData(next);
    setRedoHistory((prev) => prev.slice(0, -1));
    debouncedRecalculate();
  }, [redoHistory, data, debouncedRecalculate, guardAdminReadOnly]);

  const updateData = useCallback(
    (rowIndex, columnId, value) => {
      if (guardAdminReadOnly()) return;

      let finalValue = value;

      if (columnId === 'gender') {
        const v = String(value || '').trim().toLowerCase();
        if (['m', 'male'].includes(v)) finalValue = 'Male';
        else if (['f', 'female'].includes(v)) finalValue = 'Female';
      }

      if (columnId === 'weight') {
        finalValue = String(value || '').replace(/[^0-9.]/g, '');
      }

      saveToHistory();
      setData((prev) => {
        const newData = [...prev];
        newData[rowIndex] = { ...newData[rowIndex], [columnId]: finalValue };
        return newData;
      });
    },
    [saveToHistory, guardAdminReadOnly]
  );

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
    [saveToHistory, columnsDef, regenerateSrNumbers, guardAdminReadOnly]
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

  const handleClearAll = useCallback(() => {
    if (guardAdminReadOnly()) return;

    if (window.confirm('Are you sure you want to delete ALL entries? This cannot be undone.')) {
      saveToHistory();
      const emptyRow = ensureEntryId(
  Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
);
      setData(regenerateSrNumbers([emptyRow]));
    }
  }, [columnsDef, saveToHistory, regenerateSrNumbers, guardAdminReadOnly]);

  const handleCleanEmptyRows = useCallback(() => {
    if (guardAdminReadOnly()) return;

    saveToHistory();
    setData((prev) => {
      const filtered = prev.filter((row) =>
        Object.entries(row).some(([key, val]) => key !== 'sr' && key !== 'actions' && val !== '' && val !== undefined && val !== null)
      );
      const final =
        filtered.length > 0
          ? filtered
          : [
    ensureEntryId(
      Object.fromEntries(columnsDef.map((col) => [col.id, col.id === "actions" ? "" : ""]))
    ),
  ];
      return regenerateSrNumbers(final);
    });
  }, [columnsDef, saveToHistory, regenerateSrNumbers, guardAdminReadOnly]);

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

        const titleCaseFields = ['event', 'subEvent', 'ageCategory', 'weightCategory', 'coach', 'manager'];

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
      debouncedRecalculate();
      setSelectedImportFile(null);
    },
    [data, columnsDef, saveToHistory, regenerateSrNumbers, debouncedRecalculate, guardAdminReadOnly]
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
      ? preparedRows.filter((row) =>
          Object.entries(row || {}).some(
            ([key, value]) =>
              key !== 'sr' &&
              key !== 'actions' &&
              value !== '' &&
              value !== null &&
              value !== undefined
          )
        )
      : [];

    if (cleanRows.length === 0) {
      throw new Error('No valid player rows to submit.');
    }

    if (isAdminUser && !confirmAdminSaveIfNeeded()) {
      return;
    }

    let existingEntries = [];
    let existingState = createEmptyEntryState();

    try {
      if (token) {
        const serverPayload = await getEntriesApi(id);
        existingEntries = extractEntryRows(serverPayload);
        existingState =
          serverPayload?.userState && typeof serverPayload.userState === 'object'
            ? serverPayload.userState
            : createEmptyEntryState();
      } else {
        const localRaw = localStorage.getItem(`entryData_${id}`);
        if (localRaw) {
          existingEntries = extractEntryRows(JSON.parse(localRaw));
        }
      }
    } catch (error) {
      console.warn('Could not load latest entries before merge:', error);
      const localRaw = localStorage.getItem(`entryData_${id}`);
      if (localRaw) {
        existingEntries = extractEntryRows(JSON.parse(localRaw));
      }
    }

 const mergedEntries = [...existingEntries.map(ensureEntryId), ...cleanRows.map(ensureEntryId)].map(
  (row, index) => ({
    ...row,
    sr: String(index + 1),
  })
);
    localStorage.setItem(`entryData_${id}`, JSON.stringify(mergedEntries));

    if (token) {
      await saveEntries(id, {
        entries: mergedEntries,
        state: {
          sorting: existingState.sorting || [],
          filters: existingState.filters || {},
          columnWidths: existingState.columnWidths || [],
          searchTerm: existingState.searchTerm || '',
        },
      });
    }

    setData(regenerateSrNumbers(mergedEntries));
    window.dispatchEvent(new Event(`entryDataUpdated_${id}`));
    setShowAddTeamEntriesModal(false);
    exitAdminEditModeIfNeeded();
  };

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
      const flush = entryTableRef.current?.flushSaveNow;
      if (typeof flush === 'function' && !isAdminReadOnly) {
        if (isDev) console.log('[Entry.jsx] Flushing save before TieSheet navigation...');
        await flush('generate-tiesheets');
      }
    } catch (err) {
      console.error('[Entry.jsx] Flush save before navigation failed:', err);
    }

    localStorage.setItem(`entryData_${id}`, JSON.stringify(data));
    navigate(`/tournaments/${id}/tie-sheet`, { state: { players: data } });
  }, [data, id, navigate, isAdminReadOnly]);

  return (
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
        actionsDisabled={isAdminReadOnly}
        readOnly={isAdminReadOnly}
        onToggleColumn={handleToggleColumn}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
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
            disabled={isAdminReadOnly}
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
              cursor: isAdminReadOnly ? 'not-allowed' : 'pointer',
              opacity: isAdminReadOnly ? 0.55 : 1,
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
        editingCell={isAdminReadOnly ? null : editingCell}
        setEditingCell={isAdminReadOnly ? () => {} : setEditingCell}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
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
        readOnly={isAdminReadOnly}
        disabled={isAdminReadOnly}
      />

      <AddTeamEntriesModal
        show={showAddTeamEntriesModal && !isAdminReadOnly}
        onClose={() => setShowAddTeamEntriesModal(false)}
        onSubmit={handleTeamEntriesSubmit}
        tournamentData={tournamentData}
        visibleColumns={visibleColumns}
      />

      <ImportModal
        show={showImportModal && !isAdminReadOnly}
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
          show={showImageImportModal && !isAdminReadOnly}
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
  );
};

export default Entry;