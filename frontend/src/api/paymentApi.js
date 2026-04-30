//D:\Khiladi\frontend\api\paymentApi.js
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

export const getMyAccessStatus = async (tournamentId) => {
  const query = tournamentId ? `?tournamentId=${tournamentId}` : "";
  const { data } = await api.get(`/payment/access-status${query}`);
  return data;
};