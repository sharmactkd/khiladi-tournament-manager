// src/components/Entry/ExceededPlayers.jsx
import React, { useMemo } from 'react';
import styles from '../../pages/Entry.module.css';

// Helper: Fast counting using flat key
const getPlayerCounts = (data = []) => {
  const counts = {}; // key = "team|||gender|||age|||weight" → count

  data.forEach((row) => {
    const { team, gender, ageCategory, weightCategory } = row || {};

    if (
      !team ||
      !gender ||
      !ageCategory ||
      !weightCategory ||
      weightCategory === 'Not Eligible'
    ) {
      return;
    }

    const key = `${team.trim()}|||${gender.trim()}|||${ageCategory.trim()}|||${weightCategory.trim()}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  return counts;
};

const ExceededPlayers = ({
  filteredData = [],
  tournamentData,
  scrollToRow,
}) => {
  const exceededGroups = useMemo(() => {
    if (!tournamentData || !filteredData.length) return [];

    const playerLimit = tournamentData?.playerLimit;
    if (!playerLimit) return [];

    const officialCategories = tournamentData?.ageCategories?.official || [];
    const counts = getPlayerCounts(filteredData);
    const groups = {};

    filteredData.forEach((row) => {
      const team = row.team?.trim();
      const gender = row.gender?.trim();
      const ageCategory = row.ageCategory?.trim();
      const weightCategory = row.weightCategory?.trim();
      const sr = String(row.sr || '');

      if (
        !team ||
        !gender ||
        !ageCategory ||
        !weightCategory ||
        weightCategory === 'Not Eligible'
      ) {
        return;
      }

      if (!officialCategories.includes(ageCategory)) return;

      const key = `${team}|||${gender}|||${ageCategory}|||${weightCategory}`;
      const count = counts[key] || 0;

      if (count <= playerLimit) return;

      if (!groups[key]) {
        groups[key] = {
          team,
          gender,
          ageCategory,
          weightCategory,
          players: [],
          count,
        };
      }

      groups[key].players.push({
        name: row.name?.trim() || 'Unnamed Player',
        sr,
        weight: row.weight || '',
      });
    });

    return Object.values(groups).sort((a, b) => a.team.localeCompare(b.team));
  }, [filteredData, tournamentData]);

  if (exceededGroups.length === 0) return null;

  const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  };

  const columnSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 3;
  const chunks = chunkArray(exceededGroups, columnSize);

  return (
    <div
      className={styles.exceededPlayers}
      role="region"
      aria-label="Players exceeding category limit warning"
    >
      <h4 className={styles.warningTitle}>
        {exceededGroups.length} Team{exceededGroups.length !== 1 ? 's' : ''} Exceeding Player Limit
        {' '}({tournamentData?.playerLimit || '?'} player{(tournamentData?.playerLimit || 0) !== 1 ? 's' : ''} per category)
      </h4>

      <div className={styles.teamsContainer}>
        {chunks.map((groupChunk, groupIndex) => (
          <div key={groupIndex} className={styles.teamRow}>
            {groupChunk.map(({ team, gender, ageCategory, weightCategory, players, count }) => (
              <div
                key={`${team}-${gender}-${ageCategory}-${weightCategory}`}
                className={styles.teamColumn}
              >
                <h5 className={styles.teamHeader}>
                  {team} — {gender} — {ageCategory} — {weightCategory}
                  <span
                    className={`${styles.countBadge} ${count > (tournamentData?.playerLimit || 1) ? styles.overLimit : ''}`}
                  >
                    {count} Players
                  </span>
                </h5>

                <ul className={styles.playerList}>
                  {players.map((player) => (
                    <li
                      key={player.sr || player.name}
                      className={styles.playerItem}
                    >
                      <span
                        onClick={() => player.sr && scrollToRow?.(player.sr)}
                        className={`${styles.playerName} ${!player.name.trim() ? styles.unnamed : ''}`}
                        role="button"
                        tabIndex={0}
                        data-player-sr={player.sr}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            player.sr && scrollToRow?.(player.sr);
                          }
                        }}
                        aria-label={`Jump to entry for ${player.name || 'Unnamed'} (Sr. ${player.sr || 'N/A'})`}
                        title="Click to scroll to this player's row"
                      >
                        {player.name.trim() || 'Unnamed Player'}
                      </span>

                      {player.weight && (
                        <span className={styles.playerWeight}>
                          {player.weight} KG
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className={styles.exceededNote}>
        Note: These teams have exceeded the allowed player limit in the above categories.
        Please review and adjust entries accordingly.
      </p>
    </div>
  );
};

export default ExceededPlayers;