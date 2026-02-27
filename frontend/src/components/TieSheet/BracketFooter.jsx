// src/components/TieSheet/BracketFooter.jsx
import React, { memo } from 'react';
import styles from '../../pages/TieSheet.module.css';

const APP_NAME = 'EVOLVE - Tournament Manager';
const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'https://khiladi-khoj.com';
const WEBSITE_TEXT = WEBSITE_URL.replace(/^https?:\/\//, '');

const BracketFooter = ({ index, total }) => {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

  const sheetText = `Sheet ${index + 1} of ${total}`;

  return (
    <footer 
      className={styles.footer}
      aria-label={`Footer - ${sheetText}`}
    >
      <span>Made with: {APP_NAME}</span>
     <span className={styles.websiteLink} id="pdf-website-text">
  <a 
    href={WEBSITE_URL}
    target="_blank"
    rel="noopener noreferrer"
  >
    {WEBSITE_TEXT}
  </a>
</span>

      <span aria-live="polite">
        {formattedDate} - {sheetText}
      </span>
    </footer>
  );
};

export default memo(BracketFooter);