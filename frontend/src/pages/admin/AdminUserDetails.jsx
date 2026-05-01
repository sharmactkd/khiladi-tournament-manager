import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAdminUserDetails } from "../../api";
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

const AdminUserDetails = () => {
  const { userId } = useParams();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDetails = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getAdminUserDetails(userId);
        if (mounted) setDetails(res.data || null);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load user details");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDetails();

    return () => {
      mounted = false;
    };
  }, [userId]);

  if (loading) return <div className={styles.stateBox}>Loading user details...</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;
  if (!details) return <div className={styles.stateBox}>User not found.</div>;

  return (
    <div className={styles.pageStack}>
      <section className={styles.profilePanel}>
        <div>
          <span className={styles.kicker}>User Profile</span>
          <h2>{details.user?.name || "-"}</h2>
          <p>{details.user?.email || details.user?.phone || "-"}</p>
        </div>
        <span className={styles.roleBadge}>{details.user?.role}</span>
      </section>

      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span>Tournaments</span>
          <strong>{details.summary?.totalTournaments || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Entries</span>
          <strong>{details.summary?.totalEntries || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Payments</span>
          <strong>{details.summary?.totalPayments || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Total Paid</span>
          <strong>{formatCurrency(details.summary?.totalAmountPaid)}</strong>
        </article>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Tournaments Created</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Organizer</th>
                <th>Entries</th>
                <th>Collected</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(details.tournaments || []).map((tournament) => (
                <tr key={tournament._id}>
                  <td>{tournament.tournamentName || "-"}</td>
                  <td>{tournament.organizer || "-"}</td>
                  <td>{tournament.entriesCount || 0}</td>
                  <td>{formatCurrency(tournament.totalCollected)}</td>
                  <td>{formatDate(tournament.createdAt)}</td>
                  <td>
                    <Link to={`/admin/tournaments/${tournament._id}`} className={styles.tableLink}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {(!details.tournaments || details.tournaments.length === 0) && (
                <tr>
                  <td colSpan="6" className={styles.emptyCell}>No tournaments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                <th>Tournament</th>
                <th>Mode</th>
                <th>Amount</th>
                <th>Txn ID</th>
              </tr>
            </thead>
            <tbody>
              {(details.payments || []).map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.teamName || "-"}</td>
                  <td>{payment.tournament?.tournamentName || "-"}</td>
                  <td>{payment.mode || "-"}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.txnId || "-"}</td>
                </tr>
              ))}
              {(!details.payments || details.payments.length === 0) && (
                <tr>
                  <td colSpan="5" className={styles.emptyCell}>No payment records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminUserDetails;