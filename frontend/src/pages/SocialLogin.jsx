// FILE: frontend/src/pages/SocialLogin.jsx

import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const SocialLogin = () => {
  const { refreshToken } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleSocialLogin = async () => {
      try {
        localStorage.removeItem("authToken");

        await refreshToken();

        window.location.href = "/";
      } catch (err) {
        console.error("Social login failed:", err);
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        setError("Social login failed. Please try again.");
      }
    };

    handleSocialLogin();
  }, [refreshToken]);

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