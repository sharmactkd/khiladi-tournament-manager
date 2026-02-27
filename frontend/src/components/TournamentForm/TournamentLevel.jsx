// src/components/TournamentForm/TournamentLevel.jsx

import React from 'react';
import { TOURNAMENT_LEVELS } from './constants';
import { ErrorMessage } from 'formik'; // Formik se error message
import styles from "../../pages/TournamentForm.module.css";

const TournamentLevel = ({ values, setFieldValue, errors, touched }) => {
  return (
    <div className={styles.section}>
      <h2>Tournament Level</h2>
      <div className={styles.tournamentLevelSection}>
        <div className={styles.levelButtonsContainer}>
          {TOURNAMENT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.levelButton} ${
                values.tournamentLevel === level ? styles.selectedLevelButton : ''
              }`}
              onClick={() => setFieldValue('tournamentLevel', level)}
              aria-pressed={values.tournamentLevel === level}
              aria-label={`Select tournament level: ${level}`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Error message for tournament level */}
        <ErrorMessage
          name="tournamentLevel"
          component="div"
          className={styles.errorText}
        />
      </div>
    </div>
  );
};

export default TournamentLevel;