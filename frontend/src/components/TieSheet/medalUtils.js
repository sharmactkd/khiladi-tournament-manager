// frontend/src/components/TieSheet/medalUtils.js

import { MEDAL_PLACEHOLDER } from './bracketUtils';

export const PLACEHOLDER = '_________________';

export const isOutcomeSide = (side) => side === 'home' || side === 'away';

export const getBaseBracketKey = (key = '') =>
  String(key || '').replace(/_Pool.*$/i, '');

export const isPoolFinalBracket = (bracket = {}) => {
  const key = String(bracket?.key || '').toLowerCase();
  const pool = String(bracket?.pool || '').toLowerCase();

  return pool === 'final' || key.includes('poolfinal');
};

export const normalizeEntryId = (value = '') => String(value || '').trim();

export const isValidPlayer = (team) => {
  if (!team || typeof team !== 'object') return false;

  const entryId = normalizeEntryId(team.entryId);
  const name = String(team.name || '').trim();

  return Boolean(
    name &&
      name !== 'BYE' &&
      entryId &&
      !entryId.startsWith('pool-winner-') &&
      !entryId.startsWith('bye-')
  );
};

export const getOutcomeWinnerSide = (outcomesSnapshot = {}, bracketKey, gameId) => {
  const outcomes = outcomesSnapshot?.[bracketKey] || {};

  return (
    outcomes?.[String(gameId)] ??
    outcomes?.[Number(gameId)] ??
    null
  );
};

export const getFinalGame = (bracket = {}) => {
  if (Array.isArray(bracket?.gamesByRound) && bracket.gamesByRound.length > 0) {
    return bracket.gamesByRound[bracket.gamesByRound.length - 1]?.[0] || null;
  }

  return bracket?.game || null;
};

export const getSemiFinalGames = (bracket = {}) => {
  if (!Array.isArray(bracket?.gamesByRound) || bracket.gamesByRound.length < 2) {
    return [];
  }

  return bracket.gamesByRound[bracket.gamesByRound.length - 2] || [];
};

export const getAllGamesFromBracket = (bracket = {}) => {
  const games = [];
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.id !== undefined && node.id !== null && node.sides) {
      const key = String(node.id);
      if (!seen.has(key)) {
        seen.add(key);
        games.push(node);
      }
    }

    Object.values(node).forEach((value) => {
      if (value && typeof value === 'object') walk(value);
    });
  };

  walk(bracket.game);
  walk(bracket.rounds);
  walk(bracket.games);
  walk(bracket.gamesByRound);

  return games;
};

export const findGameInBracket = (bracket = {}, gameId) => {
  const wanted = String(gameId);
  return getAllGamesFromBracket(bracket).find((game) => String(game?.id) === wanted) || null;
};

export const findBracketByKey = (bracketsSnapshot = [], key = '') => {
  const safeBrackets = Array.isArray(bracketsSnapshot) ? bracketsSnapshot : [];
  return safeBrackets.find((bracket) => String(bracket?.key || '') === String(key || '')) || null;
};

export const getPoolSourceBracketKey = (currentBracketKey = '', side = {}) => {
  const key = String(currentBracketKey || '');

  if (!key.toLowerCase().includes('poolfinal')) return key;

  const pool = side?.pool || side?.sourceGame?.pool || '';
  if (!pool) return key;

  const baseKey = key.replace(/_PoolFinal$/i, '');
  return `${baseKey}_Pool${pool}`;
};

export const resolveSideTeam = ({
  side,
  currentBracketKey,
  bracketsSnapshot = [],
  outcomesSnapshot = {},
  depth = 0,
  maxDepth = 40,
}) => {
  if (!side || depth > maxDepth) return null;

  if (isValidPlayer(side.team)) {
    return side.team;
  }

  if (side.team?.name === 'BYE') {
    return null;
  }

  if (!side.sourceGame) {
    return null;
  }

  const sourceBracketKey = getPoolSourceBracketKey(currentBracketKey, side);
  const sourceBracket = findBracketByKey(bracketsSnapshot, sourceBracketKey);

  const sourceGame =
    findGameInBracket(sourceBracket, side.sourceGame.id) ||
    side.sourceGame;

  const winnerSide = getOutcomeWinnerSide(
    outcomesSnapshot,
    sourceBracketKey,
    sourceGame?.id
  );

  if (isOutcomeSide(winnerSide)) {
    return resolveSideTeam({
      side: sourceGame?.sides?.[winnerSide],
      currentBracketKey: sourceBracketKey,
      bracketsSnapshot,
      outcomesSnapshot,
      depth: depth + 1,
      maxDepth,
    });
  }

  return null;
};

export const resolveSideName = (args = {}) => {
  const team = resolveSideTeam(args);
  return team?.name || '';
};

export const makeMedalPayloadItem = (team, medal, bracket = {}) => ({
  ...team,
  entryId: normalizeEntryId(team?.entryId),
  medal,
  gender: team?.gender || bracket?.gender || '',
  ageCategory: team?.ageCategory || bracket?.ageCategory || '',
  weightCategory: team?.weightCategory || bracket?.weightCategory || '',
  fresherGroup: team?.fresherGroup || bracket?.fresherGroup || '',
  event: team?.event || '',
  subEvent: team?.subEvent || '',
});

export const pushUniqueMedalist = (list = [], item = {}) => {
  const entryId = normalizeEntryId(item?.entryId);

  if (!entryId) return list;

  const exists = list.some(
    (existing) => normalizeEntryId(existing?.entryId) === entryId
  );

  if (!exists) {
    list.push({
      ...item,
      entryId,
    });
  }

  return list;
};

export const collectActualTieSheetMedals = ({
  bracket,
  bracketsSnapshot = [],
  outcomesSnapshot = {},
}) => {
  const medalists = [];

  if (!bracket) return medalists;

  const bracketKey = bracket?.key || '';
  const finalGame = getFinalGame(bracket);

  if (!finalGame || finalGame.id === undefined || finalGame.id === null) {
    return medalists;
  }

  const finalWinnerSide = getOutcomeWinnerSide(
    outcomesSnapshot,
    bracketKey,
    finalGame.id
  );

  if (!isOutcomeSide(finalWinnerSide)) {
    return medalists;
  }

  const finalLoserSide = finalWinnerSide === 'home' ? 'away' : 'home';

  const goldTeam = resolveSideTeam({
    side: finalGame.sides?.[finalWinnerSide],
    currentBracketKey: bracketKey,
    bracketsSnapshot,
    outcomesSnapshot,
  });

  const silverTeam = resolveSideTeam({
    side: finalGame.sides?.[finalLoserSide],
    currentBracketKey: bracketKey,
    bracketsSnapshot,
    outcomesSnapshot,
  });

  if (isValidPlayer(goldTeam)) {
    pushUniqueMedalist(
      medalists,
      makeMedalPayloadItem(goldTeam, 'Gold', bracket)
    );
  }

  if (isValidPlayer(silverTeam)) {
    pushUniqueMedalist(
      medalists,
      makeMedalPayloadItem(silverTeam, 'Silver', bracket)
    );
  }

  const semiFinalGames = getSemiFinalGames(bracket);

  semiFinalGames.forEach((semiGame) => {
    const semiWinnerSide = getOutcomeWinnerSide(
      outcomesSnapshot,
      bracketKey,
      semiGame?.id
    );

    if (!isOutcomeSide(semiWinnerSide)) return;

    const semiLoserSide = semiWinnerSide === 'home' ? 'away' : 'home';

    const bronzeTeam = resolveSideTeam({
      side: semiGame?.sides?.[semiLoserSide],
      currentBracketKey: bracketKey,
      bracketsSnapshot,
      outcomesSnapshot,
    });

    if (isValidPlayer(bronzeTeam)) {
      pushUniqueMedalist(
        medalists,
        makeMedalPayloadItem(bronzeTeam, 'Bronze', bracket)
      );
    }
  });

  return medalists;
};

export const collectPoolFinalMedals = ({
  poolFinalBracket,
  bracketsSnapshot = [],
  outcomesSnapshot = {},
}) => {
  const medalists = [];

  if (!poolFinalBracket) return medalists;

  const bracketKey = poolFinalBracket?.key || '';
  const finalGame = getFinalGame(poolFinalBracket);

  if (!finalGame || finalGame.id === undefined || finalGame.id === null) {
    return medalists;
  }

  const finalWinnerSide = getOutcomeWinnerSide(
    outcomesSnapshot,
    bracketKey,
    finalGame.id
  );

  if (!isOutcomeSide(finalWinnerSide)) {
    return medalists;
  }

  const finalLoserSide = finalWinnerSide === 'home' ? 'away' : 'home';

  const goldTeam = resolveSideTeam({
    side: finalGame.sides?.[finalWinnerSide],
    currentBracketKey: bracketKey,
    bracketsSnapshot,
    outcomesSnapshot,
  });

  const silverTeam = resolveSideTeam({
    side: finalGame.sides?.[finalLoserSide],
    currentBracketKey: bracketKey,
    bracketsSnapshot,
    outcomesSnapshot,
  });

  if (isValidPlayer(goldTeam)) {
    pushUniqueMedalist(
      medalists,
      makeMedalPayloadItem(goldTeam, 'Gold', poolFinalBracket)
    );
  }

  if (isValidPlayer(silverTeam)) {
    pushUniqueMedalist(
      medalists,
      makeMedalPayloadItem(silverTeam, 'Silver', poolFinalBracket)
    );
  }

  const baseKey = getBaseBracketKey(bracketKey);
  const poolBrackets = bracketsSnapshot.filter((bracket) => {
    const key = String(bracket?.key || '');
    return (
      key.startsWith(`${baseKey}_Pool`) &&
      !key.toLowerCase().includes('poolfinal')
    );
  });

  poolBrackets.forEach((poolBracket) => {
    const poolFinalGame = getFinalGame(poolBracket);

    if (!poolFinalGame || poolFinalGame.id === undefined || poolFinalGame.id === null) {
      return;
    }

    const poolWinnerSide = getOutcomeWinnerSide(
      outcomesSnapshot,
      poolBracket.key,
      poolFinalGame.id
    );

    if (!isOutcomeSide(poolWinnerSide)) return;

    const poolLoserSide = poolWinnerSide === 'home' ? 'away' : 'home';

    const bronzeTeam = resolveSideTeam({
      side: poolFinalGame.sides?.[poolLoserSide],
      currentBracketKey: poolBracket.key,
      bracketsSnapshot,
      outcomesSnapshot,
    });

    if (isValidPlayer(bronzeTeam)) {
      pushUniqueMedalist(
        medalists,
        makeMedalPayloadItem(bronzeTeam, 'Bronze', poolFinalBracket)
      );
    }
  });

  return medalists;
};

export const collectBracketMedalPayload = ({
  bracketsSnapshot = [],
  outcomesSnapshot = {},
}) => {
  const safeBrackets = Array.isArray(bracketsSnapshot) ? bracketsSnapshot : [];
  const result = [];

  const grouped = new Map();

  safeBrackets.forEach((bracket) => {
    if (!bracket?.key) return;

    const baseKey = getBaseBracketKey(bracket.key);

    if (!grouped.has(baseKey)) {
      grouped.set(baseKey, []);
    }

    grouped.get(baseKey).push(bracket);
  });

  grouped.forEach((groupBrackets) => {
    const playerMap = new Map();

    groupBrackets.forEach((bracket) => {
      if (!Array.isArray(bracket?.shuffledPlayers)) return;

      bracket.shuffledPlayers.forEach((player) => {
        if (!isValidPlayer(player)) return;

        const entryId = normalizeEntryId(player.entryId);
        if (!entryId || playerMap.has(entryId)) return;

        playerMap.set(entryId, {
          ...player,
          entryId,
          gender: player.gender || bracket.gender || '',
          ageCategory: player.ageCategory || bracket.ageCategory || '',
          weightCategory: player.weightCategory || bracket.weightCategory || '',
          fresherGroup: player.fresherGroup || bracket.fresherGroup || '',
        });
      });
    });

    const allPlayers = [...playerMap.values()];
    if (allPlayers.length === 0) return;

    const poolFinalBracket = groupBrackets.find(isPoolFinalBracket);
    const sourceBracket = poolFinalBracket || groupBrackets[0];

    if (!sourceBracket) return;

    const actualMedalists = poolFinalBracket
      ? collectPoolFinalMedals({
          poolFinalBracket,
          bracketsSnapshot: safeBrackets,
          outcomesSnapshot,
        })
      : collectActualTieSheetMedals({
          bracket: sourceBracket,
          bracketsSnapshot: safeBrackets,
          outcomesSnapshot,
        });

    const hasGold = actualMedalists.some((item) => item.medal === 'Gold');

    // Result declare nahi hua hai to Entry medals touch mat karo.
    if (!hasGold) return;

    actualMedalists.forEach((item) => {
      pushUniqueMedalist(result, item);
    });

    allPlayers.forEach((player) => {
      const entryId = normalizeEntryId(player.entryId);

      const alreadyMedaled = actualMedalists.some(
        (item) => normalizeEntryId(item.entryId) === entryId
      );

      if (!alreadyMedaled) {
        pushUniqueMedalist(
          result,
          makeMedalPayloadItem(player, 'X-X-X-X', sourceBracket)
        );
      }
    });
  });

  return result;
}; 

export const emptyDisplayMedals = () => ({
  gold: PLACEHOLDER,
  silver: PLACEHOLDER,
  bronze1: PLACEHOLDER,
  bronze2: PLACEHOLDER,
});

export const getDisplayMedalsFromPayload = (payload = {}) => {
  const medals = emptyDisplayMedals();

  const medalists = Array.isArray(payload) ? payload : [];

  const gold = medalists.find((item) => item?.medal === 'Gold');
  const silver = medalists.find((item) => item?.medal === 'Silver');
  const bronzes = medalists.filter((item) => item?.medal === 'Bronze');

  medals.gold = gold?.name || PLACEHOLDER;
  medals.silver = silver?.name || PLACEHOLDER;
  medals.bronze1 = bronzes?.[0]?.name || PLACEHOLDER;
  medals.bronze2 = bronzes?.[1]?.name || PLACEHOLDER;

  return medals;
};

export const getDisplayMedalsForBracket = ({
  bracket,
  bracketsSnapshot = [],
  outcomesSnapshot = {},
}) => {
  if (!bracket) return emptyDisplayMedals();

  const baseKey = getBaseBracketKey(bracket?.key);
  const safeBrackets = Array.isArray(bracketsSnapshot) ? bracketsSnapshot : [];

  const poolFinalBracket = safeBrackets.find(
    (item) => String(item?.key || '') === `${baseKey}_PoolFinal`
  );

  if (poolFinalBracket && String(bracket?.key || '') === String(poolFinalBracket?.key || '')) {
    return getDisplayMedalsFromPayload(
      collectPoolFinalMedals({
        poolFinalBracket,
        bracketsSnapshot: safeBrackets,
        outcomesSnapshot,
      })
    );
  }

  if (poolFinalBracket && String(bracket?.key || '') !== String(poolFinalBracket?.key || '')) {
    return emptyDisplayMedals();
  }

  return getDisplayMedalsFromPayload(
    collectActualTieSheetMedals({
      bracket,
      bracketsSnapshot: safeBrackets,
      outcomesSnapshot,
    })
  );
};

export const buildMedalsByCategory = ({
  bracketsSnapshot = [],
  outcomesSnapshot = {},
}) => {
  const safeBrackets = Array.isArray(bracketsSnapshot) ? bracketsSnapshot : [];
  const medalsByCategory = {};

  safeBrackets.forEach((bracket) => {
    const key = String(bracket?.key || '');
    if (!key) return;

    medalsByCategory[key] = getDisplayMedalsForBracket({
      bracket,
      bracketsSnapshot: safeBrackets,
      outcomesSnapshot,
    });
  });

  return medalsByCategory;
};

export const hasAnyDisplayMedal = (medals = {}) => {
  const values = [
    medals.gold,
    medals.silver,
    medals.bronze1,
    medals.bronze2,
  ];

  return values.some(
    (value) =>
      value &&
      value !== PLACEHOLDER &&
      value !== MEDAL_PLACEHOLDER
  );
};

export const normalizeDisplayMedals = (medals = {}) => ({
  gold: medals.gold || PLACEHOLDER,
  silver: medals.silver || PLACEHOLDER,
  bronze1: medals.bronze1 || PLACEHOLDER,
  bronze2: medals.bronze2 || PLACEHOLDER,
});
