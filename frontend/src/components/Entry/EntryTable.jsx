import React, {
  useMemo,
  useCallback,
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faPlus } from "@fortawesome/free-solid-svg-icons";
import { debounce as lodashDebounce } from "lodash";

import EditableCell from "./EditableCell";
import FilterDropdown from "./FilterDropdown";
import { baseColumnsDef } from "./constants";
import styles from "../../pages/Entry.module.css";

// ✅ Use existing axios instance so Authorization Bearer attaches automatically
import api from "../../api";

const isDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

// Multi-select include filter
const multiSelectIncludeFilter = (row, columnId, filterValue) => {
  if (!filterValue || filterValue.length === 0) return true;
  const cellValue = row.getValue(columnId)?.toString()?.trim() || "";
  return filterValue.includes(cellValue);
};

// Sorting helpers (kept)
const alphanumericSortWithEmpty = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId) || "";
  const b = rowB.getValue(columnId) || "";
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const genderSort = (rowA, rowB, columnId) => {
  const a = (rowA.getValue(columnId) || "").toString().trim().toLowerCase();
  const b = (rowB.getValue(columnId) || "").toString().trim().toLowerCase();
  const order = { male: 1, m: 1, female: 2, f: 2, "": 3 };
  return (order[a] ?? 3) - (order[b] ?? 3);
};

const subEventSort = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId) || "";
  const b = rowB.getValue(columnId) || "";
  const eventA = rowA.getValue("event") || "";
  const eventB = rowB.getValue("event") || "";

  const kyorugiOrder = { Kyorugi: 1, Fresher: 2, "Tag Team": 3, "": 4 };
  const poomsaeOrder = { Individual: 1, Pair: 2, Team: 3, "": 4 };

  if (eventA === eventB) {
    const map = eventA === "Kyorugi" ? kyorugiOrder : poomsaeOrder;
    return (map[a] || 4) - (map[b] || 4);
  }

  return eventA.localeCompare(eventB, undefined, { sensitivity: "base" });
};

const ageCategorySort = (rowA, rowB, columnId) => {
  const order = {
    "Sub-Junior": 1,
    Cadet: 2,
    Junior: 3,
    Senior: 4,
    "Under - 14": 5,
    "Under - 17": 6,
    "Under - 19": 7,
    "Not Eligible": 8,
    "": 9,
  };
  return (order[rowA.getValue(columnId)] || 9) - (order[rowB.getValue(columnId)] || 9);
};

const medalSort = (rowA, rowB, columnId) => {
  const order = { Gold: 1, Silver: 2, Bronze: 3, "X-X-X-X": 4, "": 5 };
  return (order[rowA.getValue(columnId)] || 5) - (order[rowB.getValue(columnId)] || 5);
};

// Stable stringify + small hash (prevents false positives/negatives)
const stableStringify = (obj) => {
  const seen = new WeakSet();
  const sort = (v) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return v;
      seen.add(v);
      if (Array.isArray(v)) return v.map(sort);
      const keys = Object.keys(v).sort();
      const out = {};
      for (const k of keys) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(obj));
};

const djb2Hash = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const EntryTable = forwardRef(
  (
    {
      data = [],
      tournamentData,
      visibleColumns,
      editingCell,
      setEditingCell,
      searchTerm,
      setSearchTerm,
      sorting,
      setSorting,
      filterColumn,
      setFilterColumn,
      filters,
      setFilters,
      addNewRow,
      addRowBelow,
      deleteRow,
      updateData,
      updateColumnWidth,
      recalculateColumnWidths,
      columnWidths = [],
      // token prop optional - NOT required anymore
      token,
      tournamentId,
    },
    ref
  ) => {
    const [saveStatus, setSaveStatus] = useState("idle");
const [jumpHighlightedSr, setJumpHighlightedSr] = useState("");
    const parentRef = useRef(null);

    const debouncedSaveRef = useRef(null);
    const lastSavedHashRef = useRef(null);
    const isSavingRef = useRef(false);
    const mountedRef = useRef(false);

    // Tracks the promise of the most recent save attempt (for safe flushing on navigation)
    const lastSavePromiseRef = useRef(Promise.resolve());

    const latestUiStateRef = useRef({
      sorting,
      filters,
      columnWidths,
      searchTerm,
    });

    useEffect(() => {
      latestUiStateRef.current = { sorting, filters, columnWidths, searchTerm };
    }, [sorting, filters, columnWidths, searchTerm]);

    const buildProcessedEntries = useCallback((rows) => {
      const baseRows = Array.isArray(rows) ? rows : [];
      return baseRows
        .map((entry, index) => ({
          ...entry,
          sr: (index + 1).toString(),
        }))
        .filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          return Object.entries(entry).some(([key, val]) => {
            if (key === "sr" || key === "srNo" || key === "actions") return false;
            return val !== undefined && val !== null && val !== "" && val !== 0;
          });
        });
    }, []);

    const computeSaveHash = useCallback(
      (rows) => {
        const processed = buildProcessedEntries(rows);
        const ui = latestUiStateRef.current;
        const payloadCore = {
          entries: processed,
          state: {
            sorting: ui.sorting || [],
            filters: ui.filters || {},
            columnWidths: ui.columnWidths || [],
            searchTerm: ui.searchTerm || "",
          },
        };
        return djb2Hash(stableStringify(payloadCore));
      },
      [buildProcessedEntries]
    );

    const performSave = useCallback(
      async (rows, reason = "unknown") => {
        const tid = tournamentId || tournamentData?._id;

        if (!tid) {
          if (isDev) console.warn("[EntryTable][SAVE] SKIP: missing tournamentId");
          return { ok: false, skipped: true, reason: "missing-tournamentId" };
        }

        // token prop is OPTIONAL now because api interceptor attaches token automatically.
        if (!token && isDev) {
          console.warn("[EntryTable][SAVE] token prop missing (OK) - using axios interceptor token");
        }

        if (isSavingRef.current) {
          if (isDev) console.log("[EntryTable][SAVE] SKIP: already saving");
          return { ok: false, skipped: true, reason: "already-saving" };
        }

        const hash = computeSaveHash(rows);
        if (lastSavedHashRef.current && lastSavedHashRef.current === hash) {
          if (isDev) console.log("[EntryTable][SAVE] SKIP: unchanged hash");
          return { ok: true, skipped: true, reason: "unchanged" };
        }

        const processedEntries = buildProcessedEntries(rows);
        const ui = latestUiStateRef.current;

        const payload = {
          entries: processedEntries,
          state: {
            sorting: ui.sorting || [],
            filters: ui.filters || {},
            columnWidths: ui.columnWidths || [],
            searchTerm: ui.searchTerm || "",
          },
        };

        isSavingRef.current = true;
        setSaveStatus("saving");

        if (isDev) {
          console.log("[EntryTable][SAVE] REQUEST", {
            reason,
            url: `/tournaments/${tid}/entries`,
            entries: processedEntries.length,
            hash,
          });
        }

        try {
          const resp = await api.post(`/tournaments/${tid}/entries`, payload);

          lastSavedHashRef.current = hash;

          if (isDev) {
            console.log("[EntryTable][SAVE] SUCCESS", {
              status: resp?.status,
              lastUpdated: resp?.data?.lastUpdated,
              count: resp?.data?.count,
            });
          }

          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);

          return { ok: true, skipped: false, count: resp?.data?.count, lastUpdated: resp?.data?.lastUpdated };
        } catch (err) {
          const status = err?.response?.status;
          const serverMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.response?.data?.details;

          if (isDev) {
            console.error("[EntryTable][SAVE] FAILED", {
              status,
              message: serverMsg || err?.message,
              data: err?.response?.data,
              reason,
            });
          }

          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3500);

          return { ok: false, skipped: false, status, message: serverMsg || err?.message };
        } finally {
          isSavingRef.current = false;
        }
      },
      [tournamentId, tournamentData?._id, token, computeSaveHash, buildProcessedEntries]
    );

    useEffect(() => {
      if (debouncedSaveRef.current?.cancel) debouncedSaveRef.current.cancel();

      debouncedSaveRef.current = lodashDebounce((rows, reason) => {
        // Store the promise so navigation can await the *latest* pending save
        lastSavePromiseRef.current = performSave(rows, reason);
      }, 2000);

      return () => {
        debouncedSaveRef.current?.cancel?.();
      };
    }, [performSave]);

    const flushSaveNow = useCallback(
      (rows, reason = "flush") => {
        debouncedSaveRef.current?.cancel?.();
        lastSavePromiseRef.current = performSave(rows, reason);
        return lastSavePromiseRef.current;
      },
      [performSave]
    );

    // Autosave on data change (NOT first mount)
    useEffect(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      if (isDev) console.log("[EntryTable] data changed -> schedule save");
      debouncedSaveRef.current?.(data, "data-change");
    }, [data]);

    // Dynamic Columns (kept)
    const columnsDef = useMemo(() => {
      const optional = [
        { header: "Father's Name", accessorKey: "fathersName", id: "fathersName", className: "col-fathersName" },
        { header: "School", accessorKey: "school", id: "school", className: "col-school" },
        { header: "Class", accessorKey: "class", id: "class", className: "col-class" },
      ].filter((col) => visibleColumns?.[col.id]);

      const teamIndex = baseColumnsDef.findIndex((c) => c.id === "team");
      return [
        ...baseColumnsDef.slice(0, teamIndex + 1),
        ...optional,
        ...baseColumnsDef.slice(teamIndex + 1),
      ];
    }, [visibleColumns]);

    const columns = useMemo(() => {
      const customWidths = {
        sr: { size: 35, minSize: 25, maxSize: 65, enableResizing: false },
        title: { size: 120, minSize: 120, maxSize: 60, enableResizing: true },
        fathersName: { size: 180, minSize: 150, maxSize: 250, enableResizing: true },
        school: { size: 220, minSize: 180, maxSize: 300, enableResizing: true },
        class: { size: 100, minSize: 80, maxSize: 140, enableResizing: true },
      };

      const defaultConfig = {
        size: 120,
        minSize: 70,
        maxSize: 400,
        enableResizing: true,
      };

      return columnsDef.map((col, index) => {
        const custom = customWidths[col.id] || {};
        const isSortable = col.id !== "actions";

        return {
          ...col,
          cell: EditableCell,
          size: columnWidths[index] ?? (custom.size ?? col.size ?? defaultConfig.size),
          minSize: custom.minSize ?? col.minSize ?? defaultConfig.minSize,
          maxSize: custom.maxSize ?? col.maxSize ?? defaultConfig.maxSize,
          enableResizing: custom.enableResizing ?? col.enableColumnResizing !== false,
          enableSorting: isSortable,
          sortingFn:
            col.id === "gender"
              ? genderSort
              : col.id === "subEvent"
              ? subEventSort
              : col.id === "ageCategory"
              ? ageCategorySort
              : col.id === "medal"
              ? medalSort
              : alphanumericSortWithEmpty,
          filterFn: [
            "team",
            "school",
            "gender",
            "event",
            "subEvent",
            "ageCategory",
            "weightCategory",
            "medal",
            "coach",
          ].includes(col.id)
            ? multiSelectIncludeFilter
            : undefined,
        };
      });
    }, [columnsDef, columnWidths]);

    const columnFiltersArray = useMemo(() => {
      const arr = Object.entries(filters || {})
        .map(([id, value]) => ({
          id,
          value: Array.isArray(value) ? [...value] : [value].filter(Boolean),
        }))
        .filter((f) => f.value.length > 0);
      return Object.freeze(arr);
    }, [JSON.stringify(filters || {})]);

    const totalTableWidth = useMemo(() => {
      if (!Array.isArray(columnWidths) || columnWidths.length === 0) return 1800;
      const sum = columnWidths.reduce((s, w) => s + (Number(w) || 120), 0);
      const win = typeof window !== "undefined" ? window.innerWidth || 1200 : 1200;
      return Math.max(sum, win);
    }, [columnWidths]);

    const table = useReactTable({
      data,
      columns,
      state: {
        sorting,
        globalFilter: searchTerm,
        columnFilters: columnFiltersArray,
      },
      onSortingChange: setSorting,
      onGlobalFilterChange: setSearchTerm,
      onColumnFiltersChange: (updater) => {
        const newFilters = typeof updater === "function" ? updater(columnFiltersArray) : updater;
        const filtersObj = {};
        newFilters.forEach((f) => {
          if (f.value && f.value.length > 0) filtersObj[f.id] = f.value;
        });
        setFilters(filtersObj);
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      globalFilterFn: "includesString",
      filterFromLeafRows: true,
      meta: {
        updateData,
        updateColumnWidth,
        addNewRow,
        addRowBelow,
        deleteRow,
        recalculateColumnWidths,
        tournamentData,
        setEditingCell,
        editingCell,
        requestSave: (reason) => debouncedSaveRef.current?.(data, reason),
        flushSaveNow: (reason) => flushSaveNow(data, reason),
        saveStatusSetter: setSaveStatus,
      },
      debugTable: false,
    });

    const sortedRows = table.getSortedRowModel().rows;

    const rowVirtualizer = useVirtualizer({
      count: sortedRows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 48,
      overscan: 10,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    useImperativeHandle(
      ref,
      () => ({
       scrollToRow: (sr) => {
  if (!parentRef.current || !data.length) return;

  const srStr = String(sr);
  const index = data.findIndex((r) => String(r.sr) === srStr);
  if (index < 0) return;

  const rowHeight = 48;
  const container = parentRef.current;
  const containerHeight = container.clientHeight;
  const targetScrollTop = Math.max(0, index * rowHeight - containerHeight * 0.4);

  setJumpHighlightedSr(srStr);
  container.scrollTo({ top: targetScrollTop, behavior: "smooth" });

  // remove highlight after some time
  setTimeout(() => {
    setJumpHighlightedSr((prev) => (prev === srStr ? "" : prev));
  }, 2200);
},
        // ✅ New: force immediate server save and await it (used before TieSheet navigation)
        flushSaveNow: (reason = "flush") => flushSaveNow(data, reason),
        // Optional helpers (non-breaking)
        getSaveStatus: () => saveStatus,
        isSaving: () => !!isSavingRef.current,
      }),
      [data, flushSaveNow, saveStatus]
    );

    return (
      <div className={styles.tableContainer}>
        <div ref={parentRef} className={styles.scrollableWrapper} style={{ overflow: "auto", height: "100%" }}>
          {/* Header */}
          <div className={styles.headerWrapper}>
            <table
              className={styles.headerTable}
              style={{
                width: totalTableWidth,
                minWidth: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
              }}
            >
              <thead className={styles.stickyHeader}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const columnId = header.column.id;
                      const sortableColumns = [
                        "sr",
                        "team",
                        "gender",
                        "event",
                        "subEvent",
                        "weightCategory",
                        "ageCategory",
                        "medal",
                        "coach",
                      ];
                      const canSort = sortableColumns.includes(columnId);
                      const sortDirection = header.column.getIsSorted();
                      const isSorted = !!sortDirection;

                      const canFilter = [
                        "team",
                        "school",
                        "gender",
                        "event",
                        "subEvent",
                        "ageCategory",
                        "weightCategory",
                        "medal",
                        "coach",
                      ].includes(columnId);

                      return (
                        <th
                          key={header.id}
                          style={{
                            width: header.column.getSize(),
                            minWidth: header.column.getSize(),
                            maxWidth: header.column.getSize(),
                            boxSizing: "border-box",
                            cursor: canSort ? "pointer" : "default",
                            userSelect: "none",
                            position: "relative",
                            background: "#cf0006",
                            color: "white",
                          }}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          <div className={styles.headerCell}>
                            <span className={styles.headerText}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>

                            {canSort && (
                              <span
                                className={styles.sortIcon}
                                style={{
                                  marginLeft: "6px",
                                  opacity: isSorted ? 1 : 0.5,
                                  color: isSorted ? "#ffd700" : "white",
                                  fontWeight: isSorted ? "bold" : "normal",
                                  fontSize: "1.2rem",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : " ↕"}
                              </span>
                            )}

                            {canFilter && (
                              <span
                                role="button"
                                tabIndex={0}
                                className={styles.filterIcon}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFilterColumn((prev) => (prev === columnId ? null : columnId));
                                }}
                                title={
                                  (filters?.[columnId]?.length || 0) > 0
                                    ? `Filtered (${filters[columnId].length} values)`
                                    : "Filter this column"
                                }
                                style={{
                                  marginLeft: "8px",
                                  cursor: "pointer",
                                  color: (filters?.[columnId]?.length || 0) > 0 ? "#fff000" : "white",
                                  fontWeight: (filters?.[columnId]?.length || 0) > 0 ? "bold" : "normal",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                <FontAwesomeIcon
                                  icon={faFilter}
                                  style={{
                                    opacity: (filters?.[columnId]?.length || 0) > 0 ? 1 : 0.5,
                                    fontSize: "1.1rem",
                                  }}
                                />
                              </span>
                            )}
                          </div>

                          {header.column.getCanResize() && (
                            <div
                              className={`${styles.resizer} ${header.column.getIsResizing() ? styles.isResizing : ""}`}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                            />
                          )}

                          {canFilter && filterColumn === columnId && (
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                zIndex: 1000,
                                minWidth: header.getSize(),
                                background: "#fff",
                                border: "1px solid #ccc",
                                borderRadius: "4px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                marginTop: "4px",
                              }}
                            >
                              <FilterDropdown
                                columnId={columnId}
                                data={data}
                                onFilterChange={setFilters}
                                currentFilters={filters}
                                onClose={() => setFilterColumn(null)}
                              />
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
            </table>
          </div>

          {/* Body */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: `${totalTableWidth}px`,
              minWidth: "fit-content",
              position: "relative",
            }}
            className={styles.virtualBodyWrapper}
          >
            {virtualRows.map((virtualRow) => {
              const row = sortedRows[virtualRow.index];
              if (!row) return null;

              const rowData = row.original;
              const sr = rowData?.sr || "";
const isJumpHighlighted = String(sr) === String(jumpHighlightedSr);

              return (
              <div
  key={virtualRow.key}
  className={`${styles.virtualRow} ${isJumpHighlighted ? styles.jumpHighlightRow : ""}`}
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start}px)`,
    display: "flex",
    background: isJumpHighlighted ? "rgba(255, 59, 59, 0.35)" : undefined,
  
    transition: "background 0.25s ease, box-shadow 0.25s ease",
    zIndex: isJumpHighlighted ? 2 : 1,
  }}
  data-row-index={virtualRow.index}
  data-row-id={sr}
>
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className={`${styles.virtualCell} ${cell.column.columnDef.className || ""}`}
                      style={{
                        width: cell.column.getSize(),
                        minWidth: cell.column.getSize(),
                        maxWidth: cell.column.getSize(),
                        flexShrink: 0,
                        boxSizing: "border-box",
                        pointerEvents: "auto",
                        padding: "8px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext()) ?? "—"}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {table.getRowModel().rows.length === 0 && (
            <div className={styles.noDataOverlay}>
              <div className={styles.noDataContent}>
                <h3>No entries yet</h3>
                <p>
                  Click the <strong>+</strong> button in the Actions column to add a player.
                </p>
                <button className={styles.addFirstRowButton} onClick={() => addNewRow?.()}>
                  <FontAwesomeIcon icon={faPlus} /> Add First Player
                </button>
              </div>
            </div>
          )}

          {/* Save Status (existing UX only) */}
          {saveStatus !== "idle" && (
            <div
              style={{
                position: "fixed",
                bottom: "20px",
                right: "20px",
                padding: "10px 20px",
                borderRadius: "8px",
                background: saveStatus === "saving" ? "#ff9800" : saveStatus === "saved" ? "#4caf50" : "#f44336",
                color: "white",
                fontWeight: "bold",
                zIndex: 1000,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Error saving"}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default EntryTable;