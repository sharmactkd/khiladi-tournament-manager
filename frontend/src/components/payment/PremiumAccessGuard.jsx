// src/components/payment/PremiumAccessGuard.jsx

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getMyAccessStatus } from "../../api/paymentApi";
import PaymentPage from "./PaymentPage";

const PremiumAccessGuard = ({ children }) => {
  const { id } = useParams();
  const tournamentId = id?.trim();

  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessData, setAccessData] = useState(null);

  // ✅ Stable function (no unnecessary re-renders)
  const checkAccess = useCallback(async () => {
    try {
      setLoading(true);

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
  }, [tournamentId]);

  // ✅ Run only when tournament changes
  useEffect(() => {
    if (tournamentId) {
      checkAccess();
    }
  }, [tournamentId, checkAccess]);

  // ✅ Loading state
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

  // ✅ If NO ACCESS → show blurred content + payment overlay
  if (!hasAccess) {
    return (
      <div className="premiumAccessPreviewWrapper">
        {/* 🔹 CONTENT (blurred but visible) */}
        <div className="premiumBlurBackground">
          {children}
        </div>

        {/* 🔹 PAYMENT OVERLAY (does NOT block navbar) */}
        <div className="premiumPaymentOverlay">
          <PaymentPage
            tournamentId={tournamentId}
            onPaymentSuccess={checkAccess}
          />
        </div>
      </div>
    );
  }

  // ✅ If access granted → normal render
  return children;
};

export default PremiumAccessGuard;