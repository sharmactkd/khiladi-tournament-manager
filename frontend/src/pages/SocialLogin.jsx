// frontend/src/pages/SocialLogin.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// Import the module as a namespace
import * as jwtDecode from "jwt-decode";

const SocialLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get("token");
    if (token) {
      try {
        // Use the default export from the namespace import
        const decoded = jwtDecode.default(token);
        const userData = {
          id: decoded.id,
          name: decoded.name,
          email: decoded.email,
          token,
        };
        login(userData);
      } catch (error) {
        // Fallback if decoding fails
        login({ token });
      }
      navigate("/home");
    }
  }, [login, navigate]);

  return <div>Processing social login...</div>;
};

export default SocialLogin;
