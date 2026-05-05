import axios from "axios";

const normalizeBase = (v) => String(v || "").trim().replace(/\/+$/, "");

const resolveApiBaseUrl = () => {
  const envUrl =
    normalizeBase(import.meta.env.VITE_API_URL) ||
    normalizeBase(import.meta.env.VITE_API_BASE_URL);

  if (envUrl) {
    return envUrl.endsWith("/api") ? envUrl : `${envUrl}/api`;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin || "";
    const host = window.location.hostname || "";
    const isLocal = host === "localhost" || host === "127.0.0.1";

    if (origin && !isLocal) {
      return `${normalizeBase(origin)}/api`;
    }
  }

  return "http://localhost:5000/api";
};

const API_URL = resolveApiBaseUrl();

const isImageAnalyzeRequest = (configOrUrl) => {
  const value =
    typeof configOrUrl === "string" ? configOrUrl : configOrUrl?.url || "";

  return String(value).includes("/import/image/analyze");
};

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 90000,
});

let refreshPromise = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !String(originalRequest.url || "").includes("/auth/refresh")
    ) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
            .then((refreshRes) => {
              const { accessToken } = refreshRes.data || {};
              if (!accessToken) throw new Error("Refresh did not return accessToken");
              localStorage.setItem("authToken", accessToken);
              return accessToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const accessToken = await refreshPromise;

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);

        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 429) {
      console.warn("Rate limited (429)", error.response.data);

      if (!isImageAnalyzeRequest(originalRequest)) {
        alert("Too many requests. Please slow down and try again in a minute.");
      }
    }

    return Promise.reject(error);
  }
);

const apiCall = async (method, url, data = null, config = {}) => {
  try {
    const normalizedMethod = method.toLowerCase();

    let response;
    if (normalizedMethod === "get" || normalizedMethod === "delete") {
      response = await api[normalizedMethod](url, config);
    } else {
      response = await api[normalizedMethod](url, data, config);
    }

    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const serverMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.details;

    const msg = serverMsg || error.message || "Request failed";

    console.error(`API ${method.toUpperCase()} ${url} error:`, { status, msg });

    const err = new Error(msg);
    err.status = status;
    err.raw = error;
    throw err;
  }
};

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

export const registerUser = (userData) => apiCall("post", "/auth/register", userData);
export const loginUser = (credentials) => apiCall("post", "/auth/login", credentials);

export const forgotPassword = (payload) =>
  apiCall("post", "/auth/forgot-password", payload);

export const resetPassword = (token, payload) =>
  apiCall("post", `/auth/reset-password/${encodeURIComponent(token)}`, payload);

export const completeProfile = (payload) =>
  apiCall("patch", "/auth/complete-profile", payload);

export const getCurrentUser = () => apiCall("get", "/auth/me");

export const createTournament = (data) =>
  apiCall("post", "/tournament", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const updateTournament = (tournamentId, data) =>
  apiCall("put", `/tournament/${tournamentId}`, data, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const getOngoingTournaments = () => apiCall("get", "/tournament/ongoing");
export const getPreviousTournaments = () => apiCall("get", "/tournament/previous");
export const getTournamentById = (id) => apiCall("get", `/tournament/${id}`);

export const saveWeightPreset = (name, data) =>
  apiCall("post", "/weight-presets", { name, data });
export const getWeightPresets = () => apiCall("get", "/weight-presets");
export const deleteWeightPreset = (id) => apiCall("delete", `/weight-presets/${id}`);

export const getEntries = (tournamentId) =>
  apiCall("get", `/tournaments/${tournamentId}/entries`);
export const saveEntries = (tournamentId, payload) =>
  apiCall("post", `/tournaments/${tournamentId}/entries`, payload);

export const submitTeamSubmission = (tournamentId, payload) =>
  apiCall("post", `/team-submissions/${tournamentId}/submit`, payload);

export const getTournamentTeamSubmissions = (tournamentId) =>
  apiCall("get", `/team-submissions/${tournamentId}`);

export const getPendingTeamSubmissionCount = (tournamentId) =>
  apiCall("get", `/team-submissions/${tournamentId}/pending-count`);

export const approveTeamSubmission = (submissionId) =>
  apiCall("patch", `/team-submissions/${submissionId}/approve`, {});

export const rejectTeamSubmission = (submissionId, payload = {}) =>
  apiCall("patch", `/team-submissions/${submissionId}/reject`, payload);

export const analyzeImageImport = (formData) =>
  apiCall("post", "/import/image/analyze", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const confirmImageImport = (payload) =>
  apiCall("post", "/import/image/confirm", payload);

export const getVisitorCount = () => apiCall("get", "/visitor");

export const getAdminDashboard = () => apiCall("get", "/admin/dashboard");
export const getAdminUsers = (params = {}) =>
  apiCall("get", `/admin/users${toQueryString(params)}`);
export const getAdminUserDetails = (userId) => apiCall("get", `/admin/users/${userId}`);
export const getAdminTournaments = (params = {}) =>
  apiCall("get", `/admin/tournaments${toQueryString(params)}`);
export const getAdminTournamentDetails = (tournamentId) =>
  apiCall("get", `/admin/tournaments/${tournamentId}`);
export const getAdminPayments = (params = {}) =>
  apiCall("get", `/admin/payments${toQueryString(params)}`);
export const getAdminEntries = (params = {}) =>
  apiCall("get", `/admin/entries${toQueryString(params)}`);

export const suspendAdminUser = (userId, reason = "") =>
  apiCall("patch", `/admin/users/${userId}/suspend`, { reason });

export const unsuspendAdminUser = (userId) =>
  apiCall("patch", `/admin/users/${userId}/unsuspend`, {});

export const deleteAdminUser = (userId) =>
  apiCall("delete", `/admin/users/${userId}`);

export const deleteAdminTournament = (tournamentId) =>
  apiCall("delete", `/admin/tournaments/${tournamentId}`);

export default api;