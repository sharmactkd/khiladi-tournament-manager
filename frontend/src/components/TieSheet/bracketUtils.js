// src/components/TieSheet/bracketUtils.js

// Constants
const MAX_RECURSION_DEPTH = 32; // Prevent infinite recursion in deep brackets
const MATCH_ID_POOL_OFFSET = 1000; // For pool finals differentiation

/**
 * Returns full image URL with cache-busting
 * @param {string} filename - Image filename or full URL
 * @returns {string} Complete URL
 */
export const getFullImageUrl = (filename) => {
  if (!filename) return '';
  if (filename.startsWith('http') || filename.startsWith('//')) return filename;

  const cleanFilename = filename.replace(/^.*[\\/]/, '');
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  if (!baseUrl) return `/uploads/${cleanFilename}`;

  const uploadsUrl = baseUrl.replace(/\/api$/, '');
  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

/**
 * Sanitizes string for use as ID
 * @param {string} key
 * @returns {string}
 */
export const sanitizeId = (key) =>
  (key || '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();

/**
 * Normalizes string for comparison/display
 * @param {string} str
 * @returns {string}
 */
export const normalizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/kg/g, 'kg')
    .replace(/under-(\d+)/g, 'under - $1')
    .trim();
};

/**
 * Cached recursive lookup for team/player name
 * Uses WeakMap for automatic garbage collection
 */
const nameCache = new WeakMap();
const getNameCached = (side, bracketKey, pool, bracketsOutcomes, depth = 0) => {
  if (depth > MAX_RECURSION_DEPTH) {
    console.warn('Max recursion depth reached in getName');
    return '';
  }

  if (!side) return '';

  const cacheKey = { side, outcomes: bracketsOutcomes };
  if (nameCache.has(cacheKey)) return nameCache.get(cacheKey);

  let result = '';

  if (side.team) {
    result = side.team.name || '';
  } else if (side.sourceGame) {
    const sg = side.sourceGame;
    let srcOutcomes = bracketsOutcomes[bracketKey] || {};

    if (bracketKey.endsWith('_PoolFinal') && (pool || side.pool)) {
      const cat = bracketKey.replace('_PoolFinal', '');
      srcOutcomes = bracketsOutcomes[`${cat}_Pool${pool || side.pool}`] || {};
    }

    const winner = srcOutcomes[sg.id];
    if (winner) {
      const winnerSide = sg.sides[winner];
      result = getNameCached(winnerSide, bracketKey, pool || side.pool, bracketsOutcomes, depth + 1);
    }
  }

  nameCache.set(cacheKey, result);
  return result;
};

/**
 * Get team/player info with caching
 */
const teamCache = new WeakMap();
export const getTeamName = (side, sideName, bracketKey, gameId, outcomes) => {
  if (!side) return { id: '', name: '', team: '' };

  const cacheKey = { side, outcomes };
  if (teamCache.has(cacheKey)) return teamCache.get(cacheKey);

  let result;

  if (side.team) {
    result = {
      id: side.team.id || '',
      name: side.team.name || '',
      team: side.team.team || '',
    };
  } else if (side.sourceGame) {
    const sg = side.sourceGame;
    let sourceOutcomes = outcomes[bracketKey] || {};

    if (bracketKey.endsWith('_PoolFinal') && side.pool) {
      const category = bracketKey.replace('_PoolFinal', '');
      const poolKey = `${category}_Pool${side.pool}`;
      sourceOutcomes = outcomes[poolKey] || {};
    }

    const prevWinner = sourceOutcomes[sg.id];
    if (prevWinner) {
      const winnerSide = sg.sides[prevWinner];
      result = getTeamName(winnerSide, prevWinner, bracketKey, sg.id, outcomes);
    } else {
      result = { id: `tbd_${sg.id}_${sideName}`, name: '', team: '' };
    }
  } else {
    result = { id: '', name: '', team: '' };
  }

  teamCache.set(cacheKey, result);
  return result;
};

/**
 * Public API - uses cached version
 */
export const getName = (side, bracketKey, pool = null, bracketsOutcomes) => {
  return getNameCached(side, bracketKey, pool, bracketsOutcomes);
};

/**
 * Find all games that depend on a given game (for cascade reset)
 * @param {string} gameId - The ID of the game whose outcome changed
 * @param {Array} gamesByRound - The full bracket structure
 * @param {Set} found - Internal accumulator (do not pass)
 * @param {number} depth - Recursion depth tracker
 * @returns {string[]} Array of dependent game IDs
 */
export const findDependentGames = (gameId, gamesByRound, found = new Set(), depth = 0) => {
  if (depth > 10) return []; // Prevent deep recursion

  if (!gamesByRound || !Array.isArray(gamesByRound)) return [];

  for (const round of gamesByRound) {
    for (const game of round || []) {
      const sides = [game?.sides?.home, game?.sides?.away].filter(Boolean);
      for (const side of sides) {
        if (side?.sourceGame?.id === gameId) {
          if (!found.has(game.id)) {
            found.add(game.id);
            // Recursively find games that depend on this one
            findDependentGames(game.id, gamesByRound, found, depth + 1);
          }
        }
      }
    }
  }

  return Array.from(found);
};

/**
 * Generate Single Elimination Bracket Structure
 * @param {Array} players - Array of player objects
 * @param {string} poolLabel - Optional pool identifier
 * @returns {{ finalGame: Object|null, gamesByRound: Array }}
 */
export const generateSingleEliminationGameStructure = (players, poolLabel = '') => {
  if (!Array.isArray(players) || players.length === 0) {
    return { finalGame: null, gamesByRound: [] };
  }

  const p = (idx) => {
    if (idx >= players.length) {
      return {
        team: { id: `bye-${idx}`, name: 'BYE', team: '' },
        score: { score: null },
      };
    }
    const player = players[idx] || {};
    return {
      team: {
        id: `player-${idx}`,
        name: player.name || '',
        team: player.team || '',
      },
      score: { score: null },
    };
  };

  const src = (game) => ({
    sourceGame: game,
    score: { score: null },
    pool: game.pool,
  });

  const getRoundName = (roundNumber, totalRounds, poolLabel) => {
    if (poolLabel && roundNumber === totalRounds) {
      return `${poolLabel} Final`;
    }
    const rounds = {
      [totalRounds]: 'Final',
      [totalRounds - 1]: 'Semifinals',
      [totalRounds - 2]: 'Quarterfinals',
      [totalRounds - 3]: 'Round of 16',
    };
    return rounds[roundNumber] || `Round of ${Math.pow(2, totalRounds - roundNumber + 1)}`;
  };

  const playerCount = players.length;
  const poolNum = poolLabel ? poolLabel.charCodeAt(poolLabel.length - 1) - 64 : 0;
  let matchId = poolNum ? poolNum * MATCH_ID_POOL_OFFSET + 1 : 1;

  if (playerCount === 1) {
    const game = {
      id: matchId++,
      name: poolLabel ? `${poolLabel} Final` : 'Final',
      round: 1,
      scheduled: Date.now(),
      pool: poolLabel?.replace('Pool ', '') || '',
      sides: { home: p(0) },
    };
    return { finalGame: game, gamesByRound: [[game]] };
  }

  const totalRounds = Math.ceil(Math.log2(playerCount));
  const targetPlayerCount = Math.pow(2, totalRounds);
  const matchesInFirstRound = targetPlayerCount / 2;
  const byesNeeded = targetPlayerCount - playerCount;

  const gamesByRound = Array(totalRounds).fill().map(() => []);
  const byePositions = new Set();

  if (byesNeeded > 0) {
    for (let i = 0; i < byesNeeded; i++) {
      const pos = Math.floor(i * matchesInFirstRound / byesNeeded);
      byePositions.add(pos);
    }
  }

  let playerIndex = 0;
  const firstRoundGames = [];
  const directAdvancers = [];

  for (let slot = 0; slot < matchesInFirstRound; slot++) {
    if (byePositions.has(slot)) {
      if (playerIndex < playerCount) {
        const byePlayer = p(playerIndex);
        playerIndex++;
        byePlayer.slot = slot;
        directAdvancers.push(byePlayer);
      }
    } else if (playerIndex + 1 < playerCount) {
      const home = p(playerIndex);
      playerIndex++;
      const away = p(playerIndex);
      playerIndex++;
      const game = {
        id: matchId++,
        name: getRoundName(1, totalRounds, poolLabel),
        round: 1,
        scheduled: Date.now(),
        pool: poolLabel?.replace('Pool ', '') || '',
        sides: { home, away },
        slot,
      };
      firstRoundGames.push(game);
      directAdvancers.push(game);
    }
  }

  gamesByRound[0] = firstRoundGames;
  let currentAdvancers = [...directAdvancers];
  let roundNumber = 2;

  while (currentAdvancers.length > 1) {
    const nextRound = [];
    for (let i = 0; i < currentAdvancers.length; i += 2) {
      const homeAdvancer = currentAdvancers[i];
      const awayAdvancer = i + 1 < currentAdvancers.length ? currentAdvancers[i + 1] : null;

      const game = {
        id: matchId++,
        name: getRoundName(roundNumber, totalRounds, poolLabel),
        round: roundNumber,
        scheduled: Date.now(),
        pool: poolLabel?.replace('Pool ', '') || '',
        sides: { home: null, away: null },
      };

      game.sides.home = homeAdvancer ? (homeAdvancer.round ? src(homeAdvancer) : homeAdvancer) : null;
      game.sides.away = awayAdvancer ? (awayAdvancer.round ? src(awayAdvancer) : awayAdvancer) : null;

      nextRound.push(game);
    }

    gamesByRound[roundNumber - 1] = nextRound;
    currentAdvancers = nextRound;
    roundNumber++;
  }

  
  return {
    finalGame: currentAdvancers[0] || null,
    gamesByRound,
  };
};
export const MEDAL_PLACEHOLDER = '___________________';