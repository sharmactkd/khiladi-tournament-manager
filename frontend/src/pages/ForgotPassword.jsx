import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import { forgotPassword } from "../api";
import styles from "./Login.module.css";

const pageStyle = {
  minHeight: "calc(100vh - 160px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,64,175,0.92))",
};

const cardStyle = {
  width: "100%",
  maxWidth: "460px",
  background: "#ffffff",
  borderRadius: "18px",
  padding: "34px 30px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
};

const titleStyle = {
  margin: "0 0 10px",
  color: "#0f172a",
  fontSize: "28px",
  fontWeight: 800,
  textAlign: "center",
};

const subtitleStyle = {
  margin: "0 0 24px",
  color: "#64748b",
  fontSize: "15px",
  lineHeight: 1.6,
  textAlign: "center",
};

const noticeStyle = {
  padding: "12px 14px",
  borderRadius: "10px",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "18px",
};

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setServerError("");
      setSuccessMessage("");

      const normalizedEmail = String(email || "").trim().toLowerCase();

      if (!normalizedEmail) {
        setServerError("Email is required");
        return;
      }

      await forgotPassword({ email: normalizedEmail });

      setSuccessMessage(
        "If an account exists with this email, a password reset link has been sent."
      );
      setEmail("");
    } catch (error) {
      setServerError(
        error.message || "Unable to process your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Forgot Password</h1>
        <p style={subtitleStyle}>
          Enter your registered email address. If your account exists, we will send
          you a secure password reset link.
        </p>

        {successMessage && (
          <div
            style={{
              ...noticeStyle,
              background: "#ecfdf5",
              color: "#047857",
              border: "1px solid #a7f3d0",
            }}
          >
            {successMessage}
          </div>
        )}

        {serverError && (
          <div
            style={{
              ...noticeStyle,
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
            }}
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.inputGroup}>
            <FiMail className={styles.icon} />
            <input
              type="email"
              placeholder="Enter your email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading} className={styles.loginBtn}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "18px" }}>
          <Link
            to="/login"
            style={{
              color: "#2563eb",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;