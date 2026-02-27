// src/components/TieSheet/SignatureSection.jsx
import React from 'react';
import styles from '../../pages/TieSheet.module.css';

// Configurable list (easy to add/remove roles later)
const SIGNATURE_ROLES = [
  { label: 'ARENA INCHARGE', key: 'arena-incharge' },
  { label: 'REFEREE 1', key: 'referee-1' },
  { label: '2', key: 'referee-2' },
  { label: '3', key: 'referee-3' },
  { label: '4', key: 'referee-4' },
  { label: '5', key: 'referee-5' },
];

/**
 * Static signature section for print/PDF
 * Displays roles with underline placeholders for signing
 */
const SignatureSection = () => {
  return (
    <div
      className={styles.signatureLeft}
      role="contentinfo"
      aria-label="Signature section for officials"
    >
      <div className={styles.signature}>
        {SIGNATURE_ROLES.map((role, index) => (
          <React.Fragment key={role.key}>
            {role.label}:{' '}
            <span
              className={styles.signatureUnderline}
              aria-hidden="true"
            >
              ______________________
            </span>
            {index < SIGNATURE_ROLES.length - 1 && ' '}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default SignatureSection;