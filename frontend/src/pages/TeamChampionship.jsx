// src/pages/TeamChampionship.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { Trophy } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import styles from "./TeamChampionship.module.css";

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  const cleanFilename = filename.replace(/^.*[\\/]/, "");
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api$/, "");
  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

const TeamChampionship = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [bracketsOutcomes, setBracketsOutcomes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAge, setSelectedAge] = useState("OVERALL");
  const [selectedGender, setSelectedGender] = useState("OVERALL");
  const [availableAges, setAvailableAges] = useState(["OVERALL"]);
  const [availableGenders, setAvailableGenders] = useState(["OVERALL"]);

  const ageCategoryOrder = [
    "Sub-Junior",
    "Cadet",
    "Junior",
    "Senior",
    "Under - 14",
    "Under - 17",
    "Under - 19",
  ];
  const genderOrder = ["Male", "Female"];

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

        // 1. Tournament
        const tournamentRes = await axios.get(`${baseUrl}/tournament/${id}`, config);
        const data = tournamentRes.data;
        setTournament({
          name: data.tournamentName || "Unnamed Tournament",
          federation: data.federation || "N/A",
          logos: data.logos || [],
        });

        // 2. Players from localStorage
        let playersData = [];
        const savedData = localStorage.getItem(`entryData_${id}`);
        if (savedData) {
          try {
            playersData = JSON.parse(savedData);
          } catch {
            throw new Error("Invalid localStorage data");
          }
        } else {
          throw new Error("No player data found. Please generate from Entry page.");
        }

        playersData = playersData.filter(
          (p) => p?.name && p?.gender && p?.ageCategory && p?.weightCategory && p?.team
        );

        if (playersData.length === 0) throw new Error("No valid players");

        const normalizedPlayers = playersData.map((p) => ({
          ...p,
          gender: p.gender.charAt(0).toUpperCase() + p.gender.slice(1).toLowerCase(),
          ageCategory:
            p.ageCategory
              .toLowerCase()
              .replace(/under-(\d+)/g, "Under - $1")
              .replace(/sub-junior/g, "Sub-Junior")
              .replace(/cadet/g, "Cadet")
              .replace(/junior/g, "Junior")
              .replace(/senior/g, "Senior") || p.ageCategory,
          team: p.team || "Independent",
        }));

        setPlayers(normalizedPlayers);

        // Unique ages/genders
        const uniqueAges = [
          ...new Set(normalizedPlayers.map((p) => p.ageCategory)),
        ].sort((a, b) => ageCategoryOrder.indexOf(a) - ageCategoryOrder.indexOf(b));
        const uniqueGenders = [...new Set(normalizedPlayers.map((p) => p.gender))].sort(
          (a, b) => genderOrder.indexOf(a) - genderOrder.indexOf(b)
        );

        setAvailableAges(["OVERALL", ...uniqueAges]);
        setAvailableGenders(["OVERALL", ...uniqueGenders]);

        // 3. Brackets & outcomes from server
        const tieSheetRes = await axios.get(`${baseUrl}/tournament/${id}/tiesheet`, config);
        const saved = tieSheetRes.data.tiesheet;

        if (saved?.brackets?.length) {
          setBrackets(saved.brackets);
          setBracketsOutcomes(saved.outcomes || {});
        } else {
          setBrackets([]);
          setBracketsOutcomes({});
        }

        setIsLoading(false);
      } catch (err) {
        setError(err.message || "Failed to load data");
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id, token]);

  // Helper: get team name
  const getTeamName = (side, sideName, bracketKey, gameId, outcomes) => {
    if (!side) return { id: "", name: "", team: "" };
    if (side.team) return { id: side.team.id || "", name: side.team.name || "TBD", team: side.team.team || "" };
    if (side.sourceGame) {
      const sg = side.sourceGame;
      let srcOutcomes = outcomes[bracketKey] || {};
      if (bracketKey.endsWith("_PoolFinal") && side.pool) {
        const cat = bracketKey.replace("_PoolFinal", "");
        srcOutcomes = outcomes[`${cat}_Pool${side.pool}`] || {};
      }
      const prev = srcOutcomes[sg.id];
      if (prev) return getTeamName(sg.sides[prev], prev, bracketKey, sg.id, outcomes);
      return { id: `tbd_${sg.id}_${sideName}`, name: "", team: "" };
    }
    return { id: "", name: "", team: "" };
  };

  const getName = (side, bracketKey, pool = null) => {
    if (!side) return "";
    if (side.team) return side.team.name || "";
    if (side.sourceGame) {
      const sg = side.sourceGame;
      let src = bracketsOutcomes[bracketKey] || {};
      if (bracketKey.endsWith("_PoolFinal") && (pool || side.pool)) {
        const cat = bracketKey.replace("_PoolFinal", "");
        src = bracketsOutcomes[`${cat}_Pool${pool || side.pool}`] || {};
      }
      const w = src[sg.id];
      if (w) return getName(sg.sides[w], bracketKey, pool || side.pool);
    }
    return "";
  };

  // Medal winners
const getMedalWinners = (bracket) => {
  console.log('getMedalWinners called for bracket:', bracket.key);
  const baseKey = bracket.key.replace(/_Pool.*$/, "");
  const poolFinal = brackets.find(b => b.key === `${baseKey}_PoolFinal`);
  const playerCount = bracket.categoryPlayerCount || bracket.playerCount;

  const blank = { name: "", team: "" };
  let gold = blank, silver = blank, bronze1 = blank, bronze2 = blank;

  // Final match outcomes
  let finalGame, finalOutcomes, finalWinnerSide;

  if (poolFinal) {
    finalOutcomes = bracketsOutcomes[poolFinal.key] || {};
    finalGame = poolFinal.game;
    finalWinnerSide = finalOutcomes[finalGame.id];
    console.log('Pool Final detected - finalWinnerSide:', finalWinnerSide);
  } else {
    finalOutcomes = bracketsOutcomes[baseKey] || {};
    finalGame = bracket.game;
    finalWinnerSide = finalOutcomes[finalGame.id];
    console.log('Single Bracket - finalWinnerSide:', finalWinnerSide);
  }

  // Gold & Silver — only if final winner declared
  if (finalWinnerSide && finalGame) {
   const goldSide = finalGame?.sides?.[finalWinnerSide];
const silverSideKey = finalWinnerSide === "home" ? "away" : "home";
const silverSide = finalGame?.sides?.[silverSideKey];

// If structure is missing, don't crash — keep medals blank
if (!goldSide || !silverSide) {
  console.warn("Final sides missing:", {
    bracketKey: bracket?.key,
    baseKey,
    finalWinnerSide,
    finalGameId: finalGame?.id,
    sides: finalGame?.sides,
  });
  return { gold: blank, silver: blank, bronze1: blank, bronze2: blank };
}

gold = {
  name:
    getName(goldSide, poolFinal ? poolFinal.key : baseKey, goldSide?.pool) ||
    "_________________________",
  team: getTeamName(
    goldSide,
    finalWinnerSide,
    poolFinal ? poolFinal.key : baseKey,
    finalGame.id,
    bracketsOutcomes
  ).team,
};

silver = {
  name:
    getName(silverSide, poolFinal ? poolFinal.key : baseKey, silverSide?.pool) ||
    "_________________________",
  team: getTeamName(
    silverSide,
    silverSideKey,
    poolFinal ? poolFinal.key : baseKey,
    finalGame.id,
    bracketsOutcomes
  ).team,
};

    // 🔴 FIX: Bronze calculation should ONLY happen if final winner is declared
    // और साथ ही, bronze calculation को finalWinnerSide के चेक के INSIDE रखना चाहिए
    
    // Bronze — only compute if final winner is declared AND playerCount >= 3
    if (playerCount >= 3 && finalWinnerSide) {
      console.log('Computing bronzes since final is declared');
      
      if (poolFinal) {
        // Pool system bronzes
        ["A", "B"].forEach(p => {
          const poolB = brackets.find(b => b.key === `${baseKey}_Pool${p}`);
          if (!poolB?.gamesByRound?.length) {
            console.log(`Pool ${p} has no games`);
            return;
          }
          
          // Find the bronze medal match or third place playoff
          const bronzeMatch = poolB.gamesByRound[poolB.gamesByRound.length - 1];
          if (bronzeMatch?.[0]) {
            const bronzeGame = bronzeMatch[0];
            const bronzeOut = bracketsOutcomes[poolB.key] || {};
            const bronzeWinner = bronzeOut[bronzeGame.id];
            
            if (bronzeWinner) {
              const winSide = bronzeGame.sides[bronzeWinner];
              const loserSide = bronzeGame.sides[bronzeWinner === "home" ? "away" : "home"];
              const loserInfo = getTeamName(loserSide, bronzeWinner === "home" ? "away" : "home", poolB.key, bronzeGame.id, bracketsOutcomes);
              const loser = {
                name: getName(loserSide, poolB.key) || loserInfo.name,
                team: loserInfo.team,
              };
              if (p === "A") bronze1 = loser;
              else bronze2 = loser;
            }
          }
        });
      } else {
        // Single elimination bronzes
        // Find bronze medal match or third place playoff
        const bronzeMatch = bracket.gamesByRound[bracket.gamesByRound.length - 1];
        if (bronzeMatch?.length >= 2) {
          // If there's a separate bronze medal match
          const bronzeGame = bronzeMatch[1] || bronzeMatch[0]; // Usually the second last game
          const bronzeWinner = finalOutcomes[bronzeGame.id];
          
          if (bronzeWinner) {
            const loserSide = bronzeGame.sides[bronzeWinner === "home" ? "away" : "home"];
            const info = getTeamName(loserSide, bronzeWinner === "home" ? "away" : "home", baseKey, bronzeGame.id, bracketsOutcomes);
            bronze1 = { name: getName(loserSide, baseKey) || info.name, team: info.team };
            
            // For 4+ players, check if there's another bronze
            if (playerCount >= 5) {
              // You may need additional logic here for more players
            }
          }
        }
      }
    }
  } else {
    console.log('Final not declared - all medals blank');
    // 🔴 IMPORTANT: Reset all medals to blank if final not declared
    gold = blank;
    silver = blank;
    bronze1 = blank;
    bronze2 = blank;
  }

  return { gold, silver, bronze1, bronze2 };
};

  // Filtered teams
 // Filtered teams with Tie-Breaker
const filteredTeams = useMemo(() => {
  const teamPoints = {};

  const awardTeam = (team, medal) => {
    if (!team || !team.trim() || team === "Independent") return;
    if (!teamPoints[team]) teamPoints[team] = { gold: 0, silver: 0, bronze: 0, total: 0 };
    if (medal === "gold") {
      teamPoints[team].gold += 1;
      teamPoints[team].total += 3;
    } else if (medal === "silver") {
      teamPoints[team].silver += 1;
      teamPoints[team].total += 2;
    } else if (medal === "bronze") {
      teamPoints[team].bronze += 1;
      teamPoints[team].total += 1;
    }
  };

  brackets.forEach(bracket => {
    const { gender, ageCategory } = bracket;
    if (selectedAge !== "OVERALL" && ageCategory !== selectedAge) return;
    if (selectedGender !== "OVERALL" && gender !== selectedGender) return;

    const { gold, silver, bronze1, bronze2 } = getMedalWinners(bracket);
    const playerCount = bracket.categoryPlayerCount || bracket.playerCount;

    if (gold.name && gold.team) awardTeam(gold.team, "gold");
    if (silver.name && silver.team) awardTeam(silver.team, "silver");
    if (bronze1.name && bronze1.team && playerCount >= 3) awardTeam(bronze1.team, "bronze");
    if (bronze2.name && bronze2.team && playerCount >= 4) awardTeam(bronze2.team, "bronze");
  });

  return Object.entries(teamPoints)
    .map(([team, points]) => ({ team, ...points }))
    .sort((a, b) => {
      // 1. Total Points (descending)
      if (b.total !== a.total) return b.total - a.total;

      // 2. Gold Medals (descending)
      if (b.gold !== a.gold) return b.gold - a.gold;

      // 3. Silver Medals (descending)
      if (b.silver !== a.silver) return b.silver - a.silver;

      // 4. Bronze Medals (descending)
      return b.bronze - a.bronze;
    });
}, [brackets, bracketsOutcomes, selectedAge, selectedGender]);
  // Refresh
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get(`${baseUrl}/tournament/${id}/tiesheet`, config);
      const saved = res.data.tiesheet;
      if (saved?.brackets?.length) {
        setBrackets(saved.brackets);
        setBracketsOutcomes(saved.outcomes || {});
      }
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  };

  // Stats
  const totalTeams = new Set(players.map(p => p.team)).size;
  const totalPlayers = players.length;
  const totalMale = players.filter(p => p.gender === "Male").length;
  const totalFemale = players.filter(p => p.gender === "Female").length;
  const bracketsWithWinners = brackets.filter(bracket => {
    const w = getMedalWinners(bracket);
    return w.gold.name || w.silver.name || w.bronze1.name || w.bronze2.name;
  }).length;

  const pdfPageRef = useRef(null);

  /* ────── PDF Generation (Same as Winner.jsx) ────── */
 const generatePDFDoc = async () => {
  if (!pdfPageRef.current) {
    console.error("PDF page ref not found");
    alert("Page not ready for PDF generation");
    return null;
  }

  const page = pdfPageRef.current;

  // Landscape A4
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
    padding: "15mm",           // Clean margin around content
    boxSizing: "border-box",
  });
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2.2,                // High quality, larger capture
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");

    // A4 landscape dimensions
    const pdfWidth = 297;
    const pdfHeight = 210;

    // Calculate ratio to FIT (not fill) — aspect ratio preserve
    const ratio = Math.min(
      (pdfWidth - 30) / canvas.width,   // 15mm margin left/right
      (pdfHeight - 30) / canvas.height  // 15mm margin top/bottom
    );

    const imgWidth = canvas.width * ratio;
    const imgHeight = canvas.height * ratio;

    // Exact center positioning
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
      doc.save(`Team_Championship_${tournament?.name.replace(/[^a-z0-9]/gi, '_') || "Tournament"}_${id}.pdf`);
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

  if (isLoading) return <div className={styles.loading}>Loading Team Championship...</div>;
  if (error) return <div className={styles.container}><h2>Error: {error}</h2></div>;

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  return (
    <div className={styles.container}>
      {/* Print & Save PDF Buttons */}
      <div className={styles.buttonSection}>
        <div className={styles.pdfButtonWrapper}>
          <button 
            onClick={printAllPDF} 
            className={styles.printButton} 
            disabled={!filteredTeams.length}
          >
            Print
          </button>
          <button 
            onClick={saveAllPDF} 
            className={styles.pdfButton} 
            disabled={!filteredTeams.length}
          >
            Save PDF
          </button>
        </div>
      </div>

      {/* Main Content - Wrapped for PDF */}
    <div ref={pdfPageRef} className={styles.championshipPage}>
        {/* Header */}
        <div className={styles.header}>
          {logoLeft && <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} />}
          <div className={styles.headerContent}>
            <h1 className={styles.tournamentName}>{tournament?.name.toUpperCase()}</h1>
            <p className={styles.federation}>{tournament?.federation}</p>
            <h2 className={styles.title}>
              <Trophy className={styles.trophyIcon} />
              TEAM CHAMPIONSHIP
            </h2>
          </div>
          {logoRight && <img src={logoRight} alt="Logo Right" className={styles.logoRight} />}
        </div>

        {/* Dropdowns */}
        <div className={styles.dropdowns}>
          <div className={styles.dropdownWrapper}>
            <label className={styles.label}>Age Category:</label>
            <select value={selectedAge} onChange={(e) => setSelectedAge(e.target.value)} className={styles.dropdown}>
              {availableAges.map(age => <option key={age} value={age}>{age}</option>)}
            </select>
          </div>
          <div className={styles.dropdownWrapper}>
            <label className={styles.label}>Gender:</label>
            <select value={selectedGender} onChange={(e) => setSelectedGender(e.target.value)} className={styles.dropdown}>
              {availableGenders.map(gender => <option key={gender} value={gender}>{gender}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
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
                  No team points available. Winners need to be declared in brackets first.
                </td>
              </tr>
            ) : (
              filteredTeams.map((teamData, index) => (
                <tr
                  key={teamData.team}
                  className={
                    index === 0 ? styles.highlightGold :
                    index === 1 ? styles.highlightSilver :
                    index === 2 ? styles.highlightBronze : ""
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

        {/* Stats */}
        <div className={styles.stats}>
          <span>Total Teams: {totalTeams}</span>
          <span>Total Players: {totalPlayers}</span>
          <span>Total Male: {totalMale}</span>
          <span>Total Female: {totalFemale}</span>
          <span>Brackets with Winners: {bracketsWithWinners}</span>
        </div>
      </div>
    </div>
  );
};

export default TeamChampionship;