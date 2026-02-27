// src/components/Entry/EntryHeader.jsx
import React, { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrash,
  faFile,
  faFileArrowUp,
  faTable,
  faUndo,
  faRedo,
  faSearch,
  faTimes,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import styles from '../../pages/Entry.module.css';

const EntryHeader = ({
  tournamentData,
  isLoading = false,
  isSaving = false,           // ← अब इस्तेमाल करेंगे
  visibleColumns = { fathersName: false, school: false, class: false },
  onToggleColumn,
  searchTerm = '',
  onSearchChange,
  onClearAll,
  onCleanEmptyRows,
  onUndo,
  onRedo,
  historyLength = 0,
  redoHistoryLength = 0,
  onImport,
  onExport,
  onGenerateTieSheets,
  filters = {},
  setFilters,
  filterColumn,
  setFilterColumn,
  showImportModal = false,
}) => {
  const fileInputRef = useRef(null);



  const triggerFileInput = () => {
    if (!isLoading && !showImportModal) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={styles.headerContainer}>
      {/* Tournament Title */}
      <div className={styles.titleSection}>
        <h2>
          Entries for {tournamentData?.name || 'Tournament'}
          {isLoading && <span className={styles.loadingText}> (Loading...)</span>}
          {isSaving && (
            <span className={styles.savingText}>
              <FontAwesomeIcon icon={faSpinner} spin /> Saving...
            </span>
          )}
        </h2>
      </div>

      {/* Controls - Responsive flex-wrap */}
      <div className={styles.controlsWrapper}>
        {/* Left Controls */}
        <div className={styles.leftControls}>
          {/* Column Toggles */}
          <div className={styles.toggleGroup}>
            {['fathersName', 'school', 'class'].map((col) => (
              <button
                key={col}
                className={`${styles.toggleButton} ${visibleColumns?.[col] ? styles.active : ''}`}
                onClick={() => onToggleColumn?.(col)}
                aria-pressed={visibleColumns?.[col]}
                aria-label={`Toggle ${col.replace(/([A-Z])/g, ' $1').trim()} column`}
                disabled={isLoading}
                title={`Show/Hide ${col.replace(/([A-Z])/g, ' $1').trim()}`}
              >
                {col === 'fathersName' ? "Father's Name" : col.charAt(0).toUpperCase() + col.slice(1)}
              </button>
            ))}
          </div>

          {/* Cleanup + Filters */}
          <div className={styles.actionGroup}>
            <button
              className={`${styles.actionButton} ${styles.dangerButton}`}
              onClick={onClearAll}
              aria-label="Clear all entries (irreversible)"
              disabled={isLoading}
              title="Delete ALL entries"
            >
              <FontAwesomeIcon icon={faTrash} />
              Clear All
            </button>

            <button
              className={styles.actionButton}
              onClick={onCleanEmptyRows}
              aria-label="Remove empty rows"
              disabled={isLoading}
              title="Clean up empty rows"
            >
              <FontAwesomeIcon icon={faFile} />
              Clean Empty
            </button>

            {/* Filters Clear (Chip style में convert) */}
            {Object.keys(filters || {}).length > 0 && (
              <div className={styles.filterChips}>
                <button
                  className={`${styles.actionButton} ${styles.dangerChip}`}
                  onClick={() => {
                    setFilters({});
                    setFilterColumn(null);
                  }}
                  disabled={isLoading}
                  title="Clear all filters"
                >
                  <FontAwesomeIcon icon={faTimes} /> Clear Filters
                </button>

                {Object.entries(filters).map(([col, vals]) => (
                  <button
                    key={col}
                    className={styles.actionButton}
                    onClick={() => {
                      const newFilters = { ...filters };
                      delete newFilters[col];
                      setFilters(newFilters);
                      if (filterColumn === col) setFilterColumn(null);
                    }}
                    disabled={isLoading}
                    title={`Clear ${col} filter (${vals.length} values)`}
                  >
                    {col.charAt(0).toUpperCase() + col.slice(1)} ({vals.length})
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Undo / Redo */}
          <div className={styles.historyGroup}>
            <button
              className={styles.actionButton}
              onClick={onUndo}
              disabled={isLoading || historyLength === 0}
              aria-label={`Undo last change (Ctrl+Z)`}
              title={`Undo (${historyLength} steps) - Ctrl+Z`}
            >
              <FontAwesomeIcon icon={faUndo} />
              Undo {historyLength > 0 && `(${historyLength})`}
            </button>

            <button
              className={styles.actionButton}
              onClick={onRedo}
              disabled={isLoading || redoHistoryLength === 0}
              aria-label={`Redo last change (Ctrl+Y)`}
              title={`Redo (${redoHistoryLength} steps) - Ctrl+Y`}
            >
              <FontAwesomeIcon icon={faRedo} />
              Redo {redoHistoryLength > 0 && `(${redoHistoryLength})`}
            </button>
          </div>
        </div>

        {/* Right Controls */}
        <div className={styles.rightControls}>
          <button
            className={styles.actionButton}
            onClick={triggerFileInput}
            disabled={isLoading || showImportModal}
            aria-label="Import entries from Excel"
            title="Import from Excel"
          >
            {isLoading || showImportModal ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faTable} />
            )}
            Import Excel
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={onImport}
            accept=".xlsx,.xls,.csv"
            disabled={isLoading || showImportModal}
          />

          <button
            className={styles.actionButton}
            onClick={onExport}
            disabled={isLoading}
            aria-label="Export entries to Excel"
            title="Export to Excel"
          >
            <FontAwesomeIcon icon={faFileArrowUp} />
            Export Excel
          </button>

          <button
            className={`${styles.actionButton} ${styles.primaryButton}`}
            onClick={onGenerateTieSheets}
            disabled={isLoading}
            aria-label="Generate tie sheets"
            title="Create draw / brackets"
          >
            Generate Tie Sheets
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className={styles.searchContainer}>
        <div className={styles.searchWrapper}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by player name..."
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            disabled={isLoading}
            aria-label="Search players by name"
          />
        </div>
      </div>
    </div>
  );
};

export default EntryHeader;