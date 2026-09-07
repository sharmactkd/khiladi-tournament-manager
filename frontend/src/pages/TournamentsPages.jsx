import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  getOngoingTournaments,
  getPreviousTournaments,
  getTournamentHome,
} from "../api";
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

  useEffect(() => {
    let isMounted = true;

    const fetchTournaments = async () => {
      setLoading(true);
      setError(null);

      try {
        let ongoingResponse;
        let previousResponse;

        try {
          const homeResponse = await getTournamentHome();
          ongoingResponse = homeResponse?.ongoing || [];
          previousResponse = homeResponse?.previous || [];
        } catch (homeError) {
          if (homeError?.status !== 404) throw homeError;

          const [ongoingResult, previousResult] = await Promise.allSettled([
            getOngoingTournaments(),
            getPreviousTournaments(),
          ]);

          ongoingResponse = ongoingResult.status === "fulfilled"
            ? ongoingResult.value
            : [];
          previousResponse = previousResult.status === "fulfilled"
            ? previousResult.value
            : [];

          if (
            ongoingResult.status === "rejected" &&
            previousResult.status === "rejected"
          ) {
            throw ongoingResult.reason;
          }
        }

        if (!isMounted) return;

        const ongoingTournamentsData = Array.isArray(ongoingResponse)
          ? ongoingResponse
          : ongoingResponse.tournaments || ongoingResponse.data || [];

        const previousTournamentsData = Array.isArray(previousResponse)
          ? previousResponse
          : previousResponse.tournaments || previousResponse.data || [];

        setOngoingTournaments(ongoingTournamentsData);
        setPreviousTournaments(previousTournamentsData);
      } catch (error) {
        if (isMounted) {
          console.error("Fetch error:", error);
          setError(error.message || "Failed to fetch tournaments");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTournaments();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const filterTournament = (tournament) => {
    if (!tournament) return false;

    if (
      filters.country &&
      (!tournament.venue ||
        !tournament.venue.country ||
        tournament.venue.country.toLowerCase() !== filters.country.toLowerCase())
    ) {
      return false;
    }

    if (
      filters.tournamentLevel &&
      (!tournament.tournamentLevel ||
        tournament.tournamentLevel.toLowerCase() !==
          filters.tournamentLevel.toLowerCase())
    ) {
      return false;
    }

    if (
      filters.tournamentType &&
      (!tournament.tournamentType ||
        !tournament.tournamentType.some(
          (type) => type.toLowerCase() === filters.tournamentType.toLowerCase()
        ))
    ) {
      return false;
    }

    return true;
  };

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
    setShowMyTournaments(false);
  };

  const handleMyTournaments = () => {
    setShowMyTournaments((prev) => !prev);
    setShowPrevious(false);
    setMyTournamentView("ongoing");
  };

  const handleCreateTournament = () => {
    navigate("/tournament/create");
  };

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

  return (
    <>
      <Helmet>
        <title>KHILADI - Taekwondo Tournament Manager & Tie Sheet Maker</title>

        <meta
          name="description"
          content="KHILADI is a professional Taekwondo Tournament Manager with tie-sheet maker, bracket manager, player entry system, winner records and team championship tools."
        />

        <meta
          name="keywords"
          content="taekwondo tournament manager, tie sheet maker, bracket manager, martial arts tournament software, taekwondo software, tournament management system, championship software, KHILADI"
        />

        <link rel="canonical" href="https://khiladi-khoj.com/" />

        <meta property="og:title" content="KHILADI Tournament Manager" />
        <meta
          property="og:description"
          content="Professional Taekwondo tournament manager and tie-sheet software."
        />
        <meta
          property="og:image"
          content="https://khiladi-khoj.com/khiladi-logo.png"
        />
        <meta property="og:url" content="https://khiladi-khoj.com/" />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div className={styles.leftGroup}>
            <button className={styles.toggleButton} onClick={handleToggle}>
              {showPrevious ? "Show Ongoing Tournaments" : "Show Previous Tournaments"}
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

                <button
                  className={styles.toggleButton}
                  onClick={handleMyTournaments}
                >
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
          <h2>{loading ? "Loading tournaments..." : displayTitle}</h2>

          <div className={styles.cardsContainer}>
            {loading ? (
              <p>Loading tournaments...</p>
            ) : error ? (
              <p className={styles.error}>{error}</p>
            ) : displayTournaments.length > 0 ? (
              displayTournaments.map((tournament) => (
                <TournamentPreviewCard
                  key={tournament._id}
                  tournament={tournament}
                />
              ))
            ) : (
              <p>No tournaments found.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
};

export default TournamentsPages;
