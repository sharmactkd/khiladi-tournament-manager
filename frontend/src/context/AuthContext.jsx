// FILE: frontend/src/context/AuthContext.jsx

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from "react";
import api, { setAccessToken, getAccessToken, clearAccessToken } from "../api";

const AuthContext = createContext();

const normalizeUserData = (data) => {
  if (!data) return null;

  const { _id, id, accessToken, ...rest } = data;

  return {
    id: id || _id,
    _id: _id || id,
    ...rest,
    isProfileComplete:
      rest.isProfileComplete === undefined ? true : Boolean(rest.isProfileComplete),
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? normalizeUserData(JSON.parse(stored)) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(getAccessToken());
  const [loading, setLoading] = useState(true);
  const refreshInFlightRef = useRef(null);

  const persistUser = useCallback((userData) => {
    const normalizedUser = normalizeUserData(userData);

    if (!normalizedUser?.id) {
      throw new Error("Invalid user data");
    }

    localStorage.setItem("user", JSON.stringify(normalizedUser));
    setUser(normalizedUser);

    return normalizedUser;
  }, []);

  const clearAuthState = useCallback(() => {
    clearAccessToken();
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");

    setUser(null);
    setToken(null);
  }, []);

  const login = useCallback(
    (responseData, redirectTo = "/") => {
      const { accessToken, ...userPayload } = responseData || {};
      const normalizedUser = normalizeUserData(userPayload);

      if (!normalizedUser?.id || !accessToken) {
        throw new Error("Invalid login response");
      }

      setAccessToken(accessToken);
      localStorage.removeItem("authToken");
      localStorage.setItem("user", JSON.stringify(normalizedUser));

      setUser(normalizedUser);
      setToken(accessToken);

      const needsProfile =
        normalizedUser.loginProvider === "google" &&
        normalizedUser.isProfileComplete === false;

      window.location.href = needsProfile ? "/complete-profile" : redirectTo || "/";
    },
    []
  );

  const updateAuthUser = useCallback(
    (updatedUserData) => {
      return persistUser(updatedUserData);
    },
    [persistUser]
  );

  const refreshCurrentUser = useCallback(async () => {
    const res = await api.get("/auth/me");
    return persistUser(res.data);
  }, [persistUser]);

  const logout = useCallback((redirectTo = "/login") => {
    const performLogout = async () => {
      try {
        await api.post("/auth/logout", {}, { withCredentials: true });
      } catch (error) {
        console.error("Logout API failed:", error);
      } finally {
        clearAuthState();
        window.location.href = redirectTo;
      }
    };

    performLogout();
  }, [clearAuthState]);

  const refreshToken = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    refreshInFlightRef.current = (async () => {
      try {
        const response = await api.post("/auth/refresh", {}, { withCredentials: true });
        const { accessToken, user: refreshedUser } = response.data || {};

        if (!accessToken) throw new Error("Refresh did not return accessToken");

        setAccessToken(accessToken);
        setToken(accessToken);

        let finalUser = refreshedUser ? normalizeUserData(refreshedUser) : null;

        if (!finalUser?.id) {
          const userRes = await api.get("/auth/me");
          finalUser = normalizeUserData(userRes.data);
        }

        persistUser(finalUser);

        return accessToken;
      } catch (error) {
        console.error("Token refresh failed:", error);
        clearAuthState();
        throw error;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }, [clearAuthState, persistUser]);

  useEffect(() => {
    const restoreAuth = async () => {
      localStorage.removeItem("authToken");

      try {
        const response = await api.post("/auth/refresh", {}, { withCredentials: true });
        const { accessToken, user: refreshedUser } = response.data || {};

        if (!accessToken) {
          throw new Error("Refresh did not return accessToken");
        }

        setAccessToken(accessToken);
        setToken(accessToken);

        let userData = refreshedUser ? normalizeUserData(refreshedUser) : null;

        if (!userData?.id) {
          const res = await api.get("/auth/me");
          userData = normalizeUserData(res.data);
        }

        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));
      } catch (error) {
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, [clearAuthState]);

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
        const latestToken = getAccessToken() || token;
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
      refreshCurrentUser,
      updateAuthUser,
      setUser: updateAuthUser,
    }),
    [
      user,
      token,
      loading,
      login,
      logout,
      refreshToken,
      refreshCurrentUser,
      updateAuthUser,
    ]
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