// src/components/TieSheet/lockUtils.js
/**
 * Common lock check logic for both single and multiplayer brackets
 * @param {string} bracketKey - Full bracket key
 * @param {Set} lockedBrackets - Set of locked brackets
 * @returns {boolean} - true if bracket is locked
 */
export const isBracketLocked = (bracketKey, lockedBrackets) => {
  if (!bracketKey || !lockedBrackets) return false;
  
  // Extract base key (remove _Pool* suffix)
  const baseKey = bracketKey.replace(/_Pool.*$/, '');
  return lockedBrackets.has(baseKey);
};

/**
 * Common lock check with alert
 * @param {string} bracketKey - Full bracket key
 * @param {Set} lockedBrackets - Set of locked brackets
 * @returns {boolean} - true if bracket is locked (and alert shown)
 */
export const checkAndAlertIfLocked = (bracketKey, lockedBrackets) => {
  const locked = isBracketLocked(bracketKey, lockedBrackets);
  
  if (locked) {
    console.log(`🔒 Bracket locked: ${bracketKey}`);
    alert(`This bracket is locked. Unlock it first to make changes.`);
    return true;
  }
  
  return false;
};