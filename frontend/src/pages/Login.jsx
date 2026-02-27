// frontend/src/pages/Login.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FiLock, FiMail } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { loginUser } from "../api";
import styles from "./Login.module.css";

const Login = () => {
  const { login } = useAuth();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState("");

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const validationSchema = Yup.object({
    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),
    password: Yup.string()
      .min(8, "Password must be at least 8 characters")
      .required("Password is required"),
  });

  const formik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setServerError("");
        const response = await loginUser(values);

        if (response?.accessToken) {
          login(response);
        } else {
          setServerError("Login failed: Invalid response from server");
        }
      } catch (err) {
        setServerError(err.message || "Login failed. Please try again.");
      }
    },
  });

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  };

  const handleFacebookLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/facebook`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        <div className={styles.loginContainer}>
          <h2 className={styles.loginTitle}>Login to Your Account</h2>
          <span className={styles.socialAccountsText}>via Social Accounts</span>

          <div className={styles.socialButtons}>
            <button type="button" className={styles.socialBtn} onClick={handleGoogleLogin}>
              <FcGoogle className={styles.socialIcon} />
            </button>
            <button type="button" className={styles.socialBtn} onClick={handleFacebookLogin}>
              <FaFacebook className={styles.socialIcon} style={{ color: "#1877F2" }} />
            </button>
          </div>

          <div className={styles.divider}>
            <span className={styles.dividerText}>or</span>
          </div>

          <form onSubmit={formik.handleSubmit} className={styles.loginForm}>
            {serverError && <div className={styles.errorMessage}>{serverError}</div>}

            <div className={styles.inputGroup}>
              <FiMail className={styles.icon} />
              <input
                type="email"
                placeholder="Email"
                autoComplete="email"
                {...formik.getFieldProps("email")}
                className={formik.touched.email && formik.errors.email ? styles.inputError : ""}
              />
              {formik.touched.email && formik.errors.email && (
                <span className={styles.error}>{formik.errors.email}</span>
              )}
            </div>

            <div className={styles.inputGroup}>
              <FiLock className={styles.icon} />
              <input
                type={passwordVisible ? "text" : "password"}
                placeholder="Password"
                autoComplete="current-password"
                {...formik.getFieldProps("password")}
                className={formik.touched.password && formik.errors.password ? styles.inputError : ""}
              />
              <span
                className={styles.eyeIcon}
                onClick={() => setPasswordVisible(!passwordVisible)}
              >
                {passwordVisible ? <FaEyeSlash /> : <FaEye />}
              </span>
              {formik.touched.password && formik.errors.password && (
                <span className={styles.error}>{formik.errors.password}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={formik.isSubmitting}
              className={styles.loginBtn}
            >
              {formik.isSubmitting ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>

      <div className={styles.rightSection}>
        <h1 className={styles.signupText}>New Here?</h1>
        <Link to="/register" className={styles.signupBtn}>
          Create Account
        </Link>
        <h3 className={styles.featureText}>
          And use amazing features of Tournament Manager
        </h3>
      </div>
    </div>
  );
};

export default Login;