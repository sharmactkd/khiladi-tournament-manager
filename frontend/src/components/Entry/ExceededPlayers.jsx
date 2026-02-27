// src/components/Entry/ExceededPlayers.jsx
import React, { useMemo } from 'react';
import styles from '../../pages/Entry.module.css';

// Helper: Fast counting using flat key (already in helpers.js, just referencing)
const getPlayerCounts = (data = []) => {
  const counts = {}; // key = "team|||gender|||age|||weight" → count

  data.forEach((row) => {
    const { team, gender, ageCategory, weightCategory } = row || {};

    // Skip invalid/ineligible rows
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
  exceededStatusMap = {}, // ← New required prop from Entry.jsx
  scrollToRow,
}) => {
  const exceededGroups = useMemo(() => {
    if (!tournamentData || !filteredData.length) return [];

    const playerLimit = tournamentData?.playerLimit || 1;
    if (!playerLimit) return [];

    const officialCategories = tournamentData?.ageCategories?.official || [];
    const groups = {};

    // Use pre-computed exceededStatusMap instead of recalculating counts/filters
    filteredData.forEach((row) => {
      const sr = String(row.sr || '');
      if (!exceededStatusMap[sr]) return; // Only process exceeded rows

      const key = `${row.team?.trim() || 'Unknown'}|||${row.gender?.trim() || 'Unknown'}|||${row.ageCategory?.trim() || 'Unknown'}|||${row.weightCategory?.trim() || 'Unknown'}`;

      if (!groups[key]) {
        groups[key] = {
          team: row.team || 'Unknown Team',
          gender: row.gender || 'Unknown',
          ageCategory: row.ageCategory || 'Unknown',
          weightCategory: row.weightCategory || 'Unknown',
          players: [],
          count: 0,
        };
      }

      groups[key].players.push({
        name: row.name?.trim() || 'Unnamed Player',
        sr,
        weight: row.weight || '',
      });

      groups[key].count += 1;
    });

    // Convert to array + sort by team name
    return Object.values(groups)
      .filter(group => group.count > playerLimit && officialCategories.includes(group.ageCategory))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [filteredData, tournamentData, exceededStatusMap]);

  // If no exceeded groups → don't render anything
  if (exceededGroups.length === 0) return null;

  // Responsive chunking (mobile: 1 column, desktop: 3 columns)
  const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  };

  const chunks = chunkArray(exceededGroups, window.innerWidth < 768 ? 1 : 3);

  return (
    <div 
      className={styles.exceededPlayers}
      role="region"
      aria-label="Players exceeding category limit warning"
    >
      <h4 className={styles.warningTitle}>
        {exceededGroups.length} Team{exceededGroups.length !== 1 ? 's' : ''} Exceeding Player Limit 
        ({tournamentData?.playerLimit || '?'} player{exceededGroups.length !== 1 ? 's' : ''} per category)
      </h4>

      <div className={styles.teamsContainer}>
        {chunks.map((groupChunk, groupIndex) => (
          <div key={groupIndex} className={styles.teamRow}>
            {groupChunk.map(
              ({ team, gender, ageCategory, weightCategory, players, count }) => (
                <div
                  key={`${team}-${gender}-${ageCategory}-${weightCategory}`}
                  className={styles.teamColumn}
                >
                  <h5 className={styles.teamHeader}>
                    {team} — {gender} — {ageCategory} — {weightCategory}
                    <span className={`${styles.countBadge} ${count > (tournamentData?.playerLimit || 1) ? styles.overLimit : ''}`}>
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
              )
            )}
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