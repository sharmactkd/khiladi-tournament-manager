import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBillingDashboard } from "./billingApi";
import styles from "./Admin.module.css";

const formatCurrency = (value, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const yesNo = (value) => (value ? "ON" : "OFF");

const BillingDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getBillingDashboard();
      setDashboard(res.dashboard || {});
    } catch (err) {
      setError(err.message || "Failed to load billing dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) return <div className={styles.stateBox}>Loading billing dashboard...</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;

  const revenue = dashboard?.revenueSummary || {};
  const controls = dashboard?.globalControls || {};
  const plans = dashboard?.activePlans || {};

  const cards = [
    { label: "Total Users", value: dashboard?.totalUsers || 0 },
    { label: "Active Premium", value: dashboard?.activePremiumUsers || 0 },
    { label: "Expired Users", value: dashboard?.expiredUsers || 0 },
    { label: "Trial Users", value: dashboard?.trialUsers || 0 },
    { label: "Lifetime Users", value: dashboard?.lifetimeUsers || 0 },
    { label: "Blocked Users", value: dashboard?.blockedUsers || 0 },
    { label: "Coupons Used", value: dashboard?.couponsUsed || 0 },
    {
      label: "Total Revenue",
      value: formatCurrency(revenue.totalRevenue, revenue.currency || "INR"),
    },
    {
      label: "Monthly Revenue",
      value: formatCurrency(revenue.monthlyRevenue, revenue.currency || "INR"),
    },
  ];

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Billing Dashboard</h2>
            <p>Central SaaS billing, premium access and platform control overview.</p>
          </div>
          <Link to="/admin/billing/settings" className={styles.primaryBtn}>
            Billing Settings
          </Link>
        </div>

        <div className={styles.statsGrid}>
          {cards.map((card) => (
            <div key={card.label} className={styles.statCard}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Global Access Controls</h2>
              <p>Current platform-level billing switches.</p>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <div>
              <span>Payments</span>
              <strong>{yesNo(controls.paymentsEnabled)}</strong>
            </div>
            <div>
              <span>Free Access</span>
              <strong>{yesNo(controls.maintenanceFreeAccess)}</strong>
            </div>
            <div>
              <span>Coupons</span>
              <strong>{yesNo(controls.couponSystemEnabled)}</strong>
            </div>
            <div>
              <span>Registration</span>
              <strong>{yesNo(controls.registrationEnabled)}</strong>
            </div>
            <div>
              <span>Trial</span>
              <strong>{yesNo(controls.trialEnabled)}</strong>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Active Plans</h2>
              <p>Prices are loaded dynamically from backend settings.</p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(plans).map(([name, plan]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <span className={plan?.enabled ? styles.successBadge : styles.errorBadge}>
                        {plan?.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td>{formatCurrency(plan?.price, plan?.currency || revenue.currency || "INR")}</td>
                    <td>{plan?.durationDays ? `${plan.durationDays} days` : "Lifetime"}</td>
                  </tr>
                ))}

                {Object.keys(plans).length === 0 && (
                  <tr>
                    <td colSpan="4" className={styles.emptyCell}>
                      No plans configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Billing Shortcuts</h2>
            <p>Quick access to important billing modules.</p>
          </div>
        </div>

        <div className={styles.actionGroup}>
          <Link to="/admin/billing/users" className={styles.primaryBtn}>
            User Access Manager
          </Link>
          <Link to="/admin/billing/coupons" className={styles.secondaryBtn}>
            Coupon Manager
          </Link>
          <Link to="/admin/billing/transactions" className={styles.secondaryBtn}>
            Transactions
          </Link>
          <Link to="/admin/billing/audit-logs" className={styles.secondaryBtn}>
            Audit Logs
          </Link>
        </div>
      </section>
    </div>
  );
};

export default BillingDashboard;