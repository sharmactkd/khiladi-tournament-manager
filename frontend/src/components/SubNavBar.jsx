// src/components/SubNavBar.jsx

import React from "react";
import { NavLink, useParams, useLocation, useNavigate } from "react-router-dom";
import styles from "./SubNavBar.module.css";

const SubNavBar = ({ tournament, user }) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Safe normalize function
  const normalizeDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const today = normalizeDate(new Date());
  const start = normalizeDate(tournament?.dateFrom);
  const end = normalizeDate(tournament?.dateTo);

  // CHANGE HERE: Tournament active if it has NOT ended yet
  const isActive = start && end && today <= end;

  // Hide SubNavBar only if not logged in OR tournament already ended
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
                {item.label}
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