import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api";

const SocialLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleSocialLogin = async () => {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const token = queryParams.get("token");

        if (!token) {
          setError("Social login token missing");
          return;
        }

        localStorage.setItem("authToken", token);

        const userRes = await api.get("/auth/me");

        login(
          {
            ...userRes.data,
            accessToken: token,
          },
          "/"
        );
      } catch (err) {
        console.error("Social login failed:", err);
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        setError("Social login failed. Please try again.");
      }
    };

    handleSocialLogin();
  }, [login, navigate]);

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#b91c1c" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      Processing Google login...
    </div>
  );
};

export default SocialLogin;