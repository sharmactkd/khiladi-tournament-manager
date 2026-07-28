import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { FiLock, FiMail, FiShield, FiCloud, FiHeadphones, FiCheckCircle } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import {
  LuZap,
  LuNetwork,
  LuRadio,
  LuShieldCheck,
  LuClipboardList,
  LuUsers,
  LuTrophy,
  LuMapPin,
  LuTrendingUp,
  LuArrowRight,
} from "react-icons/lu";

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

       <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <clipPath id="loginRightSnakeClip" clipPathUnits="objectBoundingBox">
          <path d="M0.18,0 C0.05,0.08 0.03,0.18 0.10,0.28 C0.18,0.40 0.05,0.48 0.10,0.62 C0.16,0.78 0.04,0.91 0.14,1 L1,1 L1,0 Z" />
        </clipPath>
      </defs>
    </svg>
    
      <section className={styles.leftSection}>

        <div className={styles.heroContent}>
          <div className={styles.pill}>
            #1 Tournament Management Platform with most advance features for Taekwondo
          </div>

          <h1 className={styles.heroTitle}>
            WELCOME TO THE<br />
            <span>KHILADI</span>
            <b>TOURNAMENT MANAGER</b>
          </h1>

          <p className={styles.heroSubtitle}>
            The most advanced solution for organizers to run tournaments with
            speed, precision, and complete championship control.
          </p>

  <p className={styles.heroTagline}>
            More Features. More Control. More Power Than Any System.
From entries to medals — everything automated.
          </p>

          <div className={styles.featureStrip}>
            <div>
              <LuZap />
              <span>Fast Management</span>
            </div>
            <div>
              <LuNetwork />
              <span>Smart Tie-Sheet</span>
            </div>
            <div>
              <LuRadio />
              <span>Live Updates</span>
            </div>
            <div>
              <LuShieldCheck />
              <span>Secure & Reliable</span>
            </div>
            <div>
              <LuClipboardList />
              <span>Professional Reports</span>
            </div>
          </div>

         

          <div className={styles.organizerCard}>
            <div>
              <h3>Why you will Love KHILADI?</h3>
              <div className={styles.benefits}>
                <span><FiCheckCircle /> Save 90% Tournament Time</span>
                <span><FiCheckCircle /> Create Tournament for Free</span>
                <span><FiCheckCircle /> No need for google form, get entries directly</span>
                <span><FiCheckCircle /> Automatic Brackets</span>
                <span><FiCheckCircle /> Automatic Records of every printed / saved Brackets </span>
                <span><FiCheckCircle /> Live Decisions</span>
                <span><FiCheckCircle /> Automatic Winner list</span>
                <span><FiCheckCircle /> Automatic Team Championship Result</span>
                <span><FiCheckCircle /> Saprate Team Records</span>
                <span><FiCheckCircle /> Saprate Referee Records</span>
                <span><FiCheckCircle /> Professional Reports</span>
                <span><FiCheckCircle /> All Record stays for ever</span>
                <span><FiCheckCircle /> Mobile Friendly</span>
              </div>
            </div>

           
          </div>
        </div>

        <div className={styles.footerMini}>
          <span><FiShield /> Secure & Reliable</span>
          <span><FiCloud /> Cloud Based</span>
          <span><FiHeadphones /> 24/7 Support</span>
        </div>
      </section>

      <section className={styles.rightSection}>
        <div className={styles.rightGlow} />

        <div className={styles.rightHeadline}>
       
          <h2>MANAGE TOURNAMENTS LIKE A CHAMPION</h2>
        </div>

        <div className={styles.loginCard}>
          <h2 className={styles.loginTitle}>Login to Your Account</h2>
          <p className={styles.loginSubTitle}>
            Access your dashboard and manage your tournaments
          </p>

          <button
            type="button"
            className={styles.googleLoginBtn}
            onClick={handleGoogleLogin}
            aria-label="Login with Google"
          >
            <FcGoogle className={styles.googleIcon} />
            <span>Continue with Google</span>
          </button>

          <div className={styles.divider}>
            <span className={styles.dividerText}>or</span>
          </div>

          <form onSubmit={formik.handleSubmit} className={styles.loginForm}>
            {serverError && <div className={styles.errorMessage}>{serverError}</div>}

            <div className={styles.inputGroup}>
              <FiMail className={styles.icon} />
              <input
                type="text"
                placeholder="Email Address"
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
              <button
                type="button"
                className={styles.eyeIcon}
                onClick={() => setPasswordVisible((prev) => !prev)}
                aria-label={passwordVisible ? "Hide password" : "Show password"}
              >
                {passwordVisible ? <FaEyeSlash /> : <FaEye />}
              </button>
              {formik.touched.password && formik.errors.password && (
                <span className={styles.error}>{formik.errors.password}</span>
              )}
            </div>

            <div className={styles.forgotRow}>
              <Link to="/forgot-password">Forgot Password?</Link>
            </div>

            <button
              type="submit"
              disabled={formik.isSubmitting}
              className={styles.loginBtn}
            >
              {formik.isSubmitting ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className={styles.registerLine}>
            Don&apos;t have an account?{" "}
            <Link to={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}>
              Create Account
            </Link>
          </p>
        </div>

        <div className={styles.signupCard}>
          <div className={styles.trophyCircle}>🏆</div>
          <div>
            <h3>New Here?</h3>
            <p>Create your account and start managing tournaments like a pro.</p>
            <Link
              to={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
              className={styles.signupBtn}
            >
              Create Account Now <LuArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;