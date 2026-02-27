// src/components/TournamentForm/MatchSchedule.jsx

import React from 'react';
import { ErrorMessage } from 'formik';
import styles from "../../pages/TournamentForm.module.css";

const MatchSchedule = ({ values, setFieldValue, errors, touched }) => {
  return (
    <div className={styles.section}>
      <h2>Match Scheduling</h2>
      <div className={styles.fieldWrapper}>
        <textarea
          name="matchSchedule"
          placeholder="Enter match schedule details (e.g., day-wise timing, round structure)..."
          value={values.matchSchedule || ''}
          onChange={(e) => setFieldValue('matchSchedule', e.target.value)}
          className={`${styles.textarea} ${
            touched.matchSchedule && errors.matchSchedule ? styles.errorInput : ''
          }`}
          rows="6"
          aria-label="Match schedule details"
        />
        <ErrorMessage name="matchSchedule" component="div" className={styles.errorText} />
      </div>
    </div>
  );
};

export default MatchSchedule;