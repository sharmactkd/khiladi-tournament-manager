import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminDashboard } from "../../api";
import styles from "./Admin.module.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const AdminDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getAdminDashboard();
        if (mounted) setDashboard(res.data || {});
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className={styles.stateBox}>Loading admin dashboard...</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;

  const cards = [
    { label: "Total Users", value: dashboard?.totalUsers || 0 },
    { label: "Total Tournaments", value: dashboard?.totalTournaments || 0 },
    { label: "Total Entries", value: dashboard?.totalEntries || 0 },
    { label: "Paid Users", value: dashboard?.totalPaidUsers || 0 },
    { label: "Total Revenue", value: formatCurrency(dashboard?.totalRevenue || 0) },
  ];

  return (
    <div className={styles.pageStack}>
      <div className={styles.statsGrid}>
        {cards.map((card) => (
          <article key={card.label} className={styles.statCard}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Recent Users</h2>
            <Link to="/admin/users">View all</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email / Phone</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recentUsers || []).map((user) => (
                  <tr key={user._id}>
                    <td>{user.name || "-"}</td>
                    <td>{user.email || user.phone || "-"}</td>
                    <td><span className={styles.badge}>{user.role}</span></td>
                    <td>{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Recent Tournaments</h2>
            <Link to="/admin/tournaments">View all</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Owner</th>
                  <th>Entries</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.recentTournaments || []).map((tournament) => (
                  <tr key={tournament._id}>
                    <td>{tournament.tournamentName || "-"}</td>
                    <td>{tournament.createdBy?.name || tournament.createdBy?.email || "-"}</td>
                    <td>{tournament.entriesCount || 0}</td>
                    <td>{formatDate(tournament.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Recent Payments</h2>
          <Link to="/admin/payments">View all</Link>
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
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.recentPayments || []).map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.teamName || "-"}</td>
                  <td>{payment.tournament?.tournamentName || "-"}</td>
                  <td>{payment.mode || "-"}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.txnId || "-"}</td>
                  <td>{formatDate(payment.createdAt)}</td>
                </tr>
              ))}
              {(!dashboard?.recentPayments || dashboard.recentPayments.length === 0) && (
                <tr>
                  <td colSpan="6" className={styles.emptyCell}>No payment records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;