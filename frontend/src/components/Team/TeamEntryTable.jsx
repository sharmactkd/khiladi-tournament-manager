// src/components/Team/TeamEntryTable.jsx
import React, { useMemo, useState, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import modalStyles from "./AddTeamEntriesModal.module.css";
import EditableCell from "../Entry/EditableCell";
import { baseColumnsDef, optionalColumnsDef } from "../Entry/constants";
import EntryStyles from "../../pages/Entry.module.css";

const createEmptyRow = () => ({
  actions: "",
  sr: "",
  title: "",
  name: "",
  team: "",
  gender: "",
  dob: "",
  weight: "",
  event: "",
  subEvent: "",
  ageCategory: "",
  weightCategory: "",
  medal: "",
  coach: "",
  coachContact: "",
  manager: "",
  managerContact: "",
  fathersName: "",
  school: "",
  class: "",
});

const getTextWidth = (text = "", font = '16px "Helvetica Neue", Arial, sans-serif') => {
  if (typeof document === "undefined") return 100;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 100;
  context.font = font;
  const metrics = context.measureText(String(text || ""));
  return Math.ceil(metrics.width) + 20;
};

const TeamEntryTable = ({
  tournamentData,
  rows,
  setRows,
  disabled = false,
  visibleColumns = { fathersName: false, school: false, class: false },
}) => {
  const [editingCell, setEditingCell] = useState(null);
  const [columnWidths, setColumnWidths] = useState([]);

  const tableColumnsDef = useMemo(() => {
    const optional = optionalColumnsDef.filter((col) => visibleColumns?.[col.id]);

    const playerBase = baseColumnsDef.filter(
      (col) =>
        !["team", "coach", "coachContact", "manager", "managerContact"].includes(col.id)
    );

    return [...playerBase, ...optional];
  }, [visibleColumns]);

  const normalizedRows = useMemo(() => {
    const sourceRows = Array.isArray(rows) && rows.length > 0 ? rows : [createEmptyRow()];
    return sourceRows.map((row, index) => ({
      ...createEmptyRow(),
      ...row,
      sr: String(index + 1),
    }));
  }, [rows]);

  const updateData = (rowIndex, columnId, value) => {
    if (disabled) return;
    setRows((prev) => {
      const current = Array.isArray(prev) && prev.length > 0 ? [...prev] : [createEmptyRow()];
      const next = current.map((row) => ({ ...createEmptyRow(), ...row }));
      next[rowIndex] = { ...next[rowIndex], [columnId]: value };
      return next;
    });
  };

  const addNewRow = () => {
    if (disabled) return;
    setRows((prev) => {
      const current = Array.isArray(prev) ? [...prev] : [];
      return [...current, createEmptyRow()];
    });
  };

  const addRowBelow = (index) => {
    if (disabled) return;
    setRows((prev) => {
      const current = Array.isArray(prev) && prev.length > 0 ? [...prev] : [createEmptyRow()];
      return [...current.slice(0, index + 1), createEmptyRow(), ...current.slice(index + 1)];
    });
  };

  const deleteRow = (index) => {
    if (disabled) return;
    setRows((prev) => {
      const current = Array.isArray(prev) && prev.length > 0 ? [...prev] : [createEmptyRow()];
      if (current.length === 1) return [createEmptyRow()];
      return current.filter((_, i) => i !== index);
    });

    setEditingCell((current) => {
      if (!current) return current;
      if (current.rowIndex === index) return null;
      if (current.rowIndex > index) {
        return { ...current, rowIndex: current.rowIndex - 1 };
      }
      return current;
    });
  };

  const dynamicWidthColumns = ["name", "fathersName", "school"];

  const updateColumnWidth = (colIndex, value) => {
    const columnId = tableColumnsDef[colIndex]?.id;
    if (!dynamicWidthColumns.includes(columnId)) return;

    setColumnWidths((prev) => {
      const currentWidth = prev[colIndex] || 120;
      const textWidth = getTextWidth(value || "") + 10;
      const minWidth = tableColumnsDef[colIndex]?.minSize || 100;

      if (Math.abs(textWidth - currentWidth) > 20) {
        const newWidth = Math.max(minWidth, textWidth);
        if (newWidth !== currentWidth) {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        }
      }
      return prev;
    });
  };

  const recalculateColumnWidths = () => {
    const newWidths = tableColumnsDef.map((col) => {
      const override = teamColumnSizeOverrides[col.id] || {};
      let maxWidth = getTextWidth(col.header || "");

      normalizedRows.forEach((row) => {
        const val = row[col.id] || "";
        maxWidth = Math.max(maxWidth, getTextWidth(val));
      });

      if (!dynamicWidthColumns.includes(col.id)) {
        return override.size || col.size || 120;
      }

      return Math.max(maxWidth, override.minSize || col.minSize || 100);
    });

    setColumnWidths(newWidths);
  };

  useEffect(() => {
    recalculateColumnWidths();
  }, [rows, tableColumnsDef]);

  const teamColumnSizeOverrides = {
    actions: { size: 60, minSize: 50 },
    sr: { size: 55, minSize: 30 },
    title: { size: 50, minSize: 60 },
    name: { size: 180, minSize: 150 },
    gender: { size: 80, minSize: 70 },
    dob: { size: 110, minSize: 100 },
    weight: { size: 110, minSize: 90 },
    event: { size: 110, minSize: 100 },
    subEvent: { size: 130, minSize: 110 },
    ageCategory: { size: 130, minSize: 110 },
    weightCategory: { size: 150, minSize: 130 },
    medal: { size: 90, minSize: 80 },
    fathersName: { size: 170, minSize: 140 },
    school: { size: 150, minSize: 130 },
    class: { size: 80, minSize: 70 },
  };

  const columns = useMemo(() => {
    return tableColumnsDef.map((col, index) => {
      const override = teamColumnSizeOverrides[col.id] || {};

      return {
        ...col,
        cell: EditableCell,
        enableSorting: false,
        size: columnWidths[index] || override.size || col.size || 120,
        minSize: override.minSize || col.minSize || 70,
      };
    });
  }, [tableColumnsDef, columnWidths]);

  const table = useReactTable({
    data: normalizedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
    },
  });

  return (
    <>
      <div className={EntryStyles.autofillHints} style={{ margin: "10px 0" }}>
        <div className={EntryStyles.hintGrid}>
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

      <div className={`${EntryStyles.tableContainer} ${modalStyles.teamTable}`}>
        <div
          className={EntryStyles.scrollableWrapper}
          style={{ overflowX: "auto", overflowY: "auto", maxHeight: "55vh" }}
        >
          <div className={EntryStyles.headerWrapper}>
            <table
              className={EntryStyles.headerTable}
              style={{
                width: "max-content",
                minWidth: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
              }}
            >
              <thead className={EntryStyles.stickyHeader}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={EntryStyles[header.column.columnDef.className] || ""}
                        style={{
                          width: header.column.getSize(),
                          minWidth: header.column.getSize(),
                          maxWidth: header.column.getSize(),
                          boxSizing: "border-box",
                          position: "relative",
                          background: "#cf0006",
                          color: "white",
                        }}
                      >
                        <div className={EntryStyles.headerCell}>
                          <span className={EntryStyles.headerText}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
            </table>
          </div>

          <div
            className={EntryStyles.virtualBodyWrapper}
            style={{
              width: "max-content",
              minWidth: "100%",
            }}
          >
            {table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className={EntryStyles.virtualRow}
                style={{
                  display: "flex",
                  minWidth: "fit-content",
                  height: "48px",
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className={`${EntryStyles.virtualCell} ${
                      cell.column.columnDef.className
                        ? EntryStyles[cell.column.columnDef.className]
                        : ""
                    }`}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default TeamEntryTable;