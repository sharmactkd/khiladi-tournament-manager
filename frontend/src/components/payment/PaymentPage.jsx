// frontend/src/components/payment/PaymentPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  X,
} from "lucide-react";
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  getAvailableCoupons,
  validateCoupon,
  applyCoupon,
  reconcilePaymentOrder,
} from "../../api/paymentApi";
import styles from "./PaymentPage.module.css";

const plans = [
  {
    planType: "single",
    title: "Single Tournament",
    price: 1000,
    description: "Unlock all premium tools for this selected tournament.",
    accessText: "1 Tournament Access",
    features: [
      "Entry + Tie Sheet",
      "Winner & Team Championship",
      "Official & Approval Tools",
    ],
  },
  {
    planType: "six_months",
    title: "6 Months Unlimited",
    price: 2000,
    description: "Best choice for organizers handling multiple events.",
    accessText: "Unlimited / 6 Months",
    popular: true,
    features: [
      "Unlimited tournaments",
      "All premium tools",
      "Best value for academies",
    ],
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

const currency = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const waitForPaymentFinalStatus = async ({
  orderId,
  paymentId,
  tournamentId,
  feature,
  maxAttempts = 8,
}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await getPaymentStatus({
      orderId,
      paymentId,
      tournamentId,
      feature,
    });

    if (status?.final) return status;

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(
    "Payment received, but premium access is still syncing. Please refresh after a few seconds."
  );
};

const getCouponLabel = (coupon) => {
  if (!coupon) return "";

  if (coupon.type === "percentage") return `${coupon.value}% OFF`;
  if (coupon.type === "fixed") return `${currency(coupon.value)} OFF`;
  if (coupon.type === "full_access") return "FREE ACCESS";

  return "COUPON";
};

const PaymentPage = ({ tournamentId, onPaymentSuccess }) => {
  const [selectedPlan, setSelectedPlan] = useState("single");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponSystemReason, setCouponSystemReason] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [priceBreakup, setPriceBreakup] = useState(null);

  const activePlan = useMemo(
    () => plans.find((p) => p.planType === selectedPlan) || plans[0],
    [selectedPlan]
  );

  const displayBreakup = useMemo(() => {
    if (priceBreakup) return priceBreakup;

    return {
      originalAmount: activePlan.price,
      discountAmount: 0,
      finalAmount: activePlan.price,
    };
  }, [activePlan.price, priceBreakup]);

  useEffect(() => {
    let cancelled = false;

    const loadCoupons = async () => {
      try {
        setCouponSystemReason("");

        const res = await getAvailableCoupons({ planType: selectedPlan });

        if (cancelled) return;

        setAvailableCoupons(Array.isArray(res?.coupons) ? res.coupons : []);
        setCouponSystemReason(res?.reason || "");

        if (res?.reason === "coupon-system-disabled") {
          setCouponMessage(res?.message || "Coupon system is currently disabled.");
        }
      } catch {
        if (!cancelled) {
          setAvailableCoupons([]);
          setCouponSystemReason("");
        }
      }
    };

    loadCoupons();

    return () => {
      cancelled = true;
    };
  }, [selectedPlan]);

  useEffect(() => {
    setAppliedCoupon(null);
    setPriceBreakup(null);
    setCouponCode("");
    setCouponMessage("");
    setError("");
  }, [selectedPlan]);

  const handleApplyCoupon = async (codeFromButton = "") => {
    const code = String(codeFromButton || couponCode || "")
      .trim()
      .toUpperCase();

    if (!code) {
      setCouponMessage("Please enter a coupon code.");
      return;
    }

    try {
      setCouponLoading(true);
      setCouponMessage("");
      setError("");

      const validateRes = await validateCoupon({
        code,
        planType: selectedPlan,
      });

      if (!validateRes?.valid) {
        setAppliedCoupon(null);
        setPriceBreakup(null);
        setCouponMessage(validateRes?.message || "Invalid coupon.");
        return;
      }

      setAppliedCoupon(validateRes.couponSnapshot || validateRes.coupon);
      setCouponCode(code);
      setPriceBreakup({
        originalAmount: Number(validateRes.originalAmount || activePlan.price),
        discountAmount: Number(validateRes.discountAmount || 0),
        finalAmount: Number(validateRes.finalAmount ?? activePlan.price),
      });
      setCouponMessage(validateRes.message || "Coupon applied successfully.");
    } catch (err) {
      setAppliedCoupon(null);
      setPriceBreakup(null);
      setCouponMessage(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to apply coupon."
      );
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setPriceBreakup(null);
    setCouponCode("");
    setCouponMessage("");
  };

  const startPayment = async () => {
    try {
      setLoading(true);
      setError("");

      const orderRes = await createPaymentOrder({
        planType: selectedPlan,
        tournamentId,
        couponCode: appliedCoupon?.code || "",
      });

      if (orderRes?.alreadyPaid || orderRes?.hasAccess) {
        onPaymentSuccess?.();
        return;
      }

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
    setLoading(true);
    setError("");

    let verifyRes = null;

    try {
      verifyRes = await verifyPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
    } catch (verifyError) {
      console.error("Initial payment verification failed:", verifyError);
    }

    if (verifyRes?.success) {
      onPaymentSuccess?.();
      return;
    }

    let reconcileRes = null;

    try {
      reconcileRes = await reconcilePaymentOrder({
        orderId: response.razorpay_order_id,
      });
    } catch (reconcileError) {
      console.error("Payment reconcile failed:", reconcileError);
    }

    if (reconcileRes?.success) {
      onPaymentSuccess?.();
      return;
    }

    const statusRes = await waitForPaymentFinalStatus({
      orderId: response.razorpay_order_id,
      paymentId: response.razorpay_payment_id,
      tournamentId,
      feature:
        selectedPlan === "single" ? "tiesheet" : "premium_unlimited",
      maxAttempts: 12,
    });

    if (statusRes?.final || statusRes?.access?.hasAccess) {
      onPaymentSuccess?.();
      return;
    }

    setError(
      "Payment successful, but access is still syncing. Please refresh after a few seconds."
    );
  } catch (err) {
    console.error("Payment verification/status fallback failed:", err);

    setError(
      err?.response?.data?.message ||
        err?.message ||
        "Payment successful, but verification timed out. Please refresh after a few seconds."
    );
  } finally {
    setLoading(false);
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
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Payment failed to start."
      );
      setLoading(false);
    }
  };

  const activateFreeAccess = async () => {
    try {
      setLoading(true);
      setError("");

      const applyRes = await applyCoupon({
        code: appliedCoupon.code,
        planType: selectedPlan,
        tournamentId,
      });

      if (!applyRes?.success) {
        setError(applyRes?.message || "Coupon could not be applied.");
        return;
      }

      onPaymentSuccess?.();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to activate coupon access."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (appliedCoupon && Number(displayBreakup.finalAmount || 0) === 0) {
      await activateFreeAccess();
      return;
    }

    await startPayment();
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

          <h1>
            Unlock Full Access to <br /> KHILADI Tournament Management
          </h1>

          <p>
            Manage entries, tie sheets, winners, officials, approvals and team
            championship with KHILADI’s professional premium tools.
          </p>

          <div className={styles.trustRow}>
            <span>
              <ShieldCheck size={16} /> Secure Razorpay Payment
            </span>
            <span>
              <CheckCircle size={16} /> Backend Verified Access
            </span>
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
                  <span>₹</span>
                  {plan.price}
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

        <div className={styles.couponBox}>
          <div className={styles.couponHeader}>
            <div>
              <label>
                <TicketPercent size={17} />
                Coupons
              </label>
              <p>
                Select an available coupon or enter a coupon code manually.
                Discount is verified by backend.
              </p>
            </div>

            {appliedCoupon && (
              <button
                type="button"
                className={styles.removeCouponBtn}
                onClick={removeCoupon}
              >
                <X size={15} />
                Remove
              </button>
            )}
          </div>

          {availableCoupons.length > 0 && (
            <div className={styles.availableCoupons}>
              {availableCoupons.map((coupon) => (
                <button
                  key={coupon._id || coupon.code}
                  type="button"
                  className={`${styles.couponChip} ${
                    appliedCoupon?.code === coupon.code
                      ? styles.activeCouponChip
                      : ""
                  }`}
                  onClick={() => handleApplyCoupon(coupon.code)}
                  disabled={couponLoading}
                >
                  <strong>{coupon.code}</strong>
                  <span>{getCouponLabel(coupon)}</span>
                </button>
              ))}
            </div>
          )}

          {availableCoupons.length === 0 && (
            <div className={styles.couponEmpty}>
              {couponSystemReason === "coupon-system-disabled"
                ? "Coupon system is currently disabled."
                : "No coupons available for this plan."}
            </div>
          )}

          <div className={styles.couponInputRow}>
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="ENTER COUPON CODE"
              disabled={couponLoading}
            />

            <button
              type="button"
              onClick={() => handleApplyCoupon()}
              disabled={couponLoading}
            >
              {couponLoading ? "Applying..." : "Apply"}
            </button>
          </div>

          {appliedCoupon && (
            <div className={styles.discountBox}>
              <div>
                <span>Coupon Applied</span>
                <strong>{appliedCoupon.code}</strong>
              </div>

              <div className={styles.priceRows}>
                <p>
                  <span>Original</span>
                  <b>{currency(displayBreakup.originalAmount)}</b>
                </p>
                <p>
                  <span>Discount</span>
                  <b>- {currency(displayBreakup.discountAmount)}</b>
                </p>
                <p>
                  <span>Final Payable</span>
                  <b>{currency(displayBreakup.finalAmount)}</b>
                </p>
              </div>
            </div>
          )}

          {couponMessage && (
            <div
              className={`${styles.couponMessage} ${
                appliedCoupon ? styles.successMessage : ""
              }`}
            >
              {couponMessage}
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.checkoutBar}>
          <div>
            <span>Selected Plan</span>
            <strong>
              {activePlan.title} —{" "}
              {appliedCoupon ? (
                <>
                  <span className={styles.strikePrice}>
                    {currency(displayBreakup.originalAmount)}
                  </span>{" "}
                  {currency(displayBreakup.finalAmount)}
                </>
              ) : (
                currency(activePlan.price)
              )}
            </strong>
          </div>

          <button
            type="button"
            className={styles.payButton}
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading
              ? "Processing..."
              : appliedCoupon && Number(displayBreakup.finalAmount || 0) === 0
                ? "Activate Free Access"
                : "Continue to Payment"}
          </button>
        </div>

        <p className={styles.note}>
          Coupon redemption is recorded only after successful backend verification
          or confirmed free-access activation.
        </p>
      </div>
    </div>
  );
};

export default PaymentPage;