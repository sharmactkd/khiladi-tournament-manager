import React, { useMemo, useState } from "react";
import { CheckCircle, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { createPaymentOrder, verifyPayment } from "../../api/paymentApi";
import styles from "./PaymentPage.module.css";

const plans = [
  {
    planType: "single",
    title: "Single Tournament",
    price: 1000,
    description: "Unlock all premium tools for this selected tournament.",
    accessText: "1 Tournament Access",
    features: ["Entry + Tie Sheet", "Winner & Team Championship", "Official & Approval Tools"],
  },
  {
    planType: "six_months",
    title: "6 Months Unlimited",
    price: 2000,
    description: "Best choice for organizers handling multiple events.",
    accessText: "Unlimited / 6 Months",
    popular: true,
    features: ["Unlimited tournaments", "All premium tools", "Best value for academies"],
  },
  {
    planType: "one_year",
    title: "1 Year Unlimited",
    price: 3000,
    description: "Full-year professional access for serious organizers.",
    accessText: "Unlimited / 1 Year",
    features: ["Unlimited tournaments", "12 months access", "Maximum savings"],
  },
];

const PaymentPage = ({ tournamentId, onPaymentSuccess }) => {
  const [selectedPlan, setSelectedPlan] = useState("single");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activePlan = useMemo(
    () => plans.find((p) => p.planType === selectedPlan) || plans[0],
    [selectedPlan]
  );

  const startPayment = async () => {
    try {
      setLoading(true);
      setError("");

      const orderRes = await createPaymentOrder({ planType: selectedPlan, tournamentId });
      const order = orderRes?.order || orderRes;

      if (!order?.id && !orderRes?.orderId) {
        throw new Error("Invalid Razorpay order response");
      }

      if (!window.Razorpay) {
        throw new Error("Razorpay script not loaded. Add Razorpay script in index.html.");
      }

      const razorpay = new window.Razorpay({
        key: orderRes?.keyId,
        amount: order?.amount || orderRes?.amount,
        currency: order?.currency || "INR",
        name: "KHILADI Tournament Manager",
        description: activePlan.title,
        order_id: order?.id || orderRes?.orderId,
        handler: async (response) => {
          try {
            const verifyRes = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes?.success) onPaymentSuccess?.();
            else setError("Payment verification failed. Please contact support.");
          } catch (err) {
            console.error("Payment verification failed:", err);
            setError(err?.response?.data?.message || "Payment verification failed.");
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        theme: { color: "#cf0006" },
      });

      razorpay.open();
    } catch (err) {
      console.error("Payment start failed:", err);
      setError(err?.response?.data?.message || err?.message || "Payment failed to start.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.paymentOverlay}>
      <div className={styles.paymentCard}>
        <div className={styles.hero}>
        <div className={styles.logoMark}>
  <img src="/KHILADI.png" alt="Khiladi Logo" />
</div>

          <span className={styles.badge}>
            <Sparkles size={14} />
            Premium Access Required
          </span>

          <h1>Unlock Full access to <br /> khiladi Tournament Management</h1>

          <p>
            Manage entries, tie sheets, winners, officials, approvals and team
            championship with KHILADI’s professional premium tools.
          </p>

          <div className={styles.trustRow}>
            <span><ShieldCheck size={16} /> Secure Razorpay Payment</span>
            <span><CheckCircle size={16} /> Instant Access Activation</span>
          </div>
        </div>

        <div className={styles.plansGrid}>
          {plans.map((plan) => {
            const active = selectedPlan === plan.planType;

            return (
              <button
                key={plan.planType}
                type="button"
                className={`${styles.planCard} ${active ? styles.activePlan : ""}`}
                onClick={() => setSelectedPlan(plan.planType)}
              >
                {plan.popular && <span className={styles.popular}>Best Value</span>}

                <div className={styles.planTop}>
                  <h2>{plan.title}</h2>
                  {active && <CheckCircle className={styles.checkIcon} size={22} />}
                </div>

                <div className={styles.price}>
                  <span>₹</span>{plan.price}
                </div>

                <p>{plan.description}</p>

                <div className={styles.accessPill}>{plan.accessText}</div>

                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.checkoutBar}>
          <div>
            <span>Selected Plan</span>
            <strong>{activePlan.title} — ₹{activePlan.price}</strong>
          </div>

          <button
            type="button"
            className={styles.payButton}
            onClick={startPayment}
            disabled={loading}
          >
            {loading ? "Processing..." : "Continue to Payment"}
          </button>
        </div>

        <p className={styles.note}>
          Your access activates instantly after successful backend verification.
        </p>
      </div>
    </div>
  );
};

export default PaymentPage;