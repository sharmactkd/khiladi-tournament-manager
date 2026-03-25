import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from "react";
import api from "../api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(localStorage.getItem("authToken"));
  const [loading, setLoading] = useState(true);
  const refreshInFlightRef = useRef(null);

  const login = (responseData, redirectTo = "/") => {
    const { accessToken, _id, ...rest } = responseData || {};
    if (!_id || !accessToken) throw new Error("Invalid login response");

    const userData = { id: _id, ...rest };

    localStorage.setItem("authToken", accessToken);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setToken(accessToken);

    window.location.href = redirectTo || "/";
  };

  const logout = useCallback((redirectTo = "/login") => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");

    setUser(null);
    setToken(null);

    window.location.href = redirectTo;
  }, []);

  const refreshToken = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    refreshInFlightRef.current = (async () => {
      try {
        const response = await api.post("/auth/refresh", {}, { withCredentials: true });
        const { accessToken } = response.data || {};
        if (!accessToken) throw new Error("Refresh did not return accessToken");

        localStorage.setItem("authToken", accessToken);
        setToken(accessToken);

        const userRes = await api.get("/auth/me");
        const userData = { id: userRes.data?._id, ...userRes.data };
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);

        return accessToken;
      } catch (error) {
        console.error("Token refresh failed:", error);
        logout();
        throw error;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }, [logout]);

  useEffect(() => {
    const restoreAuth = async () => {
      const storedToken = localStorage.getItem("authToken");

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get("/auth/me");
        const userData = { id: res.data?._id, ...res.data };

        setUser(userData);
        setToken(storedToken);
        localStorage.setItem("user", JSON.stringify(userData));
      } catch (error) {
        console.error("Session restore failed:", error);

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
        const latestToken = localStorage.getItem("authToken") || token;
        const expiryTime = safeParseJwtExp(latestToken);

        if (!expiryTime) return;

        if (Date.now() >= expiryTime - 60000) {
          await refreshToken();
        }
      } catch (error) {
        console.error("Token check failed:", error);
      }
    };

    checkAndRefreshToken();
    const interval = setInterval(checkAndRefreshToken, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token, refreshToken]);

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
    [user, token, loading, logout, refreshToken]
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