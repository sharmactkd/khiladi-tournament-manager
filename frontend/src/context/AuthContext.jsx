// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext, useMemo } from "react";
import api from "../api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("authToken"));
  const [loading, setLoading] = useState(true);

  const login = (responseData) => {
    const { accessToken, _id, ...rest } = responseData;
    if (!_id || !accessToken) throw new Error("Invalid login response");

    const userData = { id: _id, ...rest };

    localStorage.setItem("authToken", accessToken);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setToken(accessToken);

    window.location.href = "/";
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");

    setUser(null);
    setToken(null);

    window.location.href = "/login";
  };

  const refreshToken = async () => {
    try {
      const response = await api.post("/auth/refresh", {}, { withCredentials: true });
      const { accessToken } = response.data || {};
      if (!accessToken) throw new Error("Refresh did not return accessToken");

      localStorage.setItem("authToken", accessToken);
      setToken(accessToken);

      // Fetch updated user
      const userRes = await api.get("/auth/me");
      const userData = { id: userRes.data?._id, ...userRes.data };
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);

      return accessToken;
    } catch (error) {
      console.error("Token refresh failed:", error);
      logout();
      throw error;
    }
  };

  // On app load: restore session if token exists
  useEffect(() => {
    const restoreAuth = async () => {
      const storedToken = localStorage.getItem("authToken");

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        // api will attach Authorization automatically
        const res = await api.get("/auth/me");
        const userData = { id: res.data?._id, ...res.data };

        setUser(userData);
        setToken(storedToken);
      } catch (error) {
        console.error("Session restore failed:", error);

        // If token invalid (401), clear it
        if (error?.response?.status === 401) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
          setToken(null);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, []);

  // Periodic token check & refresh (every 5 minutes)
  useEffect(() => {
    if (!token) return;

    const safeParseJwtExp = (jwt) => {
      try {
        const parts = jwt.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
      } catch {
        return null;
      }
    };

    const checkAndRefreshToken = async () => {
      try {
        const expiryTime = safeParseJwtExp(token);

        // If not a JWT or exp missing, don't break the app
        if (!expiryTime) return;

        if (Date.now() >= expiryTime) {
          await refreshToken();
          return;
        }

        if (Date.now() >= expiryTime - 60000) {
          await refreshToken();
        }
      } catch (error) {
        console.error("Token check failed:", error);
      }
    };

    const interval = setInterval(checkAndRefreshToken, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      loading,
      login,
      logout,
      refreshToken,
    }),
    [user, token, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div
          className="loading"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            zIndex: 9999,
          }}
        >
          Loading...
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);