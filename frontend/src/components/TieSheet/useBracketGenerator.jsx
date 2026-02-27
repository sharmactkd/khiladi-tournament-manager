// src/components/TieSheet/useBracketGenerator.js
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';
import { getName, MEDAL_PLACEHOLDER } from './bracketUtils';

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

// ── Helper: Smart Seed Players ──────────────────────────────────────────────
const smartSeedPlayers = (playersList) => {
  if (playersList.length <= 2) return [...playersList];

  const teamGroups = {};
  playersList.forEach(p => {
    const team = p.team?.trim() || 'No Team';
    if (!teamGroups[team]) teamGroups[team] = [];
    teamGroups[team].push(p);
  });

  const sortedTeams = Object.entries(teamGroups)
    .sort((a, b) => b[1].length - a[1].length);

  const totalSlots = Math.pow(2, Math.ceil(Math.log2(playersList.length)));
  const seeded = new Array(totalSlots);
  let topIndex = 0;
  let bottomIndex = totalSlots - 1;

  sortedTeams.forEach(([team, teamPlayers]) => {
    teamPlayers.forEach((player, i) => {
      if (i % 2 === 0) {
        while (topIndex < totalSlots && seeded[topIndex]) topIndex++;
        if (topIndex < totalSlots / 2) {
          seeded[topIndex] = player;
          topIndex += 2;
          if (topIndex >= totalSlots / 2) topIndex = 1;
        }
      } else {
        while (bottomIndex >= totalSlots / 2 && seeded[bottomIndex]) bottomIndex--;
        if (bottomIndex >= totalSlots / 2) {
          seeded[bottomIndex] = player;
          bottomIndex -= 2;
          if (bottomIndex < totalSlots / 2) bottomIndex = totalSlots - 2;
        }
      }
    });
  });

  let remaining = playersList.filter(p => !seeded.includes(p));
  let fillIndex = 0;
  for (let i = 0; i < totalSlots; i++) {
    if (!seeded[i] && remaining[fillIndex]) {
      seeded[i] = remaining[fillIndex++];
    }
  }

  return seeded.filter(Boolean);
};

// ── Generate Single Elimination Structure ───────────────────────────────────
const generateSingleEliminationGameStructure = (players, poolLabel = '') => {
  if (!players || players.length === 0) return { finalGame: null, gamesByRound: [] };

  const p = (idx) => {
    if (idx >= players.length) {
      return { team: { id: `bye-${idx}`, name: 'BYE', team: '' }, score: { score: null } };
    }
    const player = players[idx];
    return {
      team: { id: `player-${idx}`, name: player.name || '', team: player.team || '' },
      score: { score: null },
    };
  };

  const src = (game) => ({
    sourceGame: game,
    score: { score: null },
    pool: game.pool
  });

  const getRoundName = (roundNumber, totalRounds, poolLabel) => {
    if (poolLabel && roundNumber === totalRounds) {
      return `${poolLabel} Final`;
    }
    const rounds = {
      [totalRounds]: 'Final',
      [totalRounds - 1]: 'Semifinals',
      [totalRounds - 2]: 'Quarterfinals',
      [totalRounds - 3]: 'Round of 16'
    };
    return rounds[roundNumber] || `Round of ${Math.pow(2, totalRounds - roundNumber + 1)}`;
  };

  const playerCount = players.length;
  const poolNum = poolLabel ? poolLabel.charCodeAt(poolLabel.length - 1) - 64 : 0;
  let matchId = poolNum ? poolNum * 1000 + 1 : 1;

  if (playerCount <= 0) return { finalGame: null, gamesByRound: [] };
  if (playerCount === 1) {
    const game = {
      id: matchId++,
      name: poolLabel ? `${poolLabel} Final` : 'Final',
      round: 1,
      scheduled: Date.now(),
      pool: poolLabel?.replace('Pool ', '') || '',
      sides: { home: p(0) }
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
      const pos = matchesInFirstRound - 1 - Math.floor(i * matchesInFirstRound / byesNeeded);
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
    } else {
      if (playerIndex + 1 < playerCount) {
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
          sides: { home, away }
        };
        game.slot = slot;
        firstRoundGames.push(game);
        directAdvancers.push(game);
      }
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
        sides: { home: null, away: null }
      };
      game.sides.home = homeAdvancer ? (homeAdvancer.round ? src(homeAdvancer) : homeAdvancer) : null;
      if (awayAdvancer) game.sides.away = awayAdvancer.round ? src(awayAdvancer) : awayAdvancer;
      nextRound.push(game);
    }
    gamesByRound[roundNumber - 1] = nextRound;
    currentAdvancers = nextRound;
    roundNumber++;
  }

  return { finalGame: currentAdvancers[0] || null, gamesByRound };
};

// ── Memoized Medal Calculator ──────────────────────────────────────────────
const computeMedals = (brackets, outcomes) => {
  const medalsByCategory = {};

  const baseKeys = [...new Set(brackets.map(b => b.key.replace(/_Pool.*$/, '')))];

  baseKeys.forEach(baseKey => {
    const poolFinal = brackets.find(b => b.key === `${baseKey}_PoolFinal`);
    const single = brackets.find(b => b.key === baseKey);
    const categoryCount = brackets.find(b => b.key.startsWith(baseKey))?.categoryPlayerCount || 0;

    let gold = MEDAL_PLACEHOLDER;
    let silver = MEDAL_PLACEHOLDER;
    let bronze1 = MEDAL_PLACEHOLDER;
    let bronze2 = MEDAL_PLACEHOLDER;

    if (poolFinal) {
      const finalOutcomes = outcomes[poolFinal.key] || {};
      const finalGame = poolFinal.game;
      const winnerSide = finalOutcomes[finalGame.id];
      if (winnerSide) {
        gold = getName(finalGame.sides[winnerSide], poolFinal.key, null, outcomes) || gold;
        silver = getName(finalGame.sides[winnerSide === 'home' ? 'away' : 'home'], poolFinal.key, null, outcomes) || silver;
      }
    } else if (single) {
      const finalOutcomes = outcomes[single.key] || {};
      const finalGame = single.game;
      const winnerSide = finalOutcomes[finalGame.id];
      if (winnerSide) {
        gold = getName(finalGame.sides[winnerSide], single.key, null, outcomes) || gold;
        silver = getName(finalGame.sides[winnerSide === 'home' ? 'away' : 'home'], single.key, null, outcomes) || silver;
      }

      if (categoryCount === 3 && single.gamesByRound?.[0]?.length === 1) {
        const match = single.gamesByRound[0][0];
        const loserSide = finalOutcomes[match.id] === 'home' ? 'away' : 'home';
        bronze1 = getName(match.sides[loserSide], single.key, null, outcomes) || 'BYE Player';
      } else if (categoryCount >= 4 && single.gamesByRound?.length >= 2) {
        const semi = single.gamesByRound[single.gamesByRound.length - 2];
        if (semi?.length >= 2) {
          const semi1Loser = finalOutcomes[semi[0].id] === 'home' ? 'away' : 'home';
          bronze1 = getName(semi[0].sides[semi1Loser], single.key, null, outcomes) || bronze1;
          const semi2Loser = finalOutcomes[semi[1].id] === 'home' ? 'away' : 'home';
          bronze2 = getName(semi[1].sides[semi2Loser], single.key, null, outcomes) || bronze2;
        }
      }
    }

    medalsByCategory[baseKey] = { gold, silver, bronze1, bronze2 };
  });

  return medalsByCategory;
};

// ── Main Hook ───────────────────────────────────────────────────────────────
export default function useBracketGenerator({
  players,
  lockedBrackets = new Set(),
  brackets = [],
  bracketsOutcomes = {},
  setBrackets,
  setBracketsOutcomes,
  setMedalsByCategory,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [computedMedals, setComputedMedals] = useState({});
  
  // Add a ref to track manual updates
  const skipGenerationRef = useRef(false);
  const lastPlayerCountRef = useRef(0);

  // Debounced generation to prevent UI freeze during rapid changes
  const generateBrackets = useCallback(
    debounce(async () => {
      // Skip if we just performed a manual operation (like shuffle)
      if (skipGenerationRef.current) {
        console.log('⏸️ Skipping generator - manual operation detected');
        skipGenerationRef.current = false;
        return;
      }
      
      if (players.length === 0) {
        console.log('⏸️ Skipping generator - no players');
        return;
      }
      
      // Check if player count actually changed
      const playerCountChanged = players.length !== lastPlayerCountRef.current;
      lastPlayerCountRef.current = players.length;
      
      // If brackets already exist and player count didn't change, skip
      if (brackets.length > 0 && !playerCountChanged) {
        console.log('⏸️ Skipping generator - no player count change and brackets exist');
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        console.log('Bracket generation started...');

        // Preserve locked brackets & outcomes
        const preservedLocked = brackets.filter(b => {
          return lockedBrackets.has(b.key);
        });

        console.log('🔒 Preserved Locked:', preservedLocked.map(b => b.key));

        let preservedOutcomes = {};
        preservedLocked.forEach(b => {
          preservedOutcomes[b.key] = { ...(bracketsOutcomes[b.key] || {}) };
        });

        const grouped = players.reduce((acc, p) => {
          const key = `${p.gender}_${p.ageCategory}_${p.weightCategory}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(p);
          return acc;
        }, {});

        const generatedBrackets = [];

        Object.entries(grouped).forEach(([key, groupPlayers]) => {
          const [gender, ageCategory, weightCategory] = key.split('_');
          const categoryPlayerCount = groupPlayers.length;

          if (categoryPlayerCount <= 16) {
            const seededPlayers = smartSeedPlayers([...groupPlayers]);
            const { finalGame, gamesByRound } = generateSingleEliminationGameStructure(seededPlayers);

            // ✅ 3-player debug (DEV only) — logs structure without changing behavior
            if (import.meta.env.DEV && categoryPlayerCount === 3) {
              const n = categoryPlayerCount;
              const rounds = Math.ceil(Math.log2(n));
              const target = Math.pow(2, rounds);
              const byes = target - n;

              const safeSide = (side) => {
                if (!side) return null;
                if (side.team) return { kind: 'team', name: side.team.name, slot: side.slot };
                if (side.sourceGame) return { kind: 'sourceGame', id: side.sourceGame.id, round: side.sourceGame.round };
                return { kind: 'unknown', slot: side.slot };
              };

              console.log('🧪 3-PLAYER BRACKET STRUCTURE', {
                key,
                categoryPlayerCount,
                computed: { rounds, target, byes },
                gamesByRoundMeta: gamesByRound.map((r, idx) => ({
                  roundIndex: idx,
                  roundNumber: idx + 1,
                  roundName: r?.[0]?.name,
                  games: (r || []).map(g => ({
                    id: g.id,
                    round: g.round,
                    name: g.name,
                    slot: g.slot,
                    home: safeSide(g.sides?.home),
                    away: safeSide(g.sides?.away),
                  })),
                })),
                finalGame: finalGame ? {
                  id: finalGame.id,
                  name: finalGame.name,
                  round: finalGame.round,
                  home: safeSide(finalGame.sides?.home),
                  away: safeSide(finalGame.sides?.away),
                } : null
              });
            }

            generatedBrackets.push({
              key,
              sanitizedKey: key.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-'),
              gender,
              ageCategory,
              weightCategory,
              playerCount: categoryPlayerCount,
              categoryPlayerCount,
              shuffledPlayers: seededPlayers,
              game: finalGame,
              gamesByRound,
              outcomes: {},
            });
          } else {
            // ── Pool Logic ─────────────────────────────────────────────────────
            const minPools = Math.ceil(categoryPlayerCount / 16);
            let numPools = 1;
            while (numPools < minPools) numPools *= 2;

            const poolSizes = Array(numPools).fill(Math.floor(categoryPlayerCount / numPools));
            const extras = categoryPlayerCount % numPools;
            for (let i = 0; i < extras; i++) poolSizes[i]++;

            const allSeededPlayers = smartSeedPlayers([...groupPlayers]);
            let playerStart = 0;
            const pools = [];

            for (let i = 0; i < numPools; i++) {
              const poolLabelChar = String.fromCharCode(65 + i);
              const poolPlayersRaw = allSeededPlayers.slice(playerStart, playerStart + poolSizes[i]);
              const poolPlayers = poolPlayersRaw.length > 2 ? smartSeedPlayers(poolPlayersRaw) : poolPlayersRaw;
              playerStart += poolSizes[i];

              const poolStruct = generateSingleEliminationGameStructure(poolPlayers, `Pool ${poolLabelChar}`);

              pools.push({
                key: `${key}_Pool${poolLabelChar}`,
                sanitizedKey: `${key}_Pool${poolLabelChar}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-'),
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
            const dummyPlayoffPlayers = pools.map((_, idx) => ({
              name: `Winner Pool ${String.fromCharCode(65 + idx)}`,
              team: '',
            }));

            let playoffStruct = generateSingleEliminationGameStructure(dummyPlayoffPlayers);
            let poolIndex = 0;
            playoffStruct.gamesByRound[0].forEach(game => {
              game.sides.home = {
                sourceGame: pools[poolIndex].game,
                score: { score: null },
                pool: pools[poolIndex].pool,
              };
              poolIndex++;
              if (game.sides.away) {
                game.sides.away = {
                  sourceGame: pools[poolIndex].game,
                  score: { score: null },
                  pool: pools[poolIndex].pool,
                };
                poolIndex++;
              }
            });

            generatedBrackets.push(...pools);
            generatedBrackets.push({
              key: `${key}_PoolFinal`,
              sanitizedKey: `${key}_PoolFinal`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-'),
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
          }
        });

        // ── Sorting ────────────────────────────────────────────────────────────
        generatedBrackets.sort((a, b) => {
          const g = GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender);
          if (g !== 0) return g;
          const aIdx = AGE_CATEGORY_ORDER.indexOf(a.ageCategory);
          const bIdx = AGE_CATEGORY_ORDER.indexOf(b.ageCategory);
          if (aIdx !== bIdx) return aIdx - bIdx;
          const weightCmp = a.weightCategory.localeCompare(b.weightCategory);
          if (weightCmp !== 0) return weightCmp;
          const poolOrder = a.pool ? (a.pool === 'Final' ? 999 : a.pool.charCodeAt(0)) : 0;
          const pbOrder = b.pool ? (b.pool === 'Final' ? 999 : b.pool.charCodeAt(0)) : 0;
          return poolOrder - pbOrder;
        });

        // ── Merge preserved locked brackets ────────────────────────────────────
        const finalBrackets = [...preservedLocked];
        
        generatedBrackets.forEach(newB => {
          // ✅ Pehle check karo ki kya ye bracket locked hai
          if (lockedBrackets.has(newB.key)) {
            console.log(`⏸️ Skipping locked bracket in generation: ${newB.key}`);
            return;
          }
          
          // Find existing bracket with same key in finalBrackets
          const existingIndex = finalBrackets.findIndex(b => b.key === newB.key);
          
          if (existingIndex !== -1) {
            const existingBracket = finalBrackets[existingIndex];
            
            // 🔥 Agar bracket mein players same hain (shuffle nahi hua) to preserve karo
            // Agar players different hain (shuffle hua) to new use karo
            const existingPlayerNames = existingBracket.shuffledPlayers?.map(p => p.name || '').sort();
            const newPlayerNames = newB.shuffledPlayers?.map(p => p.name || '').sort();
            
            const playersChanged = JSON.stringify(existingPlayerNames) !== JSON.stringify(newPlayerNames);
            
            if (!playersChanged) {
              // Players same hain, preserve existing (shuffled) bracket
              console.log(`🔁 Preserving existing bracket (players same): ${newB.key}`);
              return;
            } else {
              // Players different hain, update with new
              console.log(`🔄 Updating bracket with new players: ${newB.key}`);
              finalBrackets[existingIndex] = newB;
            }
          } else {
            // New bracket, add it
            finalBrackets.push(newB);
          }
        });

        // Final sort again
        finalBrackets.sort((a, b) => {
          const g = GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender);
          if (g !== 0) return g;
          const aIdx = AGE_CATEGORY_ORDER.indexOf(a.ageCategory);
          const bIdx = AGE_CATEGORY_ORDER.indexOf(b.ageCategory);
          if (aIdx !== bIdx) return aIdx - bIdx;
          const weightCmp = a.weightCategory.localeCompare(b.weightCategory);
          if (weightCmp !== 0) return weightCmp;
          const poolOrder = a.pool ? (a.pool === 'Final' ? 999 : a.pool.charCodeAt(0)) : 0;
          const pbOrder = b.pool ? (b.pool === 'Final' ? 999 : b.pool.charCodeAt(0)) : 0;
          return poolOrder - pbOrder;
        });

        // ── Update state only if changed ──────────────────────────────────────
        const bracketsChanged = JSON.stringify(finalBrackets.map(b => b.key)) !== JSON.stringify(brackets.map(b => b.key));
        if (bracketsChanged) {
          console.log('✅ Updating brackets (changed detected)');
          setBrackets(finalBrackets);
        } else {
          console.log('⏸️ Skipping brackets update (no change)');
        }

        let newOutcomes = { ...bracketsOutcomes }; // पहले से जो outcomes हैं रखो

        // अगर bracket नया है तो empty outcomes
        finalBrackets.forEach(br => {
          if (!newOutcomes[br.key]) {
            newOutcomes[br.key] = {};
          }
        });

        // preserved को merge करो (locked वाले priority)
        newOutcomes = { ...newOutcomes, ...preservedOutcomes };

        // outcomesChanged check
        const outcomesChanged = JSON.stringify(newOutcomes) !== JSON.stringify(bracketsOutcomes);
        if (outcomesChanged) {
          setBracketsOutcomes(newOutcomes);
        }

        // ── Compute & Update Medals ───────────────────────────────────────────
        const newMedals = computeMedals(finalBrackets, newOutcomes);
        setComputedMedals(newMedals);           // ← NEW: update local state
        setMedalsByCategory(newMedals);         // keep for parent compatibility

        console.log('Bracket generation completed successfully');
      } catch (err) {
        console.error('Bracket generation failed:', err);
        setGenerationError('Failed to generate brackets. Please try again or reduce the number of players.');
      } finally {
        setIsGenerating(false);
      }
    }, 600), // 600ms debounce
    [
      players,
      lockedBrackets,
      brackets,
      bracketsOutcomes,
      setBrackets,
      setBracketsOutcomes,
      setMedalsByCategory,
    ]
  );

  // Trigger generation on relevant changes
  useEffect(() => {
    console.log('🔍 Generator useEffect triggered', {
      playersCount: players.length,
      bracketsCount: brackets.length,
      skipGen: skipGenerationRef.current
    });
    
    // Skip generation if we're in a manual operation mode
    if (skipGenerationRef.current) {
      console.log('⏸️ Skipping useEffect generation');
      return;
    }
    
    // Only generate initially or when players significantly change
    if (players.length === 0) {
      console.log('⏸️ No players, skipping generation');
      return;
    }
    
    console.log('🚀 Triggering bracket generation');
    generateBrackets();
    
    return () => generateBrackets.cancel(); // Cleanup debounce on unmount
  }, [generateBrackets, players.length]); // Only depend on player count

  // Function to manually skip next generation (for shuffle operations)
  const skipNextGeneration = useCallback(() => {
    console.log('⏸️ Setting skip generation flag');
    skipGenerationRef.current = true;
  }, []);

  // Return current state + generation status
  return {
    generatedBrackets: brackets,
    computedMedals,
    isGenerating,
    generationError,
    skipNextGeneration, // Export this function for shuffle operations
  };
}