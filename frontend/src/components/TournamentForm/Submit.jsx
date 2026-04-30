// src/components/TournamentForm/Submit.jsx

import React, { useEffect, useState } from 'react';
import { FaSpinner } from 'react-icons/fa';
import { useFormikContext } from 'formik';
import styles from "../../pages/TournamentForm.module.css";

const Submit = ({ initialTournament }) => {
  const { isSubmitting, isValid, dirty } = useFormikContext();

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isSubmitting) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + 15;
        });
      }, 400);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isSubmitting]);

  return (
    <div className={styles.section}>
      <button
        type="submit"
       disabled={isSubmitting}
        className={styles.submitButton}
       style={{
  opacity: isSubmitting ? 0.6 : 1,
  cursor: isSubmitting ? "not-allowed" : "pointer"
}}
      >
        {isSubmitting ? (
          <>
            <FaSpinner className={styles.spinner} />
            {progress > 0 ? `Uploading... ${progress}%` : 'Saving...'}
          </>
        ) : initialTournament ? (
          'Update Tournament'
        ) : (
          'Create Tournament'
        )}
      </button>

      {isSubmitting && progress > 0 && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
};

export default Submit;