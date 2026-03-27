import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FiLock, FiMail, FiUser, FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { registerUser } from "../api";
import { useAuth } from "../context/AuthContext";
import styles from "./Register.module.css";

const roleOptions = [
  { value: "organizer", label: "Organizer" },
  { value: "coach", label: "Coach" },
  { value: "player", label: "Player" },
];

const passwordRulesText =
  "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character";

const Register = () => {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  const redirectTo = searchParams.get("redirect") || "/tournaments";
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const validationSchema = Yup.object({
    name: Yup.string()
      .min(3, "Name must be at least 3 characters")
      .max(50, "Name too long")
      .required("Name is required"),

    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),

    password: Yup.string()
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/,
        passwordRulesText
      )
      .required("Password is required"),

    role: Yup.string()
      .oneOf(["organizer", "coach", "player"], "Please select a valid role")
      .required("Role is required"),
  });

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      password: "",
      role: "coach",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setServerError("");
        const data = await registerUser(values);
        login(data, redirectTo);
      } catch (err) {
        if (err.status === 429 || err.raw?.response?.status === 429) {
          setServerError(
            "Too many registration attempts detected. Please wait 5-10 minutes and try again."
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
            aria-label="Continue with Google"
            title="Continue with Google"
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
              placeholder="Password (8+ chars, Aa, 1, @)"
              {...formik.getFieldProps("password")}
              autoComplete="new-password"
              className={`${styles.input} ${
                formik.touched.password && formik.errors.password ? styles.error : ""
              }`}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setPasswordVisible((prev) => !prev)}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              title={passwordVisible ? "Hide password" : "Show password"}
            >
              {passwordVisible ? <FiEyeOff /> : <FiEye />}
            </button>
            {formik.touched.password && formik.errors.password && (
              <div className={styles.validationError}>{formik.errors.password}</div>
            )}
          </div>

          <div className={styles.inputGroup}>
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                marginTop: "-6px",
                marginBottom: "4px",
                lineHeight: 1.5,
              }}
            >
              Password must include uppercase, lowercase, number, and special character.
            </div>
          </div>

          <div className={`${styles.inputGroup} ${styles.roleGroup}`}>
            <div className={styles.roleWrapper}>
              <div className={styles.roleHeading}>Select Role</div>

              <div className={styles.roleOptions}>
                {roleOptions.map((roleOption) => {
                  const isSelected = formik.values.role === roleOption.value;

                  return (
                    <label
                      key={roleOption.value}
                      className={`${styles.roleOption} ${
                        isSelected ? styles.roleOptionActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={roleOption.value}
                        checked={isSelected}
                        onChange={formik.handleChange}
                        className={styles.roleRadioHidden}
                      />
                      <span className={styles.roleLabel}>{roleOption.label}</span>
                    </label>
                  );
                })}
              </div>

              {formik.touched.role && formik.errors.role && (
                <div className={`${styles.validationError} ${styles.roleError}`}>
                  {formik.errors.role}
                </div>
              )}
            </div>
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
          <Link
            to={`/login${
              redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""
            }`}
            className={styles.link}
          >
            Login here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;