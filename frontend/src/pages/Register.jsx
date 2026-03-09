// frontend/src/pages/Register.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FiLock, FiMail, FiUser, FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { registerUser } from "../api";
import { useAuth } from "../context/AuthContext";
import styles from "./Register.module.css";

const Register = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const validationSchema = Yup.object({
    name: Yup.string()
      .min(3, "Name must be at least 3 characters")
      .max(50, "Name too long")
      .required("Name is required"),
    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),
    password: Yup.string()
      .min(8, "Password must be at least 8 characters")
      .required("Password is required"),
  });

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      password: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setServerError("");
        const data = await registerUser(values);
        login(data);
        navigate("/tournaments");
      } catch (err) {
        if (err.response?.status === 429) {
          setServerError(
            "Too many registration attempts detected. Please wait 5-10 minutes and try again. Thank you for your patience! 😊"
          );
        } else {
          setServerError(err.message || "Registration failed. Please try again.");
        }
      }
    },
  });

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <h1 className={styles.title}>Khiladi Tournament Manager</h1>
        <p className={styles.subtitle}>Create Your Account</p>

        <div className={styles.socialLogin}>
          <button
            type="button"
            className={styles.socialButton}
            onClick={handleGoogleLogin}
          >
            <FcGoogle className={styles.socialIcon} />
          </button>
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerText}>or</span>
        </div>

        <form onSubmit={formik.handleSubmit} className={styles.authForm}>
          {serverError && <div className={styles.errorMessage}>{serverError}</div>}

          <div className={styles.inputGroup}>
            <FiUser className={styles.inputIcon} />
            <input
              type="text"
              placeholder="Full Name"
              {...formik.getFieldProps("name")}
              autoComplete="name"
              className={`${styles.input} ${
                formik.touched.name && formik.errors.name ? styles.error : ""
              }`}
            />
            {formik.touched.name && formik.errors.name && (
              <div className={styles.validationError}>{formik.errors.name}</div>
            )}
          </div>

          <div className={styles.inputGroup}>
            <FiMail className={styles.inputIcon} />
            <input
              type="email"
              placeholder="Email Address"
              {...formik.getFieldProps("email")}
              autoComplete="email"
              className={`${styles.input} ${
                formik.touched.email && formik.errors.email ? styles.error : ""
              }`}
            />
            {formik.touched.email && formik.errors.email && (
              <div className={styles.validationError}>{formik.errors.email}</div>
            )}
          </div>

          <div className={styles.inputGroup}>
            <FiLock className={styles.inputIcon} />
            <input
              type={passwordVisible ? "text" : "password"}
              placeholder="Password (min 8 chars)"
              {...formik.getFieldProps("password")}
              autoComplete="new-password"
              className={`${styles.input} ${
                formik.touched.password && formik.errors.password
                  ? styles.error
                  : ""
              }`}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setPasswordVisible(!passwordVisible)}
            >
              {passwordVisible ? <FiEyeOff /> : <FiEye />}
            </button>
            {formik.touched.password && formik.errors.password && (
              <div className={styles.validationError}>{formik.errors.password}</div>
            )}
          </div>

          <button
            type="submit"
            disabled={formik.isSubmitting}
            className={styles.primaryButton}
          >
            {formik.isSubmitting ? "Creating Account..." : "Register"}
          </button>
        </form>

        <div className={styles.authFooter}>
          <span className={styles.footerText}>Already have an account?</span>
          <Link to="/login" className={styles.link}>
            Login here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;