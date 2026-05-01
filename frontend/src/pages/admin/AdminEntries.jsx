import React, { useEffect, useState } from "react";
import { getAdminEntries } from "../../api";
import styles from "./Admin.module.css";

const pickEntryValue = (entry, keys) => {
  for (const key of keys) {
    if (entry?.[key] !== undefined && entry?.[key] !== null && String(entry[key]).trim() !== "") {
      return entry[key];
    }
  }
  return "-";
};

const AdminEntries = () => {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEntries = async (page = 1, searchValue = activeSearch) => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminEntries({ page, limit: 25, search: searchValue });
      setEntries(res.data || []);
      setPagination(res.pagination || { page, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load entries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setActiveSearch(search);
    loadEntries(1, search);
  };

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Entries</h2>
            <p>Global entries viewer across all tournaments.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className={styles.toolbar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player, team, tournament, medal..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.primaryBtn}>Search</button>
        </form>

        {loading ? (
          <div className={styles.stateBox}>Loading entries...</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Gender</th>
                    <th>Age Category</th>
                    <th>Weight</th>
                    <th>Medal</th>
                    <th>Tournament</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr key={entry._id || `${entry.tournamentId}-${index}`}>
                      <td>{entry._rowIndex || index + 1}</td>
                      <td>{pickEntryValue(entry, ["name", "Name", "playerName", "Player Name"])}</td>
                      <td>{pickEntryValue(entry, ["team", "Team", "teamName", "Team Name"])}</td>
                      <td>{pickEntryValue(entry, ["gender", "Gender"])}</td>
                      <td>{pickEntryValue(entry, ["ageCategory", "Age Category", "ageGroup", "Age Group"])}</td>
                      <td>{pickEntryValue(entry, ["weight", "Weight", "wt", "WT"])}</td>
                      <td>{pickEntryValue(entry, ["medal", "Medal"])}</td>
                      <td>{entry.tournamentName || "-"}</td>
                      <td>{entry.owner?.name || entry.owner?.email || "-"}</td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan="9" className={styles.emptyCell}>No entries found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadEntries(pagination.page - 1)}
                className={styles.secondaryBtn}
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadEntries(pagination.page + 1)}
                className={styles.secondaryBtn}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default AdminEntries;