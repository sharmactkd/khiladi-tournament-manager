import React, { useMemo, useLayoutEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setOutcome } from '../../store/bracketsSlice';
import styles from '../../pages/TieSheet.module.css';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import * as d3 from 'd3';
import { getTeamName } from './bracketUtils';

const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const BracketTable = ({ bracket, className = '', lockedBrackets = new Set() }) => {
  const dispatch = useDispatch();
  const bracketsOutcomes = useSelector((state) => state.brackets?.bracketsOutcomes || {});

  const { gamesByRound, key: bracketKey } = bracket || {};

  if (!bracket || !gamesByRound?.length) {
    return <div className={styles.bracketContainer}>Loading...</div>;
  }

  const svgRef = useRef(null);
  const tableRef = useRef(null);

  const totalRounds = gamesByRound.length;

  const baseKey = useMemo(() => {
    return (bracketKey || '').replace(/_Pool.*$/, '');
  }, [bracketKey]);

  const isLocked = useMemo(() => {
    if (!lockedBrackets || !baseKey) return false;
    return lockedBrackets.has(baseKey);
  }, [lockedBrackets, baseKey]);

  // ✅ FIX: Pool brackets show wrong match numbers because UI was using game.id (1001, 2001, ...)
  // We keep game.id unchanged (logic), only compute a stable display number per bracket.
  const matchNumberMap = useMemo(() => {
    const map = {};
    if (!Array.isArray(gamesByRound)) return map;

    const all = [];
    for (let r = 0; r < gamesByRound.length; r++) {
      const round = gamesByRound[r] || [];
      for (let i = 0; i < round.length; i++) {
        const g = round[i];
        if (!g || typeof g.id === 'undefined' || g.id === null) continue;

        // Prefer slot ordering in round 1; fallback to index for other rounds.
        const orderInRound = r === 0 && typeof g.slot === 'number' && Number.isFinite(g.slot) ? g.slot : i;

        all.push({ id: g.id, round: r, orderInRound });
      }
    }

    // Stable order: Round 1 matches first (slot order), then Round 2..., then Final.
    all.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      if (a.orderInRound !== b.orderInRound) return a.orderInRound - b.orderInRound;
      // final tie-breaker (stable)
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    let n = 1;
    for (const item of all) {
      map[item.id] = n++;
    }

    return map;
  }, [gamesByRound]);

  // ── Columns Definition ──────────────────────────────────────────────────────
  const columns = useMemo(() => {
    return Array.from({ length: totalRounds }, (_, i) => {
      const roundNumber = i + 1;
      return {
        accessorKey: `round${roundNumber}`,
        header: () => gamesByRound[i]?.[0]?.name || `Round ${roundNumber}`,
        cell: ({ row }) => {
          const game = row.original[`round${roundNumber}`];
          if (!game) return null;

          const outcomes = bracketsOutcomes[bracketKey] || {};
          const currentWinner = outcomes[game.id];

          const homeTeam = getTeamName(
            game.sides?.home,
            `home_${game.id}`,
            bracketKey,
            game.id,
            bracketsOutcomes
          );
          const awayTeam = getTeamName(
            game.sides?.away,
            `away_${game.id}`,
            bracketKey,
            game.id,
            bracketsOutcomes
          );

          // ✅ display number (not game.id)
          const matchNumber = matchNumberMap?.[game.id] ?? game.id;

          const isByeMatch = homeTeam.name === 'BYE' || awayTeam?.name === 'BYE';
          let isMatchReady = true;

          ['home', 'away'].forEach((s) => {
            const side = game.sides?.[s];
            if (side?.sourceGame) {
              let sourceOutcomes = bracketsOutcomes[bracketKey] || {};
              if (bracketKey.endsWith('_PoolFinal') && side.pool) {
                const category = bracketKey.replace('_PoolFinal', '');
                const poolKey = `${category}_Pool${side.pool}`;
                sourceOutcomes = bracketsOutcomes[poolKey] || {};
              }
              if (!sourceOutcomes[side.sourceGame.id]) isMatchReady = false;
            }
          });

          const clickBlocked = isByeMatch || !isMatchReady || isLocked;

          const handleClick = (clickedSide) => {
            if (clickBlocked) return;

            if (isDev) {
              console.log('🏆 [TieSheet] Winner click', { bracketKey, gameId: game.id, side: clickedSide });
            }

            // ✅ IMPORTANT: store outcomes under RAW bracket.key (bracketKey), not sanitized
            dispatch(setOutcome({ bracketKey, gameId: game.id, side: clickedSide }));
          };

          const cursor = clickBlocked ? 'not-allowed' : 'pointer';

          return (
            <div className={styles.match} data-game-id={game.id} style={{ position: 'relative', zIndex: 2 }}>
              <div className={styles.matchNumberContainer}>
                <span className={styles.matchNumber}>{matchNumber}</span>
              </div>

              <div className={styles.participantsContainer}>
                {/* Home */}
                <div
                  className={`${styles.participant} ${styles.firstParticipant} 
                    ${!homeTeam.name ? styles.emptyParticipant : ''}
                    ${homeTeam.name === 'BYE' ? styles.byeParticipant : ''}
                    ${currentWinner === 'home' ? styles.winnerParticipant : ''}
                    ${currentWinner && currentWinner !== 'home' ? styles.loserParticipant : ''}`}
                  data-participant-position="first"
                  onClick={() => handleClick('home')}
                  style={{ cursor }}
                >
                  <span className={styles.playerName}>{homeTeam.name || ''}</span>
                </div>

                <div
                  className={`${styles.teamBox} ${styles.firstParticipant}
                    ${!homeTeam.team ? styles.emptyTeamBox : ''}
                    ${currentWinner === 'home' ? styles.winnerTeamBox : ''}
                    ${currentWinner && currentWinner !== 'home' ? styles.loserTeamBox : ''}`}
                  data-participant-position="first"
                  onClick={() => handleClick('home')}
                  style={{ cursor }}
                >
                  <span className={styles.teamName}>{homeTeam.team || ''}</span>
                </div>

                {/* Away */}
                {game.sides?.away && (
                  <>
                    <div
                      className={`${styles.participant} ${styles.secondParticipant}
                        ${!awayTeam?.name ? styles.emptyParticipant : ''}
                        ${awayTeam?.name === 'BYE' ? styles.byeParticipant : ''}
                        ${currentWinner === 'away' ? styles.winnerParticipant : ''}
                        ${currentWinner && currentWinner !== 'away' ? styles.loserParticipant : ''}`}
                      data-participant-position="second"
                      onClick={() => handleClick('away')}
                      style={{ cursor }}
                    >
                      <span className={styles.playerName}>{awayTeam.name || ''}</span>
                    </div>

                    <div
                      className={`${styles.teamBox} ${styles.secondParticipant}
                        ${!awayTeam?.team ? styles.emptyTeamBox : ''}
                        ${currentWinner === 'away' ? styles.winnerTeamBox : ''}
                        ${currentWinner && currentWinner !== 'away' ? styles.loserTeamBox : ''}`}
                      data-participant-position="second"
                      onClick={() => handleClick('away')}
                      style={{ cursor }}
                    >
                      <span className={styles.teamName}>{awayTeam.team || ''}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        },
      };
    });
  }, [gamesByRound, bracketKey, bracketsOutcomes, dispatch, totalRounds, isLocked, matchNumberMap]);

  // ── Table Data with Row Spans ───────────────────────────────────────────────
  const data = useMemo(() => {
    if (!gamesByRound?.length) return [];

    const maxMatches = Math.pow(2, totalRounds - 1) || 1;
    let rows = Array(maxMatches).fill().map(() => ({}));
    const occupied = Array(totalRounds).fill().map(() => []);

    const findRow = (roundIdx, start, span) => {
      let r = Math.max(0, start);
      while (r < rows.length) {
        if (!occupied[roundIdx].some((i) => i >= r && i < r + span)) return r;
        r++;
      }
      return Math.max(0, Math.min(rows.length - 1, r));
    };

    const getPlacementIndexFromPrevRound = (prevRoundGames, sourceLike) => {
      if (!sourceLike) return 0;

      if (typeof sourceLike.id !== 'undefined' && sourceLike.id !== null) {
        const idx = prevRoundGames.findIndex((g) => g?.id === sourceLike.id);
        if (idx >= 0) return idx;
      }

      if (typeof sourceLike.slot === 'number' && Number.isFinite(sourceLike.slot)) {
        return sourceLike.slot;
      }

      return 0;
    };

    gamesByRound.forEach((round, rIdx) => {
      round.forEach((game) => {
        let rowIdx;
        let rowSpan = 1;

        if (rIdx === 0) {
          rowIdx = game.slot ?? 0;
        } else {
          const prev = gamesByRound[rIdx - 1] || [];
          const sources = [game.sides?.home, game.sides?.away].filter(Boolean);

          const sourceRows = sources.map((side) => {
            const sourceLike = side?.sourceGame ? side.sourceGame : side;
            return getPlacementIndexFromPrevRound(prev, sourceLike);
          });

          const avg = sourceRows.length
            ? Math.floor(sourceRows.reduce((a, b) => a + b, 0) / sourceRows.length)
            : 0;

          rowSpan = Math.pow(2, rIdx);
          rowIdx = findRow(rIdx, avg, rowSpan);
        }

        if (rowIdx >= rows.length) {
          const add = rowIdx - rows.length + 1;
          rows = rows.concat(Array(add).fill().map(() => ({})));
        }

        for (let i = rowIdx; i < rowIdx + rowSpan; i++) {
          occupied[rIdx].push(i);
        }

        if (!rows[rowIdx]) rows[rowIdx] = {};
        rows[rowIdx][`round${rIdx + 1}`] = { ...game, rowSpan };
      });
    });

    const numericKeys = Object.keys(rows)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));

    const maxIdx = Math.max(...numericKeys, -1);
    return Array.from({ length: maxIdx + 1 }, (_, i) => rows[i] || {});
  }, [gamesByRound, totalRounds]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // ── Draw connecting lines with D3 ───────────────────────────────────────────
  useLayoutEffect(() => {
    if (!svgRef.current || !tableRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const tableEl = tableRef.current;
    const tableRect = tableEl.getBoundingClientRect();

    const w = tableEl.scrollWidth;
    const h = tableEl.scrollHeight;

    svg
      .attr('width', w)
      .attr('height', h)
      .style('position', 'absolute')
      .style('top', 0)
      .style('left', 0)
      .style('pointer-events', 'none')
      .style('z-index', 0);

    const matchMap = new Map();

    gamesByRound.forEach((round) => {
      round.forEach((game) => {
        const el = tableEl.querySelector(`[data-game-id="${game.id}"]`);
        if (!el) return;

        const r = el.getBoundingClientRect();
        const left = r.left - tableRect.left;
        const right = r.right - tableRect.left;
        const y = r.top - tableRect.top + r.height / 2;

        const pad = 2;

        matchMap.set(game.id, {
          game,
          xLeft: left + pad,
          xRight: right - pad,
          y,
        });
      });
    });

    const radius = 8;
    const minClearance = 14;

    matchMap.forEach((target) => {
      const targetGame = target.game;

      ['home', 'away'].forEach((side) => {
        const srcGame = targetGame.sides?.[side]?.sourceGame;
        if (!srcGame) return;

        const src = matchMap.get(srcGame.id);
        if (!src) return;

        const xStart = src.xRight;
        const xEnd = target.xLeft;
        const yStart = src.y;
        const yEnd = target.y;

        const idealMid = (xStart + xEnd) / 2;
        const midX = Math.min(xEnd - minClearance, Math.max(xStart + minClearance, idealMid));
        const dir = yEnd > yStart ? 1 : -1;

        const path = `
          M ${xStart} ${yStart}
          H ${midX - radius}
          A ${radius} ${radius} 0 0 ${dir === 1 ? 1 : 0} ${midX} ${yStart + dir * radius}
          V ${yEnd - dir * radius}
          A ${radius} ${radius} 0 0 ${dir === 1 ? 0 : 1} ${midX + radius} ${yEnd}
          H ${xEnd}
        `;

        svg.append('path').attr('d', path).attr('fill', 'none').attr('stroke', '#333').attr('stroke-width', 1);
      });
    });
  }, [gamesByRound, bracketsOutcomes]);

  return (
    <div className={`${styles.bracketContainer} ${className}`} style={{ position: 'relative' }}>
      <div className={styles.tableWrapper} style={{ position: 'relative' }}>
        <table ref={tableRef} className={styles.bracketTable}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{h.column.columnDef.header()}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const game = row.original[cell.column.id];
                  return (
                    <td key={cell.id} rowSpan={game?.rowSpan || 1}>
                      {cell.column.columnDef.cell({ row })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <svg ref={svgRef} className={styles.bracketLines} style={{ zIndex: 0 }} />
      </div>
    </div>
  );
};

export default BracketTable;