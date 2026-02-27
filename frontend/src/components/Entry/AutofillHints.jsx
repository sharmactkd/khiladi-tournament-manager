// src/components/Entry/AutofillHints.jsx
import React from 'react';
import styles from '../../pages/Entry.module.css';

const AutofillHints = () => {
  return (
    <div className={styles.autofillHints}>
      <strong>Quick Entry Shortcuts (Type & Enter):</strong>
      <div className={styles.hintGrid}>
        <div>
          <strong>Gender:</strong> M → Male, F → Female
        </div>
        <div>
          <strong>Event:</strong> K → Kyorugi, P → Poomsae
        </div>
        <div>
          <strong>Sub Event (Kyorugi):</strong> K → Kyorugi, F → Fresher, T → Tag Team
        </div>
        <div>
          <strong>Sub Event (Poomsae):</strong> I → Individual, P → Pair, T → Team
        </div>
        <div>
          <strong>Medal:</strong> G → Gold, S → Silver, B → Bronze, X → X-X-X-X
        </div>
      </div>
      <small>(Type first letter when cell is empty → auto-fills full value)</small>
    </div>
  );
};

export default AutofillHints;