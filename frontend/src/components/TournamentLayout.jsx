import React, { useState, useEffect, useMemo } from "react";
import {
  Outlet,
  useParams,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getTournamentById } from "../api";
import SubNavBar from "../components/SubNavBar";
import styles from "./TournamentLayout.module.css";

const getTournamentAccess = (tournament) => tournament?.access || {};

const TournamentLayout = () => {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const routePreview =
    location.state?.tournamentPreview?._id === id
      ? location.state.tournamentPreview
      : null;

  const [tournament, setTournament] = useState(routePreview);
  const [loading, setLoading] = useState(!routePreview);
  const [error, setError] = useState(null);

  const [adminEditMode, setAdminEditMode] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Tournament ID is missing");
      setLoading(false);
      return;
    }

    const fetchTournament = async () => {
      try {
        setLoading(!routePreview);
        setError(null);

        const data = await getTournamentById(id);
        setTournament(data);
      } catch (err) {
        if (!routePreview) {
          setTournament(null);
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load tournament details. Please try again or check your connection."
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [id, routePreview]);

  useEffect(() => {
    setAdminEditMode(false);
  }, [id]);

  const access = useMemo(() => getTournamentAccess(tournament), [tournament]);

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

  const isTournamentOwner = Boolean(access?.isOwner);
  const isAdminUser = Boolean(access?.isAdmin);

  const canAccessTournamentManagement = Boolean(
    user && (access?.isOwner || access?.isAdmin)
  );

  const managementOnlyPaths = useMemo(
    () => [
      "entry",
      "tie-sheet",
      "tie-sheet-record",
      "winner",
      "team-championship",
      "official",
      "team",
      "team-submissions",
    ],
    []
  );

  const currentPath = useMemo(() => {
    return location.pathname.split("/").filter(Boolean).pop();
  }, [location.pathname]);

  const isManagementOnlyPage = useMemo(() => {
    return managementOnlyPaths.includes(currentPath);
  }, [currentPath, managementOnlyPaths]);

  const isAdminReadOnly = Boolean(isAdminUser && !adminEditMode);

  const requestAdminSaveConfirmation = () => {
    return window.confirm("Are you sure, you want to save these changes?");
  };

  useEffect(() => {
    if (!user || !access?.shouldShowPlanExpiryReminder) return;

    const rawExpiry = access?.planExpiresAt;
    if (!rawExpiry) return;

    const expiryDate = new Date(rawExpiry);
    if (Number.isNaN(expiryDate.getTime())) return;

    const yyyyMmDd = expiryDate.toISOString().slice(0, 10);
    const userId = user?._id || user?.id || "user";
    const key = `khiladi_plan_expiry_reminder_${userId}_${yyyyMmDd}`;

    if (localStorage.getItem(key) === "shown") return;

    window.alert(
      "Your premium plan expires in 10 days. Renew to keep creating premium tournaments."
    );

    localStorage.setItem(key, "shown");
  }, [user, access?.shouldShowPlanExpiryReminder, access?.planExpiresAt]);

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

  if (isManagementOnlyPage && !canAccessTournamentManagement) {
    return <Navigate to={`/tournaments/${id}`} replace />;
  }

  return (
    <div className={styles.layoutContainer}>
      {canAccessTournamentManagement && (
  <div className={styles.subNavSlot}>
    <SubNavBar
      tournament={tournament}
      access={access}
      user={user}
      isAdminUser={isAdminUser}
      adminEditMode={adminEditMode}
      setAdminEditMode={setAdminEditMode}
      isAdminReadOnly={isAdminReadOnly}
    />
  </div>
)}

      <div className={styles.content}>
        <Outlet
          context={{
            tournament,
            setTournament,
            access,
            isActive,
            isTournamentOwner,
            isAdminUser,
            canAccessTournamentManagement,
            adminEditMode,
            setAdminEditMode,
            isAdminReadOnly,
            requestAdminSaveConfirmation,
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
