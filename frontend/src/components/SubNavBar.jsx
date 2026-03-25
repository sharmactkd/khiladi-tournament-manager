import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useParams, useLocation, useNavigate } from "react-router-dom";
import { getPendingTeamSubmissionCount } from "../api";
import styles from "./SubNavBar.module.css";

const SubNavBar = ({ tournament, user }) => {
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

  const loadPendingCount = useCallback(async () => {
    try {
      if (!id || !isOrganizer) {
        setPendingCount(0);
        return;
      }

      const response = await getPendingTeamSubmissionCount(id);
      setPendingCount(Number(response?.pendingCount || 0));
    } catch (error) {
      console.error("Failed to load pending team submission count:", error);
      setPendingCount(0);
    }
  }, [id, isOrganizer]);

  useEffect(() => {
    if (!user || !isActive || !isOrganizer) return;

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
  }, [user, isActive, isOrganizer, id, loadPendingCount]);

  if (!user || !isActive) {
    return null;
  }

  const isTournamentDetailsPage = location.pathname === `/tournaments/${id}`;

  const handleBackClick = () => {
    navigate("/tournaments");
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
    ...(isOrganizer
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
      </ul>
    </nav>
  );
};

export default SubNavBar;