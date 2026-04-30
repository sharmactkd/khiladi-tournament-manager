import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Medal as MedalIcon } from "lucide-react";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import styles from "./Winner.module.css";

const EVENT_ORDER = ["OVERALL", "KYORUGI", "POOMSAE", "FRESHER", "TAG TEAM"];

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

const normalizeText = (value) => String(value || "").trim();

const normalizeGender = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (["male", "m", "boy", "boys"].includes(v)) return "Male";
  if (["female", "f", "girl", "girls"].includes(v)) return "Female";
  return normalizeText(value);
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

const getEventType = (player) => {
  const event = String(player?.event || "").trim().toLowerCase();
  const subEvent = String(player?.subEvent || "").trim().toLowerCase();

  if (subEvent.includes("tag")) return "TAG TEAM";
  if (subEvent.includes("fresher") || subEvent.includes("freshers")) return "FRESHER";
  if (event.includes("poomsae")) return "POOMSAE";
  if (event.includes("kyorugi")) return "KYORUGI";

  return "";
};

const getWeightSortValue = (weightCategory = "") => {
  const text = String(weightCategory).toLowerCase();

  const underMatch = text.match(/under\s*-?\s*(\d+)|u\s*-?\s*(\d+)/);
  if (underMatch) return Number(underMatch[1] || underMatch[2]);

  const overMatch = text.match(/over\s*-?\s*(\d+)/);
  if (overMatch) return Number(overMatch[1]) + 1000;

  const anyNumber = text.match(/(\d+)/);
  if (anyNumber) return Number(anyNumber[1]);

  return 9999;
};

const medalOrder = {
  Gold: 1,
  Silver: 2,
  Bronze: 3,
};

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

const sortByAgeGenderWeight = (a, b) => {
  const ageA = ageCategoryOrder.indexOf(a.age);
  const ageB = ageCategoryOrder.indexOf(b.age);

  if (ageA !== ageB) return (ageA === -1 ? 999 : ageA) - (ageB === -1 ? 999 : ageB);

  const genderA = genderOrder.indexOf(a.gender);
  const genderB = genderOrder.indexOf(b.gender);

  if (genderA !== genderB) return (genderA === -1 ? 999 : genderA) - (genderB === -1 ? 999 : genderB);

  return getWeightSortValue(a.weightCategory) - getWeightSortValue(b.weightCategory);
};

const PageHeader = ({ tournamentName, federation, logoLeft, logoRight, age, gender, selectedEvent }) => (
  <div className={styles.pageHeader}>
    {logoLeft && (
      <img
        src={logoLeft}
        alt="Logo Left"
        className={styles.logoLeft}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    )}

    <div className={styles.headerContent}>
      <h1 className={styles.tournamentName}>{String(tournamentName || "").toUpperCase()}</h1>
      <p className={styles.federation}>{federation}</p>

      <h2 className={styles.medalTitle}>
        {selectedEvent === "OVERALL" ? "MEDAL WINNERS" : `${selectedEvent} MEDAL WINNERS`}
      </h2>

      <h3 className={styles.ageGenderTitle}>
        {age} - {String(gender || "").toUpperCase()}
      </h3>
    </div>

    {logoRight && (
      <img
        src={logoRight}
        alt="Logo Right"
        className={styles.logoRight}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    )}
  </div>
);

const PageFooter = ({ pageIdx, totalPages }) => (
  <div className={styles.pageFooter}>
    <div className={styles.footerContent}>
      <span className={styles.footerText}>Generated by EVOLVE - Tournament Manager | www.khiladi.com</span>
      <span className={styles.pageNumber}>
        Page {pageIdx + 1} of {totalPages} |{" "}
        {new Date().toLocaleString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })}
      </span>
    </div>
  </div>
);

const Winner = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const { token, isAuthenticated } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState("KYORUGI");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

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

        const td = tournamentRes.data;

        setTournament({
          name: td.tournamentName || "Unnamed Tournament",
          federation: td.federation || "N/A",
          logos: td.logos || [],
        });

        const rows = Array.isArray(entriesRes?.data?.entries) ? entriesRes.data.entries : [];

        const normalizedRows = rows
          .map((p) => {
            const normalized = {
              ...p,
              name: normalizeText(p.name),
              team: normalizeText(p.team),
              gender: normalizeGender(p.gender),
              ageCategory: normalizeAgeCategory(p.ageCategory),
              weightCategory: normalizeText(p.weightCategory),
              medal: normalizeMedal(p.medal),
              event: normalizeText(p.event),
              subEvent: normalizeText(p.subEvent),
            };

            return {
              ...normalized,
              eventType: getEventType(normalized),
            };
          })
          .filter((p) => p.name && p.gender && p.ageCategory && p.weightCategory && p.medal);

        setPlayers(normalizedRows);
      } catch (err) {
        console.error("Winner page load failed:", err);
        setError(err?.message || "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchData();
  }, [id, token]);

  const availableEvents = useMemo(() => {
    const foundEvents = [...new Set(players.map((p) => p.eventType).filter(Boolean))].sort(
      (a, b) => EVENT_ORDER.indexOf(a) - EVENT_ORDER.indexOf(b)
    );

    return ["OVERALL", ...foundEvents];
  }, [players]);

  useEffect(() => {
    if (!availableEvents.includes(selectedEvent)) {
      setSelectedEvent("KYORUGI");
    }
  }, [availableEvents, selectedEvent]);

  const filteredPlayers = useMemo(() => {
    if (selectedEvent === "OVERALL") return players;
    return players.filter((player) => player.eventType === selectedEvent);
  }, [players, selectedEvent]);

  const grouped = useMemo(() => {
    const pageMap = new Map();

    filteredPlayers.forEach((player) => {
      const pageKey = `${player.gender}_${player.ageCategory}`;
      const weightKey = player.weightCategory || "Unknown";

      if (!pageMap.has(pageKey)) {
        pageMap.set(pageKey, {
          gender: player.gender,
          age: player.ageCategory,
          weights: new Map(),
        });
      }

      const page = pageMap.get(pageKey);

      if (!page.weights.has(weightKey)) {
        page.weights.set(weightKey, []);
      }

      page.weights.get(weightKey).push(player);
    });

    const pages = Array.from(pageMap.values()).map((page) => ({
      ...page,
      weights: Array.from(page.weights.entries())
        .map(([weightCategory, medalRows]) => ({
          weightCategory,
          rows: medalRows.sort((a, b) => {
            const medalDiff = (medalOrder[a.medal] || 99) - (medalOrder[b.medal] || 99);
            if (medalDiff !== 0) return medalDiff;
            return String(a.name || "").localeCompare(String(b.name || ""));
          }),
        }))
        .sort((a, b) => getWeightSortValue(a.weightCategory) - getWeightSortValue(b.weightCategory)),
    }));

    return pages.sort(sortByAgeGenderWeight);
  }, [filteredPlayers]);

  const hasWinners = grouped.length > 0;

  const generatePDFDoc = async () => {
    const pages = document.querySelectorAll(`.${styles.winnerPage}`);
    if (!pages.length) return null;

    const doc = new jsPDF("p", "mm", "a4");

    for (let i = 0; i < pages.length; i += 1) {
      if (i > 0) doc.addPage();

      const clone = pages[i].cloneNode(true);
      const container = document.createElement("div");

      Object.assign(container.style, {
        position: "absolute",
        left: "-9999px",
        width: "210mm",
        height: "297mm",
        background: "#fff",
      });

      container.appendChild(clone);
      document.body.appendChild(container);

      try {
        const canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#fff",
          width: 794,
          height: 1123,
        });

        const img = canvas.toDataURL("image/png");
        doc.addImage(img, "PNG", 0, 0, 210, 297);
      } finally {
        document.body.removeChild(container);
      }
    }

    return doc;
  };

  const saveAllPDF = async () => {
    const doc = await generatePDFDoc();
    if (doc) {
      doc.save(`Medal_Winners_${selectedEvent}_${tournament?.name || "Tournament"}_${id}.pdf`);
    }
  };

  const printAllPDF = async () => {
    const doc = await generatePDFDoc();

    if (doc) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 15000);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div>Loading medal winners...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2 className={styles.errorTitle}>Error Loading Winners</h2>
        <p className={styles.errorMessage}>{error}</p>

        <button className={styles.retryButton} onClick={() => window.location.reload()}>
          Retry
        </button>

        <button className={styles.backButton} onClick={() => window.history.back()}>
          Go Back
        </button>
      </div>
    );
  }

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  const medalIconCls = {
    Gold: styles.medalIconGold,
    Silver: styles.medalIconSilver,
    Bronze: styles.medalIconBronze,
  };

  return (
    <div className={styles.winnerContainer}>
       <PremiumAccessGuard tournamentId={id}>
      <div className={styles.buttonSection}>
        <div className={styles.pdfButtonWrapper}>
          <button onClick={printAllPDF} className={styles.printButton} disabled={!hasWinners}>
            Print
          </button>

          <button onClick={saveAllPDF} className={styles.pdfButton} disabled={!hasWinners}>
            Save PDF
          </button>
        </div>

        <div className={styles.eventToggleWrapper}>
          {availableEvents.map((eventName) => (
            <button
              key={eventName}
              type="button"
              onClick={() => setSelectedEvent(eventName)}
              className={`${styles.eventToggleButton} ${
                selectedEvent === eventName ? styles.eventToggleActive : ""
              }`}
            >
              {eventName}
            </button>
          ))}
        </div>
      </div>

      {hasWinners ? (
        grouped.map((page, catIdx) => (
          <div key={`${selectedEvent}_${page.gender}_${page.age}`} className={styles.winnerPage}>
            <PageHeader
              tournamentName={tournament?.name}
              federation={tournament?.federation}
              logoLeft={logoLeft}
              logoRight={logoRight}
              age={page.age}
              gender={page.gender}
              selectedEvent={selectedEvent}
            />

            <div className={styles.tableContainer}>
              <table className={styles.medalTable}>
                <thead>
                  <tr>
                    <th className={styles.weightHeader}>Weight Category</th>
                    <th className={styles.medalHeader}>Medal</th>
                    <th className={styles.participantHeader}>Name</th>
                    <th className={styles.teamHeader}>Team</th>
                    <th className={styles.markHeader}>Mark</th>
                  </tr>
                </thead>

                <tbody>
                  {page.weights.map((group) =>
                    group.rows.map((r, i) => (
                      <tr key={`${page.gender}_${page.age}_${group.weightCategory}_${r.medal}_${r.name}_${i}`}>
                        {i === 0 && (
                          <td rowSpan={group.rows.length} className={`${styles.weightCell} ${styles.weightCellFirst}`}>
                            {group.weightCategory}
                          </td>
                        )}

                        <td className={styles.medalCell}>
                          <div className={styles.medalContainer}>
                            <MedalIcon className={`${styles.medalIcon} ${medalIconCls[r.medal]}`} />
                            <span className={styles.medalText}>{r.medal}</span>
                          </div>
                        </td>

                        <td className={`${styles.participantCell} ${styles.winnerName}`}>
                          <strong>{r.name || "TBD"}</strong>
                        </td>

                        <td className={styles.teamCell}>
                          {r.team ? <span className={styles.teamName}>{r.team}</span> : <span className={styles.noTeam}>-</span>}
                        </td>

                        <td className={styles.markCell}></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <PageFooter pageIdx={catIdx} totalPages={grouped.length} />
          </div>
        ))
      ) : (
        <div className={styles.noWinnersContainer}>
          <MedalIcon className={styles.noWinnersIcon} />

          <h2 className={styles.noWinnersTitle}>No {selectedEvent} Winners Yet!</h2>

          <p className={styles.noWinnersText}>
            No results found for <strong>{selectedEvent}</strong>. Please declare medals in the{" "}
            <strong>Entry</strong> section or declare winners in the <strong>Tie Sheet</strong> section first.
          </p>

          <button
            className={styles.goToTieSheetButton}
            onClick={() => {
              window.location.href = `/tournaments/${id}/tie-sheet`;
            }}
          >
            Go to Tie Sheet
          </button>
        </div>
      )}
      </PremiumAccessGuard>
    </div>
        
  );
};

export default Winner;