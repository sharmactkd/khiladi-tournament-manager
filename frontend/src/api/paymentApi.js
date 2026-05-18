import api from "../api";

export const createPaymentOrder = async ({ planType, tournamentId }) => {
  const { data } = await api.post("/payment/create-order", {
    planType,
    tournamentId,
  });

  return data;
};

export const verifyPayment = async (paymentData) => {
  const { data } = await api.post("/payment/verify", paymentData);
  return data;
};

export const getMyAccessStatus = async (tournamentId, feature = "") => {
  const { data } = await api.get("/payment/access-status", {
    params: {
      tournamentId,
      feature,
    },
  });

  return data;
};

export const getPaymentStatus = async ({
  orderId,
  paymentId,
  tournamentId,
  feature,
}) => {
  const { data } = await api.get("/payment/status", {
    params: {
      orderId,
      paymentId,
      tournamentId,
      feature,
    },
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