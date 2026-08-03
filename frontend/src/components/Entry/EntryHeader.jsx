// src/components/Entry/EntryHeader.jsx
import { useEffect, useRef, useState } from 'react';
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
  faPlusCircle,
  faShareAlt,
  faInbox,
  faSortAmountDown,
} from '@fortawesome/free-solid-svg-icons';
import {
  DEFAULT_MULTI_SORT,
  MAX_MULTI_SORT_LEVELS,
  MULTI_SORT_COLUMNS,
} from './constants';
import { normalizeMultiSortingState } from '../../utils/entrySortingUtils';
import styles from '../../pages/Entry.module.css';

const EntryHeader = ({
  tournamentData,
  showFresherGroupColumn = false,
  isLoading = false,
  
  visibleColumns = {
    fathersName: false,
    school: false,
    class: false,
    aadhaarNumber: false,
    panNumber: false,
    udiseCode: false,
  },
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

  // Team-entry buttons
  onAddTeamEntries,
  onShareEntryForm,
  onViewTeamSubmissions,
  showOrganizerActions = true,
  sorting = [],
  onApplyMultiSort,
  onClearSorting,
}) => {
  const fileInputRef = useRef(null);
  const [showSortModal, setShowSortModal] = useState(false);
  const [draftSorting, setDraftSorting] = useState([]);
  const availableSortColumns = showFresherGroupColumn
    ? MULTI_SORT_COLUMNS
    : MULTI_SORT_COLUMNS.filter((column) => column.id !== 'fresherGroup');

  useEffect(() => {
    if (!showSortModal) return;
    setDraftSorting(
      (sorting?.length ? sorting : DEFAULT_MULTI_SORT).map((rule) => ({ ...rule }))
    );
  }, [showSortModal, sorting]);

  const triggerFileInput = () => {
    if (!isLoading && !showImportModal) {
      fileInputRef.current?.click();
    }
  };

  const updateSortRule = (index, patch) => {
    setDraftSorting((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    );
  };

  const applySorting = () => {
    const nextSorting = normalizeMultiSortingState(
      draftSorting,
      availableSortColumns.map((column) => column.id),
      MAX_MULTI_SORT_LEVELS
    );
    onApplyMultiSort?.(nextSorting);
    setShowSortModal(false);
  };

 

  return (
    <div className={styles.headerContainer}>
      {/* Tournament Title + Team Actions */}
      <div className={styles.titleSection}>
        <div className={styles.entryTitleRow}>
          <h2>
            Entries for {tournamentData?.name || tournamentData?.tournamentName || 'Tournament'}
            {isLoading && <span className={styles.loadingText}> (Loading...)</span>}
           
          </h2>

          <div className={styles.entryTitleActions}>
            <button
              type="button"
              className={styles.teamEntryActionButton}
              onClick={onAddTeamEntries}
              disabled={isLoading}
              title="Add team entries"
            >
              <FontAwesomeIcon icon={faPlusCircle} />
              <span>Add Team Entries</span>
            </button>

            {showOrganizerActions && (
              <>
                <button
                  type="button"
                  className={styles.teamEntryActionButton}
                  onClick={onShareEntryForm}
                  disabled={isLoading}
                  title="Share entry form"
                >
                  <FontAwesomeIcon icon={faShareAlt} />
                  <span>Share Entry Form</span>
                </button>

                <button
                  type="button"
                  className={styles.teamEntryActionButton}
                  onClick={onViewTeamSubmissions}
                  disabled={isLoading}
                  title="View team submissions"
                >
                  <FontAwesomeIcon icon={faInbox} />
                  <span>View Submissions</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

   

      {/* Controls - Responsive flex-wrap */}
      <div className={styles.controlsWrapper}>
        {/* Left Controls */}
        <div className={styles.leftControls}>
          {/* Column Toggles */}
          <div className={styles.toggleGroup}>
            {[
              ['fathersName', "Father's Name"],
              ['school', 'School'],
              ['class', 'Class'],
              ['aadhaarNumber', 'Aadhaar Card Number'],
              ['panNumber', 'PAN Number'],
              ['udiseCode', 'UDISE Code'],
            ].map(([col, label]) => (
              <button
                key={col}
                className={`${styles.toggleButton} ${visibleColumns?.[col] ? styles.active : ''}`}
                onClick={() => onToggleColumn?.(col)}
                aria-pressed={visibleColumns?.[col]}
                aria-label={`Toggle ${col.replace(/([A-Z])/g, ' $1').trim()} column`}
                disabled={isLoading}
                title={`Show/Hide ${col.replace(/([A-Z])/g, ' $1').trim()}`}
              >
                {label}
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
              aria-label="Undo last change (Ctrl+Z)"
              title={`Undo (${historyLength} steps) - Ctrl+Z`}
            >
              <FontAwesomeIcon icon={faUndo} />
              Undo {historyLength > 0 && `(${historyLength})`}
            </button>

            <button
              className={styles.actionButton}
              onClick={onRedo}
              disabled={isLoading || redoHistoryLength === 0}
              aria-label="Redo last change (Ctrl+Y)"
              title={`Redo (${redoHistoryLength} steps) - Ctrl+Y`}
            >
              <FontAwesomeIcon icon={faRedo} />
              Redo {redoHistoryLength > 0 && `(${redoHistoryLength})`}
            </button>

            <div className={styles.multiSortButtonGroup}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setShowSortModal(true)}
                disabled={isLoading}
                aria-label="Configure multi-level sorting"
                title="Sort by multiple columns in priority order"
              >
                <FontAwesomeIcon icon={faSortAmountDown} />
                Multi Sort{sorting.length ? ` (${sorting.length})` : ''}
              </button>
              {sorting.length > 0 && (
                <button
                  type="button"
                  className={styles.multiSortClearButton}
                  onClick={onClearSorting}
                  disabled={isLoading}
                  aria-label="Clear multi-level sorting"
                  title="Clear multi-level sorting"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              )}
            </div>
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

          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              disabled={isLoading}
              title="Clear search"
              aria-label="Clear search"
              className={styles.clearSearchBtn}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
      </div>

      {showSortModal && (
        <div
          className={styles.multiSortOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSortModal(false);
          }}
        >
          <section
            className={styles.multiSortDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="multi-sort-title"
          >
            <div className={styles.multiSortHeader}>
              <div>
                <h3 id="multi-sort-title">Multi-Level Sorting</h3>
                <p>Priority 1 is applied first, followed by the next levels.</p>
              </div>
              <button
                type="button"
                className={styles.multiSortClose}
                onClick={() => setShowSortModal(false)}
                aria-label="Close multi-level sorting"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className={styles.multiSortRules}>
              {draftSorting.map((rule, index) => {
                const selectedElsewhere = new Set(
                  draftSorting
                    .filter((_, ruleIndex) => ruleIndex !== index)
                    .map((item) => item.id)
                );

                return (
                  <div className={styles.multiSortRule} key={`sort-level-${index + 1}`}>
                    <span className={styles.multiSortLevel}>{index + 1}</span>
                    <label>
                      <span>Column</span>
                      <select
                        value={rule.id}
                        onChange={(event) => {
                          const next = [...draftSorting];
                          next[index] = { id: event.target.value, desc: rule.desc === true };
                          setDraftSorting(next.filter((item, itemIndex) => itemIndex <= index || item.id));
                        }}
                      >
                        <option value="">Not used</option>
                        {availableSortColumns.map((column) => (
                          <option
                            key={column.id}
                            value={column.id}
                            disabled={selectedElsewhere.has(column.id)}
                          >
                            {column.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Order</span>
                      <select
                        value={rule.desc ? 'desc' : 'asc'}
                        disabled={!rule.id}
                        onChange={(event) =>
                          updateSortRule(index, { desc: event.target.value === 'desc' })
                        }
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.multiSortRemoveRule}
                      onClick={() =>
                        setDraftSorting((current) =>
                          current.filter((_, ruleIndex) => ruleIndex !== index)
                        )
                      }
                      aria-label={`Remove sort priority ${index + 1}`}
                      title="Remove this sort level"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  </div>
                );
              })}
            </div>

            {draftSorting.length < MAX_MULTI_SORT_LEVELS && (
              <button
                type="button"
                className={styles.multiSortAddLevel}
                onClick={() =>
                  setDraftSorting((current) => [
                    ...current,
                    {
                      id:
                        availableSortColumns.find(
                          (column) => !current.some((rule) => rule.id === column.id)
                        )?.id || '',
                      desc: false,
                    },
                  ])
                }
              >
                <FontAwesomeIcon icon={faPlusCircle} /> Add Sort Level
              </button>
            )}

            <p className={styles.multiSortHint}>
              Tip: table headers can also be Shift-clicked to add another sort level.
            </p>

            <div className={styles.multiSortActions}>
              <button
                type="button"
                className={styles.multiSortSecondary}
                onClick={() => {
                  setDraftSorting([]);
                  onClearSorting?.();
                  setShowSortModal(false);
                }}
              >
                Clear Sorting
              </button>
              <button
                type="button"
                className={styles.multiSortSecondary}
                onClick={() => setDraftSorting(DEFAULT_MULTI_SORT.map((rule) => ({ ...rule })))}
              >
                Use Recommended
              </button>
              <button type="button" className={styles.multiSortApply} onClick={applySorting}>
                Apply Sorting
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default EntryHeader;