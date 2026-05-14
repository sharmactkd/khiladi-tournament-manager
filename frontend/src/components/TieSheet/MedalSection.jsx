// src/components/TieSheet/MedalSection.jsx
import React from 'react';
import { getName, MEDAL_PLACEHOLDER } from './bracketUtils';
import styles from '../../pages/TieSheet.module.css';

const PLACEHOLDER = '_________________';

const MedalSection = ({
  medals = {},
  categoryPlayerCount = 0,
  bracket = {},
  bracketsOutcomes = {},
}) => {
  const playerCount = categoryPlayerCount || bracket?.playerCount || 0;

  let gold = PLACEHOLDER;
  let silver = PLACEHOLDER;
  let bronze1 = PLACEHOLDER;
  let bronze2 = PLACEHOLDER;

  const showSilver = playerCount >= 2;
  const showBronze1 = playerCount >= 3;
  const showBronze2 = playerCount >= 4;

  const hasProvidedMedals =
    medals &&
    typeof medals === 'object' &&
    (medals.gold || medals.silver || medals.bronze1 || medals.bronze2);

  if (hasProvidedMedals) {
    gold = medals.gold || PLACEHOLDER;
    silver = medals.silver || PLACEHOLDER;
    bronze1 = medals.bronze1 || PLACEHOLDER;
    bronze2 = medals.bronze2 || PLACEHOLDER;
  } else {
    let finalGame = null;

    if (bracket?.gamesByRound?.length > 0) {
      finalGame = bracket.gamesByRound[bracket.gamesByRound.length - 1]?.[0] || null;
    } else if (bracket?.game) {
      finalGame = bracket.game;
    }

    const bracketKey = bracket?.key || '';
    const finalOutcome = finalGame ? bracketsOutcomes?.[bracketKey]?.[finalGame.id] : null;

    if (playerCount === 1) {
      if (finalGame && (finalOutcome === 'home' || finalOutcome === 'away')) {
        const winnerSide = finalGame.sides?.home;
        gold = getName(winnerSide, bracketKey, null, bracketsOutcomes) || PLACEHOLDER;
      }
    } else if (finalGame && (finalOutcome === 'home' || finalOutcome === 'away')) {
      const winnerSide = finalGame.sides?.[finalOutcome];
      const loserSide = finalGame.sides?.[finalOutcome === 'home' ? 'away' : 'home'];

      if (winnerSide) {
        gold = getName(winnerSide, bracketKey, null, bracketsOutcomes) || PLACEHOLDER;
      }

      if (loserSide) {
        silver = getName(loserSide, bracketKey, null, bracketsOutcomes) || PLACEHOLDER;
      }

      if (bracket?.gamesByRound?.length >= 2) {
        const semiRound = bracket.gamesByRound[bracket.gamesByRound.length - 2];

        if (semiRound?.length >= 1) {
          const semi1 = semiRound[0];
          const semi1Outcome = bracketsOutcomes?.[bracketKey]?.[semi1.id];

          if (semi1Outcome === 'home' || semi1Outcome === 'away') {
            const semi1LoserSide = semi1.sides?.[semi1Outcome === 'home' ? 'away' : 'home'];
            bronze1 = getName(semi1LoserSide, bracketKey, null, bracketsOutcomes) || PLACEHOLDER;
          }
        }

        if (semiRound?.length >= 2) {
          const semi2 = semiRound[1];
          const semi2Outcome = bracketsOutcomes?.[bracketKey]?.[semi2.id];

          if (semi2Outcome === 'home' || semi2Outcome === 'away') {
            const semi2LoserSide = semi2.sides?.[semi2Outcome === 'home' ? 'away' : 'home'];
            bronze2 = getName(semi2LoserSide, bracketKey, null, bracketsOutcomes) || PLACEHOLDER;
          }
        }
      }
    }
  }

  const hasAnyWinner =
    (gold && gold !== PLACEHOLDER && gold !== MEDAL_PLACEHOLDER) ||
    (silver && silver !== PLACEHOLDER && silver !== MEDAL_PLACEHOLDER) ||
    (bronze1 && bronze1 !== PLACEHOLDER && bronze1 !== MEDAL_PLACEHOLDER) ||
    (bronze2 && bronze2 !== PLACEHOLDER && bronze2 !== MEDAL_PLACEHOLDER);

  return (
    <div className={styles.signatureMedalSection}>
      <div className={`${styles.medalRow} ${hasAnyWinner ? styles.hasWinners : ''}`}>
        <span className={styles.medal}>
          GOLD:{' '}
          <strong
            className={
              gold === MEDAL_PLACEHOLDER || gold === PLACEHOLDER
                ? styles.placeholderText
                : `${styles.medalistName} ${styles.gold}`
            }
          >
            {gold}
          </strong>
        </span>

        {showSilver && (
          <span className={styles.medal}>
            SILVER:{' '}
            <strong
              className={
                silver === MEDAL_PLACEHOLDER || silver === PLACEHOLDER
                  ? styles.placeholderText
                  : `${styles.medalistName} ${styles.silver}`
              }
            >
              {silver}
            </strong>
          </span>
        )}

        {showBronze1 && (
          <span className={styles.medal}>
            BRONZE:{' '}
            <strong
              className={
                bronze1 === MEDAL_PLACEHOLDER ||
                bronze1 === PLACEHOLDER ||
                (typeof bronze1 === 'string' && bronze1.includes('_'))
                  ? styles.placeholderText
                  : `${styles.medalistName} ${styles.bronze}`
              }
            >
              {bronze1}
            </strong>
          </span>
        )}

        {showBronze2 && (
          <span className={styles.medal}>
            BRONZE:{' '}
            <strong
              className={
                bronze2 === MEDAL_PLACEHOLDER ||
                bronze2 === PLACEHOLDER ||
                (typeof bronze2 === 'string' && bronze2.includes('_'))
                  ? styles.placeholderText
                  : `${styles.medalistName} ${styles.bronze}`
              }
            >
              {bronze2}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
};

export default MedalSection;