// src/components/TieSheet/ShuffleButton.jsx
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { shuffleBracket } from '../../store/bracketsSlice';
import styles from '../../pages/TieSheet.module.css';

const ShuffleButton = ({ bracket }) => {
  const dispatch = useDispatch();
  
  const isLocked = useSelector((state) =>
    state.brackets.lockedBrackets.includes(bracket.key)
  );

  const handleShuffle = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (isLocked) {
      alert('Cannot shuffle - bracket is locked');
      return;
    }

    if (bracket.pool === 'Final') {
      alert('Cannot shuffle pool final bracket');
      return;
    }

    console.log('Dispatching shuffle for:', bracket.key); // ← optional debug
    dispatch(shuffleBracket(bracket.key));
  };

  return (
    <button
      className={`${styles.toggleButton} ${styles.shuffleButton} ${isLocked ? styles.disabled : ''}`}
      onClick={handleShuffle}
      disabled={isLocked || bracket.pool === 'Final'}
      aria-label="Shuffle bracket"
    >
      🔀 Shuffle
    </button>
  );
};

export default ShuffleButton;