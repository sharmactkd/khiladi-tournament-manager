import { createSlice } from '@reduxjs/toolkit';
import {
  generateSingleEliminationGameStructure,
  findDependentGames,
} from '../components/TieSheet/bracketUtils';

const initialState = {
  brackets: [],
  bracketsOutcomes: {},
  lockedBrackets: [],
  shuffleVersion: 0,
  printData: null,
  lastOutcomeAction: null,
};

const isByeTeam = (team) => String(team?.name || '').trim().toUpperCase() === 'BYE';

const shuffleArray = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const getAllGames = (bracket) => {
  return (bracket?.gamesByRound || []).flat().filter(Boolean);
};

const relinkSourceGames = (bracket) => {
  const allGames = getAllGames(bracket);
  const gameMap = new Map(allGames.map((g) => [g.id, g]));

  allGames.forEach((game) => {
    ['home', 'away'].forEach((sideKey) => {
      const side = game?.sides?.[sideKey];
      const sourceId = side?.sourceGame?.id;

      if (sourceId !== undefined && gameMap.has(sourceId)) {
        side.sourceGame = gameMap.get(sourceId);
      }
    });
  });

  const lastRound = bracket.gamesByRound?.[bracket.gamesByRound.length - 1] || [];
  bracket.game = lastRound[lastRound.length - 1] || bracket.game;

  return bracket;
};

const collectDirectPlayerPositions = (bracket) => {
  const positions = [];

  getAllGames(bracket).forEach((game) => {
    ['home', 'away'].forEach((sideKey) => {
      const side = game?.sides?.[sideKey];
      const team = side?.team;

      if (team && !isByeTeam(team)) {
        positions.push({
          gameId: game.id,
          sideKey,
          team,
        });
      }
    });
  });

  return positions;
};

const applyTeamsToExistingBracket = (bracket, teamsToApply) => {
  const cloned = relinkSourceGames(JSON.parse(JSON.stringify(bracket)));
  const positions = collectDirectPlayerPositions(cloned);
  const teams = Array.isArray(teamsToApply) ? teamsToApply : shuffleArray(positions.map((p) => p.team));

  positions.forEach((pos, index) => {
    const game = getAllGames(cloned).find((g) => g?.id === pos.gameId);

    if (game?.sides?.[pos.sideKey]?.team && teams[index]) {
      game.sides[pos.sideKey].team = teams[index];
    }
  });

  relinkSourceGames(cloned);

  cloned.shuffledPlayers = teams.map((team) => ({
    name: team?.name || '',
    team: team?.team || '',
  }));

  cloned.outcomes = {};
  return cloned;
};

const applyShuffledPlayersToExistingBracket = (bracket) => {
  return applyTeamsToExistingBracket(bracket);
};

const bracketsSlice = createSlice({
  name: 'brackets',
  initialState,
  reducers: {
    setInitialBrackets(state, action) {
      if (Array.isArray(action.payload?.brackets)) {
        state.brackets = action.payload.brackets;
        state.shuffleVersion = 0;
      }

      if (action.payload?.outcomes && typeof action.payload.outcomes === 'object') {
        state.bracketsOutcomes = action.payload.outcomes;
      }

      if (Array.isArray(action.payload?.lockedBrackets)) {
        state.lockedBrackets = action.payload.lockedBrackets;
      }
    },

    setOutcomes(state, action) {
      const next = action.payload;
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        state.bracketsOutcomes = next;
      } else {
        console.warn('Invalid payload for setOutcomes:', next);
      }
    },

    setBracketsOnly(state, action) {
      const next = action.payload;
      if (Array.isArray(next)) {
        state.brackets = next;
        state.shuffleVersion = 0;
      } else {
        console.warn('Invalid payload for setBracketsOnly:', next);
      }
    },

    toggleLock(state, action) {
      const key = action.payload;
      if (!key || typeof key !== 'string') {
        console.warn('Invalid key for toggleLock:', key);
        return;
      }

      if (state.lockedBrackets.includes(key)) {
        state.lockedBrackets = state.lockedBrackets.filter((k) => k !== key);
      } else {
        state.lockedBrackets.push(key);
      }
    },

    shuffleBracket(state, action) {
      const bracketKey = action.payload;

      if (!bracketKey || typeof bracketKey !== 'string') {
        console.warn('Invalid bracketKey for shuffle:', bracketKey);
        return;
      }

      const baseKey = bracketKey.replace(/_Pool.*$/, '');

      if (state.lockedBrackets.includes(baseKey) || state.lockedBrackets.includes(bracketKey)) {
        console.warn('Cannot shuffle locked bracket:', bracketKey);
        return;
      }

      const bracketIndex = state.brackets.findIndex((b) => b.key === bracketKey);

      if (bracketIndex === -1) {
        console.warn('Bracket not found for shuffle:', bracketKey);
        return;
      }

      const bracket = state.brackets[bracketIndex];

      if (!bracket || !Array.isArray(bracket.shuffledPlayers)) {
        console.warn('Invalid bracket structure for shuffle:', bracket);
        return;
      }

      const newBrackets = JSON.parse(JSON.stringify(state.brackets));

      if (bracket.pool && bracket.pool !== 'Final') {
        const poolBrackets = newBrackets
          .filter(
            (b) =>
              b &&
              b.key &&
              b.key.startsWith(`${baseKey}_Pool`) &&
              b.pool &&
              b.pool !== 'Final'
          )
          .sort((a, b) => (a.pool?.charCodeAt(0) || 0) - (b.pool?.charCodeAt(0) || 0));

        if (poolBrackets.length === 0) {
          console.warn('No pool brackets found for shuffle:', bracketKey);
          return;
        }

        const allPositions = [];

        poolBrackets.forEach((pb) => {
          const positions = collectDirectPlayerPositions(pb);
          positions.forEach((pos) => {
            allPositions.push({
              bracketKey: pb.key,
              team: pos.team,
            });
          });
        });

        if (allPositions.length === 0) {
          console.warn('No player positions found in pool brackets for shuffle');
          return;
        }

        const shuffledTeams = shuffleArray(allPositions.map((p) => p.team));
        let cursor = 0;

        poolBrackets.forEach((pb) => {
          const positions = collectDirectPlayerPositions(pb);
          const teamsForThisPool = shuffledTeams.slice(cursor, cursor + positions.length);
          cursor += positions.length;

          try {
            const updatedPool = applyTeamsToExistingBracket(pb, teamsForThisPool);
            const idx = newBrackets.findIndex((b) => b.key === pb.key);
            if (idx !== -1) newBrackets[idx] = updatedPool;
          } catch (error) {
            console.error('Error applying shuffle to existing pool:', pb.pool, error);
          }
        });

        const updatedPoolBrackets = newBrackets
          .filter(
            (b) =>
              b &&
              b.key &&
              b.key.startsWith(`${baseKey}_Pool`) &&
              b.pool &&
              b.pool !== 'Final'
          )
          .sort((a, b) => (a.pool?.charCodeAt(0) || 0) - (b.pool?.charCodeAt(0) || 0));

        const poolFinalIndex = newBrackets.findIndex((b) => b.key === `${baseKey}_PoolFinal`);

        if (poolFinalIndex !== -1) {
          try {
            const dummyPlayers = updatedPoolBrackets.map((_, idx) => ({
              name: `Winner Pool ${String.fromCharCode(65 + idx)}`,
              team: '',
            }));

            const playoffStruct = generateSingleEliminationGameStructure(dummyPlayers);

            let poolIndex = 0;

            playoffStruct.gamesByRound[0]?.forEach((game) => {
              if (!game?.sides) return;

              if (updatedPoolBrackets[poolIndex]) {
                game.sides.home = {
                  sourceGame: updatedPoolBrackets[poolIndex].game,
                  score: { score: null },
                  pool: updatedPoolBrackets[poolIndex].pool,
                };
                poolIndex++;
              }

              if (game.sides.away && updatedPoolBrackets[poolIndex]) {
                game.sides.away = {
                  sourceGame: updatedPoolBrackets[poolIndex].game,
                  score: { score: null },
                  pool: updatedPoolBrackets[poolIndex].pool,
                };
                poolIndex++;
              }
            });

            newBrackets[poolFinalIndex] = {
              ...newBrackets[poolFinalIndex],
              game: playoffStruct.finalGame,
              gamesByRound: playoffStruct.gamesByRound,
              outcomes: {},
            };
          } catch (error) {
            console.error('Error rebuilding pool final:', error);
          }
        }
      } else {
        try {
          newBrackets[bracketIndex] = applyShuffledPlayersToExistingBracket(bracket);
        } catch (error) {
          console.error('Error applying shuffle to existing bracket:', bracketKey, error);
          return;
        }
      }

      const newOutcomes = { ...(state.bracketsOutcomes || {}) };

      Object.keys(newOutcomes).forEach((k) => {
        if (k && k.startsWith(baseKey)) {
          newOutcomes[k] = {};
        }
      });

      state.brackets = [...newBrackets];
      state.bracketsOutcomes = { ...newOutcomes };
      state.shuffleVersion = (state.shuffleVersion || 0) + 1;
    },

    setOutcome(state, action) {
      const { bracketKey, gameId, side } = action.payload;

      if (!bracketKey || typeof bracketKey !== 'string' || !gameId || !['home', 'away'].includes(side)) {
        console.warn('Invalid setOutcome payload:', action.payload);
        return;
      }

      state.lastOutcomeAction = {
        bracketKey,
        gameId,
        side,
        ts: Date.now(),
      };

      const prevBracketOutcomes = state.bracketsOutcomes?.[bracketKey] || {};
      const prevWinner = prevBracketOutcomes?.[gameId];
      const nextWinner = prevWinner === side ? null : side;

      const newBracketsOutcomes = { ...(state.bracketsOutcomes || {}) };

      const ensured = (key) => {
        const current = newBracketsOutcomes[key] || {};
        if (current === state.bracketsOutcomes[key]) {
          newBracketsOutcomes[key] = { ...current };
        }
        return newBracketsOutcomes[key];
      };

      const curOut = ensured(bracketKey);

      if (nextWinner) {
        curOut[gameId] = nextWinner;
      } else {
        delete curOut[gameId];
      }

      const shouldCascade = !!prevWinner && prevWinner !== nextWinner;

      if (shouldCascade) {
        const getGamesByRound = (key) => {
          const b = (state.brackets || []).find((x) => x?.key === key);
          return Array.isArray(b?.gamesByRound) ? b.gamesByRound : [];
        };

        const findDirectCrossBracketDependents = (sourceGameId) => {
          const res = [];
          const brackets = Array.isArray(state.brackets) ? state.brackets : [];

          for (const b of brackets) {
            const bKey = b?.key;
            const gbr = Array.isArray(b?.gamesByRound) ? b.gamesByRound : [];
            if (!bKey || !gbr.length) continue;

            for (const round of gbr) {
              for (const g of round || []) {
                const sides = [g?.sides?.home, g?.sides?.away].filter(Boolean);

                for (const s of sides) {
                  if (s?.sourceGame?.id === sourceGameId) {
                    res.push({ bracketKey: bKey, gameId: g.id });
                    break;
                  }
                }
              }
            }
          }

          return res;
        };

        const queue = [];
        const visited = new Set();

        const seedFrom = (srcBracketKey, srcGameId) => {
          const depsSame = findDependentGames(srcGameId, getGamesByRound(srcBracketKey));

          for (const depId of depsSame) {
            queue.push({ bracketKey: srcBracketKey, gameId: depId });
          }

          const depsCross = findDirectCrossBracketDependents(srcGameId);

          for (const dep of depsCross) {
            queue.push(dep);
          }
        };

        seedFrom(bracketKey, gameId);

        while (queue.length) {
          const node = queue.shift();
          const k = node?.bracketKey;
          const gId = node?.gameId;

          if (!k || !gId) continue;

          const key = `${k}::${gId}`;
          if (visited.has(key)) continue;

          visited.add(key);

          const out = ensured(k);
          const hadOutcome = typeof out[gId] !== 'undefined';

          if (hadOutcome) delete out[gId];

          seedFrom(k, gId);
        }
      }

      state.bracketsOutcomes = newBracketsOutcomes;
    },

    clearOutcomes(state, action) {
      const bracketKey = action.payload;

      if (!bracketKey) {
        console.warn('Invalid bracketKey for clearOutcomes');
        return;
      }

      const newOutcomes = { ...state.bracketsOutcomes };
      delete newOutcomes[bracketKey];
      state.bracketsOutcomes = newOutcomes;
    },

    setPrintData(state, action) {
      state.printData = action.payload;
    },

    clearPrintData(state) {
      state.printData = null;
    },

    resetBrackets(state) {
      state.brackets = [];
      state.bracketsOutcomes = {};
      state.lockedBrackets = [];
      state.shuffleVersion = 0;
      state.printData = null;
      state.lastOutcomeAction = null;
    },
  },
});

export const {
  setInitialBrackets,
  setOutcomes,
  setBracketsOnly,
  toggleLock,
  shuffleBracket,
  setOutcome,
  clearOutcomes,
  resetBrackets,
  setPrintData,
  clearPrintData,
} = bracketsSlice.actions;

export const selectBrackets = (state) => state.brackets.brackets || [];
export const selectBracketsOutcomes = (state) => state.brackets.bracketsOutcomes || {};
export const selectLockedBrackets = (state) => state.brackets.lockedBrackets || [];
export const selectLastOutcomeAction = (state) => state.brackets.lastOutcomeAction || null;

export default bracketsSlice.reducer;