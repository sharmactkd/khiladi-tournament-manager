// src/components/TieSheet/BracketPrintPage.jsx
import React from 'react';
import BracketHeader from './BracketHeader';
import BracketTable from './BracketTable';
import MedalSection from './MedalSection';
import SignatureSection from './SignatureSection';
import BracketFooter from './BracketFooter';
import { MEDAL_PLACEHOLDER, sanitizeId } from './bracketUtils';
import styles from '../../pages/TieSheet.module.css';

const BracketPrintPage = ({
  bracket,
  medals,
  index,
  total,
  tournamentName,
  federation,
  logoLeft,
  logoRight,
  bracketsOutcomes,
  lockedBrackets
}) => {
  return (
    <div className={styles.printPage}>
     <div className={`${styles.page} page`} data-bracket-key={sanitizeId(bracket.key)}>
        <BracketHeader
          bracket={bracket}
          tournamentName={tournamentName}
          federation={federation}
          logoLeft={logoLeft}
          logoRight={logoRight}
        />

        <BracketTable
          bracket={bracket}
          bracketsOutcomes={bracketsOutcomes}
          lockedBrackets={lockedBrackets}
        />

        <div className={styles.signatureMedalSection}>
          <MedalSection
            medals={medals || {
              gold: MEDAL_PLACEHOLDER,
              silver: MEDAL_PLACEHOLDER,
              bronze1: MEDAL_PLACEHOLDER,
              bronze2: MEDAL_PLACEHOLDER,
            }}
            categoryPlayerCount={bracket.categoryPlayerCount || bracket.playerCount}
            bracket={bracket}
            bracketsOutcomes={bracketsOutcomes}
          />
          <SignatureSection />
        </div>

        <BracketFooter index={index} total={total} />
      </div>
    </div>
  );
};

export default BracketPrintPage;