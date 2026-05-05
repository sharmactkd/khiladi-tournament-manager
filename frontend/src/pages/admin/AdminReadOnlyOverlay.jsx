//D:\Khiladi\frontend\src\pages\admin\AdminReadOnlyOverlay.jsx

import React from "react";
import { useOutletContext } from "react-router-dom";

const AdminReadOnlyOverlay = ({ children }) => {
  const { isAdminReadOnly } = useOutletContext() || {};

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Actual Page Content */}
      {children}

      {/* 🔒 Read-only overlay */}
      {isAdminReadOnly && (
        <div
          title="Admin read-only mode. Click Edit to make changes."
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: "rgba(255,255,255,0.01)", // invisible but blocks clicks
            cursor: "not-allowed",
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            alert("Admin read-only mode is active. Click Edit first to make changes.");
          }}
        />
      )}
    </div>
  );
};

export default AdminReadOnlyOverlay;