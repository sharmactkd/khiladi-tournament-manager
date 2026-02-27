// src/components/TieSheet/LockButton.jsx
import React, { useCallback } from 'react';
import styles from '../../pages/TieSheet.module.css';

const LockButton = ({
  bracketKey,           // full bracket key (e.g. "Male_Under-19_55kg" या "..._PoolA")
  lockedBrackets,       // Set from parent
  toggleLock,           // function from TieSheet
  size = 'medium',
  disabled = false,
  className = '',
}) => {
  const baseKey = bracketKey.replace(/_Pool.*$/, '');
  const isLocked = lockedBrackets.has(baseKey);

  const handleClick = useCallback(() => {
    if (disabled) return;
    toggleLock(bracketKey); // parent को full key पास करेंगे
  }, [bracketKey, toggleLock, disabled]);

  return (
    <button
      className={`
        ${styles.toggleButton}
        ${isLocked ? styles.lockedButton : styles.unlockedButton}
        ${disabled ? styles.disabled : ''}
        ${className}
      `.trim()}
      onClick={handleClick}
      disabled={disabled}
      title={isLocked ? 'Bracket locked – कोई बदलाव नहीं हो सकता' : 'Bracket unlock करें – editing allowed'}
      aria-label={isLocked ? 'Unlock bracket' : 'Lock bracket'}
      aria-pressed={isLocked}
    >
      {isLocked ? '🔒 Locked' : '🔓 Unlock'}
    </button>
  );
};

export default LockButton;