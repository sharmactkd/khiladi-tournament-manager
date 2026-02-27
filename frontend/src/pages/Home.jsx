// frontend/src/pages/Home.jsx
import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Welcome, {user?.name || "User"}!</h1>
      <p>This is your Tournament Manager home page.</p>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
};

export default Home;
