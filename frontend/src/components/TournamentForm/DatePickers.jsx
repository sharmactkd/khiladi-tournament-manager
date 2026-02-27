// src/components/TournamentForm/DatePickers.jsx

import React from 'react';
import ReactDatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { ErrorMessage } from 'formik';
import styles from "../../pages/TournamentForm.module.css";


const DatePickers = ({
  values,
  setFieldValue,
  errors,
  touched,
  startDatePickerRef,
  endDatePickerRef,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleStartDateChange = (date) => {
    if (date) {
      date.setHours(0, 0, 0, 0); // Reset time
    }
    setFieldValue('dateFrom', date);
  };

  const handleEndDateChange = (date) => {
    if (date) {
      date.setHours(0, 0, 0, 0); // Reset time
    }
    setFieldValue('dateTo', date);
  };

  return (
    <div className={styles.dates}>
      {/* Start Date */}
      <div className={styles.datePickerContainer}>
        <div className={styles.fieldWrapper}>
          <ReactDatePicker
            ref={startDatePickerRef}
            selected={values.dateFrom}
            onChange={handleStartDateChange}
            dateFormat="dd MMMM yyyy, EEEE"
            placeholderText="Select Start Date"
            className={`${styles.dateInput} ${touched.dateFrom && errors.dateFrom ? styles.errorInput : ''}`}
            minDate={today}
            shouldCloseOnSelect={true}
            required
            popperPlacement="bottom-start"
            wrapperClassName={styles.datepickerWrapper}
          />
          <ErrorMessage name="dateFrom" component="div" className={styles.errorText} />
        </div>
      </div>

      {/* End Date */}
      <div className={styles.datePickerContainer}>
        <div className={styles.fieldWrapper}>
          <ReactDatePicker
            ref={endDatePickerRef}
            selected={values.dateTo}
            onChange={handleEndDateChange}
            dateFormat="dd MMMM yyyy, EEEE"
            placeholderText="Select End Date"
            className={`${styles.dateInput} ${touched.dateTo && errors.dateTo ? styles.errorInput : ''}`}
            minDate={values.dateFrom || today}
            shouldCloseOnSelect={true}
            required
            popperPlacement="bottom-start"
            wrapperClassName={styles.datepickerWrapper}
          />
          <ErrorMessage name="dateTo" component="div" className={styles.errorText} />
        </div>
      </div>
    </div>
  );
};

export default DatePickers;