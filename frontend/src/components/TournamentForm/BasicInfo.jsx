// src/components/TournamentForm/BasicInfo.jsx

import React from "react";
import ReactSelect from "react-select";
import ReactCountryFlag from "react-country-flag";
import { FaMapMarkerAlt } from "react-icons/fa";
import { ErrorMessage } from "formik";
import CustomPhoneInput from "./CustomPhoneInput";
import DatePickers from "./DatePickers";
import styles from "../../pages/TournamentForm.module.css";

const BasicInfo = ({
  values,
  setFieldValue,
  errors,
  touched,
  startDatePickerRef,
  endDatePickerRef,
  countries,
  states,
  cities,
  handleCountryChange,
  handleStateChange,
}) => {
  const countryOptions = countries.map((country) => ({
    value: country.isoCode,
    label: country.name,
  }));

  const stateOptions = states.map((state) => ({
    value: state.isoCode,
    label: state.name,
  }));

  const districtOptions = cities.map((city) => ({
    value: city.name,
    label: city.name,
  }));

  const customSelectStyles = {
    control: (provided) => ({
      ...provided,
      width: "270px",
      minWidth: "200px",
      border: "1px solid #ccc",
      borderRadius: "6px",
      boxShadow: "none",
    }),
    menu: (provided) => ({
      ...provided,
      width: "300px",
      minWidth: "300px",
      zIndex: 9999,
    }),
    menuPortal: (provided) => ({
      ...provided,
      zIndex: 9999,
    }),
  };

  return (
    <div className={styles.section}>
      <h2>Basic Information</h2>

      {/* Organizer, Federation, Tournament Name */}
      <div className={styles.nameFields}>
        <div className={styles.fieldWrapper}>
          <input
            type="text"
            id="organizer"
            name="organizer"
            autoComplete="organization"
            placeholder="Organizer"
            value={values.organizer || ""}
            onChange={(e) => setFieldValue("organizer", e.target.value)}
            onBlur={(e) => setFieldValue("organizer", e.target.value.trim())}
            className={touched.organizer && errors.organizer ? styles.errorInput : ""}
          />
          <ErrorMessage name="organizer" component="div" className={styles.errorText} />
        </div>

        <div className={styles.fieldWrapper}>
          <input
            type="text"
            id="federation"
            name="federation"
            placeholder="Federation"
            value={values.federation || ""}
            onChange={(e) => setFieldValue("federation", e.target.value)}
            onBlur={(e) => setFieldValue("federation", e.target.value.trim())}
            className={touched.federation && errors.federation ? styles.errorInput : ""}
          />
          <ErrorMessage name="federation" component="div" className={styles.errorText} />
        </div>

        <div className={styles.fieldWrapper}>
          <input
            type="text"
            id="tournamentName"
            name="tournamentName"
            placeholder="Tournament Name"
            value={values.tournamentName || ""}
            onChange={(e) => setFieldValue("tournamentName", e.target.value)}
            onBlur={(e) => setFieldValue("tournamentName", e.target.value.trim())}
            className={touched.tournamentName && errors.tournamentName ? styles.errorInput : ""}
          />
          <ErrorMessage name="tournamentName" component="div" className={styles.errorText} />
        </div>
      </div>

      {/* Email & Phone */}
      <div className={styles.rowFields}>
        <div className={styles.fieldWrapper}>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="E-mail"
            value={values.email || ""}
            onChange={(e) => setFieldValue("email", e.target.value)}
            onBlur={(e) => setFieldValue("email", e.target.value.trim())}
            className={touched.email && errors.email ? styles.errorInput : ""}
          />
          <ErrorMessage name="email" component="div" className={styles.errorText} />
        </div>

        <div className={styles.fieldWrapper} data-field="contact">
          <CustomPhoneInput
            value={values.contact || ""}
            setFieldValue={setFieldValue}
            name="contact"
            errors={errors}
            touched={touched}
          />
        </div>
      </div>

      {/* Date Pickers */}
      <DatePickers
        values={values}
        setFieldValue={setFieldValue}
        errors={errors}
        touched={touched}
        startDatePickerRef={startDatePickerRef}
        endDatePickerRef={endDatePickerRef}
      />

      {/* Venue Name & Map Button */}
      <div className={styles.venueNameRow}>
        <div className={styles.fieldWrapper} style={{ flex: 1 }}>
          <input
            type="text"
            id="venue.name"
            name="venue.name"
            placeholder="Venue Name"
            value={values.venue?.name || ""}
            onChange={(e) => setFieldValue("venue.name", e.target.value)}
            onBlur={(e) => setFieldValue("venue.name", e.target.value.trim())}
            className={touched.venue?.name && errors.venue?.name ? styles.errorInput : ""}
            style={{ width: "100%" }}
          />
          <ErrorMessage name="venue.name" component="div" className={styles.errorText} />
        </div>

        <button type="button" className={styles.mapButton} aria-label="View venue on map">
          <FaMapMarkerAlt />
        </button>
      </div>

      {/* Venue Dropdowns */}
      <div className={styles.venueContainer}>
        <div className={styles.venueDropdowns}>
          {/* Country */}
          <div className={styles.fieldWrapper} data-field="venue.country">
            <ReactSelect
              inputId="venue.country"
              name="venue.country"
              classNamePrefix="react-select"
              options={countryOptions}
              value={countryOptions.find((option) => option.value === values.venue?.country) || null}
              onChange={(selected) => {
                const code = selected ? selected.value : "";
                handleCountryChange(code);
                setFieldValue("venue.country", code);
                setFieldValue("venue.state", "");
                setFieldValue("venue.district", "");
              }}
              placeholder="Country"
              formatOptionLabel={(option) => (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <ReactCountryFlag
                    countryCode={option.value}
                    svg
                    style={{
                      width: "1.5em",
                      height: "1.5em",
                      marginRight: "0.5em",
                    }}
                  />
                  {option.label}
                </div>
              )}
              styles={customSelectStyles}
              menuPortalTarget={document.body}
              isClearable
              isSearchable
            />
            <ErrorMessage name="venue.country" component="div" className={styles.errorText} />
          </div>

          {/* State */}
          <div className={styles.fieldWrapper} data-field="venue.state">
            <ReactSelect
              inputId="venue.state"
              name="venue.state"
              classNamePrefix="react-select"
              options={stateOptions}
              value={stateOptions.find((option) => option.value === values.venue?.state) || null}
              onChange={(selected) => {
                const code = selected ? selected.value : "";
                handleStateChange(code);
                setFieldValue("venue.state", code);
                setFieldValue("venue.district", "");
              }}
              placeholder="State"
              isDisabled={!values.venue?.country}
              styles={customSelectStyles}
              menuPortalTarget={document.body}
              isClearable
              isSearchable
            />
            <ErrorMessage name="venue.state" component="div" className={styles.errorText} />
          </div>

          {/* District */}
          <div className={styles.fieldWrapper} data-field="venue.district">
            <ReactSelect
              inputId="venue.district"
              name="venue.district"
              classNamePrefix="react-select"
              options={districtOptions}
              value={districtOptions.find((option) => option.value === values.venue?.district) || null}
              onChange={(selected) => {
                const name = selected ? selected.value : "";
                setFieldValue("venue.district", name);
              }}
              placeholder="District"
              isDisabled={!values.venue?.state}
              styles={customSelectStyles}
              menuPortalTarget={document.body}
              isClearable
              isSearchable
            />
            <ErrorMessage name="venue.district" component="div" className={styles.errorText} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicInfo;