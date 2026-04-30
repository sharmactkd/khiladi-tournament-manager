import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FiLock, FiMail } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { loginUser } from "../api";
import styles from "./Login.module.css";

const Login = () => {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState("");

  const redirectTo = searchParams.get("redirect") || "/";
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const validationSchema = Yup.object({
    email: Yup.string().required("Email is required"),
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
          login(response, redirectTo);
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

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
  <div className={styles.heroContent}>
    <h1 className={styles.heroTitle}>
      WELCOME TO THE <br/>
      <span>KHILADI TOURNAMENT MANAGER</span>
    </h1>

    <p className={styles.heroSubtitle}>
      The Most Advanced Tournament Manager for Organizers, built for speed,
      precision, and complete championship control.
    </p>

    <p className={styles.heroTagline}>
      More Features. More Control. More Power Than Any System. <br/> From entries to
      medals — everything automated.
    </p>
  </div>

  <div className={styles.loginContainer}>
    <h2 className={styles.loginTitle}>Login to Your Account</h2>
    <span className={styles.socialAccountsText}>via Social Accounts</span>

    <div className={styles.socialButtons}>
   <button
  type="button"
  className={styles.googleLoginBtn}
  onClick={handleGoogleLogin}
  aria-label="Login with Google"
  title="Login with Google"
>
  <FcGoogle className={styles.googleIcon} />
  <span>Login with Google</span>
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
          type="text"
          placeholder="Email"
          autoComplete="username"
          {...formik.getFieldProps("email")}
          className={
            formik.touched.email && formik.errors.email ? styles.inputError : ""
          }
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
          className={
            formik.touched.password && formik.errors.password
              ? styles.inputError
              : ""
          }
        />
        <span
          className={styles.eyeIcon}
          onClick={() => setPasswordVisible(!passwordVisible)}
          role="button"
          tabIndex={0}
          aria-label={passwordVisible ? "Hide password" : "Show password"}
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
        <Link
          to={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
          className={styles.signupBtn}
        >
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