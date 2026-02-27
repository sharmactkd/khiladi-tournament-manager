// src/components/TieSheet/BracketFilters.jsx
import React, { useCallback, useMemo } from 'react';
import styles from '../../pages/TieSheet.module.css';

const ToggleButton = ({ label, isActive, onClick, disabled = false, count }) => (
  <button
    className={`${styles.toggleButton} ${isActive ? styles.active : ''}`}
    onClick={onClick}
    disabled={disabled}
    aria-pressed={isActive}
    aria-label={`${label} filter ${isActive ? 'active' : 'inactive'}${count ? ` (${count} brackets)` : ''}`}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className={styles.badge}>{count}</span>
    )}
  </button>
);

const BracketFilters = ({
  availableGenders,
  selectedGenders,
  setSelectedGenders,
  availableAgeCategories,
  selectedAgeCategories,
  setSelectedAgeCategories,
  bracketCounts, // optional
}) => {
  const toggleGender = useCallback((gender) => {
    setSelectedGenders((prev) =>
      prev.includes(gender)
        ? prev.filter((g) => g !== gender)
        : [...prev, gender]
    );
  }, [setSelectedGenders]);

  const toggleAgeCategory = useCallback((ageCategory) => {
    setSelectedAgeCategories((prev) =>
      prev.includes(ageCategory)
        ? prev.filter((a) => a !== ageCategory)
        : [...prev, ageCategory]
    );
  }, [setSelectedAgeCategories]);

  const selectAll = useCallback(() => {
    setSelectedGenders([...availableGenders]);
    setSelectedAgeCategories([...availableAgeCategories]);
  }, [availableGenders, availableAgeCategories, setSelectedGenders, setSelectedAgeCategories]);

  const isAllSelected = useMemo(
    () =>
      selectedGenders.length === availableGenders.length &&
      selectedAgeCategories.length === availableAgeCategories.length,
    [selectedGenders, availableGenders, selectedAgeCategories, availableAgeCategories]
  );

  const hasNoGenders = availableGenders.length === 0;
  const hasNoAgeCategories = availableAgeCategories.length === 0;

  return (
    <div className={styles.toggleContainer}>
      <div className={styles.toggleGroup}>
        <ToggleButton
          label="Select All"
          isActive={isAllSelected}
          onClick={selectAll}
          disabled={hasNoGenders || hasNoAgeCategories}
        />

        {availableAgeCategories.map((age) => (
          <ToggleButton
            key={age}
            label={age}
            isActive={selectedAgeCategories.includes(age)}
            onClick={() => toggleAgeCategory(age)}
            disabled={hasNoAgeCategories}
            count={bracketCounts?.ageCategories?.[age]}
          />
        ))}

        <span className={styles.spacer} />

        {availableGenders.map((gender) => (
          <ToggleButton
            key={gender}
            label={gender}
            isActive={selectedGenders.includes(gender)}
            onClick={() => toggleGender(gender)}
            disabled={hasNoGenders}
            count={bracketCounts?.genders?.[gender]}
          />
        ))}
      </div>
    </div>
  );
};

export default BracketFilters;