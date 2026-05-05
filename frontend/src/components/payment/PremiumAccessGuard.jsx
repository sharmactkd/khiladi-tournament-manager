// src/components/payment/PremiumAccessGuard.jsx

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getMyAccessStatus } from "../../api/paymentApi";
import PaymentPage from "./PaymentPage";

const PremiumAccessGuard = ({ children }) => {
  const { id } = useParams();
  const tournamentId = id?.trim();
  const { user } = useAuth();

  const isAdminUser = ["admin", "superadmin"].includes(user?.role);

  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessData, setAccessData] = useState(null);

  const checkAccess = useCallback(async () => {
    try {
      setLoading(true);

      if (isAdminUser) {
        setHasAccess(true);
        setAccessData({ hasAccess: true, bypass: "admin" });
        return;
      }

      const res = await getMyAccessStatus(tournamentId);
      console.log("PAYMENT ACCESS STATUS:", res);

      const accessGranted = res?.hasAccess === true;

      setHasAccess(accessGranted);
      setAccessData(res);
    } catch (error) {
      console.error("Access check failed:", error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, isAdminUser]);

  useEffect(() => {
    if (isAdminUser) {
      setLoading(false);
      setHasAccess(true);
      setAccessData({ hasAccess: true, bypass: "admin" });
      return;
    }

    if (tournamentId) {
      checkAccess();
    }
  }, [tournamentId, checkAccess, isAdminUser]);

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
      <div className="premiumAccessPreviewWrapper">
        <div className="premiumBlurBackground">{children}</div>

        <div className="premiumPaymentOverlay">
          <PaymentPage tournamentId={tournamentId} onPaymentSuccess={checkAccess} />
        </div>
      </div>
    );
  }

  return children;
};

export default PremiumAccessGuard;