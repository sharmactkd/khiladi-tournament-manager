import Razorpay from "razorpay";
import Payment from "../models/payment.js";
import logger from "../utils/logger.js";
import processPaidPayment from "./paymentProcessingService.js";
import processPaymentStatusUpdate from "./paymentStatusService.js";

const RECONCILABLE_STATUSES = [
  "created",
  "attempted",
  "authorized",
  "captured",
  "failed",
];

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const mapRazorpayPaymentStatus = (razorpayPayment) => {
  if (!razorpayPayment) return null;

  if (razorpayPayment.status === "captured") return "paid";
  if (razorpayPayment.status === "authorized") return "authorized";
  if (razorpayPayment.status === "failed") return "failed";
  if (razorpayPayment.status === "refunded") return "refunded";

  return null;
};

const getBestRazorpayPayment = async ({ razorpay, orderId }) => {
  const response = await razorpay.orders.fetchPayments(orderId);
  const payments = Array.isArray(response?.items) ? response.items : [];

  if (payments.length === 0) return null;

  const captured = payments.find((payment) => payment.status === "captured");
  if (captured) return captured;

  const authorized = payments.find((payment) => payment.status === "authorized");
  if (authorized) return authorized;

  const failed = payments.find((payment) => payment.status === "failed");
  if (failed) return failed;

  return payments[0];
};

const validateRazorpayPaymentAgainstLocal = ({ localPayment, razorpayPayment }) => {
  if (!localPayment || !razorpayPayment) {
    return {
      valid: false,
      reason: "missing-payment",
    };
  }

  const expectedAmountInPaise = Number(localPayment.amount || 0) * 100;

  if (String(razorpayPayment.order_id || "") !== String(localPayment.razorpayOrderId)) {
    return {
      valid: false,
      reason: "order-id-mismatch",
    };
  }

  if (Number(razorpayPayment.amount || 0) !== expectedAmountInPaise) {
    return {
      valid: false,
      reason: "amount-mismatch",
    };
  }

  if (
    String(razorpayPayment.currency || "").toUpperCase() !==
    String(localPayment.currency || "INR").toUpperCase()
  ) {
    return {
      valid: false,
      reason: "currency-mismatch",
    };
  }

  return {
    valid: true,
    reason: "",
  };
};

export const reconcileOnePayment = async ({ paymentId, dryRun = true } = {}) => {
  const localPayment = await Payment.findById(paymentId);

  if (!localPayment) {
    return {
      paymentId,
      action: "not_found",
      changed: false,
      message: "Local payment not found",
    };
  }

  if (!localPayment.razorpayOrderId) {
    return {
      paymentId: localPayment._id,
      action: "skipped",
      changed: false,
      message: "Missing Razorpay order id",
    };
  }

  const razorpay = getRazorpayInstance();

  const razorpayOrder = await razorpay.orders.fetch(localPayment.razorpayOrderId);
  const razorpayPayment = await getBestRazorpayPayment({
    razorpay,
    orderId: localPayment.razorpayOrderId,
  });

  if (!razorpayPayment) {
    return {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      localStatus: localPayment.status,
      razorpayOrderStatus: razorpayOrder?.status || "",
      action: "no_gateway_payment_found",
      changed: false,
      message: "Razorpay order exists but no payment attempts found",
    };
  }

  const validation = validateRazorpayPaymentAgainstLocal({
    localPayment,
    razorpayPayment,
  });

  if (!validation.valid) {
    logger.warn("Reconciliation validation failed", {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      reason: validation.reason,
    });

    return {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      localStatus: localPayment.status,
      gatewayStatus: razorpayPayment.status,
      action: "validation_failed",
      changed: false,
      reason: validation.reason,
    };
  }

  const mappedStatus = mapRazorpayPaymentStatus(razorpayPayment);

  if (!mappedStatus) {
    return {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      localStatus: localPayment.status,
      gatewayStatus: razorpayPayment.status,
      action: "unsupported_gateway_status",
      changed: false,
    };
  }

  if (
    localPayment.status === mappedStatus ||
    (mappedStatus === "paid" && localPayment.status === "paid")
  ) {
    return {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      localStatus: localPayment.status,
      gatewayStatus: razorpayPayment.status,
      action: "already_in_sync",
      changed: false,
    };
  }

  if (dryRun) {
    return {
      paymentId: localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      localStatus: localPayment.status,
      gatewayStatus: razorpayPayment.status,
      mappedStatus,
      action: "would_update",
      changed: false,
    };
  }

  if (mappedStatus === "paid") {
    const processed = await processPaidPayment({
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      razorpaySignature: "reconciled_by_server",
      verifiedBy: "razorpay_reconciliation",
    });

    return {
      paymentId: processed?.payment?._id || localPayment._id,
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: razorpayPayment.id,
      previousStatus: localPayment.status,
      newStatus: "paid",
      action: "activated_paid_access",
      changed: true,
      alreadyProcessed: processed?.alreadyProcessed || false,
    };
  }

  const processed = await processPaymentStatusUpdate({
    razorpayOrderId: localPayment.razorpayOrderId,
    razorpayPaymentId: razorpayPayment.id,
    status: mappedStatus,
    source: "razorpay_reconciliation",
    note: `Reconciled from Razorpay status: ${razorpayPayment.status}`,
    metadata: {
      reconciliationAt: new Date(),
      razorpayOrderStatus: razorpayOrder?.status || "",
      razorpayPaymentStatus: razorpayPayment.status || "",
    },
  });

  return {
    paymentId: processed?.payment?._id || localPayment._id,
    razorpayOrderId: localPayment.razorpayOrderId,
    razorpayPaymentId: razorpayPayment.id,
    previousStatus: localPayment.status,
    newStatus: mappedStatus,
    action: "status_updated",
    changed: true,
  };
};

export const reconcilePayments = async ({
  limit = 50,
  dryRun = true,
  statuses = RECONCILABLE_STATUSES,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const payments = await Payment.find({
    gateway: "razorpay",
    razorpayOrderId: { $ne: "" },
    status: { $in: statuses },
  })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .select("_id razorpayOrderId status amount currency gateway")
    .lean();

  const results = [];

  for (const payment of payments) {
    try {
      const result = await reconcileOnePayment({
        paymentId: payment._id,
        dryRun,
      });

      results.push(result);
    } catch (error) {
      logger.error("Single payment reconciliation failed", {
        paymentId: payment._id,
        razorpayOrderId: payment.razorpayOrderId,
        error: error.message,
        stack: error.stack,
      });

      results.push({
        paymentId: payment._id,
        razorpayOrderId: payment.razorpayOrderId,
        action: "error",
        changed: false,
        error: error.message,
      });
    }
  }

  const summary = results.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.changed) acc.changed += 1;
      if (item.action === "already_in_sync") acc.alreadyInSync += 1;
      if (item.action === "error") acc.errors += 1;
      if (item.action === "would_update") acc.wouldUpdate += 1;
      return acc;
    },
    {
      total: 0,
      changed: 0,
      alreadyInSync: 0,
      wouldUpdate: 0,
      errors: 0,
    }
  );

  return {
    dryRun,
    summary,
    results,
  };
};

export default reconcilePayments;