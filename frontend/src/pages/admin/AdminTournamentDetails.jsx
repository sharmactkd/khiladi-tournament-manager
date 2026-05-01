import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getAdminTournamentDetails } from "../../api";
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

const pickEntryValue = (entry, keys) => {
  for (const key of keys) {
    if (entry?.[key] !== undefined && entry?.[key] !== null && String(entry[key]).trim() !== "") {
      return entry[key];
    }
  }
  return "-";
};

const AdminTournamentDetails = () => {
  const { tournamentId } = useParams();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const entries = useMemo(() => details?.entries || [], [details]);

  useEffect(() => {
    let mounted = true;

    const loadDetails = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getAdminTournamentDetails(tournamentId);
        if (mounted) setDetails(res.data || null);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load tournament details");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDetails();

    return () => {
      mounted = false;
    };
  }, [tournamentId]);

  if (loading) return <div className={styles.stateBox}>Loading tournament details...</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;
  if (!details) return <div className={styles.stateBox}>Tournament not found.</div>;

  const tournament = details.tournament;

  return (
    <div className={styles.pageStack}>
      <section className={styles.profilePanel}>
        <div>
          <span className={styles.kicker}>Tournament</span>
          <h2>{tournament?.tournamentName || "-"}</h2>
          <p>{tournament?.venue?.name || "-"} • {tournament?.venue?.district || ""}</p>
        </div>
        <span className={styles.roleBadge}>{tournament?.tournamentLevel || "Tournament"}</span>
      </section>

      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span>Entries</span>
          <strong>{details.summary?.entriesCount || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Payment Rows</span>
          <strong>{details.summary?.totalPaymentRows || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Collected</span>
          <strong>{formatCurrency(details.summary?.totalAmountPaid)}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Created</span>
          <strong>{formatDate(tournament?.createdAt)}</strong>
        </article>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Owner Details</h2>
        </div>
        <div className={styles.detailGrid}>
          <div><span>Name</span><strong>{details.owner?.name || "-"}</strong></div>
          <div><span>Email</span><strong>{details.owner?.email || "-"}</strong></div>
          <div><span>Phone</span><strong>{details.owner?.phone || "-"}</strong></div>
          <div><span>Role</span><strong>{details.owner?.role || "-"}</strong></div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Entries</h2>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 200).map((entry, index) => (
                <tr key={`${tournamentId}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{pickEntryValue(entry, ["name", "Name", "playerName", "Player Name"])}</td>
                  <td>{pickEntryValue(entry, ["team", "Team", "teamName", "Team Name"])}</td>
                  <td>{pickEntryValue(entry, ["gender", "Gender"])}</td>
                  <td>{pickEntryValue(entry, ["ageCategory", "Age Category", "ageGroup", "Age Group"])}</td>
                  <td>{pickEntryValue(entry, ["weight", "Weight", "wt", "WT"])}</td>
                  <td>{pickEntryValue(entry, ["medal", "Medal"])}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan="7" className={styles.emptyCell}>No entries found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {entries.length > 200 && (
          <p className={styles.note}>Showing first 200 entries only for performance.</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Payments</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Team</th>
                <th>Members</th>
                <th>Mode</th>
                <th>Cash</th>
                <th>Online</th>
                <th>Total</th>
                <th>Txn ID</th>
              </tr>
            </thead>
            <tbody>
              {(details.payments || []).map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.teamName || "-"}</td>
                  <td>{payment.foodMembers || 0}</td>
                  <td>{payment.mode || "-"}</td>
                  <td>{formatCurrency(payment.cash)}</td>
                  <td>{formatCurrency(payment.online)}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.txnId || "-"}</td>
                </tr>
              ))}
              {(!details.payments || details.payments.length === 0) && (
                <tr>
                  <td colSpan="7" className={styles.emptyCell}>No payment records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminTournamentDetails;