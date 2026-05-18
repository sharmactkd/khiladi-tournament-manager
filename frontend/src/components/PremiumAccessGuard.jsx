// FILE: frontend/src/components/PremiumAccessGuard.jsx

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMyAccessStatus } from "../api/paymentApi";
import PaymentPage from "./payment/PaymentPage";

const PremiumAccessGuard = ({
  children,
  featureLabel = "Premium feature",
  feature = "",
}) => {
  const { id } = useParams();
  const tournamentId = id?.trim();
  const { user } = useAuth();

  const isAdminUser = user?.role === "admin" || user?.role === "superadmin";

  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessData, setAccessData] = useState(null);
  const [error, setError] = useState("");

  const checkAccess = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (isAdminUser) {
        setHasAccess(true);
        setAccessData({
          hasAccess: true,
          source: "admin-ui-bypass",
          accessType: "admin",
          reason: "admin-user",
        });
        return;
      }

      if (!tournamentId) {
        setHasAccess(false);
        setAccessData({
          hasAccess: false,
          paymentRequired: true,
          reason: "missing-tournament-id",
        });
        return;
      }

      const res = await getMyAccessStatus(tournamentId, feature);

      setAccessData(res);
      setHasAccess(res?.hasAccess === true);
    } catch (err) {
      console.error("Premium access check failed:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to check premium access"
      );

      setAccessData({
        hasAccess: false,
        paymentRequired: true,
        reason: "access-check-failed",
      });

      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, feature, isAdminUser]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  if (isAdminUser) {
    return children;
  }

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          fontWeight: 700,
          fontSize: "18px",
        }}
      >
        Checking premium access...
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {error && (
          <div
            style={{
              maxWidth: "900px",
              margin: "20px auto 0",
              padding: "12px 16px",
              borderRadius: "12px",
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {featureLabel}: {error}
          </div>
        )}

        {accessData?.reason && !error && (
          <div
            style={{
              maxWidth: "900px",
              margin: "20px auto 0",
              padding: "10px 14px",
              borderRadius: "999px",
              background: "#fff7ed",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              fontWeight: 700,
              textAlign: "center",
              width: "fit-content",
            }}
          >
            {featureLabel} requires premium access
          </div>
        )}

        <PaymentPage tournamentId={tournamentId} onPaymentSuccess={checkAccess} />
      </div>
    );
  }

  return children;
};

export default PremiumAccessGuard;