// src/components/Entry/ImportModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  excelSerialToDate, 
  validateDOB, 
  getAgeCategory, 
  getWeightCategory 
} from './helpers';
import styles from '../../pages/Entry.module.css';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Header synonyms
const headerSynonyms = {
  name: ['player name', 'full name', 'athlete name', 'name'],
  team: ['team name', 'club', 'organization', 'team'],
  gender: ['sex', 'male/female', 'gender'],
  dob: ['date of birth', 'birth date', 'dob', 'born'],
  weight: ['weight kg', 'body weight', 'weight'],
  event: ['event type', 'competition', 'event'],
  subEvent: ['sub-event', 'category', 'sub event'],
  ageCategory: ['age group', 'age category', 'age'],
  weightCategory: ['weight class', 'weight category', 'weight group'],
  medal: ['award', 'medal', 'result'],
  coach: ['coach name', 'trainer', 'coach'],
  coachContact: ['coach phone', 'coach contact', 'trainer contact'],
  manager: ['manager name', 'team manager', 'manager'],
  managerContact: ['manager phone', 'manager contact', 'team contact'],
  fathersName: ["father's name", 'parent name', 'father name'],
  school: ['school name', 'institution', 'school'],
  class: ['grade', 'class', 'year'],
};

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
  const [workbookData, setWorkbookData] = useState(null); // Cache workbook
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [headerMappings, setHeaderMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0); // Progress %
  const [errorMessage, setErrorMessage] = useState('');
  const fileReaderRef = useRef(null); // For aborting

  // Combined useEffect for show + selectedFile
  useEffect(() => {
    if (!show) {
      // Modal close → full reset
      setExcelFile(null);
      setWorkbookData(null);
      setSheetNames([]);
      setSelectedSheet('');
      setSheetHeaders([]);
      setHeaderMappings({});
      setErrorMessage('');
      setIsLoading(false);
      setProgress(0);
      if (fileReaderRef.current) {
        fileReaderRef.current.abort(); // Cancel any ongoing read
      }
      return;
    }

    // Modal open → reset + process selectedFile if present
    setExcelFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet('');
    setSheetHeaders([]);
    setHeaderMappings({});
    setErrorMessage('');
    setIsLoading(false);
    setProgress(0);

    if (selectedFile) {
      setExcelFile(selectedFile);
      processFile(selectedFile);
    }
  }, [show, selectedFile]);

  if (!show) return null;

  // Process file once and cache workbook
  const processFile = (file) => {
    if (!file) return;

    setIsLoading(true);
    setErrorMessage('');
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
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        setWorkbookData(workbook); // Cache
        setSheetNames(workbook.SheetNames);
        setSelectedSheet('');
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
      setErrorMessage('Error reading file.');
      setIsLoading(false);
      setProgress(0);
      fileReaderRef.current = null;
    };

    reader.readAsArrayBuffer(file);
  };

  // Manual file change
  const handleFileChange = (e) => {
    const newFile = e.target.files?.[0];
    if (newFile) {
      setExcelFile(newFile);
      processFile(newFile);
    }
  };

  // Go to sheet selection
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

  // Extract headers from cached workbook
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
        blankrows: false 
      });

      if (jsonData.length === 0) {
        setErrorMessage('No data found in the selected sheet.');
        setIsLoading(false);
        return;
      }

      // Improved header detection: find row with most non-empty cells
      let headerRowIndex = -1;
      let maxNonEmpty = 0;
      jsonData.forEach((row, i) => {
        const nonEmpty = row.filter(cell => cell && String(cell).trim() !== '').length;
        if (nonEmpty > maxNonEmpty && nonEmpty >= 3) { // At least 3 columns
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
      const headers = headerRow.map((h, i) => 
        h ? String(h).trim() : `Column ${i + 1}`
      );

      setSheetHeaders(headers);

      // Auto-mapping (same logic)
      const mappings = {};
      const tableHeaders = columnsDef
        ?.filter(col => col.id !== 'actions' && col.id !== 'sr')
        .map(col => ({
          id: col.id,
          header: col.header.toLowerCase().trim().replace(/[-\s()]+/g, ''),
          synonyms: headerSynonyms[col.id]?.map(s => s.toLowerCase().trim().replace(/[-\s()]+/g, '')) || [],
        })) || [];

      headers.forEach((header, index) => {
        if (!header || header.startsWith('Column')) return;
        const cleanHeader = header.toLowerCase().trim().replace(/[-\s()]+/g, '');

        let bestMatch = null;
        let highestScore = 0;

        tableHeaders.forEach(th => {
          th.synonyms.forEach(syn => {
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

  // Full import using cached workbook
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

      // Skip initial empty rows
      let startIndex = 0;
      while (startIndex < jsonData.length && 
             jsonData[startIndex].every(cell => !cell || String(cell).trim() === '')) {
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
                value = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
              }
              const validation = validateDOB(value);
              value = validation.isValid ? validation.formatted : '';
            }

            if (tableColId === 'gender') {
              const lower = value.toLowerCase();
              value = lower === 'm' || lower === 'male' ? 'Male' : 
                      lower === 'f' || lower === 'female' ? 'Female' : value;
            }

            rowData[tableColId] = value;
          }
        });

        if (Object.keys(rowData).length > 0) {
          const fullRow = {
            ...Object.fromEntries(columnsDef?.map(col => [col.id, col.id === 'actions' ? '' : '']) || []),
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

      // Reset & close
      setExcelFile(null);
      setWorkbookData(null);
      setSheetNames([]);
      setSelectedSheet('');
      setSheetHeaders([]);
      setHeaderMappings({});
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
    setIsLoading(false);
    setProgress(0);
    setExcelFile(null);
    setWorkbookData(null);
    setSheetNames([]);
    setSelectedSheet('');
    setSheetHeaders([]);
    setHeaderMappings({});
    setErrorMessage('');
    onClose();
  };

  return (
    <div className={styles.modal} role="dialog" aria-modal="true">
      <div className={styles.modalContent}>
        {/* Header */}
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

        {/* Error */}
        {errorMessage && (
          <div className={styles.errorMessage}>
            {errorMessage}
          </div>
        )}

        {/* Step 1: File Upload */}
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
            {/* File Info */}
            <div style={{ marginBottom: '16px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
              <strong>Selected File:</strong> {excelFile?.name || 'Unknown'} 
              <small style={{ color: '#666', marginLeft: '8px' }}>
                ({excelFile ? Math.round(excelFile.size / 1024) + ' KB' : ''})
              </small>
            </div>

            {/* Progress */}
            {isLoading && (
              <div style={{ margin: '16px 0', textAlign: 'center' }}>
                <div className={styles.spinner} style={{ margin: '0 auto' }}></div>
                <p>{progress > 0 ? `Processing: ${progress}%` : 'Processing your Excel file...'}</p>
              </div>
            )}

            {/* Step 2: Sheet Selection */}
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
                  {sheetNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Next Button */}
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

            {/* Step 3: Header Mapping */}
            {sheetHeaders.length > 0 && (
              <div className={styles.mappingSection}>
                <div style={{ background: '#e3f2fd', padding: '10px', borderRadius: '4px', marginBottom: '16px' }}>
                  <strong>Column Mapping:</strong> Match your Excel columns with table fields.
                </div>
                <h4>Map Columns</h4>
                <div className={styles.mappingGrid}>
                  {columnsDef
                    ?.filter(col => col.id !== 'actions' && col.id !== 'sr')
                    .map((tableCol) => (
                      <div key={tableCol.id} className={styles.mappingRow}>
                        <span className={styles.mappingSource}>{tableCol.header}</span>
                        →
                        <select
                          value={Object.keys(headerMappings).find(key => headerMappings[key] === tableCol.id) || ''}
                          onChange={(e) => {
                            const newMappings = { ...headerMappings };
                            Object.keys(newMappings).forEach(k => {
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
                  <p style={{ color: '#d32f2f', marginTop: '16px' }}>
                    Map at least one column to enable Import
                  </p>
                )}
              </div>
            )}

            {/* Buttons */}
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

        {/* Loading */}
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