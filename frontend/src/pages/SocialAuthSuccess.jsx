import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const SocialAuthSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const completeLogin = async () => {
      try {
        const accessToken = searchParams.get("accessToken");

        if (!accessToken) {
          navigate("/login?error=google_login_failed", { replace: true });
          return;
        }

        localStorage.setItem("authToken", accessToken);

        const user = await api.get("/auth/me");

        login(
          {
            ...user.data,
            accessToken,
          },
          "/tournaments"
        );
      } catch (error) {
        console.error("Google login complete failed:", error);
        localStorage.removeItem("authToken");
        navigate("/login?error=google_login_failed", { replace: true });
      }
    };

    completeLogin();
  }, [searchParams, navigate, login]);

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      Logging you in with Google...
    </div>
  );
};

export default SocialAuthSuccess;