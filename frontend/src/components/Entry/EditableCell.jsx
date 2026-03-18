import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import ActionsCell from './ActionsCell';
import {
  shouldHighlightRow,
  validateDOB,
  validateContactNumber,
  formatContactNumberRealTime,
  getAgeCategory,
  getWeightCategory,
} from './helpers';
import styles from '../../pages/Entry.module.css';

// Helper: Force DD-MM-YYYY format for DOB
const formatDOB = (val) => {
  if (!val) return '';
  if (val.includes('T') || (val.includes('-') && val.length > 10)) {
    try {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }
    } catch (error) {
      // silent fail
    }
  }
  return val;
};

const EditableCell = ({ getValue, row, column, table }) => {
  const rawInitial = getValue() || '';
  const initialValue = column.id === 'dob' ? formatDOB(rawInitial) : rawInitial;

  const [value, setValue] = useState(initialValue || '');
  const [isContactValid, setIsContactValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const inputRef = useRef(null);
  const isNavigatingRef = useRef(false);

  // Prevent double-commit (blur + global outside click)
  const commitLockRef = useRef(false);
  const lastCommitKeyRef = useRef('');

  // Prevent duplicate toast spam for same invalid attempt
  const lastToastKeyRef = useRef('');

  const {
    updateData,
    updateColumnWidth,
    tournamentData,
    addNewRow,
    setEditingCell,
    editingCell,
  } = table.options.meta || {};

  const data = table.options.data || [];
  const isEditing =
    editingCell?.rowIndex === row.index && editingCell?.colIndex === column.getIndex();
  const highlightRow = shouldHighlightRow(row, data, tournamentData);

  const showValidationToast = useCallback((message, uniqueKey = '') => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;

    const finalKey = uniqueKey || `${row.index}-${column.id}-${normalizedMessage}`;
    if (lastToastKeyRef.current === finalKey) return;

    lastToastKeyRef.current = finalKey;

    toast.error(normalizedMessage, {
      toastId: finalKey,
      position: 'top-right',
      autoClose: 2500,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }, [row.index, column.id]);

  // Sync value only when NOT editing
  useEffect(() => {
    if (!isEditing) {
      const formatted = column.id === 'dob' ? formatDOB(rawInitial) : rawInitial;
      setValue(formatted);
      setErrorMessage('');
      lastToastKeyRef.current = '';

      if (['coachContact', 'managerContact'].includes(column.id)) {
        const digits = String(formatted || '').replace(/[^0-9]/g, '');
        setIsContactValid(digits.length === 0 || digits.length >= 10);
      }
    }
  }, [rawInitial, column.id, isEditing]);

  // Focus on edit start
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(
    (e) => {
      if (['actions', 'sr', 'title'].includes(column.id)) return;

      if (e?.type === 'pointerdown' || e?.type === 'mousedown' || e?.type === 'touchstart') {
        e.stopPropagation();
      } else {
        e.preventDefault();
        e.stopPropagation();
      }

      requestAnimationFrame(() => {
        setEditingCell?.({ rowIndex: row.index, colIndex: column.getIndex() });
      });
    },
    [column.id, setEditingCell, row.index, column]
  );

  // Commit logic
  const validateAndCommit = useCallback(
    (commitValue = value) => {
      let finalValue = String(commitValue ?? '').trim();
      let isValid = true;
      let validationMessage = '';

      setErrorMessage('');

      if (column.id === 'dob') {
        if (finalValue) {
          const validation = validateDOB(finalValue);
          if (!validation.isValid) {
            validationMessage = validation.message;
            setErrorMessage(validation.message);
            showValidationToast(validation.message, `${row.index}-${column.id}-${finalValue}-${validation.message}`);
            isValid = false;
          } else {
            finalValue = validation.formatted;
            const ageCat = tournamentData ? getAgeCategory(finalValue, tournamentData) : '';
            updateData?.(row.index, 'ageCategory', ageCat);

            const wtCat =
              tournamentData && row.original?.gender && ageCat && row.original?.weight
                ? getWeightCategory(row.original.gender, ageCat, row.original.weight, tournamentData)
                : '';
            updateData?.(row.index, 'weightCategory', wtCat);

            lastToastKeyRef.current = '';
          }
        } else {
          updateData?.(row.index, 'ageCategory', '');
          updateData?.(row.index, 'weightCategory', '');
          lastToastKeyRef.current = '';
        }
      } else if (['coachContact', 'managerContact'].includes(column.id)) {
        const digits = finalValue.replace(/[^0-9]/g, '');
        const validation = validateContactNumber(digits);
        if (!validation.isValid) {
          validationMessage = validation.message;
          setErrorMessage(validation.message);
          setIsContactValid(false);
          showValidationToast(validation.message, `${row.index}-${column.id}-${digits}-${validation.message}`);
          isValid = false;
        } else {
          finalValue = validation.formatted;
          setIsContactValid(true);
          lastToastKeyRef.current = '';
        }
      } else if (column.id === 'weight') {
        if (finalValue) {
          const num = Number(finalValue);
          if (isNaN(num) || num <= 0) {
            validationMessage = 'Invalid weight: Must be a positive number';
            setErrorMessage(validationMessage);
            showValidationToast(validationMessage, `${row.index}-${column.id}-${finalValue}-${validationMessage}`);
            isValid = false;
          } else {
            const wtCat =
              tournamentData && row.original?.gender && row.original?.ageCategory
                ? getWeightCategory(row.original.gender, row.original.ageCategory, num, tournamentData)
                : 'Not Eligible';
            updateData?.(row.index, 'weightCategory', wtCat);
            lastToastKeyRef.current = '';
          }
        } else {
          updateData?.(row.index, 'weightCategory', '');
          lastToastKeyRef.current = '';
        }
      } else {
        lastToastKeyRef.current = '';
      }

      if (isValid) {
        console.log('[COMMIT] Row:', row.index, 'Column:', column.id, 'New Value:', finalValue);
        console.log('[COMMIT] Before update - current data value:', row.original[column.id]);
        updateData?.(row.index, column.id, finalValue);
        updateColumnWidth?.(column.getIndex(), finalValue, row.index);
        console.log('[COMMIT] updateData called successfully');
        return true;
      }

      console.log('[COMMIT FAIL] Validation failed for', column.id, validationMessage);
      return false;
    },
    [value, column.id, updateData, updateColumnWidth, tournamentData, row, showValidationToast]
  );

  // Global click-outside commit
  useEffect(() => {
    if (!isEditing) return;

    commitLockRef.current = false;

    const handlePointerDownCapture = (ev) => {
      try {
        const target = ev.target;
        const inputEl = inputRef.current;

        if (inputEl && (target === inputEl || inputEl.contains(target))) return;

        const stillEditing =
          table.options.meta?.editingCell?.rowIndex === row.index &&
          table.options.meta?.editingCell?.colIndex === column.getIndex();

        if (!stillEditing) return;

        if (commitLockRef.current) return;

        const commitKey = `${row.index}:${column.id}:${String(value ?? '').trim()}`;
        if (lastCommitKeyRef.current === commitKey) {
          commitLockRef.current = true;
          setEditingCell?.(null);
          return;
        }

        commitLockRef.current = true;

        const currentValue = String(value ?? '').trim();
        const ok = validateAndCommit(currentValue);

        if (!ok) {
          commitLockRef.current = false;
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select?.();
          }
          return;
        }

        lastCommitKeyRef.current = commitKey;
        setEditingCell?.(null);

        const needsFlush = ['dob', 'weight', 'gender'].includes(column.id);
        if (needsFlush && window.debouncedSaveInstance && typeof window.debouncedSaveInstance.flush === 'function') {
          window.debouncedSaveInstance.flush();
        }
      } catch (err) {
        console.error('[OUTSIDE CLICK COMMIT ERROR]', err);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownCapture, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, true);
    };
  }, [isEditing, table, row.index, column, column.id, value, validateAndCommit, setEditingCell]);

  // Focus helper for navigation
  const focusInputIfExists = useCallback((nextRow, nextCol) => {
    const tryFocus = (attempt = 0) => {
      const selector = `input[data-row="${nextRow}"][data-col="${nextCol}"]`;
      const el = document.querySelector(selector);
      if (el && typeof el.focus === 'function') {
        el.focus();
        el.select?.();
        isNavigatingRef.current = false;
      } else if (attempt < 6) {
        setTimeout(() => tryFocus(attempt + 1), 50 + attempt * 30);
      } else {
        isNavigatingRef.current = false;
      }
    };
    tryFocus();
  }, []);

  // Navigation logic
  const navigateToNextCell = useCallback(
    (e) => {
      const colIndex = column.getIndex();
      const rowIndex = row.index;
      const totalColumns = table.getAllColumns().length;
      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (e.key === 'Enter') {
        if (rowIndex === table.getRowModel().rows.length - 1) {
          addNewRow?.();
          nextRow = rowIndex + 1;
          nextCol = 3;
        } else {
          nextRow += 1;
        }
      } else if (e.key === 'Tab') {
        if (e.shiftKey) {
          nextCol--;
          if (nextCol < 0) {
            nextRow--;
            nextCol = totalColumns - 1;
          }
        } else {
          nextCol++;
          if (nextCol >= totalColumns) {
            nextRow++;
            nextCol = 0;
          }
        }
      }

      if (nextRow < 0) {
        setEditingCell?.(null);
        isNavigatingRef.current = false;
        return;
      }

      setEditingCell?.({ rowIndex: nextRow, colIndex: nextCol });
      focusInputIfExists(nextRow, nextCol);
    },
    [column, row, table, addNewRow, setEditingCell, focusInputIfExists]
  );

  // Keydown handler
  const handleKeyDown = useCallback(
    (e) => {
      if (['Enter', 'Tab'].includes(e.key)) {
        e.preventDefault();

        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;

        const commitSuccess = validateAndCommit();

        if (commitSuccess) {
          navigateToNextCell(e);
        } else {
          isNavigatingRef.current = false;
        }
        return;
      }

      if (e.key === 'Escape') {
        setValue(initialValue);
        setErrorMessage('');
        lastToastKeyRef.current = '';
        setEditingCell?.(null);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (['gender', 'event', 'subEvent', 'medal'].includes(column.id)) {
          setValue('');
          validateAndCommit('');
        }
        return;
      }

      const allowedInputKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-', 'Backspace', 'Delete'];
      if (!allowedInputKeys.includes(e.key)) {
        if (column.id === 'gender' && !/^[MmFf]$/.test(e.key)) e.preventDefault();
        if (column.id === 'dob' && !/[0-9-]/.test(e.key)) e.preventDefault();
        if (column.id === 'weight' && !/[0-9.]/.test(e.key)) e.preventDefault();
        if (['coachContact', 'managerContact'].includes(column.id) && !/[0-9]/.test(e.key)) e.preventDefault();
        if (column.id === 'event' && !/^[kKpP]$/.test(e.key)) e.preventDefault();
        if (column.id === 'subEvent' && !['k', 'f', 't', 'i', 'p'].includes(e.key.toLowerCase())) e.preventDefault();
        if (column.id === 'medal' && !/^[gGsSbBxX]$/.test(e.key)) e.preventDefault();
      }
    },
    [validateAndCommit, navigateToNextCell, initialValue, column.id, setEditingCell]
  );

  // Change handler
  const handleChange = useCallback(
    (e) => {
      let newValue = e.target.value || '';

      const dynamicWidthColumns = ['name', 'team', 'fathersName', 'school', 'coach', 'manager'];
      if (dynamicWidthColumns.includes(column.id)) {
        updateColumnWidth?.(column.getIndex(), newValue);
      }

      if (value.length > 0 && ['gender', 'event', 'subEvent', 'medal'].includes(column.id)) {
        return;
      }

      if (column.id === 'dob') {
        setErrorMessage('');
        lastToastKeyRef.current = '';
      }

      if (column.id === 'event') {
        const currentEvent = row.original?.event || '';
        const trimmedNew = newValue.trim();
        if (trimmedNew && trimmedNew !== currentEvent) {
          updateData?.(row.index, 'subEvent', '');
        }
      }

      if (value.length === 0 && newValue.length > 0) {
        const lower = newValue.toLowerCase();

        if (column.id === 'gender') {
          if (lower === 'm') {
            newValue = 'Male';
            updateData?.(row.index, 'title', 'Mr.');
          } else if (lower === 'f') {
            newValue = 'Female';
            updateData?.(row.index, 'title', 'Miss');
          } else {
            newValue = '';
          }
        }

        if (column.id === 'event') {
          if (lower === 'k') newValue = 'Kyorugi';
          else if (lower === 'p') newValue = 'Poomsae';
          else newValue = '';
        }

        if (column.id === 'subEvent') {
          const eventVal = row.original?.event?.toLowerCase() || '';
          let subVal = '';

          if (eventVal.includes('kyorugi')) {
            if (lower === 'k') subVal = 'Kyorugi';
            else if (lower === 'f') subVal = 'Fresher';
            else if (lower === 't') subVal = 'Tag Team';
          } else if (eventVal.includes('poomsae')) {
            if (lower === 'i') subVal = 'Individual';
            else if (lower === 'p') subVal = 'Pair';
            else if (lower === 't') subVal = 'Team';
          }

          newValue = subVal || '';
        }

        if (column.id === 'medal') {
          if (lower === 'g') newValue = 'Gold';
          else if (lower === 's') newValue = 'Silver';
          else if (lower === 'b') newValue = 'Bronze';
          else if (lower === 'x') newValue = 'X-X-X-X';
          else newValue = '';
        }
      }

      if (['coachContact', 'managerContact'].includes(column.id)) {
        const digits = newValue.replace(/[^0-9]/g, '');
        const result = formatContactNumberRealTime(digits);
        newValue = result.formatted;
        setIsContactValid(result.digitCount === 0 || result.digitCount >= 10);
      }

      setValue(newValue);
      console.log('[CHANGE] Local value updated to:', newValue);
    },
    [column.id, value, row.original, updateData, updateColumnWidth, column, row.index]
  );

  // Blur handler
  const handleBlur = useCallback(
    (e) => {
      console.log('[BLUR START] Editing cell:', isEditing, 'Current local value:', value);

      if (commitLockRef.current) {
        console.log('[BLUR SKIP] Commit already handled by outside click handler');
        return;
      }

      const currentValue = String(value ?? '').trim();

      if (!isEditing) {
        console.log('[BLUR SKIP] Not editing anymore');
        return;
      }

      console.log('[BLUR COMMIT] Attempting commit with value:', currentValue);
      const commitSuccess = validateAndCommit(currentValue);

      if (!commitSuccess) {
        console.log('[BLUR COMMIT FAILED] Validation failed');
        if (inputRef.current) inputRef.current.focus();
        return;
      }

      console.log('[BLUR COMMIT SUCCESS] Committed:', currentValue);

      if (column.id === 'event') {
        if (!currentValue) updateData?.(row.index, 'subEvent', '');
        updateData?.(row.index, 'event', currentValue);
      } else if (column.id === 'gender') {
        let finalGender = '';
        let finalTitle = '';
        const lower = currentValue.toLowerCase();

        if (['m', 'male'].includes(lower)) {
          finalGender = 'Male';
          finalTitle = 'Mr.';
        } else if (['f', 'female'].includes(lower)) {
          finalGender = 'Female';
          finalTitle = 'Miss';
        }

        updateData?.(row.index, 'gender', finalGender);
        updateData?.(row.index, 'title', finalTitle);

        const wtCat =
          tournamentData && finalGender && row.original?.ageCategory && row.original?.weight
            ? getWeightCategory(finalGender, row.original.ageCategory, row.original.weight, tournamentData)
            : '';
        updateData?.(row.index, 'weightCategory', wtCat);
      }

      updateColumnWidth?.(column.getIndex(), currentValue, row.index);

      const needsFlush = ['dob', 'weight', 'gender'].includes(column.id);
      if (needsFlush && window.debouncedSaveInstance && typeof window.debouncedSaveInstance.flush === 'function') {
        window.debouncedSaveInstance.flush();
      }

      setEditingCell?.(null);
    },
    [
      value,
      isEditing,
      validateAndCommit,
      column.id,
      updateData,
      updateColumnWidth,
      tournamentData,
      row.original,
      row.index,
      column,
      setEditingCell,
    ]
  );

  // Render
  if (column.id === 'actions') {
    return <ActionsCell row={row} table={table} />;
  }

  if (['sr', 'title'].includes(column.id)) {
    return (
      <div className={`${styles.nonEditableCell} ${highlightRow ? styles.highlightRow : ''}`}>
        {column.id === 'sr' ? (row.index + 1).toString() : initialValue}
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div
        onClick={startEditing}
        onDoubleClick={startEditing}
        onPointerDown={startEditing}
        data-row={row.index}
        data-col={column.getIndex()}
        className={`${styles.editableCell} ${highlightRow ? styles.highlightRow : ''} ${
          ['name', 'team', 'coach', 'manager', 'fathersName', 'school', 'class'].includes(column.id)
            ? styles.alignLeft
            : styles.alignCenter
        }`}
        role="button"
        tabIndex={0}
        aria-label={`Edit cell: ${column.columnDef.header} for row ${row.index + 1}`}
      >
        <span className={styles.cellContent}>{value || ''}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        data-row={row.index}
        data-col={column.getIndex()}
        autoFocus
        className={`${styles.editableInput} ${highlightRow ? styles.highlightRow : ''}`}
        aria-label={`Editing ${column.columnDef.header} for row ${row.index + 1}`}
        role="textbox"
        aria-invalid={!!errorMessage || (!isContactValid && ['coachContact', 'managerContact'].includes(column.id))}
      />
      {errorMessage && !['dob', 'coachContact', 'managerContact', 'weight'].includes(column.id) && (
        <div className={styles.cellErrorTooltip}>{errorMessage}</div>
      )}
    </div>
  );
};

export default EditableCell;