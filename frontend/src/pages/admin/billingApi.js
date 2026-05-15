import api from "../../api";

const toQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, value);
    }
  });

  const value = query.toString();
  return value ? `?${value}` : "";
};

export const getBillingDashboard = async () => {
  const res = await api.get("/admin/billing/dashboard");
  return res.data;
};

export const getPlatformSettings = async () => {
  const res = await api.get("/admin/billing/settings");
  return res.data;
};

export const updatePlatformSettings = async (payload) => {
  const res = await api.patch("/admin/billing/settings", payload);
  return res.data;
};

export const getBillingUsers = async (params = {}) => {
  const res = await api.get(`/admin/billing/users${toQueryString(params)}`);
  return res.data;
};

export const grantPremium = async (userId, payload) => {
  const res = await api.patch(`/admin/billing/users/${userId}/grant-premium`, payload);
  return res.data;
};

export const removePremium = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/remove-premium`, {});
  return res.data;
};

export const extendPremium = async (userId, payload) => {
  const res = await api.patch(`/admin/billing/users/${userId}/extend-premium`, payload);
  return res.data;
};

export const setLifetimeAccess = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/lifetime`, {});
  return res.data;
};

export const startTrial = async (userId, payload) => {
  const res = await api.patch(`/admin/billing/users/${userId}/start-trial`, payload);
  return res.data;
};

export const removeTrial = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/remove-trial`, {});
  return res.data;
};

export const enableOverride = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/enable-override`, {});
  return res.data;
};

export const disableOverride = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/disable-override`, {});
  return res.data;
};

export const blockBillingUser = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/block`, {});
  return res.data;
};

export const unblockBillingUser = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/unblock`, {});
  return res.data;
};

export const forceLogoutBillingUser = async (userId) => {
  const res = await api.patch(`/admin/billing/users/${userId}/force-logout`, {});
  return res.data;
};

export const listCoupons = async () => {
  const res = await api.get("/admin/billing/coupons");
  return res.data;
};

export const createCoupon = async (payload) => {
  const res = await api.post("/admin/billing/coupons", payload);
  return res.data;
};

export const updateCoupon = async (couponId, payload) => {
  const res = await api.patch(`/admin/billing/coupons/${couponId}`, payload);
  return res.data;
};

export const disableCoupon = async (couponId) => {
  const res = await api.patch(`/admin/billing/coupons/${couponId}/disable`, {});
  return res.data;
};

export const deleteCoupon = async (couponId) => {
  const res = await api.delete(`/admin/billing/coupons/${couponId}`);
  return res.data;
};

export const listTransactions = async () => {
  const res = await api.get("/admin/billing/transactions");
  return res.data;
};

export const listAuditLogs = async () => {
  const res = await api.get("/admin/billing/audit-logs");
  return res.data;
};