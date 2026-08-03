// src/components/TieSheet/useBracketGenerator.js
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';
import { buildMedalsByCategory } from './medalUtils';
import {
  buildBracketStructureSignature,
  reconcileBracketOutcomes,
} from './bracketUtils';
import {
  buildBracketEntrySignature,
  isFresherEntry,
  normalizeFresherGroup,
} from '../../utils/entrySyncUtils';

// ── Config (easy to extend in future) ───────────────────────────────────────
const GENDER_ORDER = ['Male', 'Female'];

const AGE_CATEGORY_ORDER = [
  'Sub-Junior',
  'Cadet',
  'Junior',
  'Senior',
  'Under - 14',
  'Under - 17',
  'Under - 19',
];

const normalizeCategoryText = (value = '') => {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—−]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ');
};

const getCanonicalAgeCategoryKey = (value = '') => {
  const text = normalizeCategoryText(value);

  if (!text) return '';

  const underMatch = text.match(/under\s*-?\s*(\d+)/i);
  if (underMatch) return `under_${underMatch[1]}`;

  const overMatch = text.match(/over\s*-?\s*(\d+)/i);
  if (overMatch) return `over_${overMatch[1]}`;

  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};

const getCanonicalWeightCategoryKey = (value = '') => {
  const text = normalizeCategoryText(value)
    .replace(/\bkilograms?\b/g, 'kg')
    .replace(/\bkgs\b/g, 'kg')
    .replace(/\bkg\b/g, 'kg');

  if (!text) return '';

  const underMatch = text.match(/under\s*-?\s*(\d+)/i);
  if (underMatch) return `under_${underMatch[1]}_kg`;

  const overMatch = text.match(/over\s*-?\s*(\d+)/i);
  if (overMatch) return `over_${overMatch[1]}_kg`;

  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};

const normalizeAgeCategoryForDisplay = (value = '') => {
  const text = normalizeCategoryText(value);

  if (!text) return '';

  return text
    .replace(/^under\s*-?\s*(\d+).*$/i, 'Under - $1')
    .replace(/^over\s*-?\s*(\d+).*$/i, 'Over - $1')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s-\s/g, ' - ')
    .trim();
};

const normalizeWeightCategoryForDisplay = (value = '') => {
  const text = normalizeCategoryText(value);

  if (!text) return '';

  return text
    .replace(/^under\s*-?\s*(\d+).*$/i, 'Under - $1 KG')
    .replace(/^over\s*-?\s*(\d+).*$/i, 'Over - $1 KG')
    .replace(/\bkg\b/gi, 'KG')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
};

const getWeightSortValue = (weightCategory = '') => {
  const text = String(weightCategory).toLowerCase();

  const underMatch = text.match(/under\s*-?\s*(\d+)|u\s*-?\s*(\d+)/);
  if (underMatch) return Number(underMatch[1] || underMatch[2]);

  const overMatch = text.match(/over\s*-?\s*(\d+)/);
  if (overMatch) return Number(overMatch[1]) + 1000;

  const anyNumber = text.match(/(\d+)/);
  if (anyNumber) return Number(anyNumber[1]);

  return 9999;
};

const compareWeightCategories = (a, b) => {
  const weightA = getWeightSortValue(a?.weightCategory);
  const weightB = getWeightSortValue(b?.weightCategory);

  if (weightA !== weightB) return weightA - weightB;

  return String(a?.weightCategory || '').localeCompare(
    String(b?.weightCategory || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
};

const sanitizeBracketKey = (value = '') =>
  String(value || '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .replace(/-+/g, '-');

// ── Helper: Smart Seed Players ──────────────────────────────────────────────
const smartSeedPlayers = (playersList = []) => {
  if (playersList.length <= 2) return [...playersList];

  const teamGroups = {};

  playersList.forEach((player) => {
    const team = player?.team?.trim() || 'No Team';

    if (!teamGroups[team]) {
      teamGroups[team] = [];
    }

    teamGroups[team].push(player);
  });

  const sortedTeams = Object.entries(teamGroups).sort(
    (a, b) => b[1].length - a[1].length
  );

  const totalSlots = Math.pow(2, Math.ceil(Math.log2(playersList.length)));
  const seeded = new Array(totalSlots);

  let topIndex = 0;
  let bottomIndex = totalSlots - 1;

  sortedTeams.forEach(([, teamPlayers]) => {
    teamPlayers.forEach((player, index) => {
      if (index % 2 === 0) {
        while (topIndex < totalSlots && seeded[topIndex]) topIndex += 1;

        if (topIndex < totalSlots / 2) {
          seeded[topIndex] = player;
          topIndex += 2;

          if (topIndex >= totalSlots / 2) {
            topIndex = 1;
          }
        }
      } else {
        while (bottomIndex >= totalSlots / 2 && seeded[bottomIndex]) {
          bottomIndex -= 1;
        }

        if (bottomIndex >= totalSlots / 2) {
          seeded[bottomIndex] = player;
          bottomIndex -= 2;

          if (bottomIndex < totalSlots / 2) {
            bottomIndex = totalSlots - 2;
          }
        }
      }
    });
  });

  const remaining = playersList.filter((player) => !seeded.includes(player));
  let fillIndex = 0;

  for (let index = 0; index < totalSlots; index += 1) {
    if (!seeded[index] && remaining[fillIndex]) {
      seeded[index] = remaining[fillIndex];
      fillIndex += 1;
    }
  }

  return seeded.filter(Boolean);
};

// ── Generate Single Elimination Structure ───────────────────────────────────
const generateSingleEliminationGameStructure = (players = [], poolLabel = '') => {
  if (!Array.isArray(players) || players.length === 0) {
    return { finalGame: null, gamesByRound: [] };
  }

  const p = (idx) => {
    if (idx >= players.length) {
      return {
        team: {
          id: `bye-${idx}`,
          entryId: '',
          name: 'BYE',
          team: '',
          gender: '',
          ageCategory: '',
          weightCategory: '',
          weight: '',
          event: '',
          subEvent: '',
          fresherGroup: '',
        },
        score: { score: null },
      };
    }

    const player = players[idx] || {};

    return {
      team: {
        id: player.entryId || `player-${idx}`,
        entryId: player.entryId || '',
        name: player.name || '',
        team: player.team || '',
        gender: player.gender || '',
        ageCategory: player.ageCategory || '',
        weightCategory: player.weightCategory || '',
        weight: player.weight || '',
        event: player.event || '',
        subEvent: player.subEvent || '',
        fresherGroup: player.fresherGroup || '',
      },
      score: { score: null },
    };
  };

  const src = (game) => ({
    sourceGame: game,
    score: { score: null },
    pool: game.pool,
  });

  const getRoundName = (roundNumber, totalRounds, currentPoolLabel) => {
    if (currentPoolLabel && roundNumber === totalRounds) {
      return `${currentPoolLabel} Final`;
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

  let matchId = poolNum ? poolNum * 1000 + 1 : 1;

  if (playerCount <= 0) {
    return { finalGame: null, gamesByRound: [] };
  }

  if (playerCount === 1) {
    const game = {
      id: matchId,
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

  const gamesByRound = Array(totalRounds)
    .fill()
    .map(() => []);

  const byePositions = new Set();

  if (byesNeeded > 0) {
    for (let index = 0; index < byesNeeded; index += 1) {
      const pos =
        matchesInFirstRound -
        1 -
        Math.floor((index * matchesInFirstRound) / byesNeeded);

      byePositions.add(pos);
    }
  }

  let playerIndex = 0;

  const firstRoundGames = [];
  const directAdvancers = [];

  for (let slot = 0; slot < matchesInFirstRound; slot += 1) {
    if (byePositions.has(slot)) {
      if (playerIndex < playerCount) {
        const byePlayer = p(playerIndex);
        playerIndex += 1;

        byePlayer.slot = slot;
        directAdvancers.push(byePlayer);
      }
    } else if (playerIndex + 1 < playerCount) {
      const home = p(playerIndex);
      playerIndex += 1;

      const away = p(playerIndex);
      playerIndex += 1;

      const game = {
        id: matchId,
        name: getRoundName(1, totalRounds, poolLabel),
        round: 1,
        scheduled: Date.now(),
        pool: poolLabel?.replace('Pool ', '') || '',
        sides: { home, away },
        slot,
      };

      matchId += 1;

      firstRoundGames.push(game);
      directAdvancers.push(game);
    }
  }

  gamesByRound[0] = firstRoundGames;

  let currentAdvancers = [...directAdvancers];
  let roundNumber = 2;

  while (currentAdvancers.length > 1) {
    const nextRound = [];

    for (let index = 0; index < currentAdvancers.length; index += 2) {
      const homeAdvancer = currentAdvancers[index];
      const awayAdvancer =
        index + 1 < currentAdvancers.length ? currentAdvancers[index + 1] : null;

      const game = {
        id: matchId,
        name: getRoundName(roundNumber, totalRounds, poolLabel),
        round: roundNumber,
        scheduled: Date.now(),
        pool: poolLabel?.replace('Pool ', '') || '',
        sides: { home: null, away: null },
      };

      matchId += 1;

      game.sides.home = homeAdvancer
        ? homeAdvancer.round
          ? src(homeAdvancer)
          : homeAdvancer
        : null;

      if (awayAdvancer) {
        game.sides.away = awayAdvancer.round ? src(awayAdvancer) : awayAdvancer;
      }

      nextRound.push(game);
    }

    gamesByRound[roundNumber - 1] = nextRound;
    currentAdvancers = nextRound;
    roundNumber += 1;
  }

  return {
    finalGame: currentAdvancers[0] || null,
    gamesByRound,
  };
};

// ── Main Hook ───────────────────────────────────────────────────────────────
export default function useBracketGenerator({
  players = [],
  lockedBrackets = new Set(),
  brackets = [],
  bracketsOutcomes = {},
  setBrackets,
  setBracketsOutcomes,
  setBracketsAndOutcomes,
  setMedalsByCategory,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [computedMedals, setComputedMedals] = useState({});

  const skipGenerationRef = useRef(false);
  const lastPlayerCountRef = useRef(0);
  const lastPlayerContentSignatureRef = useRef('');

  const safeLockedBrackets = useMemo(() => {
    if (lockedBrackets instanceof Set) return lockedBrackets;
    if (Array.isArray(lockedBrackets)) return new Set(lockedBrackets);
    return new Set();
  }, [lockedBrackets]);

  const playerContentSignature = useMemo(
    () => buildBracketEntrySignature(players),
    [players]
  );

  const sortBrackets = useCallback((items = []) => {
    return [...items].sort((a, b) => {
      const genderCompare =
        GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender);

      if (genderCompare !== 0) return genderCompare;

      const aAgeIndex = AGE_CATEGORY_ORDER.indexOf(a.ageCategory);
      const bAgeIndex = AGE_CATEGORY_ORDER.indexOf(b.ageCategory);

      if (aAgeIndex !== bAgeIndex) return aAgeIndex - bAgeIndex;

      const weightCompare = compareWeightCategories(a, b);

      if (weightCompare !== 0) return weightCompare;

      const aPoolOrder = a.pool ? (a.pool === 'Final' ? 999 : a.pool.charCodeAt(0)) : 0;
      const bPoolOrder = b.pool ? (b.pool === 'Final' ? 999 : b.pool.charCodeAt(0)) : 0;

      return aPoolOrder - bPoolOrder;
    });
  }, []);

  const generateBrackets = useCallback(
    debounce(async () => {
      if (skipGenerationRef.current) {
        skipGenerationRef.current = false;
        return;
      }

      if (!Array.isArray(players) || players.length === 0) {
        return;
      }

      const playerCountChanged = players.length !== lastPlayerCountRef.current;
      const contentSignatureChanged =
        playerContentSignature !== lastPlayerContentSignatureRef.current;

      lastPlayerCountRef.current = players.length;
      lastPlayerContentSignatureRef.current = playerContentSignature;

      if (brackets.length > 0 && !playerCountChanged && !contentSignatureChanged) {
        const currentMedals = buildMedalsByCategory({
          bracketsSnapshot: brackets,
          outcomesSnapshot: bracketsOutcomes,
        });

        setComputedMedals(currentMedals);

        if (typeof setMedalsByCategory === 'function') {
          setMedalsByCategory(currentMedals);
        }

        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const grouped = players.reduce((acc, player) => {
          const genderDisplay = String(player?.gender || '').trim();
          const ageDisplay = normalizeAgeCategoryForDisplay(player?.ageCategory);
          const weightDisplay = normalizeWeightCategoryForDisplay(player?.weightCategory);
          const fresher = isFresherEntry(player);
          const fresherGroup = normalizeFresherGroup(player?.fresherGroup);

          const genderKey = normalizeCategoryText(genderDisplay)
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          const ageKey = getCanonicalAgeCategoryKey(player?.ageCategory);
          const weightKey = getCanonicalWeightCategoryKey(player?.weightCategory);

          const groupKey = fresher
            ? fresherGroup.toLowerCase().replace(/[^a-z0-9]+/g, '_')
            : '';
          const key = fresher
            ? `fresher_${genderKey}_${groupKey}`
            : `${genderKey}_${ageKey}_${weightKey}`;

          if (!acc[key]) {
            acc[key] = {
              gender: genderDisplay,
              ageCategory: ageDisplay,
              weightCategory: weightDisplay,
              fresherGroup,
              eventType: fresher ? 'FRESHER' : 'KYORUGI',
              players: [],
            };
          }

          acc[key].players.push({
            ...player,
            gender: genderDisplay,
            ageCategory: ageDisplay,
            weightCategory: weightDisplay,
            fresherGroup,
          });

          return acc;
        }, {});

        const generatedBrackets = [];

        Object.entries(grouped).forEach(([key, group]) => {
          const { gender, ageCategory, weightCategory, fresherGroup, eventType } = group;
          const groupPlayers = group.players;
          const categoryPlayerCount = groupPlayers.length;

          if (eventType === 'FRESHER' && categoryPlayerCount > 4) {
            throw new Error(`${fresherGroup} (${gender}) has ${categoryPlayerCount} players; a Fresher group can contain maximum 4 players.`);
          }

          if (categoryPlayerCount <= 16) {
            const seededPlayers = smartSeedPlayers([...groupPlayers]);
            const { finalGame, gamesByRound } =
              generateSingleEliminationGameStructure(seededPlayers);

            if (import.meta.env.DEV && categoryPlayerCount === 3) {
              const rounds = Math.ceil(Math.log2(categoryPlayerCount));
              const target = Math.pow(2, rounds);
              const byes = target - categoryPlayerCount;

              const safeSide = (side) => {
                if (!side) return null;

                if (side.team) {
                  return {
                    kind: 'team',
                    name: side.team.name,
                    slot: side.slot,
                  };
                }

                if (side.sourceGame) {
                  return {
                    kind: 'sourceGame',
                    id: side.sourceGame.id,
                    round: side.sourceGame.round,
                  };
                }

                return {
                  kind: 'unknown',
                  slot: side.slot,
                };
              };

              console.log('🧪 3-PLAYER BRACKET STRUCTURE', {
                key,
                categoryPlayerCount,
                computed: { rounds, target, byes },
                gamesByRoundMeta: gamesByRound.map((round, index) => ({
                  roundIndex: index,
                  roundNumber: index + 1,
                  roundName: round?.[0]?.name,
                  games: (round || []).map((game) => ({
                    id: game.id,
                    round: game.round,
                    name: game.name,
                    slot: game.slot,
                    home: safeSide(game.sides?.home),
                    away: safeSide(game.sides?.away),
                  })),
                })),
                finalGame: finalGame
                  ? {
                      id: finalGame.id,
                      name: finalGame.name,
                      round: finalGame.round,
                      home: safeSide(finalGame.sides?.home),
                      away: safeSide(finalGame.sides?.away),
                    }
                  : null,
              });
            }

            generatedBrackets.push({
              key,
              sanitizedKey: sanitizeBracketKey(key),
              gender,
              ageCategory,
              weightCategory,
              fresherGroup,
              eventType,
              playerCount: categoryPlayerCount,
              categoryPlayerCount,
              shuffledPlayers: seededPlayers,
              game: finalGame,
              gamesByRound,
              outcomes: {},
            });

            return;
          }

          // ── Pool Logic ─────────────────────────────────────────────────────
          const minPools = Math.ceil(categoryPlayerCount / 16);

          let numPools = 1;

          while (numPools < minPools) {
            numPools *= 2;
          }

          const poolSizes = Array(numPools).fill(
            Math.floor(categoryPlayerCount / numPools)
          );

          const extras = categoryPlayerCount % numPools;

          for (let index = 0; index < extras; index += 1) {
            poolSizes[index] += 1;
          }

          const allSeededPlayers = smartSeedPlayers([...groupPlayers]);

          let playerStart = 0;

          const pools = [];

          for (let index = 0; index < numPools; index += 1) {
            const poolLabelChar = String.fromCharCode(65 + index);
            const poolPlayersRaw = allSeededPlayers.slice(
              playerStart,
              playerStart + poolSizes[index]
            );

            const poolPlayers =
              poolPlayersRaw.length > 2
                ? smartSeedPlayers(poolPlayersRaw)
                : poolPlayersRaw;

            playerStart += poolSizes[index];

            const poolStruct = generateSingleEliminationGameStructure(
              poolPlayers,
              `Pool ${poolLabelChar}`
            );

            pools.push({
              key: `${key}_Pool${poolLabelChar}`,
              sanitizedKey: sanitizeBracketKey(`${key}_Pool${poolLabelChar}`),
              gender,
              ageCategory,
              weightCategory,
              playerCount: poolPlayers.length,
              categoryPlayerCount,
              shuffledPlayers: poolPlayers,
              game: poolStruct.finalGame,
              gamesByRound: poolStruct.gamesByRound,
              pool: poolLabelChar,
              outcomes: {},
            });
          }

          // ── Pool Final Bracket ─────────────────────────────────────────────
          const dummyPlayoffPlayers = pools.map((_, index) => ({
            entryId: `pool-winner-${index}`,
            name: `Winner Pool ${String.fromCharCode(65 + index)}`,
            team: '',
          }));

          const playoffStruct =
            generateSingleEliminationGameStructure(dummyPlayoffPlayers);

          let poolIndex = 0;

          playoffStruct.gamesByRound[0].forEach((game) => {
            game.sides.home = {
              sourceGame: pools[poolIndex].game,
              score: { score: null },
              pool: pools[poolIndex].pool,
            };

            poolIndex += 1;

            if (game.sides.away) {
              game.sides.away = {
                sourceGame: pools[poolIndex].game,
                score: { score: null },
                pool: pools[poolIndex].pool,
              };

              poolIndex += 1;
            }
          });

          generatedBrackets.push(...pools);

          generatedBrackets.push({
            key: `${key}_PoolFinal`,
            sanitizedKey: sanitizeBracketKey(`${key}_PoolFinal`),
            gender,
            ageCategory,
            weightCategory,
            playerCount: numPools,
            categoryPlayerCount,
            shuffledPlayers: [],
            game: playoffStruct.finalGame,
            gamesByRound: playoffStruct.gamesByRound,
            pool: 'Final',
            outcomes: {},
          });
        });

        const sortedGeneratedBrackets = sortBrackets(generatedBrackets);

        // ── Merge preserved locked brackets ────────────────────────────────────
        const finalBrackets = [];

        sortedGeneratedBrackets.forEach((newBracket) => {
          const existingIndex = brackets.findIndex(
            (bracket) => bracket.key === newBracket.key
          );

          if (existingIndex !== -1) {
            const existingBracket = brackets[existingIndex];
            const sameStructure =
              buildBracketStructureSignature([existingBracket]) ===
              buildBracketStructureSignature([newBracket]);

            if (safeLockedBrackets.has(newBracket.key) && sameStructure) {
              finalBrackets.push(existingBracket);
              return;
            }
          }

          finalBrackets.push(newBracket);
        });

        const sortedFinalBrackets = sortBrackets(finalBrackets);

        // ── Update state only if changed ──────────────────────────────────────
        const bracketsChanged =
          buildBracketStructureSignature(sortedFinalBrackets) !==
          buildBracketStructureSignature(brackets);

        const newOutcomes = reconcileBracketOutcomes({
          previousBrackets: brackets,
          nextBrackets: sortedFinalBrackets,
          previousOutcomes: bracketsOutcomes,
        });

        const outcomesChanged =
          JSON.stringify(newOutcomes) !== JSON.stringify(bracketsOutcomes);

        if (bracketsChanged || outcomesChanged) {
          if (typeof setBracketsAndOutcomes === 'function') {
            setBracketsAndOutcomes({
              brackets: sortedFinalBrackets,
              outcomes: newOutcomes,
            });
          } else {
            if (bracketsChanged) setBrackets(sortedFinalBrackets);
            if (outcomesChanged) setBracketsOutcomes(newOutcomes);
          }
        } else {
          console.log('⏸️ Skipping bracket/outcome update (no change)');
        }

        // ── Compute & Update Medals through centralized medalUtils ─────────────
        const newMedals = buildMedalsByCategory({
          bracketsSnapshot: sortedFinalBrackets,
          outcomesSnapshot: newOutcomes,
        });

        setComputedMedals(newMedals);

        if (typeof setMedalsByCategory === 'function') {
          setMedalsByCategory(newMedals);
        }

        console.log('Bracket generation completed successfully');
      } catch (err) {
        console.error('Bracket generation failed:', err);
        setGenerationError(
          'Failed to generate brackets. Please try again or reduce the number of players.'
        );
      } finally {
        setIsGenerating(false);
      }
    }, 600),
    [
      players,
      safeLockedBrackets,
      brackets,
      bracketsOutcomes,
      setBrackets,
      setBracketsOutcomes,
      setBracketsAndOutcomes,
      setMedalsByCategory,
      playerContentSignature,
      sortBrackets,
    ]
  );

  // Keep computed medals updated when only outcomes change.
 const lastComputedMedalsHashRef = useRef('');

useEffect(() => {
  const newMedals = buildMedalsByCategory({
    bracketsSnapshot: brackets,
    outcomesSnapshot: bracketsOutcomes,
  });

  const hash = JSON.stringify(newMedals);

  if (lastComputedMedalsHashRef.current === hash) {
    return;
  }

  lastComputedMedalsHashRef.current = hash;
  setComputedMedals(newMedals);

  if (typeof setMedalsByCategory === 'function') {
    setMedalsByCategory(newMedals);
  }
}, [brackets, bracketsOutcomes]);

  // Trigger generation on relevant changes.
  useEffect(() => {
    console.log('🔍 Generator useEffect triggered', {
      playersCount: players.length,
      bracketsCount: brackets.length,
      skipGen: skipGenerationRef.current,
    });

    if (skipGenerationRef.current) {
      console.log('⏸️ Skipping useEffect generation');
      return undefined;
    }

    if (!Array.isArray(players) || players.length === 0) {
      console.log('⏸️ No players, skipping generation');
      return undefined;
    }

    console.log('🚀 Triggering bracket generation');
    generateBrackets();

    return () => generateBrackets.cancel();
  }, [generateBrackets, playerContentSignature, players.length, brackets.length]);

  const skipNextGeneration = useCallback(() => {
    console.log('⏸️ Setting skip generation flag');
    skipGenerationRef.current = true;
  }, []);

  return {
    generatedBrackets: brackets,
    computedMedals,
    isGenerating,
    generationError,
    skipNextGeneration,
  };
}
