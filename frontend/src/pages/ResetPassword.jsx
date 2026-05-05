import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiLock } from "react-icons/fi";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { resetPassword } from "../api";
import styles from "./Login.module.css";

const pageStyle = {
  minHeight: "calc(100vh - 160px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(185,28,28,0.88))",
};

const cardStyle = {
  width: "100%",
  maxWidth: "480px",
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

const isStrongPassword = (password) => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(
    String(password || "")
  );
};

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordHelp = useMemo(() => {
    return "Password must include uppercase, lowercase, number, special character and be at least 8 characters.";
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setServerError("");
      setSuccessMessage("");

      if (!token) {
        setServerError("Invalid reset link.");
        return;
      }

      if (!password || !confirmPassword) {
        setServerError("New password and confirm password are required.");
        return;
      }

      if (!isStrongPassword(password)) {
        setServerError(passwordHelp);
        return;
      }

      if (password !== confirmPassword) {
        setServerError("Passwords do not match.");
        return;
      }

      const response = await resetPassword(token, { password });

      setSuccessMessage(
        response?.message || "Password reset successful. Please login."
      );

      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1800);
    } catch (error) {
      setServerError(
        error.message || "Unable to reset password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Reset Password</h1>
        <p style={subtitleStyle}>
          Create a new secure password for your KHILADI account.
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
            <FiLock className={styles.icon} />
            <input
              type={passwordVisible ? "text" : "password"}
              placeholder="New Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || !!successMessage}
            />
            <span
              className={styles.eyeIcon}
              onClick={() => setPasswordVisible((prev) => !prev)}
              role="button"
              tabIndex={0}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
            >
              {passwordVisible ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>

          <div className={styles.inputGroup}>
            <FiLock className={styles.icon} />
            <input
              type={confirmPasswordVisible ? "text" : "password"}
              placeholder="Confirm New Password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading || !!successMessage}
            />
            <span
              className={styles.eyeIcon}
              onClick={() => setConfirmPasswordVisible((prev) => !prev)}
              role="button"
              tabIndex={0}
              aria-label={
                confirmPasswordVisible ? "Hide confirm password" : "Show confirm password"
              }
            >
              {confirmPasswordVisible ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>

          <p
            style={{
              margin: "-4px 0 8px",
              color: "#64748b",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {passwordHelp}
          </p>

          <button
            type="submit"
            disabled={loading || !!successMessage}
            className={styles.loginBtn}
          >
            {loading ? "Resetting..." : "Reset Password"}
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

export default ResetPassword;