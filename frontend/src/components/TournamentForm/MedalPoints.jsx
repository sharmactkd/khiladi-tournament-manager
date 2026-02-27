// src/components/TournamentForm/MedalPoints.jsx

import React from 'react';
import { ErrorMessage } from 'formik'; // Formik se error message
import styles from "../../pages/TournamentForm.module.css";

const MedalPoints = ({ values, setFieldValue, errors, touched }) => {
  return (
    <div className={styles.section}>
      <h2>Medal Points for Team Championship</h2>
      <div className={styles.pointSystem}>
        {/* Gold */}
        <div className={styles.pointRow}>
          <label htmlFor="goldPoints">Gold:</label>
          <div className={styles.fieldWrapper}>
            <input
              id="goldPoints"
              type="number"
              min="0"
              name="medalPoints.gold"
              value={values.medalPoints?.gold || ''}
              onChange={(e) => setFieldValue('medalPoints.gold', e.target.value)}
              className={touched.medalPoints?.gold && errors.medalPoints?.gold ? styles.errorInput : ''}
              aria-label="Points for gold medal"
              aria-required="true"
            />
            <ErrorMessage name="medalPoints.gold" component="div" className={styles.errorText} />
          </div>
        </div>

        {/* Silver */}
        <div className={styles.pointRow}>
          <label htmlFor="silverPoints">Silver:</label>
          <div className={styles.fieldWrapper}>
            <input
              id="silverPoints"
              type="number"
              min="0"
              name="medalPoints.silver"
              value={values.medalPoints?.silver || ''}
              onChange={(e) => setFieldValue('medalPoints.silver', e.target.value)}
              className={touched.medalPoints?.silver && errors.medalPoints?.silver ? styles.errorInput : ''}
              aria-label="Points for silver medal"
              aria-required="true"
            />
            <ErrorMessage name="medalPoints.silver" component="div" className={styles.errorText} />
          </div>
        </div>

        {/* Bronze */}
        <div className={styles.pointRow}>
          <label htmlFor="bronzePoints">Bronze:</label>
          <div className={styles.fieldWrapper}>
            <input
              id="bronzePoints"
              type="number"
              min="0"
              name="medalPoints.bronze"
              value={values.medalPoints?.bronze || ''}
              onChange={(e) => setFieldValue('medalPoints.bronze', e.target.value)}
              className={touched.medalPoints?.bronze && errors.medalPoints?.bronze ? styles.errorInput : ''}
              aria-label="Points for bronze medal"
              aria-required="true"
            />
            <ErrorMessage name="medalPoints.bronze" component="div" className={styles.errorText} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedalPoints;