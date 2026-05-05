import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useParams, useLocation, useNavigate } from "react-router-dom";
import { getPendingTeamSubmissionCount } from "../api";
import styles from "./SubNavBar.module.css";

const SubNavBar = ({
  tournament,
  user,
  isAdminUser: isAdminUserProp = false,
  adminEditMode = false,
  setAdminEditMode,
}) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [pendingCount, setPendingCount] = useState(0);

  const normalizeDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const today = normalizeDate(new Date());
  const start = normalizeDate(tournament?.dateFrom);
  const end = normalizeDate(tournament?.dateTo);

  const isActive = start && end && today <= end;

  const isOrganizer = user?.role === "organizer";
  const isAdminUser =
    isAdminUserProp || ["admin", "superadmin"].includes(user?.role);

  const canReviewTeamSubmissions = isOrganizer || isAdminUser;

 const loadPendingCount = useCallback(async () => {
  try {
    if (!id || !canReviewTeamSubmissions) {
      setPendingCount(0);
      return;
    }

    const response = await getPendingTeamSubmissionCount(id);
    setPendingCount(Number(response?.pendingCount || 0));
  } catch (error) {
    if (error?.status !== 403) {
      console.error("Failed to load pending team submission count:", error);
    }

    setPendingCount(0);
  }
}, [id, canReviewTeamSubmissions]);
  useEffect(() => {
    if (!user || (!isActive && !isAdminUser) || !canReviewTeamSubmissions) return;

    loadPendingCount();

    const intervalId = setInterval(() => {
      loadPendingCount();
    }, 20000);

    const handleCountRefresh = () => {
      loadPendingCount();
    };

    window.addEventListener(`teamSubmissionCountUpdated_${id}`, handleCountRefresh);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener(`teamSubmissionCountUpdated_${id}`, handleCountRefresh);
    };
  }, [user, isActive, isAdminUser, canReviewTeamSubmissions, id, loadPendingCount]);

  if (!user || (!isActive && !isAdminUser)) {
    return null;
  }

  const isTournamentDetailsPage = location.pathname === `/tournaments/${id}`;

  const handleBackClick = () => {
    navigate(isAdminUser ? "/admin/tournaments" : "/tournaments");
  };

  const handleAdminEditClick = () => {
    if (typeof setAdminEditMode === "function") {
      setAdminEditMode(true);
    }
  };

  const handleAdminCancelClick = () => {
    if (typeof setAdminEditMode === "function") {
      const confirmed = window.confirm(
        "Are you sure, you want to cancel editing? Unsaved changes may be lost."
      );

      if (!confirmed) return;

      setAdminEditMode(false);
    }
  };

  const menuItems = [
    {
      label: isTournamentDetailsPage ? "<< Back" : "<< My Tournament",
      path: isTournamentDetailsPage ? null : `/tournaments/${id}`,
      onClick: isTournamentDetailsPage ? handleBackClick : null,
    },
    { label: "Entry", path: `/tournaments/${id}/entry` },
    { label: "Tie-Sheet", path: `/tournaments/${id}/tie-sheet` },
    { label: "Tie-Sheet Record", path: `/tournaments/${id}/tie-sheet-record` },
    { label: "Winner", path: `/tournaments/${id}/winner` },
    { label: "Team Championship", path: `/tournaments/${id}/team-championship` },
    { label: "Official", path: `/tournaments/${id}/official` },
    { label: "Team", path: `/tournaments/${id}/team` },
    ...(canReviewTeamSubmissions
      ? [
          {
            label: "Team Submissions",
            path: `/tournaments/${id}/team-submissions`,
            badge: pendingCount,
          },
        ]
      : []),
  ];

  return (
    <nav className={styles.subNav}>
      <ul>
        {menuItems.map((item) => (
          <li key={item.label}>
            {item.path ? (
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  isActive ? styles.active : styles.inactive
                }
                end
              >
                <span className={styles.linkContent}>
                  <span>{item.label}</span>
                  {item.badge > 0 ? (
                    <span className={styles.notificationBadge}>
                      {item.badge}
                    </span>
                  ) : null}
                </span>
              </NavLink>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className={styles.inactive}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                {item.label}
              </button>
            )}
          </li>
        ))}

        {isAdminUser && (
          <li>
            {!adminEditMode ? (
              <button
                type="button"
                onClick={handleAdminEditClick}
                className={styles.adminEditButton}
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAdminCancelClick}
                className={styles.adminCancelButton}
              >
                Cancel Edit
              </button>
            )}
          </li>
        )}
      </ul>
    </nav>
  );
};

export default SubNavBar;