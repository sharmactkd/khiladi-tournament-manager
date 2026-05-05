import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAdminTournament, getAdminTournaments } from "../../api";
import { useAuth } from "../../context/AuthContext";
import styles from "./Admin.module.css";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN");
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const AdminTournaments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tournaments, setTournaments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");

  const isSuperadmin = user?.role === "superadmin";

  const loadTournaments = async (page = 1, searchValue = activeSearch) => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminTournaments({ page, limit: 20, search: searchValue });
      setTournaments(res.data || []);
      setPagination(res.pagination || { page, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTournaments(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setActiveSearch(search);
    loadTournaments(1, search);
  };

  const openTournament = (tournament) => {
    if (tournament?._id) navigate(`/tournaments/${tournament._id}`);
  };

  const stopRowNavigation = (event) => {
    event.stopPropagation();
  };

  const handleDeleteTournament = async (event, tournament) => {
    stopRowNavigation(event);

    if (!isSuperadmin || !tournament?._id) return;

    if (
      !window.confirm(
        `Delete tournament "${tournament.tournamentName || "this tournament"}"? It will be hidden from normal users.`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(tournament._id);
      await deleteAdminTournament(tournament._id);
      await loadTournaments(pagination.page, activeSearch);
    } catch (err) {
      alert(err.message || "Failed to delete tournament");
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Tournaments</h2>
            <p>All tournaments created by users.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className={styles.toolbar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tournament, organizer, venue..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.primaryBtn}>
            Search
          </button>
        </form>

        {loading ? (
          <div className={styles.stateBox}>Loading tournaments...</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Owner</th>
                    <th>Organizer</th>
                    <th>Entries</th>
                    <th>Payment</th>
                    <th>Collected</th>
                    <th>Created</th>
                    {isSuperadmin && <th>Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map((tournament) => (
                    <tr
                      key={tournament._id}
                      className={styles.clickableRow}
                      onClick={() => openTournament(tournament)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openTournament(tournament);
                        }
                      }}
                    >
                      <td>{tournament.tournamentName || "-"}</td>
                      <td>
                        {tournament.createdBy?.name ||
                          tournament.createdBy?.email ||
                          "-"}
                      </td>
                      <td>{tournament.organizer || "-"}</td>
                      <td>{tournament.entriesCount || 0}</td>
                      <td>
                        <span
                          className={
                            tournament.isPaidTournament
                              ? styles.successBadge
                              : styles.mutedBadge
                          }
                        >
                          {tournament.isPaidTournament ? "Paid Setup" : "Free Setup"}
                        </span>
                      </td>
                      <td>{formatCurrency(tournament.totalCollected)}</td>
                      <td>{formatDate(tournament.createdAt)}</td>

                      {isSuperadmin && (
                        <td onClick={stopRowNavigation}>
                          <div
                            className={styles.actionGroup}
                            onClick={stopRowNavigation}
                            onKeyDown={stopRowNavigation}
                          >
                            {!tournament.isDeleted && (
                              <button
                                type="button"
                                className={styles.dangerBtn}
                                disabled={actionLoadingId === tournament._id}
                                onClick={(event) =>
                                  handleDeleteTournament(event, tournament)
                                }
                              >
                                {actionLoadingId === tournament._id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}

                  {tournaments.length === 0 && (
                    <tr>
                      <td
                        colSpan={isSuperadmin ? 8 : 7}
                        className={styles.emptyCell}
                      >
                        No tournaments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadTournaments(pagination.page - 1)}
                className={styles.secondaryBtn}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadTournaments(pagination.page + 1)}
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

export default AdminTournaments;