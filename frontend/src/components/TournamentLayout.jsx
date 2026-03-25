import React, { useState, useEffect, useMemo } from "react";
import { Outlet, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getTournamentById } from "../api";
import SubNavBar from "../components/SubNavBar";
import styles from "./TournamentLayout.module.css";

const getTournamentOwnerId = (tournament) => {
  if (!tournament) return null;

  const owner =
    tournament.user ||
    tournament.userId ||
    tournament.organizerId ||
    tournament.createdBy ||
    null;

  if (!owner) return null;

  if (typeof owner === "string") return owner;
  if (typeof owner === "object" && owner._id) return owner._id;

  return null;
};

const TournamentLayout = () => {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setTournament(null);
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load tournament details. Please try again or check your connection."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [id]);

  const isActive = useMemo(() => {
    if (!tournament?.dateTo) return false;

    const normalizeDate = (dateLike) => {
      const date = new Date(dateLike);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const today = normalizeDate(new Date());
    const endDate = normalizeDate(tournament.dateTo);

    return today <= endDate;
  }, [tournament]);

  const isTournamentOwner = useMemo(() => {
    if (!user || !tournament) return false;

    const ownerId = getTournamentOwnerId(tournament);
    const currentUserId = user.id || user._id;

    return !!ownerId && !!currentUserId && String(ownerId) === String(currentUserId);
  }, [user, tournament]);

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
      {user && isActive && isTournamentOwner && (
        <SubNavBar tournament={tournament} user={user} />
      )}

      <div className={styles.content}>
        <Outlet
          context={{
            tournament,
            isActive,
            isTournamentOwner,
            user,
            loading: false,
            error: null,
          }}
        />
      </div>
    </div>
  );
};

export default TournamentLayout;