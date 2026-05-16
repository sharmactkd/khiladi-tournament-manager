import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPremiumAccessStatus } from "../api";

const PremiumAccessGuard = ({
  children,
  featureLabel = "Premium feature",
  feature = "",
}) => {
  const { id: tournamentId } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [error, setError] = useState("");

  const isAdminUser = user?.role === "admin" || user?.role === "superadmin";

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      try {
        setLoading(true);
        setError("");

        if (isAdminUser) {
          if (!cancelled) {
            setAccess({
              hasAccess: true,
              source: "admin-ui-bypass",
              accessType: "admin",
              reason: "admin-user",
            });
          }
          return;
        }

        const data = await getPremiumAccessStatus(tournamentId, feature);

        if (!cancelled) {
          setAccess(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to check premium access");
          setAccess({
            hasAccess: false,
            paymentRequired: true,
            reason: "access-check-failed",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [tournamentId, feature, isAdminUser]);

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        Checking premium access...
      </div>
    );
  }

  if (!access?.hasAccess) {
    return (
      <div
        style={{
          maxWidth: "720px",
          margin: "40px auto",
          padding: "28px",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          background: "#fff",
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h2 style={{ marginBottom: "12px" }}>Premium Access Required</h2>

        <p style={{ color: "#4b5563", marginBottom: "8px" }}>
          {featureLabel} is available only for premium users.
        </p>

        {error ? (
          <p style={{ color: "#dc2626", marginBottom: "16px" }}>{error}</p>
        ) : (
          <p style={{ color: "#6b7280", marginBottom: "16px" }}>
            Reason: {access?.reason || "premium-access-required"}
          </p>
        )}

        <Link
          to={`/tournaments/${tournamentId}`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: "10px",
            background: "#111827",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Back to Tournament
        </Link>
      </div>
    );
  }

  return children;
};

export default PremiumAccessGuard;