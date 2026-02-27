// src/components/TournamentLayout.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getTournamentById } from "../api";
import SubNavBar from "../components/SubNavBar";
import styles from "./TournamentLayout.module.css";

const TournamentLayout = () => {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch tournament data
  useEffect(() => {
    if (!id) {
      setError("Tournament ID is missing");
      setLoading(false);
      return;
    }

    const fetchTournament = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getTournamentById(id);
      
        setTournament(data);
      } catch (err) {
      
        setError(
          err.response?.data?.message || 
          "Failed to load tournament details. Please try again or check your connection."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [id]);

  // isActive: Tournament is considered "active" if it has NOT ended yet
  // This includes ongoing tournaments AND future/upcoming ones
  const isActive = useMemo(() => {
    if (!tournament?.dateTo) {
     
      return false;
    }

    const normalizeDate = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      // Reset time to start of day (ignore time portion)
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const today = normalizeDate(new Date());
    const endDate = normalizeDate(tournament.dateTo);

    if (!today || !endDate) {
     
      return false;
    }

    const active = today <= endDate;

   
    return active;
  }, [tournament]);

  // ── Render Logic ────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading tournament details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.error}>
          <h3>Oops!</h3>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.error}>
          <h3>Tournament Not Found</h3>
          <p>The tournament you're looking for doesn't exist or has been removed.</p>
          <button 
            onClick={() => navigate("/tournaments")}
            className={styles.backButton}
          >
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layoutContainer}>
      {/* SubNavBar only shows if:
          1. User is logged in
          2. Tournament has NOT ended yet (today <= end date)
      */}
      {user && isActive && (
        <SubNavBar 
          tournament={tournament} 
          user={user} 
        />
      )}

      {/* Main content area - child routes like Entry, Tie-Sheet etc. */}
      <div className={styles.content}>
        <Outlet context={{ tournament, isActive, user }} />
      </div>
    </div>
  );
};

export default TournamentLayout;