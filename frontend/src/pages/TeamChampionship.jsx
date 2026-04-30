// src/pages/TeamChampionship.jsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { Trophy } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import styles from "./TeamChampionship.module.css";

const EVENT_FILTERS = ["OVERALL", "KYORUGI", "POOMSAE", "FRESHER", "TAG TEAM"];

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;

  const cleanFilename = filename.replace(/^.*[\\/]/, "");
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api$/, "");

  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

const normalizeBaseUrl = () => {
  const rawBase = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  return rawBase.replace(/\/+$/, "");
};

const normalizeMedal = (value) => {
  const medal = String(value || "").trim();
  return ["Gold", "Silver", "Bronze"].includes(medal) ? medal : "";
};

const normalizeEventType = (event, subEvent) => {
  const e = String(event || "").trim().toLowerCase();
  const s = String(subEvent || "").trim().toLowerCase();

  if (s.includes("fresher") || s.includes("fresh")) return "FRESHER";
  if (s.includes("tag")) return "TAG TEAM";
  if (e.includes("poomsae") || s.includes("poomsae")) return "POOMSAE";
  if (e.includes("kyorugi") || s.includes("kyorugi")) return "KYORUGI";

  return "OTHER";
};

const normalizeGender = (value) => {
  const v = String(value || "").trim().toLowerCase();

  if (["male", "m", "boy", "boys"].includes(v)) return "Male";
  if (["female", "f", "girl", "girls"].includes(v)) return "Female";

  return String(value || "").trim();
};

const normalizeAgeCategory = (value) => {
  const v = String(value || "").trim();
  const lower = v.toLowerCase();

  if (lower === "sub-junior" || lower === "sub junior") return "Sub-Junior";
  if (lower === "cadet") return "Cadet";
  if (lower === "junior") return "Junior";
  if (lower === "senior") return "Senior";
  if (lower === "under-14" || lower === "under - 14" || lower === "under 14") return "Under - 14";
  if (lower === "under-17" || lower === "under - 17" || lower === "under 17") return "Under - 17";
  if (lower === "under-19" || lower === "under - 19" || lower === "under 19") return "Under - 19";

  return v;
};

const TeamChampionship = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [medalPoints, setMedalPoints] = useState({
    gold: 12,
    silver: 7,
    bronze: 5,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState("KYORUGI");
  const [selectedAge, setSelectedAge] = useState("OVERALL");
  const [selectedGender, setSelectedGender] = useState("OVERALL");
  const [availableAges, setAvailableAges] = useState(["OVERALL"]);
  const [availableGenders, setAvailableGenders] = useState(["OVERALL"]);

  const pdfPageRef = useRef(null);

  const ageCategoryOrder = useMemo(
    () => [
      "Sub-Junior",
      "Cadet",
      "Junior",
      "Senior",
      "Under - 14",
      "Under - 17",
      "Under - 19",
    ],
    []
  );

  const genderOrder = useMemo(() => ["Male", "Female"], []);

  const normalizeEntryRows = useCallback((rows = []) => {
    return rows
      .map((p) => ({
        ...p,
        name: String(p?.name || "").trim(),
        team: String(p?.team || "").trim() || "Independent",
        gender: normalizeGender(p?.gender),
        ageCategory: normalizeAgeCategory(p?.ageCategory),
        weightCategory: String(p?.weightCategory || "").trim(),
        event: String(p?.event || "").trim(),
        subEvent: String(p?.subEvent || "").trim(),
        eventType: normalizeEventType(p?.event, p?.subEvent),
        medal: normalizeMedal(p?.medal),
      }))
      .filter((p) => p.name && p.gender && p.ageCategory && p.weightCategory && p.team);
  }, []);

  const updateAvailableFilters = useCallback(
    (rows) => {
      const uniqueAges = [...new Set(rows.map((p) => p.ageCategory).filter(Boolean))].sort((a, b) => {
        const ai = ageCategoryOrder.indexOf(a);
        const bi = ageCategoryOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      const uniqueGenders = [...new Set(rows.map((p) => p.gender).filter(Boolean))].sort((a, b) => {
        const ai = genderOrder.indexOf(a);
        const bi = genderOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      setAvailableAges(["OVERALL", ...uniqueAges]);
      setAvailableGenders(["OVERALL", ...uniqueGenders]);
    },
    [ageCategoryOrder, genderOrder]
  );

  const availableEvents = useMemo(() => {
    const events = [...new Set(players.map((p) => p.eventType).filter(Boolean))]
      .filter((eventName) => EVENT_FILTERS.includes(eventName))
      .sort((a, b) => EVENT_FILTERS.indexOf(a) - EVENT_FILTERS.indexOf(b));

    return ["OVERALL", ...events];
  }, [players]);

  useEffect(() => {
    if (!availableEvents.includes(selectedEvent)) {
      setSelectedEvent("KYORUGI");
    }
  }, [availableEvents, selectedEvent]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const baseUrl = normalizeBaseUrl();
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

        const [tournamentRes, entriesRes] = await Promise.all([
          axios.get(`${baseUrl}/tournament/${id}`, config),
          axios.get(`${baseUrl}/tournaments/${id}/entries?ts=${Date.now()}`, config),
        ]);

        const tournamentData = tournamentRes.data;

        setTournament({
          name: tournamentData.tournamentName || "Unnamed Tournament",
          federation: tournamentData.federation || "N/A",
          logos: tournamentData.logos || [],
        });

        setMedalPoints({
          gold: Number(tournamentData?.medalPoints?.gold) || 12,
          silver: Number(tournamentData?.medalPoints?.silver) || 7,
          bronze: Number(tournamentData?.medalPoints?.bronze) || 5,
        });

        const rows = Array.isArray(entriesRes?.data?.entries) ? entriesRes.data.entries : [];
        const normalizedPlayers = normalizeEntryRows(rows);

        setPlayers(normalizedPlayers);
        updateAvailableFilters(normalizedPlayers);
      } catch (err) {
        setError(err?.message || "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    if (id && isAuthenticated) fetchData();
  }, [id, token, isAuthenticated, normalizeEntryRows, updateAvailableFilters]);

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (selectedEvent !== "OVERALL" && player.eventType !== selectedEvent) return false;
      if (selectedAge !== "OVERALL" && player.ageCategory !== selectedAge) return false;
      if (selectedGender !== "OVERALL" && player.gender !== selectedGender) return false;
      return true;
    });
  }, [players, selectedEvent, selectedAge, selectedGender]);

  const filteredTeams = useMemo(() => {
    const teamPoints = {};

    const awardTeam = (team, medal) => {
      if (!team || !team.trim() || team === "Independent") return;

      if (!teamPoints[team]) {
        teamPoints[team] = {
          gold: 0,
          silver: 0,
          bronze: 0,
          total: 0,
        };
      }

      if (medal === "Gold") {
        teamPoints[team].gold += 1;
        teamPoints[team].total += medalPoints.gold;
      } else if (medal === "Silver") {
        teamPoints[team].silver += 1;
        teamPoints[team].total += medalPoints.silver;
      } else if (medal === "Bronze") {
        teamPoints[team].bronze += 1;
        teamPoints[team].total += medalPoints.bronze;
      }
    };

    filteredPlayers.forEach((player) => {
      if (!player.medal) return;
      awardTeam(player.team, player.medal);
    });

    return Object.entries(teamPoints)
      .map(([team, points]) => ({ team, ...points }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
      });
  }, [filteredPlayers, medalPoints]);

  const refreshData = async () => {
    setIsLoading(true);

    try {
      const baseUrl = normalizeBaseUrl();
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

      const entriesRes = await axios.get(`${baseUrl}/tournaments/${id}/entries?ts=${Date.now()}`, config);
      const rows = Array.isArray(entriesRes?.data?.entries) ? entriesRes.data.entries : [];
      const normalizedPlayers = normalizeEntryRows(rows);

      setPlayers(normalizedPlayers);
      updateAvailableFilters(normalizedPlayers);
    } finally {
      setIsLoading(false);
    }
  };

  const totalTeams = new Set(filteredPlayers.map((p) => p.team).filter(Boolean)).size;
  const totalPlayers = filteredPlayers.length;
  const totalMale = filteredPlayers.filter((p) => p.gender === "Male").length;
  const totalFemale = filteredPlayers.filter((p) => p.gender === "Female").length;
  const bracketsWithWinners = filteredPlayers.filter((p) => p.medal).length;

  const generatePDFDoc = async () => {
    if (!pdfPageRef.current) {
      alert("Page not ready for PDF generation");
      return null;
    }

    const page = pdfPageRef.current;
    const doc = new jsPDF("l", "mm", "a4");

    const clone = page.cloneNode(true);
    const container = document.createElement("div");

    Object.assign(container.style, {
      position: "absolute",
      left: "-9999px",
      top: "-9999px",
      width: "297mm",
      height: "210mm",
      background: "#ffffff",
      padding: "15mm",
      boxSizing: "border-box",
    });

    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2.2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdfWidth = 297;
      const pdfHeight = 210;
      const ratio = Math.min((pdfWidth - 30) / canvas.width, (pdfHeight - 30) / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;

      doc.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
      return doc;
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF");
      return null;
    } finally {
      document.body.removeChild(container);
    }
  };

  const saveAllPDF = async () => {
    const doc = await generatePDFDoc();

    if (doc) {
      doc.save(
        `Team_Championship_${selectedEvent}_${tournament?.name?.replace(/[^a-z0-9]/gi, "_") || "Tournament"}_${id}.pdf`
      );
    }
  };

  const printAllPDF = async () => {
    const doc = await generatePDFDoc();

    if (doc) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, "_blank");
      if (printWin) printWin.focus();
    }
  };

  if (!isAuthenticated) return null;

  if (isLoading) return <div className={styles.loading}>Loading Team Championship...</div>;

  if (error) {
    return (
      <div className={styles.container}>
        <h2>Error: {error}</h2>
      </div>
    );
  }

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  return (
    <div className={styles.container}>
      <PremiumAccessGuard tournamentId={id}>
      <div className={styles.buttonSection}>
        <div className={styles.pdfButtonWrapper}>
          <button onClick={refreshData} className={styles.printButton}>
            Refresh
          </button>

          <button onClick={printAllPDF} className={styles.printButton} disabled={!filteredTeams.length}>
            Print
          </button>

          <button onClick={saveAllPDF} className={styles.pdfButton} disabled={!filteredTeams.length}>
            Save PDF
          </button>
        </div>
      </div>

      <div className={styles.eventTabs}>
        {availableEvents.map((eventName) => (
          <button
            key={eventName}
            type="button"
            className={`${styles.eventTab} ${selectedEvent === eventName ? styles.activeEventTab : ""}`}
            onClick={() => setSelectedEvent(eventName)}
          >
            {eventName}
          </button>
        ))}
      </div>

      <div ref={pdfPageRef} className={styles.championshipPage}>
        <div className={styles.header}>
          {logoLeft && <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} />}

          <div className={styles.headerContent}>
            <h1 className={styles.tournamentName}>{tournament?.name?.toUpperCase()}</h1>
            <p className={styles.federation}>{tournament?.federation}</p>

            <h2 className={styles.title}>
              <Trophy className={styles.trophyIcon} />
              TEAM CHAMPIONSHIP
            </h2>

            <h3 className={styles.subTitle}>{selectedEvent}</h3>
          </div>

          {logoRight && <img src={logoRight} alt="Logo Right" className={styles.logoRight} />}
        </div>

        <div className={styles.dropdowns}>
          <div className={styles.dropdownWrapper}>
            <label className={styles.label}>Age Category:</label>
            <select value={selectedAge} onChange={(e) => setSelectedAge(e.target.value)} className={styles.dropdown}>
              {availableAges.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.dropdownWrapper}>
            <label className={styles.label}>Gender:</label>
            <select value={selectedGender} onChange={(e) => setSelectedGender(e.target.value)} className={styles.dropdown}>
              {availableGenders.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team Name</th>
              <th>Gold</th>
              <th>Silver</th>
              <th>Bronze</th>
              <th>Total Points</th>
            </tr>
          </thead>

          <tbody>
            {filteredTeams.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.noData}>
                  No team points available for {selectedEvent}. Declare medals in Entry page or declare winners in TieSheet first.
                </td>
              </tr>
            ) : (
              filteredTeams.map((teamData, index) => (
                <tr
                  key={teamData.team}
                  className={
                    index === 0
                      ? styles.highlightGold
                      : index === 1
                        ? styles.highlightSilver
                        : index === 2
                          ? styles.highlightBronze
                          : ""
                  }
                >
                  <td className={styles.rank}>#{index + 1}</td>
                  <td className={styles.teamName}>{teamData.team}</td>
                  <td>{teamData.gold}</td>
                  <td>{teamData.silver}</td>
                  <td>{teamData.bronze}</td>
                  <td className={styles.totalPoints}>{teamData.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className={styles.stats}>
          <span>Total Teams: {totalTeams}</span>
          <span>Total Players: {totalPlayers}</span>
          <span>Total Male: {totalMale}</span>
          <span>Total Female: {totalFemale}</span>
          <span>Medal Winners: {bracketsWithWinners}</span>
        </div>
      </div>
      </PremiumAccessGuard>
    </div>
  );
};

export default TeamChampionship;