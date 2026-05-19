import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyPlan } from "../api/paymentApi";
import styles from "./MyPlan.module.css";

const formatCurrency = (amount, currency = "INR") => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const humanize = (value) => {
  if (!value) return "—";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const DetailRow = ({ label, value }) => (
  <div className={styles.detailRow}>
    <span>{label}</span>
    <strong>{value || "—"}</strong>
  </div>
);

const MyPlan = () => {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let alive = true;

    const loadPlan = async () => {
      try {
        const data = await getMyPlan();

        if (!alive) return;

        setState({
          loading: false,
          error: "",
          data,
        });
      } catch (error) {
        if (!alive) return;

        setState({
          loading: false,
          error:
            error?.response?.data?.message ||
            error?.message ||
            "Failed to load subscription details",
          data: null,
        });
      }
    };

    loadPlan();

    return () => {
      alive = false;
    };
  }, []);

  const plan = state.data?.plan || null;
  const entitlement = state.data?.entitlement || null;

  const accessEndLabel = useMemo(() => {
    if (!plan) return "—";

    if (plan.planType === "single" && plan.isLifetime) {
      return "Lifetime for this tournament";
    }

    if (plan.isLifetime && !plan.accessExpiresAt) {
      return "Lifetime";
    }

    return formatDate(plan.accessExpiresAt);
  }, [plan]);

  if (state.loading) {
    return (
      <section className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p>Loading your subscription details...</p>
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyCard}>
          <h1>My Plan / Subscription</h1>
          <p>{state.error}</p>
          <Link to="/" className={styles.primaryLink}>
            Go to Dashboard
          </Link>
        </div>
      </section>
    );
  }

  if (!state.data?.hasPlan || !plan) {
    return (
      <section className={styles.page}>
        <div className={styles.emptyCard}>
          <span className={styles.badge}>No Active Plan</span>
          <h1>My Plan / Subscription</h1>
          <p>
            You do not have an active premium subscription yet. Buy premium
            access from a tournament page whenever you need paid features.
          </p>
          <Link to="/tournaments" className={styles.primaryLink}>
            View Tournaments
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.badge}>KHILADI Premium</span>
          <h1>My Plan / Subscription</h1>
          <p>
            View your current premium access, payment details, coupon benefits,
            and entitlement status.
          </p>
        </div>

        <div className={styles.statusPill}>
          {humanize(plan.status || entitlement?.status)}
        </div>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Current Plan</h2>

          <div className={styles.planTitle}>
            {plan.label || humanize(plan.planType)}
          </div>

          <div className={styles.planMeta}>
            <span>{humanize(plan.accessType)}</span>
            <span>{humanize(plan.accessLifecycle)}</span>
          </div>

          <div className={styles.details}>
            <DetailRow label="Status" value={humanize(plan.status)} />
            <DetailRow label="Access Type" value={humanize(plan.accessType)} />
            <DetailRow
              label="Tournament Access"
              value={
                plan.tournamentName ||
                (plan.tournamentId ? String(plan.tournamentId) : "Unlimited")
              }
            />
            <DetailRow label="Access Starts" value={formatDate(plan.accessStartsAt)} />
            <DetailRow label="Access Ends" value={accessEndLabel} />
            <DetailRow label="Source" value={humanize(plan.source)} />
          </div>
        </article>

        <article className={styles.card}>
          <h2>Payment Details</h2>

          <div className={styles.amount}>
            {formatCurrency(plan.finalAmount, plan.currency)}
          </div>

          <div className={styles.details}>
            <DetailRow
              label="Paid Amount"
              value={formatCurrency(plan.finalAmount, plan.currency)}
            />
            <DetailRow
              label="Original Amount"
              value={formatCurrency(plan.originalAmount, plan.currency)}
            />
            <DetailRow
              label="Discount"
              value={formatCurrency(plan.discountAmount, plan.currency)}
            />
            <DetailRow label="Coupon Used" value={plan.couponUsed || "—"} />
            <DetailRow label="Payment Date" value={formatDate(plan.paidAt)} />
            <DetailRow
              label="Razorpay Payment ID"
              value={plan.razorpayPaymentId || "—"}
            />
          </div>
        </article>

        <article className={styles.card}>
          <h2>Entitlement</h2>

          <div className={styles.details}>
            <DetailRow label="Entitlement ID" value={entitlement?.id || "—"} />
            <DetailRow label="Scope" value={humanize(entitlement?.scope)} />
            <DetailRow label="Status" value={humanize(entitlement?.status)} />
            <DetailRow label="Source" value={humanize(entitlement?.source)} />
            <DetailRow label="Starts At" value={formatDate(entitlement?.startsAt)} />
            <DetailRow label="Expires At" value={formatDate(entitlement?.expiresAt)} />
            <DetailRow label="Revoked At" value={formatDate(entitlement?.revokedAt)} />
            <DetailRow
              label="Revoke Reason"
              value={entitlement?.revokeReason || "—"}
            />
          </div>
        </article>
      </div>
    </section>
  );
};

export default MyPlan;