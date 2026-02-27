// src/components/TournamentForm/TournamentDescription.jsx

import React from 'react';
import { ErrorMessage } from 'formik'; // Formik se error message
import styles from "../../pages/TournamentForm.module.css";

const TournamentDescription = ({ values, setFieldValue, errors, touched }) => {
  return (
    <div className={styles.section}>
      <h2>Tournament Details / Description</h2>
      <div className={styles.descriptionContainer}>
        <div className={styles.fieldWrapper}>
          <textarea
            name="description"
            id="tournamentDescription"
            placeholder="Enter tournament description (rules, special notes, prizes, contact info, etc.)..."
            value={values.description || ''}
            onChange={(e) => setFieldValue('description', e.target.value)}
            className={`${styles.descriptionInput} ${
              touched.description && errors.description ? styles.errorInput : ''
            }`}
            rows="8"
            aria-label="Tournament description and special notes"
          />
          <ErrorMessage name="description" component="div" className={styles.errorText} />
        </div>
      </div>
    </div>
  );
};

export default TournamentDescription;