// src/components/TieSheet/MedalSection.jsx
import React from 'react';
import { MEDAL_PLACEHOLDER } from './bracketUtils';
import { PLACEHOLDER, normalizeDisplayMedals, hasAnyDisplayMedal } from './medalUtils';
import styles from '../../pages/TieSheet.module.css';

const MedalSection = ({
  medals = {},
  categoryPlayerCount = 0,
  bracket = {},
}) => {
  const playerCount = categoryPlayerCount || bracket?.playerCount || bracket?.categoryPlayerCount || 0;

  const normalizedMedals = normalizeDisplayMedals(medals);

  const gold = normalizedMedals.gold;
  const silver = normalizedMedals.silver;
  const bronze1 = normalizedMedals.bronze1;
  const bronze2 = normalizedMedals.bronze2;

  const showSilver = playerCount >= 2;
  const showBronze1 = playerCount >= 3;
  const showBronze2 = playerCount >= 4;

  const hasAnyWinner = hasAnyDisplayMedal(normalizedMedals);

  const getMedalClassName = (value, medalClass) => {
    if (
      value === MEDAL_PLACEHOLDER ||
      value === PLACEHOLDER ||
      (typeof value === 'string' && value.includes('_'))
    ) {
      return styles.placeholderText;
    }

    return `${styles.medalistName} ${medalClass}`;
  };

  return (
    <div className={styles.signatureMedalSection}>
      <div className={`${styles.medalRow} ${hasAnyWinner ? styles.hasWinners : ''}`}>
        <span className={styles.medal}>
          GOLD:{' '}
          <strong className={getMedalClassName(gold, styles.gold)}>
            {gold}
          </strong>
        </span>

        {showSilver && (
          <span className={styles.medal}>
            SILVER:{' '}
            <strong className={getMedalClassName(silver, styles.silver)}>
              {silver}
            </strong>
          </span>
        )}

        {showBronze1 && (
          <span className={styles.medal}>
            BRONZE:{' '}
            <strong className={getMedalClassName(bronze1, styles.bronze)}>
              {bronze1}
            </strong>
          </span>
        )}

        {showBronze2 && (
          <span className={styles.medal}>
            BRONZE:{' '}
            <strong className={getMedalClassName(bronze2, styles.bronze)}>
              {bronze2}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
};

export default MedalSection;