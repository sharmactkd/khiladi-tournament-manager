import { createSlice } from '@reduxjs/toolkit';
import {
  generateSingleEliminationGameStructure,
  findDependentGames,
} from '../components/TieSheet/bracketUtils';

const initialState = {
  brackets: [], // array of bracket objects
  bracketsOutcomes: {}, // { bracketKey: { gameId: 'home' | 'away' } }
  lockedBrackets: [], // array of locked bracket keys (we convert to Set in selectors)
  shuffleVersion: 0, // increment to force UI refresh after shuffle
  printData: null, // optional: can be used for print-related state if needed

  // ✅ Internal meta (no UI behavior impact): allows TieSheet to log/save precisely
  lastOutcomeAction: null, // { bracketKey, gameId, side, ts }
};

const bracketsSlice = createSlice({
  name: 'brackets',
  initialState,
  reducers: {
    // Load initial brackets & outcomes from server / local (existing behavior)
    setInitialBrackets(state, action) {
      // Ensure brackets is always an array
      if (Array.isArray(action.payload?.brackets)) {
        state.brackets = action.payload.brackets;
        // Only reset shuffleVersion when we are explicitly setting brackets
        state.shuffleVersion = 0;
      }

      // Ensure outcomes is always an object
      if (action.payload?.outcomes && typeof action.payload.outcomes === 'object') {
        state.bracketsOutcomes = action.payload.outcomes;
      }

      // Ensure lockedBrackets from payload if provided
      if (Array.isArray(action.payload?.lockedBrackets)) {
        state.lockedBrackets = action.payload.lockedBrackets;
      }
    },

    // ✅ Set only outcomes (no bracket/shuffleVersion side-effects)
    setOutcomes(state, action) {
      const next = action.payload;
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        state.bracketsOutcomes = next;
      } else {
        console.warn('Invalid payload for setOutcomes:', next);
      }
    },

    // ✅ Set only brackets (keeps outcomes; resets version like full reload)
    setBracketsOnly(state, action) {
      const next = action.payload;
      if (Array.isArray(next)) {
        state.brackets = next;
        state.shuffleVersion = 0;
      } else {
        console.warn('Invalid payload for setBracketsOnly:', next);
      }
    },

    // Toggle lock for a bracket (base key or full key)
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

    // Shuffle a bracket (pool or regular) - using old logic
    shuffleBracket(state, action) {
      const bracketKey = action.payload;

      if (!bracketKey || typeof bracketKey !== 'string') {
        console.warn('Invalid bracketKey for shuffle:', bracketKey);
        return;
      }

      // Lock check (use base key for consistency)
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

      // Validate bracket structure
      if (!bracket || !Array.isArray(bracket.shuffledPlayers)) {
        console.warn('Invalid bracket structure for shuffle:', bracket);
        return;
      }

      // Deep copy of entire brackets array (important for immutability)
      let newBrackets = JSON.parse(JSON.stringify(state.brackets));

      if (bracket.pool && bracket.pool !== 'Final') {
        // ── POOL SHUFFLE ────────────────────────────────────────────────
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

        let allPlayers = [];
        const poolSizes = [];

        poolBrackets.forEach((pb) => {
          if (Array.isArray(pb.shuffledPlayers)) {
            allPlayers.push(...pb.shuffledPlayers);
            poolSizes.push(pb.shuffledPlayers.length);
          }
        });

        if (allPlayers.length === 0) {
          console.warn('No players found in pool brackets for shuffle');
          return;
        }

        // Fisher-Yates shuffle (old logic preserved)
        for (let i = allPlayers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
        }

        let start = 0;
        poolBrackets.forEach((pb, i) => {
          const size = poolSizes[i] || 0;
          const newPlayers = allPlayers.slice(start, start + size);
          start += size;

          try {
            const { finalGame, gamesByRound } = generateSingleEliminationGameStructure(
              newPlayers,
              `Pool ${pb.pool}`
            );

            const updatedPool = {
              ...pb,
              shuffledPlayers: newPlayers,
              game: finalGame,
              gamesByRound,
              outcomes: {}, // Clear outcomes on shuffle
            };

            const idx = newBrackets.findIndex((b) => b.key === pb.key);
            if (idx !== -1) newBrackets[idx] = updatedPool;
          } catch (error) {
            console.error('Error generating game structure for pool:', pb.pool, error);
          }
        });

        // Rebuild Pool Final
        const poolFinalIndex = newBrackets.findIndex((b) => b.key === `${baseKey}_PoolFinal`);
        if (poolFinalIndex !== -1) {
          try {
            const dummyPlayers = poolBrackets.map((_, idx) => ({
              name: `Winner Pool ${String.fromCharCode(65 + idx)}`,
              team: '',
            }));

            const playoffStruct = generateSingleEliminationGameStructure(dummyPlayers);

            let poolIndex = 0;
            playoffStruct.gamesByRound[0]?.forEach((game) => {
              if (game && game.sides) {
                if (poolBrackets[poolIndex]) {
                  game.sides.home = {
                    sourceGame: poolBrackets[poolIndex].game,
                    score: { score: null },
                    pool: poolBrackets[poolIndex].pool,
                  };
                  poolIndex++;
                }
                if (game.sides.away && poolBrackets[poolIndex]) {
                  game.sides.away = {
                    sourceGame: poolBrackets[poolIndex].game,
                    score: { score: null },
                    pool: poolBrackets[poolIndex].pool,
                  };
                  poolIndex++;
                }
              }
            });

            newBrackets[poolFinalIndex] = {
              ...newBrackets[poolFinalIndex],
              game: playoffStruct.finalGame,
              gamesByRound: playoffStruct.gamesByRound,
              outcomes: {}, // Clear outcomes on shuffle
            };
          } catch (error) {
            console.error('Error rebuilding pool final:', error);
          }
        }
      } else {
        // ── REGULAR (NON-POOL) BRACKET SHUFFLE ───────────────────────────────
        const shuffledPlayers = [...bracket.shuffledPlayers];

        // Fisher-Yates shuffle (old logic preserved)
        for (let i = shuffledPlayers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
        }

        try {
          const { finalGame, gamesByRound } = generateSingleEliminationGameStructure(shuffledPlayers);

          newBrackets[bracketIndex] = {
            ...bracket,
            shuffledPlayers,
            game: finalGame,
            gamesByRound,
            outcomes: {}, // Clear outcomes on shuffle
          };
        } catch (error) {
          console.error('Error generating game structure for bracket:', bracketKey, error);
          return;
        }
      }

      // ── Clear outcomes for the entire category ──────────────────────────────
      const newOutcomes = { ...(state.bracketsOutcomes || {}) };
      Object.keys(newOutcomes).forEach((k) => {
        if (k && k.startsWith(baseKey)) {
          newOutcomes[k] = {};
        }
      });

      // ── Apply updates with new references (immutability) ─────────────────────
      state.brackets = [...newBrackets]; // force new array reference
      state.bracketsOutcomes = { ...newOutcomes }; // force new object reference
      state.shuffleVersion = (state.shuffleVersion || 0) + 1; // force UI refresh
    },

    // Set outcome for a single match (with cascade reset)
    setOutcome(state, action) {
      const { bracketKey, gameId, side } = action.payload;

      if (!bracketKey || typeof bracketKey !== 'string' || !gameId || !['home', 'away'].includes(side)) {
        console.warn('Invalid setOutcome payload:', action.payload);
        return;
      }

      // ✅ Meta for persistence/logging (no UI impact)
      state.lastOutcomeAction = {
        bracketKey,
        gameId,
        side,
        ts: Date.now(),
      };

      // Snapshot previous outcome
      const prevBracketOutcomes = state.bracketsOutcomes?.[bracketKey] || {};
      const prevWinner = prevBracketOutcomes?.[gameId];

      // Toggle behavior preserved:
      // - clicking same side clears
      // - clicking other side switches
      const nextWinner = prevWinner === side ? null : side;

      // Prepare immutable updates at key-level (new object ref for any touched bracketKey)
      const newBracketsOutcomes = { ...(state.bracketsOutcomes || {}) };
      const ensured = (key) => {
        const current = newBracketsOutcomes[key] || {};
        // ensure a new reference if we're going to mutate this key
        if (current === state.bracketsOutcomes[key]) {
          newBracketsOutcomes[key] = { ...current };
        }
        return newBracketsOutcomes[key];
      };

      // Apply current match outcome
      const curOut = ensured(bracketKey);
      if (nextWinner) {
        curOut[gameId] = nextWinner;
      } else {
        delete curOut[gameId];
      }

      // Cascade reset ONLY when clearing or changing an existing winner
      // (i.e., this action invalidates downstream results)
      const shouldCascade = !!prevWinner && prevWinner !== nextWinner;

      if (shouldCascade) {
        // Helper: safely get gamesByRound for a bracket key
        const getGamesByRound = (key) => {
          const b = (state.brackets || []).find((x) => x?.key === key);
          return Array.isArray(b?.gamesByRound) ? b.gamesByRound : [];
        };

        // Helper: find direct dependents across OTHER brackets (pool finals, etc.)
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

        // Seed queue with games that depend on the changed/cleared match,
        // both within the same bracket and across brackets.
        const queue = [];
        const visited = new Set();

        const seedFrom = (srcBracketKey, srcGameId) => {
          // Same-bracket dependents
          const depsSame = findDependentGames(srcGameId, getGamesByRound(srcBracketKey));
          for (const depId of depsSame) {
            queue.push({ bracketKey: srcBracketKey, gameId: depId });
          }

          // Cross-bracket dependents
          const depsCross = findDirectCrossBracketDependents(srcGameId);
          for (const dep of depsCross) {
            queue.push(dep);
          }
        };

        // Start cascade from the changed match id (do NOT clear it here; already handled above)
        seedFrom(bracketKey, gameId);

        // BFS: clear each dependent outcome and continue recursively
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

          // Continue cascade from this game regardless of whether it had an outcome
          seedFrom(k, gId);
        }
      }

      state.bracketsOutcomes = newBracketsOutcomes;
    },

    // Clear all outcomes for a bracket
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

    // Clear print data
    clearPrintData(state) {
      state.printData = null;
    },

    // Reset all brackets (useful for debugging or testing)
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

// Selector helpers
export const selectBrackets = (state) => state.brackets.brackets || [];
export const selectBracketsOutcomes = (state) => state.brackets.bracketsOutcomes || {};
export const selectLockedBrackets = (state) => state.brackets.lockedBrackets || [];
export const selectLastOutcomeAction = (state) => state.brackets.lastOutcomeAction || null;

export default bracketsSlice.reducer;