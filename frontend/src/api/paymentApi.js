import api from "../api";

const PAYMENT_VERIFY_TIMEOUT_MS = 20000;
const PAYMENT_RECONCILE_TIMEOUT_MS = 25000;
const PAYMENT_STATUS_TIMEOUT_MS = 15000;

export const createPaymentOrder = async ({
  planType,
  tournamentId,
  couponCode = "",
}) => {
  const { data } = await api.post(
    "/payment/create-order",
    { planType, tournamentId, couponCode },
    { timeout: 30000 }
  );

  return data;
};

export const verifyPayment = async (paymentData) => {
  const { data } = await api.post("/payment/verify", paymentData, {
    timeout: PAYMENT_VERIFY_TIMEOUT_MS,
  });

  return data;
};

export const reconcilePaymentOrder = async ({ orderId }) => {
  const { data } = await api.post(
    "/payment/reconcile-order",
    { orderId },
    { timeout: PAYMENT_RECONCILE_TIMEOUT_MS }
  );

  return data;
};

export const getPaymentStatus = async ({
  orderId,
  paymentId,
  tournamentId,
  feature,
}) => {
  const { data } = await api.get("/payment/status", {
    params: { orderId, paymentId, tournamentId, feature },
    timeout: PAYMENT_STATUS_TIMEOUT_MS,
  });

  return data;
};

export const getMyPlan = async () => {
  const { data } = await api.get("/payment/my-plan", {
    timeout: PAYMENT_STATUS_TIMEOUT_MS,
  });

  return data;
};

export const getMyAccessStatus = async (tournamentId, feature = "") => {
  const { data } = await api.get("/payment/access-status", {
    params: { tournamentId, feature },
  });

  return data;
};

export const getAvailableCoupons = async ({ planType }) => {
  const { data } = await api.get("/payment/coupons/available", {
    params: { planType },
  });

  return data;
};

export const validateCoupon = async ({ code, planType }) => {
  const { data } = await api.post("/payment/coupon/validate", {
    code,
    planType,
  });

  return data;
};

export const applyCoupon = async ({ code, planType, tournamentId }) => {
  const { data } = await api.post("/payment/coupon/apply", {
    code,
    planType,
    tournamentId,
  });

  return data;
};