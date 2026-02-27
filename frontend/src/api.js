import axios from "axios";

/**
 * IMPORTANT (Root-cause fix):
 * Your backend mounts tournament CRUD at:   /api/tournament/...
 * Your entry routes mount at:               /api/tournaments/:id/entries
 *
 * Earlier helper functions were calling:
 *   /tournament/:id/entries   ❌ (wrong route)
 * which results in 404, and many times it looks like "save didn't happen"
 * because UI updates locally and errors are swallowed.
 *
 * This file now provides correct entry endpoints while keeping all existing auth behavior same.
 */

const normalizeBase = (v) => String(v || "").trim().replace(/\/+$/, "");

// Prefer VITE_API_URL (existing), fallback to VITE_API_BASE_URL, then local dev default
const API_ROOT =
  normalizeBase(import.meta.env.VITE_API_URL) ||
  normalizeBase(import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:5000";

const API_URL = API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // refresh token cookie
  timeout: 90000,
});

// Auto attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle response errors (401 → refresh token, 429 → rate limit)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 401 handling with refresh (same behavior as before)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshRes = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken } = refreshRes.data;
        localStorage.setItem("authToken", accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);

        if (refreshError.response?.status === 429) {
          alert("Too many requests. Please wait a minute before trying again.");
          await new Promise((resolve) => setTimeout(resolve, 60000));
          try {
            return api(originalRequest);
          } catch (finalError) {
            localStorage.clear();
            window.location.href = "/login";
            return Promise.reject(finalError);
          }
        }

        localStorage.clear();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 429) {
      console.warn("Rate limited (429)", error.response.data);
      alert("Too many requests. Please slow down and try again in a minute.");
    }

    return Promise.reject(error);
  }
);

// Helper for API calls with clean error handling
const apiCall = async (method, url, data = null, config = {}) => {
  try {
    const response = await api[method.toLowerCase()](url, data, config);
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const serverMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.details;

    const msg = serverMsg || error.message || "Request failed";

    // Keep prior behavior (console + throw)
    console.error(`API ${method.toUpperCase()} ${url} error:`, { status, msg });

    const err = new Error(msg);
    err.status = status;
    err.raw = error;
    throw err;
  }
};

// User APIs
export const registerUser = (userData) => apiCall("post", "/auth/register", userData);
export const loginUser = (credentials) => apiCall("post", "/auth/login", credentials);

// Tournament APIs
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

// Weight presets
export const saveWeightPreset = (name, data) => apiCall("post", "/weight-presets", { name, data });
export const getWeightPresets = () => apiCall("get", "/weight-presets");
export const deleteWeightPreset = (id) => apiCall("delete", `/weight-presets/${id}`);

/**
 * ✅ Entries APIs (FIXED ROUTES)
 * Backend: /api/tournaments/:id/entries
 */
export const getEntries = (tournamentId) => apiCall("get", `/tournaments/${tournamentId}/entries`);

export const saveEntries = (tournamentId, payload) =>
  apiCall("post", `/tournaments/${tournamentId}/entries`, payload);

export default api;