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
    } catch {}
  }

  return val;
};

const formatWeightCategory = (value) => {
  if (!value) return '';
  return String(value).split('(')[0].trim();
};

const EditableCell = ({ getValue, row, column, table }) => {
  const rawInitial = getValue() || '';

  const initialValue =
    column.id === 'dob'
      ? formatDOB(rawInitial)
      : column.id === 'weightCategory'
        ? formatWeightCategory(rawInitial)
        : rawInitial;

  const [value, setValue] = useState(initialValue || '');
  const [isContactValid, setIsContactValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const inputRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const commitLockRef = useRef(false);
  const lastCommitKeyRef = useRef('');
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

  // 🔹 Autofill (Excel-like suggestion)
const autofillColumns = ['team', 'coach', 'manager'];

const autofillSuggestion = React.useMemo(() => {
  if (!autofillColumns.includes(column.id)) return '';

  const typed = String(value || '').trim().toLowerCase();
  if (!typed) return '';

  const values = [...new Set(
    data
      .map((row) => String(row?.[column.id] || '').trim())
      .filter(Boolean)
  )];

  return (
    values.find(
      (item) =>
        item.toLowerCase().startsWith(typed) &&
        item.toLowerCase() !== typed
    ) || ''
  );
}, [column.id, value, data]);

  const isEditing =
    editingCell?.rowIndex === row.index && editingCell?.colIndex === column.getIndex();

  const highlightRow = shouldHighlightRow(row, data, tournamentData);

  const isTieSheetMedalLocked =
    column.id === 'medal' && row.original?.medalSource === 'tiesheet';

  const showValidationToast = useCallback(
    (message, uniqueKey = '') => {
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
    },
    [row.index, column.id]
  );

  const showTieSheetLockToast = useCallback(() => {
    toast.warning('This medal was declared from TieSheet. Clear/change TieSheet result to edit it.', {
      toastId: `tiesheet-medal-locked-${row.index}`,
      position: 'top-right',
      autoClose: 2500,
    });
  }, [row.index]);

  useEffect(() => {
    if (!isEditing) {
      const formatted =
        column.id === 'dob'
          ? formatDOB(rawInitial)
          : column.id === 'weightCategory'
            ? formatWeightCategory(rawInitial)
            : rawInitial;

      setValue(formatted);
      setErrorMessage('');
      lastToastKeyRef.current = '';

      if (['coachContact', 'managerContact'].includes(column.id)) {
        const digits = String(formatted || '').replace(/[^0-9]/g, '');
        setIsContactValid(digits.length === 0 || digits.length >= 10);
      }
    }
  }, [rawInitial, column.id, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(
    (e) => {
      if (['actions', 'sr', 'title'].includes(column.id)) return;

      if (isTieSheetMedalLocked) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        showTieSheetLockToast();
        return;
      }

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
    [column.id, column, row.index, setEditingCell, isTieSheetMedalLocked, showTieSheetLockToast]
  );

  const validateAndCommit = useCallback(
    (commitValue = value) => {
      if (isTieSheetMedalLocked) {
        showTieSheetLockToast();
        return false;
      }

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

            updateData?.(row.index, 'weightCategory', formatWeightCategory(wtCat));
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

            updateData?.(row.index, 'weightCategory', formatWeightCategory(wtCat));
            lastToastKeyRef.current = '';
          }
        } else {
          updateData?.(row.index, 'weightCategory', '');
          lastToastKeyRef.current = '';
        }
      } else if (column.id === 'weightCategory') {
        finalValue = formatWeightCategory(finalValue);
        lastToastKeyRef.current = '';
      } else {
        lastToastKeyRef.current = '';
      }

      if (isValid) {
        updateData?.(row.index, column.id, finalValue);
        updateColumnWidth?.(column.getIndex(), finalValue, row.index);
        return true;
      }

      return false;
    },
    [
      value,
      column.id,
      column,
      updateData,
      updateColumnWidth,
      tournamentData,
      row,
      showValidationToast,
      isTieSheetMedalLocked,
      showTieSheetLockToast,
    ]
  );

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

  const handleKeyDown = useCallback(
    (e) => {

      const copyFromAboveColumns = ['team', 'coach', 'coachContact', 'manager', 'managerContact'];

if (e.altKey && e.key.toLowerCase() === 'd') {
  if (copyFromAboveColumns.includes(column.id)) {
    e.preventDefault();
    e.stopPropagation();

    const aboveRow = data[row.index - 1];
    const aboveValue = aboveRow?.[column.id] || '';

    if (aboveValue) {
      setValue(aboveValue);
      updateData?.(row.index, column.id, aboveValue);
      updateColumnWidth?.(column.getIndex(), aboveValue, row.index);
    }
  }

  return;
}

      if (isTieSheetMedalLocked) {
        e.preventDefault();
        showTieSheetLockToast();
        return;
      }

      if (['Enter', 'Tab'].includes(e.key)) {

        // 🔹 Autofill accept (Excel style)
if (autofillSuggestion && autofillColumns.includes(column.id)) {
  e.preventDefault();

  setValue(autofillSuggestion);
  updateData?.(row.index, column.id, autofillSuggestion);
  updateColumnWidth?.(column.getIndex(), autofillSuggestion, row.index);

  return;
}

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
    [
      validateAndCommit,
      navigateToNextCell,
      initialValue,
      column.id,
      setEditingCell,
      isTieSheetMedalLocked,
      showTieSheetLockToast,
    ]
  );

  const handleChange = useCallback(
    (e) => {
      if (isTieSheetMedalLocked) {
        showTieSheetLockToast();
        return;
      }

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

      if (column.id === 'weightCategory') {
        newValue = formatWeightCategory(newValue);
      }

      if (['coachContact', 'managerContact'].includes(column.id)) {
        const digits = newValue.replace(/[^0-9]/g, '');
        const result = formatContactNumberRealTime(digits);

        newValue = result.formatted;
        setIsContactValid(result.digitCount === 0 || result.digitCount >= 10);
      }

      setValue(newValue);
    },
    [
      column.id,
      column,
      value,
      row.original,
      row.index,
      updateData,
      updateColumnWidth,
      isTieSheetMedalLocked,
      showTieSheetLockToast,
    ]
  );

  const handleBlur = useCallback(() => {
    if (commitLockRef.current) return;

    const currentValue = String(value ?? '').trim();

    if (!isEditing) return;

    const commitSuccess = validateAndCommit(currentValue);

    if (!commitSuccess) {
      if (inputRef.current) inputRef.current.focus();
      return;
    }

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

      updateData?.(row.index, 'weightCategory', formatWeightCategory(wtCat));
    }

    updateColumnWidth?.(column.getIndex(), currentValue, row.index);

    const needsFlush = ['dob', 'weight', 'gender'].includes(column.id);

    if (needsFlush && window.debouncedSaveInstance && typeof window.debouncedSaveInstance.flush === 'function') {
      window.debouncedSaveInstance.flush();
    }

    setEditingCell?.(null);
  }, [
    value,
    isEditing,
    validateAndCommit,
    column.id,
    column,
    updateData,
    updateColumnWidth,
    tournamentData,
    row.original,
    row.index,
    setEditingCell,
  ]);

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
        title={isTieSheetMedalLocked ? 'TieSheet result locked' : undefined}
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

{autofillSuggestion && autofillColumns.includes(column.id) && (
  <div
    style={{
      position: 'absolute',
      left: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none',
      color: '#cf0006',
      fontSize: '14px',
      whiteSpace: 'nowrap',
      zIndex: 1,
    }}
  >
    <span style={{ color: 'transparent' }}>{value}</span>
    <span>{autofillSuggestion.slice(String(value || '').length)}</span>
  </div>
)}

      {errorMessage && !['dob', 'coachContact', 'managerContact', 'weight'].includes(column.id) && (
        <div className={styles.cellErrorTooltip}>{errorMessage}</div>
      )}
    </div>
  );
};

export default EditableCell;