// FILE: frontend/src/components/PremiumAccessGuard.jsx

import React from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PaymentPage from "./payment/PaymentPage";

const PremiumAccessGuard = ({
  children,
  featureLabel = "Premium feature",
}) => {
  const { id } = useParams();
  const tournamentId = id?.trim();

  const outletContext = useOutletContext() || {};
  const { user } = useAuth();

  const access = outletContext?.access || outletContext?.tournament?.access || {};

  const isAdminUser =
    access?.isAdmin || user?.role === "admin" || user?.role === "superadmin";

  const canAccessPremiumPages = Boolean(
    isAdminUser || access?.canAccessPremiumPages
  );

  if (canAccessPremiumPages) {
    return children;
  }

  return (
    <div>
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

      <PaymentPage tournamentId={tournamentId} />
    </div>
  );
};

export default PremiumAccessGuard;