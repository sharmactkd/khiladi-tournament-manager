import Razorpay from "razorpay";
import Payment from "../models/payment.js";
import logger from "../utils/logger.js";
import processPaidPayment from "./paymentProcessingService.js";
import processPaymentStatusUpdate from "./paymentStatusService.js";

const getEntity = (event, entityName) =>
  event?.payload?.[entityName]?.entity || {};

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const getPaymentByOrderId = async (orderId) => {
  if (!orderId) return null;
  return Payment.findOne({ razorpayOrderId: orderId });
};

const getExpectedAmountInPaise = (payment) =>
  Math.round(Number(payment.finalAmount ?? payment.amount ?? 0) * 100);

const validateCapturedPayment = ({ payment, paymentEntity }) => {
  const expectedAmountInPaise = getExpectedAmountInPaise(payment);

  return (
    paymentEntity?.id &&
    paymentEntity?.order_id === payment.razorpayOrderId &&
    paymentEntity?.status === "captured" &&
    Number(paymentEntity?.amount) === expectedAmountInPaise &&
    String(paymentEntity?.currency || "").toUpperCase() ===
      String(payment.currency || "INR").toUpperCase()
  );
};

const validateNotes = ({ payment, paymentEntity }) => {
  const paymentNotes = paymentEntity.notes || {};

  if (paymentNotes.userId && String(paymentNotes.userId) !== String(payment.userId)) {
    return { valid: false, message: "Webhook user mismatch" };
  }

  if (
    payment.planType === "single" &&
    paymentNotes.tournamentId &&
    String(paymentNotes.tournamentId) !== String(payment.tournamentId)
  ) {
    return { valid: false, message: "Webhook tournament mismatch" };
  }

  return { valid: true, message: "" };
};

const handlePaymentCaptured = async ({ paymentEntity, signature, source }) => {
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

  if (!validateCapturedPayment({ payment, paymentEntity })) {
    const error = new Error("Webhook payment validation failed");
    error.statusCode = 400;
    throw error;
  }

  const noteValidation = validateNotes({ payment, paymentEntity });

  if (!noteValidation.valid) {
    const error = new Error(noteValidation.message);
    error.statusCode = 400;
    throw error;
  }

  return processPaidPayment({
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    razorpaySignature: signature,
    verifiedBy: source || "razorpay_webhook_payment_captured_worker",
  });
};

const findCapturedPaymentFromRazorpayOrder = async ({ orderId, localPayment }) => {
  const razorpay = getRazorpayInstance();
  const paymentsResult = await razorpay.orders.fetchPayments(orderId);
  const items = Array.isArray(paymentsResult?.items) ? paymentsResult.items : [];

  return (
    items.find((item) =>
      validateCapturedPayment({
        payment: localPayment,
        paymentEntity: item,
      })
    ) || null
  );
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

  if (localPayment.status === "paid") {
    return {
      alreadyProcessed: true,
      payment: localPayment,
      access: {
        planType: localPayment.planType,
        accessType: localPayment.accessType,
        tournamentId: localPayment.tournamentId,
        accessStartsAt: localPayment.accessStartsAt,
        accessExpiresAt: localPayment.accessExpiresAt,
      },
    };
  }

  const capturedPayment = await findCapturedPaymentFromRazorpayOrder({
    orderId: orderEntity.id,
    localPayment,
  });

  if (!capturedPayment?.id) {
    return processPaymentStatusUpdate({
      razorpayOrderId: orderEntity.id,
      status: "captured",
      source: "razorpay_webhook_order_paid_no_payment_entity_worker",
      note: "Razorpay order.paid received but captured payment was not fetchable yet",
    });
  }

  return handlePaymentCaptured({
    paymentEntity: capturedPayment,
    signature,
    source: "razorpay_webhook_order_paid_reconciled_worker",
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

export const processRazorpayWebhookEvent = async ({
  eventType,
  event,
  signature,
}) => {
  const paymentEntity = getEntity(event, "payment");
  const orderEntity = getEntity(event, "order");

  switch (eventType) {
    case "payment.captured":
      return handlePaymentCaptured({
        paymentEntity,
        signature,
        source: "razorpay_webhook_payment_captured_worker",
      });

    case "payment.authorized":
      return handlePaymentAuthorized({ paymentEntity });

    case "payment.failed":
      return handlePaymentFailed({ paymentEntity });

    case "order.paid":
      return handleOrderPaid({ orderEntity, signature });

    default:
      logger.info("Webhook event ignored by processor", { eventType });
      return { ignored: true, eventType };
  }
};

export default processRazorpayWebhookEvent;