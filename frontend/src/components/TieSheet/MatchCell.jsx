import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { getTeamName, getName, findDependentGames } from './bracketUtils';
import styles from '../../pages/TieSheet.module.css';

const teamCache = new WeakMap();
const nameCache = new WeakMap();

const checkBracketLocked = (bracketKey, bracket, lockedBrackets) => {
  if (!lockedBrackets || !bracketKey) return false;
  const bracketkey = bracket?.key?.replace(/_Pool.*$/, '') || bracketKey.replace(/_Pool.*$/, '');
  return lockedBrackets.has(bracketkey);
};

const MatchCell = ({
  game,
  bracketKey,
  bracketsOutcomes,
  matchNumber,
  bracket,
  gamesByRound,
  lockedBrackets = new Set(),
  onOutcomeChange,
}) => {
  // Refs for immediate access (avoids stale closures)
  const lockedBracketsRef = useRef(lockedBrackets);
  const bracketKeyRef = useRef(bracketKey);
  const bracketRef = useRef(bracket);
  const onOutcomeChangeRef = useRef(onOutcomeChange);

  useEffect(() => {
    lockedBracketsRef.current = lockedBrackets;
  }, [lockedBrackets]);
  useEffect(() => {
    bracketKeyRef.current = bracketKey;
  }, [bracketKey]);
  useEffect(() => {
    bracketRef.current = bracket;
  }, [bracket]);
  useEffect(() => {
    onOutcomeChangeRef.current = onOutcomeChange;
  }, [onOutcomeChange]);

  // Debug: log every render (DEV only)
  if (import.meta.env.DEV) {
    console.log(`🎬 MatchCell rendering for: ${game?.id}, bracket: ${bracketKey}`);
  }

  const outcomes = bracketsOutcomes?.[bracketKey] || {};
  const currentWinner = outcomes[game?.id];

  // Cached team & name lookup
  const homeTeam = useMemo(() => {
    const cacheKey = { side: game?.sides?.home, outcomes };
    if (teamCache.has(cacheKey)) return teamCache.get(cacheKey);
    const team = getTeamName(game?.sides?.home, `home_${game?.id}`, bracketKey, game?.id, bracketsOutcomes);
    teamCache.set(cacheKey, team);
    return team;
  }, [game?.sides?.home, bracketKey, game?.id, bracketsOutcomes, outcomes]);

  const awayTeam = game?.sides?.away
    ? useMemo(() => {
        const cacheKey = { side: game.sides.away, outcomes };
        if (teamCache.has(cacheKey)) return teamCache.get(cacheKey);
        const team = getTeamName(game.sides.away, `away_${game?.id}`, bracketKey, game?.id, bracketsOutcomes);
        teamCache.set(cacheKey, team);
        return team;
      }, [game?.sides?.away, bracketKey, game?.id, bracketsOutcomes, outcomes])
    : null;

  const homeName = useMemo(() => {
    const cacheKey = { side: game?.sides?.home, bracketKey };
    if (nameCache.has(cacheKey)) return nameCache.get(cacheKey);
    const name = getName(game?.sides?.home, bracketKey, null, bracketsOutcomes);
    nameCache.set(cacheKey, name);
    return name;
  }, [game?.sides?.home, bracketKey, bracketsOutcomes]);

  const awayName = awayTeam
    ? useMemo(() => {
        const cacheKey = { side: game?.sides?.away, bracketKey };
        if (nameCache.has(cacheKey)) return nameCache.get(cacheKey);
        const name = getName(game?.sides?.away, bracketKey, null, bracketsOutcomes);
        nameCache.set(cacheKey, name);
        return name;
      }, [game?.sides?.away, bracketKey, bracketsOutcomes])
    : '';

  const isByeMatch = homeName === 'BYE' || awayName === 'BYE';

  const isMatchReady = useMemo(() => {
    if (isByeMatch) return true;

    let ready = true;

    ['home', 'away'].forEach((s) => {
      const side = game?.sides?.[s];
      if (side?.sourceGame) {
        let sourceOutcomes = bracketsOutcomes?.[bracketKey] || {};

        if (bracketKey?.endsWith('_PoolFinal') && side.pool) {
          const category = bracketKey.replace('_PoolFinal', '');
          const poolKey = `${category}_Pool${side.pool}`;
          sourceOutcomes = bracketsOutcomes?.[poolKey] || {};
        }

        const prevGameId = side.sourceGame.id;
        const prevWinner = sourceOutcomes?.[prevGameId];

        if (prevWinner !== 'home' && prevWinner !== 'away') {
          ready = false;
        }
      }
    });

    return ready;
  }, [game?.sides, bracketKey, bracketsOutcomes, isByeMatch, game?.id]);

  const handleClick = useCallback(
    (clickedSide) => {
      const currentLockedBrackets = lockedBracketsRef.current;
      const currentBracketKey = bracketKeyRef.current;
      const currentBracket = bracketRef.current;
      const currentOnOutcomeChange = onOutcomeChangeRef.current;

      const bracketkey =
        currentBracket?.key?.replace(/_Pool.*$/, '') || currentBracketKey.replace(/_Pool.*$/, '');
      const isCurrentlyLocked = currentLockedBrackets.has(bracketkey);

      if (import.meta.env.DEV) {
        console.log(`🔍 MatchCell click - bracketkey: ${bracketkey}, locked: ${isCurrentlyLocked}`);
      }

      if (isCurrentlyLocked) {
        if (import.meta.env.DEV) {
          console.log(`🚫 CLICK BLOCKED: ${bracketkey} is locked!`);
        }
        alert(`This bracket is locked. Unlock it first to make changes.`);
        return;
      }

      if (!isMatchReady || isByeMatch) {
        if (import.meta.env.DEV) {
          console.log(`⏳ Click ignored: match not ready or bye`);
        }
        return;
      }

      const now = Date.now();
      if (now - (window.lastClick || 0) < 300) {
        if (import.meta.env.DEV) {
          console.log('⏳ Debouncing click');
        }
        return;
      }
      window.lastClick = now;

      if (import.meta.env.DEV) {
        console.log(`✅ Setting winner: ${clickedSide} for match ${game?.id} in ${currentBracketKey}`);
      }

      if (currentOnOutcomeChange) {
        currentOnOutcomeChange(game.id, clickedSide);
      }
    },
    [isMatchReady, isByeMatch, game?.id, gamesByRound]
  );

  const isDisabled = useMemo(() => {
    const locked = checkBracketLocked(bracketKey, bracket, lockedBrackets);
    const disabled = locked || !isMatchReady || isByeMatch;
    if (import.meta.env.DEV) {
      console.log(`🎯 MatchCell ${game?.id} isDisabled: ${disabled} (locked: ${locked})`);
    }
    return disabled;
  }, [bracketKey, bracket, lockedBrackets, isMatchReady, isByeMatch, game?.id]);

  const cursorStyle = useMemo(() => {
    const locked = checkBracketLocked(bracketKey, bracket, lockedBrackets);
    if (locked) return 'not-allowed';
    if (isDisabled && !locked) return 'not-allowed';
    return 'pointer';
  }, [bracketKey, bracket, lockedBrackets, isDisabled]);

  const getParticipantClass = (isHome) => {
    const baseClass = isHome ? styles.firstParticipant : styles.secondParticipant;
    const isWinner = currentWinner === (isHome ? 'home' : 'away');
    const isLoser = currentWinner && currentWinner !== (isHome ? 'home' : 'away');
    const isEmpty = (isHome && !homeName) || (!isHome && !awayName);
    const isBye = (isHome && homeName === 'BYE') || (!isHome && awayName === 'BYE');

    let classes = `${styles.participant} ${baseClass}`;
    if (isEmpty) classes += ` ${styles.emptyParticipant}`;
    if (isBye) classes += ` ${styles.byeParticipant}`;
    if (isWinner) classes += ` ${styles.winnerParticipant}`;
    if (isLoser) classes += ` ${styles.loserParticipant}`;
    return classes;
  };

  const getTeamBoxClass = (isHome) => {
    const baseClass = isHome ? styles.firstParticipant : styles.secondParticipant;
    const isWinner = currentWinner === (isHome ? 'home' : 'away');
    const isLoser = currentWinner && currentWinner !== (isHome ? 'home' : 'away');
    const isEmpty = (isHome && !homeTeam?.team) || (!isHome && !awayTeam?.team);

    let classes = `${styles.teamBox} ${baseClass}`;
    if (isEmpty) classes += ` ${styles.emptyTeamBox}`;
    if (isWinner) classes += ` ${styles.winnerTeamBox}`;
    if (isLoser) classes += ` ${styles.loserTeamBox}`;
    return classes;
  };

  const handleKeyDown = useCallback(
    (e, side) => {
      const currentLockedBrackets = lockedBracketsRef.current;
      const currentBracket = bracketRef.current;

      const baseKey = currentBracket?.key?.replace(/_Pool.*$/, '') || bracketKeyRef.current.replace(/_Pool.*$/, '');
      const isCurrentlyLocked = currentLockedBrackets.has(baseKey);

      if (isCurrentlyLocked) {
        e.preventDefault();
        return;
      }

      if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleClick(side);
      }
    },
    [handleClick, isDisabled]
  );

  return (
    <div
      className={styles.match}
      data-game-id={game?.id}
      role="region"
      aria-label={`Match ${matchNumber}: ${homeName || ''} vs ${awayName || ''}`}
      data-locked={isDisabled}
    >
      <div className={styles.matchNumberContainer}>
        <span className={styles.matchNumber}>{matchNumber}</span>
      </div>

      <div className={styles.participantsContainer}>
        {/* Home Side */}
        <div
          className={getParticipantClass(true)}
          data-participant-position="first"
          onClick={() => handleClick('home')}
          onKeyDown={(e) => handleKeyDown(e, 'home')}
          style={{ cursor: cursorStyle }}
          role="button"
          tabIndex={isDisabled ? -1 : 0}
          aria-disabled={isDisabled}
          aria-pressed={currentWinner === 'home'}
          aria-label={`Select ${homeName || 'home player'} as winner`}
          data-testid={`match-${game?.id}-home`}
        >
          <span className={styles.playerName}>{homeName === 'BYE' ? 'BYE' : homeName || ''}</span>
        </div>

        <div
          className={getTeamBoxClass(true)}
          data-participant-position="first"
          onClick={() => handleClick('home')}
          style={{ cursor: cursorStyle }}
          aria-label={`Team: ${homeTeam?.team || 'No team'}`}
          data-testid={`match-${game?.id}-home-team`}
        >
          <span className={styles.teamName}>{homeTeam?.team || ''}</span>
        </div>

        {/* Away Side */}
        {awayTeam && (
          <>
            <div
              className={getParticipantClass(false)}
              data-participant-position="second"
              onClick={() => !isDisabled && handleClick('away')}
              onKeyDown={(e) => !isDisabled && handleKeyDown(e, 'away')}
              style={{ cursor: cursorStyle }}
              role="button"
              tabIndex={isDisabled ? -1 : 0}
              aria-disabled={isDisabled}
              aria-pressed={currentWinner === 'away'}
              aria-label={`Select ${awayName || 'away player'} as winner`}
              data-testid={`match-${game?.id}-away`}
            >
              <span className={styles.playerName}>{awayName === 'BYE' ? 'BYE' : awayName || ''}</span>
            </div>
            <div
              className={getTeamBoxClass(false)}
              data-participant-position="second"
              onClick={() => !isDisabled && handleClick('away')}
              style={{ cursor: cursorStyle }}
              aria-label={`Team: ${awayTeam?.team || 'No team'}`}
              data-testid={`match-${game?.id}-away-team`}
            >
              <span className={styles.teamName}>{awayTeam?.team || ''}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Custom comparison function for React.memo
 */
const areEqual = (prevProps, nextProps) => {
  // Basic equality checks
  const keysEqual = prevProps.bracketKey === nextProps.bracketKey;
  const gameEqual = prevProps.game?.id === nextProps.game?.id;
  // Lock status
  const prevBaseKey = prevProps.bracket?.key?.replace(/_Pool.*$/, '') || prevProps.bracketKey.replace(/_Pool.*$/, '');
  const nextBaseKey = nextProps.bracket?.key?.replace(/_Pool.*$/, '') || nextProps.bracketKey.replace(/_Pool.*$/, '');
  const lockedEqual = prevProps.lockedBrackets.has(prevBaseKey) === nextProps.lockedBrackets.has(nextBaseKey);
  // Outcome check
  const prevOutcome = prevProps.bracketsOutcomes?.[prevProps.bracketKey]?.[prevProps.game?.id];
  const nextOutcome = nextProps.bracketsOutcomes?.[nextProps.bracketKey]?.[nextProps.game?.id];
  const outcomeEqual = prevOutcome === nextOutcome;
  // Outcome change handler check
  const onOutcomeChangeEqual = prevProps.onOutcomeChange === nextProps.onOutcomeChange;
  // Detect shuffledPlayers change
  const prevPlayers = prevProps.bracket?.shuffledPlayers;
  const nextPlayers = nextProps.bracket?.shuffledPlayers;
  const playersChanged =
    prevPlayers !== nextPlayers &&
    JSON.stringify(prevPlayers?.map((p) => p?.name || p?.id || '')) !==
      JSON.stringify(nextPlayers?.map((p) => p?.name || p?.id || ''));
  // Debug when players change
  if (playersChanged) {
    if (import.meta.env.DEV) {
      console.log(
        `🔄 MatchCell ${prevProps.game?.id} MUST re-render: shuffledPlayers changed!`,
        'Prev:',
        prevPlayers?.map((p) => p?.name),
        'Next:',
        nextPlayers?.map((p) => p?.name)
      );
    }
    return false; // force re-render
  }
  const shouldNotUpdate = keysEqual && gameEqual && lockedEqual && outcomeEqual && onOutcomeChangeEqual;
  if (!shouldNotUpdate) {
    if (import.meta.env.DEV) {
      console.log(`🔄 MatchCell ${prevProps.game?.id} update triggered (normal)`);
    }
  }
  return shouldNotUpdate;
};

export default React.memo(MatchCell, areEqual);