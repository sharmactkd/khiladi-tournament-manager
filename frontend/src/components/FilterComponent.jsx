// frontend/src/components/FilterComponent.jsx

import React from "react";
import ReactSelect from "react-select";
import ReactCountryFlag from "react-country-flag";
import styles from "./FilterComponent.module.css";
import { Country } from "country-state-city";

const FilterComponent = ({ filters, onFilterChange, availableCountries = [] }) => {
  // Country Options – optimized with memo + default "All Countries"
  const countryOptions = React.useMemo(() => {
    // Get all countries once
    const allCountries = Country.getAllCountries();

    // Filter only if availableCountries is provided and not empty
    const filteredCountries = availableCountries.length > 0
      ? allCountries.filter(c => availableCountries.includes(c.isoCode))
      : allCountries;

    return [
      { value: "", label: "All Countries", flag: null, code: null },
      ...filteredCountries.map(c => ({
        value: c.isoCode,
        label: c.name,
        flag: c.isoCode,
        code: c.isoCode,
      })),
    ];
  }, [availableCountries]);

  // Tournament Level Options
  const tournamentLevelOptions = React.useMemo(() => [
    { value: "", label: "All Levels" },
    { value: "Inter School", label: "Inter School" },
    { value: "District", label: "District" },
    { value: "Regional", label: "Regional" },
    { value: "State", label: "State" },
    { value: "National", label: "National" },
    { value: "International", label: "International" },
  ], []);

  // Tournament Type Options
  const tournamentTypeOptions = React.useMemo(() => [
    { value: "", label: "All Types" },
    { value: "Open", label: "Open" },
    { value: "Official", label: "Official" },
  ], []);

  // Custom option rendering with flag + code + name
  const formatOptionLabel = ({ flag, code, label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {flag && (
        <ReactCountryFlag
          countryCode={flag}
          svg
          style={{ width: "24px", height: "24px", borderRadius: "2px" }}
          title={label}
          aria-label={`${label} flag`}
        />
      )}
      {code && (
        <span style={{ fontWeight: "600", minWidth: "36px", color: "#cf0006" }}>
          {code}
        </span>
      )}
      <span>{label}</span>
    </div>
  );

  // Handlers
  const handleCountryChange = (selected) => {
    onFilterChange({ ...filters, country: selected ? selected.value : "" });
  };

  const handleLevelChange = (selected) => {
    onFilterChange({ ...filters, tournamentLevel: selected ? selected.value : "" });
  };

  const handleTypeChange = (selected) => {
    onFilterChange({ ...filters, tournamentType: selected ? selected.value : "" });
  };

  // Custom styles for better UX and accessibility
  const selectStyles = {
    control: (provided, state) => ({
      ...provided,
      minHeight: "42px",
      borderColor: state.isFocused ? "#cf0006" : "#ccc",
      boxShadow: state.isFocused ? "0 0 0 1px #cf0006" : "none",
      "&:hover": { borderColor: "#cf0006" },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  };

  return (
    <div className={styles.filterContainer} role="region" aria-label="Tournament filters">
      {/* Country Filter */}
      <div className={styles.filterField}>
        <label htmlFor="country-select" className={styles.label}>
          Country:
        </label>
        <ReactSelect
          inputId="country-select"
          options={countryOptions}
          value={countryOptions.find(opt => opt.value === filters.country) || countryOptions[0]}
          onChange={handleCountryChange}
          formatOptionLabel={formatOptionLabel}
          placeholder="Select country"
          isClearable
          isSearchable
          menuPortalTarget={document.body}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by country"
        />
      </div>

      {/* Tournament Level Filter */}
      <div className={styles.filterField}>
        <label htmlFor="level-select" className={styles.label}>
          Tournament Level:
        </label>
        <ReactSelect
          inputId="level-select"
          options={tournamentLevelOptions}
          value={tournamentLevelOptions.find(opt => opt.value === filters.tournamentLevel) || tournamentLevelOptions[0]}
          onChange={handleLevelChange}
          placeholder="All Levels"
          isClearable
          menuPortalTarget={document.body}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by tournament level"
        />
      </div>

      {/* Tournament Type Filter */}
      <div className={styles.filterField}>
        <label htmlFor="type-select" className={styles.label}>
          Tournament Type:
        </label>
        <ReactSelect
          inputId="type-select"
          options={tournamentTypeOptions}
          value={tournamentTypeOptions.find(opt => opt.value === filters.tournamentType) || tournamentTypeOptions[0]}
          onChange={handleTypeChange}
          placeholder="All Types"
          isClearable
          menuPortalTarget={document.body}
          styles={selectStyles}
          classNamePrefix="select"
          aria-label="Filter by tournament type"
        />
      </div>
    </div>
  );
};

export default FilterComponent;