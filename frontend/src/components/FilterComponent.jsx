// frontend/src/components/FilterComponent.jsx

import React from "react";
import ReactSelect from "react-select";
import styles from "./FilterComponent.module.css";

const FilterComponent = ({ filters, onFilterChange, availableCountries = [] }) => {
  const countryOptions = React.useMemo(() => {
    const uniqueCountries = [...new Set(availableCountries.filter(Boolean))].sort();

    return [
      { value: "", label: "All Countries" },
      ...uniqueCountries.map((country) => ({
        value: country,
        label: country,
      })),
    ];
  }, [availableCountries]);

  const tournamentLevelOptions = React.useMemo(
    () => [
      { value: "", label: "All Levels" },
      { value: "Inter School", label: "Inter School" },
      { value: "District", label: "District" },
      { value: "Regional", label: "Regional" },
      { value: "State", label: "State" },
      { value: "National", label: "National" },
      { value: "International", label: "International" },
    ],
    []
  );

  const tournamentTypeOptions = React.useMemo(
    () => [
      { value: "", label: "All Types" },
      { value: "Open", label: "Open" },
      { value: "Official", label: "Official" },
    ],
    []
  );

  const selectStyles = React.useMemo(
    () => ({
      control: (provided, state) => ({
        ...provided,
        minHeight: "42px",
        borderColor: state.isFocused ? "#cf0006" : "#ccc",
        boxShadow: state.isFocused ? "0 0 0 1px #cf0006" : "none",
        "&:hover": { borderColor: "#cf0006" },
      }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    }),
    []
  );

  const handleCountryChange = (selected) => {
    onFilterChange({
      ...filters,
      country: selected?.value || "",
    });
  };

  const handleLevelChange = (selected) => {
    onFilterChange({
      ...filters,
      tournamentLevel: selected?.value || "",
    });
  };

  const handleTypeChange = (selected) => {
    onFilterChange({
      ...filters,
      tournamentType: selected?.value || "",
    });
  };

  return (
    <div className={styles.filterContainer} role="region" aria-label="Tournament filters">
      <div className={styles.filterField}>
        <label htmlFor="country-select" className={styles.label}>
          Country:
        </label>

        <ReactSelect
          inputId="country-select"
          options={countryOptions}
          value={
            countryOptions.find((option) => option.value === filters.country) ||
            countryOptions[0]
          }
          onChange={handleCountryChange}
          placeholder="Select country"
          isClearable
          isSearchable
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by country"
        />
      </div>

      <div className={styles.filterField}>
        <label htmlFor="level-select" className={styles.label}>
          Tournament Level:
        </label>

        <ReactSelect
          inputId="level-select"
          options={tournamentLevelOptions}
          value={
            tournamentLevelOptions.find(
              (option) => option.value === filters.tournamentLevel
            ) || tournamentLevelOptions[0]
          }
          onChange={handleLevelChange}
          placeholder="All Levels"
          isClearable
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by tournament level"
        />
      </div>

      <div className={styles.filterField}>
        <label htmlFor="type-select" className={styles.label}>
          Tournament Type:
        </label>

        <ReactSelect
          inputId="type-select"
          options={tournamentTypeOptions}
          value={
            tournamentTypeOptions.find(
              (option) => option.value === filters.tournamentType
            ) || tournamentTypeOptions[0]
          }
          onChange={handleTypeChange}
          placeholder="All Types"
          isClearable
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by tournament type"
        />
      </div>
    </div>
  );
};

export default FilterComponent;