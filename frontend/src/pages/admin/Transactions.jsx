import React, { useEffect, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const formatCurrency = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/admin/billing/transactions");
      setTransactions(res.data?.transactions || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load transactions"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filteredTransactions = transactions.filter((item) => {
    const userText = `${item.userId?.name || ""} ${item.userId?.email || ""} ${
      item.userId?.phone || ""
    }`.toLowerCase();

    const textMatch =
      !search.trim() ||
      userText.includes(search.toLowerCase()) ||
      String(item.paymentId || "").toLowerCase().includes(search.toLowerCase()) ||
      String(item.orderId || "").toLowerCase().includes(search.toLowerCase()) ||
      String(item.planType || "").toLowerCase().includes(search.toLowerCase());

    const statusMatch = status === "all" || item.status === status;

    return textMatch && statusMatch;
  });

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Payment Transactions</h2>
            <p>Track all billing transactions, gateways, plans and payment status.</p>
          </div>

          <button type="button" className={styles.secondaryBtn} onClick={loadTransactions}>
            Refresh
          </button>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, payment id, order id or plan"
          />

          <select
            className={styles.searchInput}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">ALL STATUS</option>
            <option value="created">CREATED</option>
            <option value="paid">PAID</option>
            <option value="failed">FAILED</option>
            <option value="refunded">REFUNDED</option>
            <option value="cancelled">CANCELLED</option>
          </select>
        </div>

        {loading && <div className={styles.stateBox}>Loading transactions...</div>}
        {error && <div className={styles.errorBox}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Gateway</th>
                  <th>Status</th>
                  <th>Coupon</th>
                  <th>Payment ID</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.userId?.name || "-"}</strong>
                      <br />
                      <span>{item.userId?.email || item.userId?.phone || "-"}</span>
                    </td>

                    <td>
                      <span className={styles.badge}>{item.planType || "-"}</span>
                    </td>

                    <td>{formatCurrency(item.amount, item.currency)}</td>

                    <td>{item.paymentGateway || "-"}</td>

                    <td>
                      {item.status === "paid" ? (
                        <span className={styles.successBadge}>Paid</span>
                      ) : item.status === "failed" ? (
                        <span className={styles.errorBadge}>Failed</span>
                      ) : item.status === "created" ? (
                        <span className={styles.warningBadge}>Created</span>
                      ) : (
                        <span className={styles.mutedBadge}>{item.status || "-"}</span>
                      )}
                    </td>

                    <td>{item.couponUsed || "-"}</td>

                    <td>{item.paymentId || item.orderId || "-"}</td>

                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan="8" className={styles.emptyCell}>
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default Transactions;