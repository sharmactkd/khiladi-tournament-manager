import Payment from "../models/payment.js";
import logger from "../utils/logger.js";
import processPaidPayment from "./paymentProcessingService.js";
import processPaymentStatusUpdate from "./paymentStatusService.js";

const getEntity = (event, entityName) => {
  return event?.payload?.[entityName]?.entity || {};
};

const getPaymentByOrderId = async (orderId) => {
  if (!orderId) return null;
  return Payment.findOne({ razorpayOrderId: orderId });
};

const getCapturedPaymentFromOrder = ({ orderEntity }) => {
  const payments = Array.isArray(orderEntity?.payments) ? orderEntity.payments : [];
  return payments.find((payment) => payment?.status === "captured") || null;
};

const validateCapturedPayment = ({ payment, paymentEntity }) => {
  const expectedAmountInPaise = Number(payment.amount || 0) * 100;

  return (
    paymentEntity.id &&
    paymentEntity.order_id === payment.razorpayOrderId &&
    paymentEntity.status === "captured" &&
    paymentEntity.captured === true &&
    Number(paymentEntity.amount) === expectedAmountInPaise &&
    String(paymentEntity.currency || "").toUpperCase() ===
      String(payment.currency || "INR").toUpperCase()
  );
};

const validateNotes = ({ payment, paymentEntity }) => {
  const paymentNotes = paymentEntity.notes || {};

  if (paymentNotes.userId && String(paymentNotes.userId) !== String(payment.userId)) {
    return {
      valid: false,
      message: "Webhook user mismatch",
    };
  }

  if (
    payment.planType === "single" &&
    paymentNotes.tournamentId &&
    String(paymentNotes.tournamentId) !== String(payment.tournamentId)
  ) {
    return {
      valid: false,
      message: "Webhook tournament mismatch",
    };
  }

  return {
    valid: true,
    message: "",
  };
};

const handlePaymentCaptured = async ({ paymentEntity, signature }) => {
  if (!paymentEntity?.order_id || !paymentEntity?.id) {
    const error = new Error("Invalid payment captured payload");
    error.statusCode = 400;
    throw error;
  }

  const payment = await getPaymentByOrderId(paymentEntity.order_id);

  if (!payment) {
    const error = new Error("Payment order not found");
    error.statusCode = 404;
    throw error;
  }

  const isValidWebhookPayment = validateCapturedPayment({
    payment,
    paymentEntity,
  });

  if (!isValidWebhookPayment) {
    const error = new Error("Webhook payment validation failed");
    error.statusCode = 400;
    throw error;
  }

  const noteValidation = validateNotes({
    payment,
    paymentEntity,
  });

  if (!noteValidation.valid) {
    const error = new Error(noteValidation.message);
    error.statusCode = 400;
    throw error;
  }

  return processPaidPayment({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    razorpaySignature: signature,
    verifiedBy: "razorpay_webhook_payment_captured_worker",
  });
};

const handlePaymentAuthorized = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id || !paymentEntity?.id) {
    const error = new Error("Invalid payment authorized payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: "authorized",
    source: "razorpay_webhook_payment_authorized_worker",
    note: "Payment authorized by Razorpay",
  });
};

const handlePaymentFailed = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id && !paymentEntity?.id) {
    const error = new Error("Invalid payment failed payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: "failed",
    source: "razorpay_webhook_payment_failed_worker",
    note: paymentEntity.error_description || "Payment failed at Razorpay",
    metadata: {
      errorCode: paymentEntity.error_code || "",
      errorDescription: paymentEntity.error_description || "",
      errorSource: paymentEntity.error_source || "",
      errorStep: paymentEntity.error_step || "",
      errorReason: paymentEntity.error_reason || "",
    },
  });
};

const handlePaymentRefunded = async ({ paymentEntity }) => {
  if (!paymentEntity?.order_id && !paymentEntity?.id) {
    const error = new Error("Invalid payment refunded payload");
    error.statusCode = 400;
    throw error;
  }

  const refundStatus =
    Number(paymentEntity.amount_refunded || 0) > 0 &&
    Number(paymentEntity.amount_refunded || 0) < Number(paymentEntity.amount || 0)
      ? "partially_refunded"
      : "refunded";

  return processPaymentStatusUpdate({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    status: refundStatus,
    source: "razorpay_webhook_payment_refunded_worker",
    note: "Payment refund updated by Razorpay",
    metadata: {
      amountRefunded: paymentEntity.amount_refunded || 0,
      refundStatus,
    },
  });
};

const handleRefundProcessed = async ({ refundEntity }) => {
  if (!refundEntity?.payment_id) {
    const error = new Error("Invalid refund processed payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayPaymentId: refundEntity.payment_id,
    status: "refunded",
    source: "razorpay_webhook_refund_processed_worker",
    note: "Refund processed by Razorpay",
    metadata: {
      refundId: refundEntity.id || "",
      refundAmount: refundEntity.amount || 0,
      refundStatus: refundEntity.status || "",
    },
  });
};

const handleDisputeCreated = async ({ disputeEntity }) => {
  const paymentId = disputeEntity?.payment_id || disputeEntity?.paymentId || "";

  if (!paymentId) {
    const error = new Error("Invalid dispute payload");
    error.statusCode = 400;
    throw error;
  }

  return processPaymentStatusUpdate({
    razorpayPaymentId: paymentId,
    status: "disputed",
    source: "razorpay_webhook_dispute_created_worker",
    note: "Payment dispute created",
    metadata: {
      disputeId: disputeEntity.id || "",
      disputeStatus: disputeEntity.status || "",
      disputeReason: disputeEntity.reason || "",
    },
  });
};

const handleOrderPaid = async ({ orderEntity, signature }) => {
  if (!orderEntity?.id) {
    const error = new Error("Invalid order paid payload");
    error.statusCode = 400;
    throw error;
  }

  const localPayment = await getPaymentByOrderId(orderEntity.id);

  if (!localPayment) {
    const error = new Error("Payment order not found for order.paid");
    error.statusCode = 404;
    throw error;
  }

  const capturedPayment = getCapturedPaymentFromOrder({ orderEntity });

  if (capturedPayment?.id) {
    return handlePaymentCaptured({
      paymentEntity: {
        ...capturedPayment,
        order_id: capturedPayment.order_id || orderEntity.id,
      },
      signature,
    });
  }

  if (localPayment.razorpayPaymentId) {
    return processPaidPayment({
      razorpayOrderId: localPayment.razorpayOrderId,
      razorpayPaymentId: localPayment.razorpayPaymentId,
      razorpaySignature: signature,
      verifiedBy: "razorpay_webhook_order_paid_fallback_worker",
    });
  }

  return processPaymentStatusUpdate({
    razorpayOrderId: orderEntity.id,
    status: "captured",
    source: "razorpay_webhook_order_paid_worker",
    note: "Razorpay order marked paid but payment entity was not available",
  });
};

export const processRazorpayWebhookEvent = async ({
  eventType,
  event,
  signature,
}) => {
  const paymentEntity = getEntity(event, "payment");
  const refundEntity = getEntity(event, "refund");
  const disputeEntity = getEntity(event, "dispute");
  const orderEntity = getEntity(event, "order");

  switch (eventType) {
    case "payment.captured":
      return handlePaymentCaptured({ paymentEntity, signature });

    case "payment.authorized":
      return handlePaymentAuthorized({ paymentEntity });

    case "payment.failed":
      return handlePaymentFailed({ paymentEntity });

    case "payment.refunded":
      return handlePaymentRefunded({ paymentEntity });

    case "refund.processed":
      return handleRefundProcessed({ refundEntity });

    case "payment.dispute.created":
    case "dispute.created":
      return handleDisputeCreated({ disputeEntity });

    case "order.paid":
      return handleOrderPaid({ orderEntity, signature });

    default:
      logger.info("Webhook event ignored by processor", { eventType });
      return {
        ignored: true,
        eventType,
      };
  }
};

export default processRazorpayWebhookEvent;