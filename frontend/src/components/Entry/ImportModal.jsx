import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  excelSerialToDate,
  validateDOB,
  getAgeCategory,
  getWeightCategory,
} from './helpers';
import styles from '../../pages/Entry.module.css';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const headerSynonyms = {
  name: ['player name', 'full name', 'athlete name', 'name'],
  team: ['team name', 'club', 'organization', 'team'],
  gender: ['sex', 'male/female', 'gender'],
  dob: ['date of birth', 'birth date', 'dob', 'born'],
  weight: ['weight kg', 'body weight', 'weight', 'wt'],
  event: ['event type', 'competition', 'event'],
  subEvent: ['sub-event', 'sub event'],
  ageCategory: ['age group', 'age category', 'age'],
  weightCategory: ['weight class', 'weight category', 'weight group', 'wt category'],
  medal: ['award', 'medal', 'result'],
  coach: ['coach name', 'trainer', 'coach'],
  coachContact: ['coach phone', 'coach contact', 'trainer contact'],
  manager: ['manager name', 'team manager', 'manager'],
  managerContact: ['manager phone', 'manager contact', 'team contact'],
  fathersName: ["father's name", 'parent name', 'father name'],
  school: ['school name', 'institution', 'school'],
  class: ['grade', 'class', 'year'],
};

const cleanHeaderText = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[-\s()]+/g, '');

const ImportModal = ({
  show,
  onClose,
  onImportSuccess,
  tournamentData,
  columnsDef,
  saveToHistory,
  updateSerialNumbers,
  recalculateColumnWidths,
  selectedFile,
}) => {
  const [excelFile, setExcelFile] = useState(null);
  const [workbookData, setWorkbookData] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [headerMappings, setHeaderMappings] = useState({});
  const [exactMatchedColumns, setExactMatchedColumns] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const fileReaderRef = useRef(null);

  const resetImportState = () => {
    setExcelFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet('');
    setSheetHeaders([]);
    setHeaderMappings({});
    setExactMatchedColumns({});
    setErrorMessage('');
    setIsLoading(false);
    setProgress(0);
  };

  useEffect(() => {
    if (!show) {
      resetImportState();

      if (fileReaderRef.current) {
        fileReaderRef.current.abort();
      }

      return;
    }

    resetImportState();

    if (selectedFile) {
      setExcelFile(selectedFile);
      processFile(selectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, selectedFile]);

  if (!show) return null;

  const processFile = (file) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMessage('');
    setProgress(0);
    setSheetHeaders([]);
    setHeaderMappings({});
    setExactMatchedColumns({});

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
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        setWorkbookData(workbook);
        setSheetNames(workbook.SheetNames);
        setSelectedSheet('');
        setSheetHeaders([]);
        setHeaderMappings({});
        setExactMatchedColumns({});
      } catch (err) {
        setErrorMessage(`File read failed: ${err.message}`);
      } finally {
        setIsLoading(false);
        setProgress(0);
        fileReaderRef.current = null;
      }
    };

    reader.onerror = () => {
      setErrorMessage('Error reading file.');
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
      setErrorMessage('Please select a file first!');
      return;
    }

    if (!workbookData) {
      setErrorMessage('File not processed yet.');
      return;
    }

    if (!selectedSheet) {
      setErrorMessage('Please select a sheet!');
      return;
    }

    handleSheetSelect();
  };

  const handleSheetSelect = () => {
    if (!workbookData || !selectedSheet) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const worksheet = workbookData.Sheets[selectedSheet];

      if (!worksheet) throw new Error('Selected sheet not found.');

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });

      if (jsonData.length === 0) {
        setErrorMessage('No data found in the selected sheet.');
        setIsLoading(false);
        return;
      }

      let headerRowIndex = -1;
      let maxNonEmpty = 0;

      jsonData.forEach((row, i) => {
        const nonEmpty = row.filter((cell) => cell && String(cell).trim() !== '').length;

        if (nonEmpty > maxNonEmpty && nonEmpty >= 3) {
          maxNonEmpty = nonEmpty;
          headerRowIndex = i;
        }
      });

      if (headerRowIndex === -1) {
        setErrorMessage('No valid header row found (need at least 3 non-empty cells).');
        setIsLoading(false);
        return;
      }

      const headerRow = jsonData[headerRowIndex];

      const headers = headerRow.map((h, i) => (h ? String(h).trim() : `Column ${i + 1}`));

      setSheetHeaders(headers);

      const mappings = {};
      const exactMatches = {};

      const tableHeaders =
        columnsDef
          ?.filter((col) => col.id !== 'actions' && col.id !== 'sr')
          .map((col) => ({
            id: col.id,
            header: cleanHeaderText(col.header),
            synonyms: headerSynonyms[col.id]?.map(cleanHeaderText) || [],
          })) || [];

      headers.forEach((header, index) => {
        if (!header || header.startsWith('Column')) return;

        const cleanHeader = cleanHeaderText(header);

        let bestMatch = null;
        let highestScore = 0;
        let isExactMatch = false;

        tableHeaders.forEach((th) => {
          const exactCandidates = [th.header, ...th.synonyms];

          if (exactCandidates.includes(cleanHeader)) {
            bestMatch = th.id;
            highestScore = 100;
            isExactMatch = true;
            return;
          }

          th.synonyms.forEach((syn) => {
            if (!syn) return;

            if (cleanHeader.includes(syn) || syn.includes(cleanHeader)) {
              const score = Math.max(
                cleanHeader.includes(syn) ? (syn.length / cleanHeader.length) * 80 : 0,
                syn.includes(cleanHeader) ? (cleanHeader.length / syn.length) * 80 : 0
              );

              if (score > highestScore) {
                bestMatch = th.id;
                highestScore = score;
                isExactMatch = false;
              }
            }
          });
        });

        if (bestMatch && !Object.values(mappings).includes(bestMatch)) {
          mappings[index] = bestMatch;
          exactMatches[bestMatch] = isExactMatch;
        }
      });

      setHeaderMappings(mappings);
      setExactMatchedColumns(exactMatches);
    } catch (err) {
      setErrorMessage(`Sheet processing failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isColumnExactMatched = (tableColId) =>
    Object.values(headerMappings).includes(tableColId) && exactMatchedColumns[tableColId];

  const handleImport = () => {
    if (!workbookData || !selectedSheet) {
      setErrorMessage('No sheet selected or file not processed.');
      return;
    }

    if (Object.keys(headerMappings).length === 0) {
      setErrorMessage('Please map at least one column.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const worksheet = workbookData.Sheets[selectedSheet];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (jsonData.length <= 1) throw new Error('No valid data found.');

      let startIndex = 0;

      while (
        startIndex < jsonData.length &&
        jsonData[startIndex].every((cell) => !cell || String(cell).trim() === '')
      ) {
        startIndex++;
      }

      startIndex++;

      const importedRows = [];

      jsonData.slice(startIndex).forEach((row) => {
        const rowData = {};

        row.forEach((cell, colIndex) => {
          const tableColId = headerMappings[colIndex];

          if (tableColId && tableColId !== 'actions' && tableColId !== 'sr') {
            let value = cell ? String(cell).trim() : '';

            if (tableColId === 'dob' && value) {
              if (/^\d+$/.test(value)) {
                value = excelSerialToDate(parseFloat(value));
              } else if (Date.parse(value)) {
                const date = new Date(value);
                value = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1)
                  .toString()
                  .padStart(2, '0')}-${date.getFullYear()}`;
              }

              const validation = validateDOB(value);
              value = validation.isValid ? validation.formatted : '';
            }

            if (tableColId === 'gender') {
              const lower = value.toLowerCase();
              value =
                lower === 'm' || lower === 'male'
                  ? 'Male'
                  : lower === 'f' || lower === 'female'
                    ? 'Female'
                    : value;
            }

            rowData[tableColId] = value;
          }
        });

        if (Object.keys(rowData).length > 0) {
          const fullRow = {
            ...Object.fromEntries(columnsDef?.map((col) => [col.id, col.id === 'actions' ? '' : '']) || []),
            ...rowData,
          };

          if (rowData.gender) {
            fullRow.title = rowData.gender === 'Male' ? 'Mr.' : rowData.gender === 'Female' ? 'Miss' : '';
          }

          if (rowData.dob && tournamentData) {
            fullRow.ageCategory = getAgeCategory(rowData.dob, tournamentData);
          }

          if (rowData.gender && fullRow.ageCategory && rowData.weight && tournamentData) {
            fullRow.weightCategory = getWeightCategory(
              rowData.gender,
              fullRow.ageCategory,
              rowData.weight,
              tournamentData
            );
          }

          importedRows.push(fullRow);
        }
      });

      if (importedRows.length === 0) {
        setErrorMessage('No valid rows found after processing.');
        setIsLoading(false);
        return;
      }

      saveToHistory?.();
      onImportSuccess?.(updateSerialNumbers?.(importedRows) || importedRows);
      recalculateColumnWidths?.();

      setExcelFile(null);
      setWorkbookData(null);
      setSheetNames([]);
      setSelectedSheet('');
      setSheetHeaders([]);
      setHeaderMappings({});
      setExactMatchedColumns({});
      onClose();
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

    resetImportState();
    onClose();
  };

  return (
    <div className={styles.modal} role="dialog" aria-modal="true">
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3>Import Entries from Excel</h3>

          <button
            className={styles.modalCloseButton}
            onClick={handleCancel}
            aria-label="Close import modal"
            title="Cancel and close"
          >
            <FontAwesomeIcon icon={faTimes} style={{ fontSize: '1.6rem' }} />
          </button>
        </div>

        {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}

        {!sheetNames.length ? (
          <div className={styles.uploadSection}>
            <label htmlFor="excelFileInput" className={styles.fileLabel}>
              Choose Excel File (.xlsx, .xls, .xlsb, .xlsm)
            </label>

            <input
              id="excelFileInput"
              type="file"
              accept=".xlsx,.xls,.xlsb,.xlsm"
              onChange={handleFileChange}
              disabled={isLoading}
              className={styles.fileInput}
            />

            <p className={styles.fileNote}>
              Max size: 10MB | Supports header mapping & auto calculations
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
              }}
            >
              <strong>Selected File:</strong> {excelFile?.name || 'Unknown'}

              <small style={{ color: '#666', marginLeft: '8px' }}>
                ({excelFile ? Math.round(excelFile.size / 1024) + ' KB' : ''})
              </small>
            </div>

            {isLoading && (
              <div style={{ margin: '16px 0', textAlign: 'center' }}>
                <div className={styles.spinner} style={{ margin: '0 auto' }}></div>
                <p>{progress > 0 ? `Processing: ${progress}%` : 'Processing your Excel file...'}</p>
              </div>
            )}

            {sheetNames.length > 0 && !sheetHeaders.length && !isLoading && (
              <div className={styles.sheetSection}>
                <label htmlFor="sheetSelect">Select Sheet:</label>

                <select
                  id="sheetSelect"
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
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  className={`${styles.actionButton} ${styles.primaryButton}`}
                  onClick={handleNext}
                  disabled={isLoading || !selectedSheet}
                >
                  Next
                </button>
              </div>
            )}

            {sheetHeaders.length > 0 && (
              <div className={styles.mappingSection}>
                <div
                  style={{
                    background: '#e3f2fd',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '16px',
                  }}
                >
                  <strong>Column Mapping:</strong> Red border means exact column match was not found. Please verify before importing.
                </div>

                <h4>Map Columns</h4>

                <div className={styles.mappingGrid}>
                  {columnsDef
                    ?.filter((col) => col.id !== 'actions' && col.id !== 'sr')
                    .map((tableCol) => (
                      <div
                        key={tableCol.id}
                        className={styles.mappingRow}
                        style={{
                          border: isColumnExactMatched(tableCol.id)
                            ? '1px solid transparent'
                            : '2px solid #d32f2f',
                          borderRadius: '6px',
                          padding: '8px',
                        }}
                      >
                        <span className={styles.mappingSource}>{tableCol.header}</span>
                        →

                        <select
                          value={Object.keys(headerMappings).find((key) => headerMappings[key] === tableCol.id) || ''}
                          onChange={(e) => {
                            const newMappings = { ...headerMappings };
                            const newExactMatches = { ...exactMatchedColumns };

                            Object.keys(newMappings).forEach((k) => {
                              if (newMappings[k] === tableCol.id) delete newMappings[k];
                            });

                            delete newExactMatches[tableCol.id];

                            if (e.target.value) {
                              newMappings[e.target.value] = tableCol.id;

                              const selectedExcelHeader = sheetHeaders[Number(e.target.value)] || '';
                              const cleanExcelHeader = cleanHeaderText(selectedExcelHeader);
                              const cleanTableHeader = cleanHeaderText(tableCol.header);
                              const cleanSynonyms = headerSynonyms[tableCol.id]?.map(cleanHeaderText) || [];

                              newExactMatches[tableCol.id] =
                                cleanExcelHeader === cleanTableHeader || cleanSynonyms.includes(cleanExcelHeader);
                            }

                            setHeaderMappings(newMappings);
                            setExactMatchedColumns(newExactMatches);
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
                  <p style={{ color: '#d32f2f', marginTop: '16px' }}>
                    Map at least one column to enable Import
                  </p>
                )}
              </div>
            )}

            {sheetHeaders.length > 0 && (
              <div className={styles.modalButtons}>
                <button
                  className={`${styles.actionButton} ${styles.primaryButton}`}
                  onClick={handleImport}
                  disabled={isLoading || Object.keys(headerMappings).length === 0}
                >
                  Import Data
                </button>

                <button
                  className={`${styles.actionButton} ${styles.cancelButton}`}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}

        {isLoading && !progress && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner}></div>
            <p>Processing...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportModal;