// src/components/TournamentForm/AgeCategories.jsx

import React, { useEffect } from 'react';
import styles from "../../pages/TournamentForm.module.css";
import {
  handleAgeToggle,
  handleGenderToggle,
  handleSelectAllAges
} from './helpers';
import { MAIN_AGE_CATEGORIES } from './constants'; // Select All button के लिए जरूरी

const UNDER_AGE_CATEGORIES = ["Under - 14", "Under - 17", "Under - 19"];

const AgeCategories = ({ values, setFieldValue }) => {

  // === FINAL FIX: Default playerLimit = 1 only on FIRST Official selection ===
  useEffect(() => {
    const officialSelected = values.ageCategories?.official?.length > 0;
    if (officialSelected && values.playerLimit == null) {
      setFieldValue('playerLimit', 1);
    }
  }, [values.ageCategories?.official?.length, setFieldValue]);

  return (
    <div className={styles.section}>
      <h2>Tournament Type</h2>
      <div className={styles.typeContainer}>
        {/* ========= OPEN CATEGORY ========= */}
        <div
          className={`${styles.typeBox} ${
            values.ageCategories?.open?.length > 0 ? styles.activeType : ''
          }`}
        >
          <div className={styles.typeHeader}>
            <button
              type="button"
              className={styles.selectAllButton}
              onClick={() => handleSelectAllAges(values, setFieldValue, 'open')}
            >
              {MAIN_AGE_CATEGORIES.every((age) =>
                values.ageCategories?.open?.includes(age)
              )
                ? "Deselect All"
                : "Select All"}
            </button>
            <span className={styles.typeLabel}>Open</span>
          </div>

          <div className={styles.ageGrid}>
            {/* Main Ages */}
            <div className={styles.regularAgeContainer}>
              {MAIN_AGE_CATEGORIES.map((age) => (
                <div key={`open-${age}`} className={styles.ageContainer}>
                  <button
                    type="button"
                    className={`${styles.ageButton} ${
                      values.ageCategories?.open?.includes(age) ? styles.selectedAge : ''
                    }`}
                    onClick={() => handleAgeToggle(values, setFieldValue, age, 'open')}
                  >
                    {age}
                  </button>

                  {values.ageCategories?.open?.includes(age) && (
                    <div className={styles.individualGenderSelection}>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.open?.[age] || []).includes('Male')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Male', 'open')}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.open?.[age] || []).includes('Female')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Female', 'open')}
                      >
                        Female
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Under Ages */}
            <div className={styles.underAgeContainer}>
              {UNDER_AGE_CATEGORIES.map((age) => (
                <div key={`open-${age}`} className={styles.ageContainer}>
                  <button
                    type="button"
                    className={`${styles.ageButton} ${
                      values.ageCategories?.open?.includes(age) ? styles.selectedAge : ''
                    }`}
                    onClick={() => handleAgeToggle(values, setFieldValue, age, 'open')}
                  >
                    {age}
                  </button>

                  {values.ageCategories?.open?.includes(age) && (
                    <div className={styles.individualGenderSelection}>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.open?.[age] || []).includes('Male')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Male', 'open')}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.open?.[age] || []).includes('Female')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Female', 'open')}
                      >
                        Female
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ========= OFFICIAL CATEGORY ========= */}
        <div
          className={`${styles.typeBox} ${
            values.ageCategories?.official?.length > 0 ? styles.activeType : ''
          }`}
        >
          <div className={styles.typeHeader}>
            <button
              type="button"
              className={styles.selectAllButton}
              onClick={() => handleSelectAllAges(values, setFieldValue, 'official')}
            >
              {MAIN_AGE_CATEGORIES.every((age) =>
                values.ageCategories?.official?.includes(age)
              )
                ? "Deselect All"
                : "Select All"}
            </button>
            <span className={styles.typeLabel}>Official</span>
          </div>

          <div className={styles.ageGrid}>
            {/* Main Ages */}
            <div className={styles.regularAgeContainer}>
              {MAIN_AGE_CATEGORIES.map((age) => (
                <div key={`official-${age}`} className={styles.ageContainer}>
                  <button
                    type="button"
                    className={`${styles.ageButton} ${
                      values.ageCategories?.official?.includes(age) ? styles.selectedAge : ''
                    }`}
                    onClick={() => handleAgeToggle(values, setFieldValue, age, 'official')}
                  >
                    {age}
                  </button>

                  {values.ageCategories?.official?.includes(age) && (
                    <div className={styles.individualGenderSelection}>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.official?.[age] || []).includes('Male')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Male', 'official')}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.official?.[age] || []).includes('Female')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Female', 'official')}
                      >
                        Female
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Under Ages */}
            <div className={styles.underAgeContainer}>
              {UNDER_AGE_CATEGORIES.map((age) => (
                <div key={`official-${age}`} className={styles.ageContainer}>
                  <button
                    type="button"
                    className={`${styles.ageButton} ${
                      values.ageCategories?.official?.includes(age) ? styles.selectedAge : ''
                    }`}
                    onClick={() => handleAgeToggle(values, setFieldValue, age, 'official')}
                  >
                    {age}
                  </button>

                  {values.ageCategories?.official?.includes(age) && (
                    <div className={styles.individualGenderSelection}>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.official?.[age] || []).includes('Male')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Male', 'official')}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={`${styles.genderTag} ${
                          (values.ageGender?.official?.[age] || []).includes('Female')
                            ? styles.selectedAge
                            : ''
                        }`}
                        onClick={() => handleGenderToggle(values, setFieldValue, age, 'Female', 'official')}
                      >
                        Female
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Player Limit - Only for Official */}
          {values.ageCategories?.official?.length > 0 && (
            <div className={styles.playerLimitContainer}>
              <label className={styles.playerLimitLabel}>
                Maximum Number of Players<br />
                From Each Team in Each Weight Category:
              </label>
              <div className={styles.playerLimitButtons}>
                <button
                  type="button"
                  className={`${styles.playerLimitButton} ${
                    values.playerLimit === 1 ? styles.selectedButton : ''
                  }`}
                  onClick={() => setFieldValue('playerLimit', 1)}
                >
                  1
                </button>
                <button
                  type="button"
                  className={`${styles.playerLimitButton} ${
                    values.playerLimit === 2 ? styles.selectedButton : ''
                  }`}
                  onClick={() => setFieldValue('playerLimit', 2)}
                >
                  2
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgeCategories;