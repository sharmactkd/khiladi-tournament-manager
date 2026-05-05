//D:\Khiladi\frontend\src\pages\CompleteProfile.jsx
import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FiCheckCircle, FiLock, FiMail, FiPhone, FiUser } from "react-icons/fi";
import { completeProfile } from "../api";
import { useAuth } from "../context/AuthContext";

const roles = [
  {
    value: "organizer",
    title: "Organizer",
    description: "Create tournaments, manage entries, tie-sheets, results, teams and much more.",
  },
  {
    value: "coach",
    title: "Coach",
    description: "Submit tournament entries, track tournaments.",
  },
  {
    value: "player",
    title: "Player",
    description: "Use KHILADI as a player and access tournament information.",
  },
];

const pageStyle = {
  minHeight: "calc(100vh - 160px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,64,175,0.92), rgba(185,28,28,0.88))",
};

const cardStyle = {
  width: "100%",
  maxWidth: "760px",
  background: "#ffffff",
  borderRadius: "22px",
  padding: "34px",
  boxShadow: "0 26px 80px rgba(0,0,0,0.32)",
};

const titleStyle = {
  margin: "0 0 8px",
  color: "#0f172a",
  fontSize: "30px",
  fontWeight: 900,
  textAlign: "center",
};

const subtitleStyle = {
  margin: "0 auto 26px",
  color: "#64748b",
  fontSize: "15px",
  lineHeight: 1.6,
  textAlign: "center",
  maxWidth: "560px",
};

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 800,
  color: "#334155",
  marginBottom: "8px",
};

const inputWrapStyle = {
  position: "relative",
  marginBottom: "18px",
};

const iconStyle = {
  position: "absolute",
  left: "14px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#64748b",
  fontSize: "18px",
};

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "13px 14px 13px 44px",
  fontSize: "15px",
  outline: "none",
  background: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
};

const readonlyInputStyle = {
  ...inputStyle,
  background: "#f8fafc",
  color: "#475569",
  cursor: "not-allowed",
};

const noticeStyle = {
  padding: "12px 14px",
  borderRadius: "12px",
  fontSize: "14px",
  lineHeight: 1.5,
  marginBottom: "18px",
};

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, updateAuthUser, refreshCurrentUser } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [role, setRole] = useState(
    ["organizer", "coach", "player"].includes(user?.role) ? user.role : ""
  );
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const email = useMemo(() => user?.email || "", [user?.email]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.isProfileComplete === true) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setServerError("");
      setSuccessMessage("");

      const trimmedName = String(name || "").trim();
      const trimmedPhone = String(phone || "").trim();

      if (!trimmedName) {
        setServerError("Name is required.");
        return;
      }

      if (!role) {
        setServerError("Please select your role.");
        return;
      }

      if (!["organizer", "coach", "player"].includes(role)) {
        setServerError("Please select a valid role.");
        return;
      }

      const updatedUser = await completeProfile({
        name: trimmedName,
        phone: trimmedPhone || undefined,
        role,
      });

      if (typeof updateAuthUser === "function") {
        updateAuthUser(updatedUser);
      } else if (typeof refreshCurrentUser === "function") {
        await refreshCurrentUser();
      }

      setSuccessMessage("Profile completed successfully.");

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 700);
    } catch (error) {
      setServerError(
        error.message || "Unable to complete profile. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Complete Your Profile</h1>
        <p style={subtitleStyle}>
          Your Google account is connected. Please confirm your role so KHILADI can
          give you the correct access and tournament controls.
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

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "18px",
            }}
          >
            <div>
              <label style={labelStyle}>Email</label>
              <div style={inputWrapStyle}>
                <FiMail style={iconStyle} />
                <input
                  type="email"
                  value={email}
                  readOnly
                  style={readonlyInputStyle}
                  aria-label="Google account email"
                />
                <FiLock
                  style={{
                    position: "absolute",
                    right: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                  }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Name</label>
              <div style={inputWrapStyle}>
                <FiUser style={iconStyle} />
                <input
                  type="text"
                  value={name}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  disabled={loading}
                  style={inputStyle}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Phone Number Optional</label>
              <div style={inputWrapStyle}>
                <FiPhone style={iconStyle} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-15 digit phone number"
                  disabled={loading}
                  style={inputStyle}
                  autoComplete="tel"
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: "6px" }}>
            <label style={labelStyle}>Select Your Role</label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "14px",
                marginTop: "10px",
              }}
            >
              {roles.map((item) => {
                const selected = role === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setRole(item.value)}
                    disabled={loading}
                    style={{
                      textAlign: "left",
                      border: selected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                      background: selected ? "#eff6ff" : "#ffffff",
                      color: "#0f172a",
                      borderRadius: "16px",
                      padding: "16px",
                      cursor: loading ? "not-allowed" : "pointer",
                      boxShadow: selected
                        ? "0 12px 28px rgba(37,99,235,0.18)"
                        : "0 8px 18px rgba(15,23,42,0.06)",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        marginBottom: "8px",
                      }}
                    >
                      <strong style={{ fontSize: "16px" }}>{item.title}</strong>
                      {selected && (
                        <FiCheckCircle
                          style={{ color: "#2563eb", fontSize: "20px" }}
                        />
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        color: "#64748b",
                        fontSize: "13px",
                        lineHeight: 1.45,
                      }}
                    >
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!successMessage}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "14px",
              padding: "14px 18px",
              marginTop: "26px",
              background:
                loading || successMessage
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #dc2626, #2563eb)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 900,
              cursor: loading || successMessage ? "not-allowed" : "pointer",
              boxShadow: "0 14px 30px rgba(37,99,235,0.25)",
            }}
          >
            {loading ? "Saving Profile..." : "Complete Profile"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;