// src/components/TournamentForm/CustomPhoneInput.jsx

import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactSelect from "react-select";
import ReactCountryFlag from "react-country-flag";
import { Country } from "country-state-city";
import { ErrorMessage } from "formik";
import styles from "../../pages/TournamentForm.module.css";

const CustomPhoneInput = ({
  value,
  setFieldValue,
  name = "contact",
  errors,
  touched,
}) => {
  const [countryCode, setCountryCode] = useState("+91");
  const [rawNumber, setRawNumber] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const prevValueRef = useRef(null);

  // Sync with Formik value
  useEffect(() => {
    if (value && value !== prevValueRef.current && value !== `${countryCode}${rawNumber}`) {
      const codes = Country.getAllCountries()
        .map((c) => c.phonecode)
        .sort((a, b) => b.length - a.length);
      const matchedCode = codes.find((code) => value.startsWith(`+${code}`));
      if (matchedCode) {
        setCountryCode(`+${matchedCode}`);
        const nationalNumber = value.slice(matchedCode.length + 1).replace(/\D/g, "");
        setRawNumber(nationalNumber);
      } else {
        setCountryCode("+91");
        setRawNumber(value.replace(/\D/g, ""));
      }
    }
    prevValueRef.current = value;
  }, [value, countryCode, rawNumber]);

  const formatPhoneNumber = (digits) => {
    if (!digits) return "";
    const part1 = digits.slice(0, 4);
    const part2 = digits.slice(4, 6);
    const part3 = digits.slice(6);
    if (part2) {
      return `${part1}-${part2}${part3 ? `-${part3}` : ""}`;
    } else if (part1.length > 0) {
      return part1;
    }
    return "";
  };

  const handleChange = useCallback(
    (e) => {
      const inputValue = e.target.value.replace(/[^0-9]/g, "");
      const maxLength = countryCode === "+91" ? 10 : 15;
      if (inputValue.length <= maxLength) {
        setRawNumber(inputValue);
        const fullNumber = `${countryCode}${inputValue}`;
        if (fullNumber !== value) {
          setFieldValue(name, fullNumber);
        }
      }
    },
    [countryCode, value, setFieldValue, name]
  );

  const handleCountryChange = (selected) => {
    setCountryCode(selected.value);
    setRawNumber("");
    setErrorMessage("");
    setFieldValue(name, selected.value);
  };

  const validatePhoneNumber = () => {
    if (countryCode === "+91") {
      if (rawNumber.length > 0 && rawNumber.length !== 10) {
        setErrorMessage(`${rawNumber.length} Digits Only`);
      } else {
        setErrorMessage("");
      }
    } else {
      if (rawNumber.length > 15) {
        setErrorMessage("Maximum 15 digits allowed");
      } else if (rawNumber.length === 0) {
        setErrorMessage("Phone number is required");
      } else {
        setErrorMessage("");
      }
    }
  };

  const countryOptions = Country.getAllCountries().map((country) => ({
    value: `+${country.phonecode}`,
    label: (
      <div style={{ display: "flex", alignItems: "center" }}>
        <ReactCountryFlag
          countryCode={country.isoCode}
          svg
          style={{ width: "1.5em", height: "1.5em", marginRight: "0.5em" }}
        />
        {country.name} (+{country.phonecode})
      </div>
    ),
  }));

  const formattedNumber = formatPhoneNumber(rawNumber);

  return (
    <div className={styles.customPhoneContainer}>
      <div className={styles.phoneInputRow}>
        {/* Country Code Select */}
        <div className={styles.fieldWrapper}>
          <ReactSelect
            options={countryOptions}
            value={countryOptions.find((opt) => opt.value === countryCode)}
            onChange={handleCountryChange}
            styles={{
              control: (provided) => ({
                ...provided,
                width: 170,
                border: "1px solid #ccc",
                borderRadius: "4px 0 0 4px",
                borderColor: touched[name] && errors[name] ? '#cf0006' : '#ccc',
              }),
              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            }}
            menuPortalTarget={document.body}
            aria-label="Select country code for phone number"
          />
          <ErrorMessage name={name} component="div" className={styles.errorText} />
        </div>

        {/* Phone Number Input */}
        <div className={styles.inputWrapper}>
          <input
            type="text"
            value={formattedNumber}
            onChange={handleChange}
            onBlur={() => {
              validatePhoneNumber();
              // Ensure Formik gets the latest value
              setFieldValue(name, `${countryCode}${rawNumber}`);
            }}
            placeholder="Phone number"
            className={touched[name] && errors[name] ? styles.errorInput : styles.phoneNumberInput}
            aria-label="Phone number input"
          />

          {/* Local error message (real-time feedback) */}
          {errorMessage && <span className={styles.errorMessage}>{errorMessage}</span>}
        </div>
      </div>
    </div>
  );
};

export default CustomPhoneInput;