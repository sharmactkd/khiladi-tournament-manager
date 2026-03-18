// src/components/Official/ImportModal.jsx
import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import entryStyles from "../../pages/Entry.module.css";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const headerSynonyms = {
  name: ["official name", "name", "full name"],
  rank: ["rank", "position", "designation"],
  dan: ["dan", "belt", "grade"],
  danNumber: ["dan number", "dan no", "certificate number", "id number", "number"],
  mark: ["mark", "marks", "remark", "remarks"],
};

const OFFICIAL_COLUMNS = [
  { id: "name", header: "Name" },
  { id: "rank", header: "Rank" },
  { id: "dan", header: "Dan" },
  { id: "danNumber", header: "Dan Number" },
  { id: "mark", header: "Mark" },
];

const OfficialImportModal = ({
  show,
  onClose,
  onImportSuccess,
  selectedFile,
}) => {
  const [excelFile, setExcelFile] = useState(null);
  const [workbookData, setWorkbookData] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [headerMappings, setHeaderMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const fileReaderRef = useRef(null);

  useEffect(() => {
    if (!show) {
      setExcelFile(null);
      setWorkbookData(null);
      setSheetNames([]);
      setSelectedSheet("");
      setSheetHeaders([]);
      setHeaderMappings({});
      setErrorMessage("");
      setIsLoading(false);
      setProgress(0);

      if (fileReaderRef.current) {
        fileReaderRef.current.abort();
      }
      return;
    }

    setExcelFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet("");
    setSheetHeaders([]);
    setHeaderMappings({});
    setErrorMessage("");
    setIsLoading(false);
    setProgress(0);

    if (selectedFile) {
      setExcelFile(selectedFile);
      processFile(selectedFile);
    }
  }, [show, selectedFile]);

  if (!show) return null;

  const processFile = (file) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMessage("");
    setProgress(0);

    const reader = new FileReader();
    fileReaderRef.current = reader;

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setProgress(percent);
      }
    };

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        setWorkbookData(workbook);
        setSheetNames(workbook.SheetNames);
        setSelectedSheet("");
        setSheetHeaders([]);
        setHeaderMappings({});
      } catch (err) {
        setErrorMessage(`File read failed: ${err.message}`);
      } finally {
        setIsLoading(false);
        setProgress(0);
        fileReaderRef.current = null;
      }
    };

    reader.onerror = () => {
      setErrorMessage("Error reading file.");
      setIsLoading(false);
      setProgress(0);
      fileReaderRef.current = null;
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e) => {
    const newFile = e.target.files?.[0];
    if (newFile) {
      setExcelFile(newFile);
      processFile(newFile);
    }
  };

  const handleNext = () => {
    if (!excelFile) {
      setErrorMessage("Please select a file first!");
      return;
    }

    if (!workbookData) {
      setErrorMessage("File not processed yet.");
      return;
    }

    if (!selectedSheet) {
      setErrorMessage("Please select a sheet!");
      return;
    }

    handleSheetSelect();
  };

  const handleSheetSelect = () => {
    if (!workbookData || !selectedSheet) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const worksheet = workbookData.Sheets[selectedSheet];
      if (!worksheet) throw new Error("Selected sheet not found.");

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });

      if (jsonData.length === 0) {
        setErrorMessage("No data found in the selected sheet.");
        setIsLoading(false);
        return;
      }

      let headerRowIndex = -1;
      let maxNonEmpty = 0;

      jsonData.forEach((row, i) => {
        const nonEmpty = row.filter((cell) => cell && String(cell).trim() !== "").length;
        if (nonEmpty > maxNonEmpty && nonEmpty >= 2) {
          maxNonEmpty = nonEmpty;
          headerRowIndex = i;
        }
      });

      if (headerRowIndex === -1) {
        setErrorMessage("No valid header row found.");
        setIsLoading(false);
        return;
      }

      const headerRow = jsonData[headerRowIndex];
      const headers = headerRow.map((h, i) =>
        h ? String(h).trim() : `Column ${i + 1}`
      );

      setSheetHeaders(headers);

      const mappings = {};
      const tableHeaders = OFFICIAL_COLUMNS.map((col) => ({
        id: col.id,
        header: col.header.toLowerCase().trim().replace(/[-\s()]+/g, ""),
        synonyms:
          headerSynonyms[col.id]?.map((s) =>
            s.toLowerCase().trim().replace(/[-\s()]+/g, "")
          ) || [],
      }));

      headers.forEach((header, index) => {
        if (!header || header.startsWith("Column")) return;

        const cleanHeader = header.toLowerCase().trim().replace(/[-\s()]+/g, "");

        let bestMatch = null;
        let highestScore = 0;

        tableHeaders.forEach((th) => {
          th.synonyms.forEach((syn) => {
            if (cleanHeader === syn) {
              bestMatch = th.id;
              highestScore = 100;
            } else if (cleanHeader.includes(syn) || syn.includes(cleanHeader)) {
              const score = Math.max(
                cleanHeader.includes(syn) ? (syn.length / cleanHeader.length) * 80 : 0,
                syn.includes(cleanHeader) ? (cleanHeader.length / syn.length) * 80 : 0
              );

              if (score > highestScore) {
                bestMatch = th.id;
                highestScore = score;
              }
            }
          });
        });

        if (bestMatch && !Object.values(mappings).includes(bestMatch)) {
          mappings[index] = bestMatch;
        }
      });

      setHeaderMappings(mappings);
    } catch (err) {
      setErrorMessage(`Sheet processing failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (!workbookData || !selectedSheet) {
      setErrorMessage("No sheet selected or file not processed.");
      return;
    }

    if (Object.keys(headerMappings).length === 0) {
      setErrorMessage("Please map at least one column.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const worksheet = workbookData.Sheets[selectedSheet];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (jsonData.length <= 1) throw new Error("No valid data found.");

      let startIndex = 0;
      while (
        startIndex < jsonData.length &&
        jsonData[startIndex].every((cell) => !cell || String(cell).trim() === "")
      ) {
        startIndex++;
      }
      startIndex++;

      const importedRows = [];

      jsonData.slice(startIndex).forEach((row) => {
        const rowData = {
          name: "",
          rank: "",
          dan: "",
          danNumber: "",
          mark: "",
        };

        row.forEach((cell, colIndex) => {
          const tableColId = headerMappings[colIndex];
          if (tableColId) {
            rowData[tableColId] = cell ? String(cell).trim() : "";
          }
        });

        if (Object.values(rowData).some((value) => value !== "")) {
          importedRows.push(rowData);
        }
      });

      if (importedRows.length === 0) {
        setErrorMessage("No valid rows found after processing.");
        setIsLoading(false);
        return;
      }

      onImportSuccess?.(importedRows);

      setExcelFile(null);
      setWorkbookData(null);
      setSheetNames([]);
      setSelectedSheet("");
      setSheetHeaders([]);
      setHeaderMappings({});
      onClose?.();
    } catch (err) {
      setErrorMessage(`Import failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (fileReaderRef.current) {
      fileReaderRef.current.abort();
    }

    setIsLoading(false);
    setProgress(0);
    setExcelFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet("");
    setSheetHeaders([]);
    setHeaderMappings({});
    setErrorMessage("");
    onClose?.();
  };

  return (
    <div className={entryStyles.modal} role="dialog" aria-modal="true">
      <div className={entryStyles.modalContent}>
        <div className={entryStyles.modalHeader}>
          <h3>Import Officials from Excel</h3>
          <button
            className={entryStyles.modalCloseButton}
            onClick={handleCancel}
            aria-label="Close import modal"
            title="Cancel and close"
          >
            <FontAwesomeIcon icon={faTimes} style={{ fontSize: "1.6rem" }} />
          </button>
        </div>

        {errorMessage && (
          <div className={entryStyles.errorMessage}>
            {errorMessage}
          </div>
        )}

        {!sheetNames.length ? (
          <div className={entryStyles.uploadSection}>
            <label htmlFor="officialExcelFileInput" className={entryStyles.fileLabel}>
              Choose Excel File (.xlsx, .xls, .xlsb, .xlsm)
            </label>
            <input
              id="officialExcelFileInput"
              type="file"
              accept=".xlsx,.xls,.xlsb,.xlsm"
              onChange={handleFileChange}
              disabled={isLoading}
              className={entryStyles.fileInput}
            />
            <p className={entryStyles.fileNote}>
              Max size: 10MB | Supports header mapping for officials
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                background: "#f8f9fa",
                borderRadius: "6px",
                border: "1px solid #dee2e6",
              }}
            >
              <strong>Selected File:</strong> {excelFile?.name || "Unknown"}
              <small style={{ color: "#666", marginLeft: "8px" }}>
                ({excelFile ? Math.round(excelFile.size / 1024) + " KB" : ""})
              </small>
            </div>

            {isLoading && (
              <div style={{ margin: "16px 0", textAlign: "center" }}>
                <div className={entryStyles.spinner} style={{ margin: "0 auto" }}></div>
                <p>{progress > 0 ? `Processing: ${progress}%` : "Processing your Excel file..."}</p>
              </div>
            )}

            {sheetNames.length > 0 && !sheetHeaders.length && !isLoading && (
              <div className={entryStyles.sheetSection}>
                <label htmlFor="officialSheetSelect">Select Sheet:</label>
                <select
                  id="officialSheetSelect"
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">-- Choose Sheet --</option>
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sheetNames.length > 0 && !sheetHeaders.length && (
              <div style={{ marginTop: "20px", textAlign: "center" }}>
                <button
                  className={`${entryStyles.actionButton} ${entryStyles.primaryButton}`}
                  onClick={handleNext}
                  disabled={isLoading || !selectedSheet}
                >
                  Next
                </button>
              </div>
            )}

            {sheetHeaders.length > 0 && (
              <div className={entryStyles.mappingSection}>
                <div
                  style={{
                    background: "#e3f2fd",
                    padding: "10px",
                    borderRadius: "4px",
                    marginBottom: "16px",
                  }}
                >
                  <strong>Column Mapping:</strong> Match your Excel columns with official fields.
                </div>

                <h4>Map Columns</h4>

                <div className={entryStyles.mappingGrid}>
                  {OFFICIAL_COLUMNS.map((tableCol) => (
                    <div key={tableCol.id} className={entryStyles.mappingRow}>
                      <span className={entryStyles.mappingSource}>{tableCol.header}</span>
                      →
                      <select
                        value={
                          Object.keys(headerMappings).find(
                            (key) => headerMappings[key] === tableCol.id
                          ) || ""
                        }
                        onChange={(e) => {
                          const newMappings = { ...headerMappings };

                          Object.keys(newMappings).forEach((k) => {
                            if (newMappings[k] === tableCol.id) delete newMappings[k];
                          });

                          if (e.target.value) {
                            newMappings[e.target.value] = tableCol.id;
                          }

                          setHeaderMappings(newMappings);
                        }}
                        disabled={isLoading}
                      >
                        <option value="">None</option>
                        {sheetHeaders.map((excelHeader, excelIndex) => (
                          <option key={excelIndex} value={excelIndex}>
                            {excelHeader || `Column ${excelIndex + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {Object.keys(headerMappings).length === 0 && (
                  <p style={{ color: "#d32f2f", marginTop: "16px" }}>
                    Map at least one column to enable Import
                  </p>
                )}
              </div>
            )}

            {sheetHeaders.length > 0 && (
              <div className={entryStyles.modalButtons}>
                <button
                  className={`${entryStyles.actionButton} ${entryStyles.primaryButton}`}
                  onClick={handleImport}
                  disabled={isLoading || Object.keys(headerMappings).length === 0}
                >
                  Import Data
                </button>
                <button
                  className={`${entryStyles.actionButton} ${entryStyles.cancelButton}`}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {isLoading && !progress && (
          <div className={entryStyles.loadingOverlay}>
            <div className={entryStyles.spinner}></div>
            <p>Processing...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficialImportModal;