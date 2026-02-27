// src/components/Entry/ActionsCell.jsx
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import styles from '../../pages/Entry.module.css';

const ActionsCell = ({ row, table }) => {
  const addRowBelow = table.options.meta?.addRowBelow;
  const deleteRow = table.options.meta?.deleteRow;

  // Safety check: functions missing हो तो warning (dev only)
  if (process.env.NODE_ENV !== 'production' && (!addRowBelow || !deleteRow)) {
    console.warn(`ActionsCell: meta functions missing for row ${row.index}`);
  }

  return (
    <div 
      className={styles.actionsCell}
      role="cell"
      aria-label={`Actions for row ${row.index + 1}`}
    >
      {/* Add Row Button */}
      <button
        className={styles.actionsButton}
        onClick={() => addRowBelow?.(row.index)}
        onPointerDown={(e) => {
          // Mobile/touch पर immediate feedback
          if (!addRowBelow) return;
          e.currentTarget.style.transform = 'scale(0.95)';
        }}
        onPointerUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        aria-label={`Add new row below row ${row.index + 1}`}
        title="Add row below this one"
        type="button"
        disabled={!addRowBelow}
        aria-disabled={!addRowBelow}
      >
        <FontAwesomeIcon 
          icon={faPlus} 
          aria-hidden="true"
          style={{ fontSize: '1.1rem' }}
        />
      </button>

      {/* Delete Row Button */}
      <button
        className={`${styles.actionsButton} ${styles.deleteButton}`}
        onClick={() => deleteRow?.(row.index)}
        onPointerDown={(e) => {
          if (!deleteRow) return;
          e.currentTarget.style.transform = 'scale(0.95)';
        }}
        onPointerUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        aria-label={`Delete row ${row.index + 1}`}
        title="Delete this row"
        type="button"
        disabled={!deleteRow}
        aria-disabled={!deleteRow}
      >
        <FontAwesomeIcon 
          icon={faTrashCan} 
          aria-hidden="true"
          style={{ fontSize: '1.1rem' }}
        />
      </button>
    </div>
  );
};

export default ActionsCell;