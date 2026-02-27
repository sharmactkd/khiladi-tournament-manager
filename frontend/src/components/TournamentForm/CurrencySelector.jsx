// src/components/TournamentForm/CurrencySelector.jsx

import React from 'react';
import ReactSelect from 'react-select';
import { ErrorMessage } from 'formik'; // Formik se error message import
import styles from "../../pages/TournamentForm.module.css";

const CurrencySelector = ({
  currencyOptions,
  values,            // Formik se milta hai (values.entryFees.currency)
  setFieldValue,     // Formik se milta hai
  errors,            // Formik se errors
  touched,           // Formik se touched
}) => {
  return (
    <div className={styles.currencyContainer}>
      <span className={styles.currencyLabel}>Currency:</span>

      <div className={styles.fieldWrapper}>
        <ReactSelect
          className={styles.currencyDropdown}
          options={currencyOptions}
          value={currencyOptions.find((option) => option.value === values.entryFees?.currency) || null}
          onChange={(selected) => {
            setFieldValue('entryFees.currency', selected.value);
            setFieldValue('entryFees.currencySymbol', selected.symbol);
          }}
          styles={{
            control: (provided) => ({
              ...provided,
              minWidth: "200px",
              border: "1.5px solid #cf0006",
              borderRadius: "4px",
              // Error border if touched
              borderColor: touched.entryFees?.currency && errors.entryFees?.currency ? '#cf0006' : '#cf0006',
            }),
            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
          }}
          menuPortalTarget={document.body}
          isSearchable
          placeholder="Select currency"
          aria-label="Select currency for entry fees"
        />

        {/* Error message for currency */}
        <ErrorMessage
          name="entryFees.currency"
          component="div"
          className={styles.errorText}
        />
      </div>
    </div>
  );
};

export default CurrencySelector;