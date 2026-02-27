// src/components/TieSheet/BracketHeader.jsx
import React from 'react';
import styles from '../../pages/TieSheet.module.css';

const BracketHeader = ({
  bracket,
  tournamentName,
  federation,
  logoLeft,
  logoRight,
}) => {
  return (
    <div className={styles.header}>
      {/* Logos with lazy loading & accessibility */}
      {logoLeft && (
        <img
          src={logoLeft}
          loading="lazy" // ← Performance boost: lazy load
          className={styles.logoLeft}
          alt={`Left logo for ${tournamentName}`} // ← Better alt
          onError={(e) => {
            e.target.style.display = 'none'; // Hide broken
            e.target.alt = 'Logo not available'; // Fallback text
          }}
        />
      )}

      {logoRight && (
        <img
          src={logoRight}
          loading="lazy"
          className={styles.logoRight}
          alt={`Right logo for ${tournamentName}`}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.alt = 'Logo not available';
          }}
        />
      )}

      {/* Tournament Name */}
      <h1>{tournamentName?.toUpperCase() || 'Tournament'}</h1>

      {/* Federation */}
      <p className={styles.federationName}>
        {federation || 'Federation Not Specified'}
      </p>

      {/* Category Row - Simplified */}
      <div className={styles.categoryRow}>
        {bracket?.pool && (
          <span className={styles.categoryItem}>
            Pool: {bracket.pool}
          </span>
        )}
        {bracket?.ageCategory && (
          <span className={styles.categoryItem}>{bracket.ageCategory}</span>
        )}
        {bracket?.gender && (
          <span className={styles.categoryItem}>{bracket.gender}</span>
        )}
        {bracket?.weightCategory && (
          <span className={styles.categoryItem}>{bracket.weightCategory}</span>
        )}
        <span className={styles.categoryItem}>
          Total Players: {bracket?.categoryPlayerCount || bracket?.playerCount || 'N/A'}
        </span>
      </div>
    </div>
  );
};

export default BracketHeader;