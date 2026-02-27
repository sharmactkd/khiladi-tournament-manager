import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getOngoingTournaments, getPreviousTournaments } from "../api";
import TournamentPreviewCard from "../components/TournamentPreviewCard";
import FilterComponent from "../components/FilterComponent";
import { useAuth } from "../context/AuthContext";
import styles from "./TournamentsPages.module.css";

const TournamentsPages = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ongoingTournaments, setOngoingTournaments] = useState([]);
  const [previousTournaments, setPreviousTournaments] = useState([]);
  const [filters, setFilters] = useState({
    country: "",
    tournamentLevel: "",
    tournamentType: "",
  });
  const [showPrevious, setShowPrevious] = useState(false);
  const [showMyTournaments, setShowMyTournaments] = useState(false);
  const [myTournamentView, setMyTournamentView] = useState("ongoing");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch tournaments
  useEffect(() => {
    const controller = new AbortController();
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const [ongoingResponse, previousResponse] = await Promise.all([
          getOngoingTournaments(),
          getPreviousTournaments(),
        ]);

        const ongoingTournamentsData = Array.isArray(ongoingResponse)
          ? ongoingResponse
          : ongoingResponse.tournaments || ongoingResponse.data || [];

        const previousTournamentsData = Array.isArray(previousResponse)
          ? previousResponse
          : previousResponse.tournaments || previousResponse.data || [];

        setOngoingTournaments(ongoingTournamentsData);
        setPreviousTournaments(previousTournamentsData);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Fetch error:", error);
          setError(error.message || "Failed to fetch tournaments");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
    return () => controller.abort();
  }, []);

  // Unique countries with useMemo
  const getUniqueCountries = useMemo(
    () => () => {
      const allTournaments = [...ongoingTournaments, ...previousTournaments];
      const countries = allTournaments
        .filter((tournament) => tournament?.venue?.country)
        .map((tournament) => tournament.venue.country);
      return [...new Set(countries)].sort();
    },
    [ongoingTournaments, previousTournaments]
  );

  // Filter function (case-insensitive)
  const filterTournament = (tournament) => {
    if (!tournament) return false;

    if (
      filters.country &&
      (!tournament.venue ||
        !tournament.venue.country ||
        tournament.venue.country.toLowerCase() !== filters.country.toLowerCase())
    )
      return false;

    if (
      filters.tournamentLevel &&
      (!tournament.tournamentLevel ||
        tournament.tournamentLevel.toLowerCase() !==
          filters.tournamentLevel.toLowerCase())
    )
      return false;

    if (
      filters.tournamentType &&
      (!tournament.tournamentType ||
        !tournament.tournamentType.some(
          (type) => type.toLowerCase() === filters.tournamentType.toLowerCase()
        ))
    )
      return false;

    return true;
  };

  // Memoized filtered lists
  const filteredOngoing = useMemo(
    () => ongoingTournaments.filter(filterTournament),
    [ongoingTournaments, filters]
  );
  const filteredPrevious = useMemo(
    () => previousTournaments.filter(filterTournament),
    [previousTournaments, filters]
  );
  const filteredMyOngoing = useMemo(
    () => filteredOngoing.filter((t) => t.createdBy?._id === user?._id),
    [filteredOngoing, user]
  );
  const filteredMyPrevious = useMemo(
    () => filteredPrevious.filter((t) => t.createdBy?._id === user?._id),
    [filteredPrevious, user]
  );

  const handleToggle = () => {
    setShowPrevious((prev) => !prev);
    setShowMyTournaments(false); // Reset My Tournaments
  };

  const handleMyTournaments = () => {
    setShowMyTournaments((prev) => !prev);
    setShowPrevious(false);
    setMyTournamentView("ongoing"); // Default view
  };

  const handleCreateTournament = () => {
    navigate("/tournament/create");
  };

  // Display logic
  let displayTournaments = [];
  let displayTitle = "";

  if (showMyTournaments) {
    if (myTournamentView === "ongoing") {
      displayTournaments = filteredMyOngoing;
      displayTitle = `${displayTournaments.length} My Ongoing Tournaments`;
    } else {
      displayTournaments = filteredMyPrevious;
      displayTitle = `${displayTournaments.length} My Previous Tournaments`;
    }
  } else if (showPrevious) {
    displayTournaments = filteredPrevious;
    displayTitle = `${displayTournaments.length} Previous Tournaments`;
  } else {
    displayTournaments = filteredOngoing;
    displayTitle = `${displayTournaments.length} Ongoing Tournaments`;
  }

  if (loading) return <div className={styles.loading}>Loading tournaments...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div className={styles.leftGroup}>
          <button className={styles.toggleButton} onClick={handleToggle}>
            {showPrevious
              ? "Show Ongoing Tournaments"
              : "Show Previous Tournaments"}
          </button>
        </div>

        <h1 className={styles.pageTitle}>Tournaments</h1>

        <div className={styles.rightGroup}>
          {user && (
            <>
              <button
                className={styles.toggleButton}
                onClick={handleCreateTournament}
              >
                Create Tournament
              </button>
              <button className={styles.toggleButton} onClick={handleMyTournaments}>
                My Tournaments
              </button>
            </>
          )}
        </div>
      </div>

      {showMyTournaments && (
        <div className={styles.myToggleGroup}>
          <button
            className={`${styles.myToggleButton} ${
              myTournamentView === "ongoing" ? styles.activeToggle : ""
            }`}
            onClick={() => setMyTournamentView("ongoing")}
          >
            My Ongoing Tournaments
          </button>
          <button
            className={`${styles.myToggleButton} ${
              myTournamentView === "previous" ? styles.activeToggle : ""
            }`}
            onClick={() => setMyTournamentView("previous")}
          >
            My Previous Tournaments
          </button>
        </div>
      )}

      <FilterComponent
        filters={filters}
        onFilterChange={setFilters}
        availableCountries={getUniqueCountries()}
      />

      <section className={styles.section}>
        <h2>{displayTitle}</h2>
        <div className={styles.cardsContainer}>
          {displayTournaments.length > 0 ? (
            displayTournaments.map((tournament) => (
              <TournamentPreviewCard
                key={tournament._id}
                tournament={tournament}
                onClick={() => navigate(`/tournaments/${tournament._id}`)}
              />
            ))
          ) : (
            <p>No tournaments found.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default TournamentsPages;