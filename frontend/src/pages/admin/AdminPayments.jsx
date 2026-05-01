import React, { useEffect, useState } from "react";
import { getAdminPayments } from "../../api";
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

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPayments = async (page = 1, searchValue = activeSearch) => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminPayments({ page, limit: 25, search: searchValue });
      setPayments(res.data || []);
      setPagination(res.pagination || { page, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setActiveSearch(search);
    loadPayments(1, search);
  };

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Payments</h2>
            <p>Payment records collected from tournament team payment data.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className={styles.toolbar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, tournament, user, txn id..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.primaryBtn}>Search</button>
        </form>

        {loading ? (
          <div className={styles.stateBox}>Loading payments...</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>User</th>
                    <th>Tournament</th>
                    <th>Mode</th>
                    <th>Cash</th>
                    <th>Online</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Txn ID</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment._id}>
                      <td>{payment.teamName || "-"}</td>
                      <td>{payment.user?.name || payment.user?.email || "-"}</td>
                      <td>{payment.tournament?.tournamentName || "-"}</td>
                      <td>{payment.mode || "-"}</td>
                      <td>{formatCurrency(payment.cash)}</td>
                      <td>{formatCurrency(payment.online)}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>
                        <span className={payment.status === "paid" ? styles.successBadge : styles.mutedBadge}>
                          {payment.status}
                        </span>
                      </td>
                      <td>{payment.txnId || "-"}</td>
                      <td>{formatDate(payment.createdAt)}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan="10" className={styles.emptyCell}>No payments found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadPayments(pagination.page - 1)}
                className={styles.secondaryBtn}
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadPayments(pagination.page + 1)}
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

export default AdminPayments;