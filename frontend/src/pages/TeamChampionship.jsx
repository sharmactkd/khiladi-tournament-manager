// src/pages/TeamChampionship.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  FileDown,
  Mars,
  Medal,
  Printer,
  RefreshCw,
  Trophy,
  UserRound,
  Users,
  Venus,
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuth } from "../context/AuthContext";
import api from "../api";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import styles from "./TeamChampionship.module.css";

const EVENT_FILTERS = ["OVERALL", "KYORUGI", "POOMSAE", "FRESHER", "TAG TEAM"];
const PDF_EXPORT_WIDTH = 1400;
const HERO_DOT_COUNT = 126;

const EMPTY_STATS = {
  totalTeams: 0,
  totalPlayers: 0,
  totalMale: 0,
  totalFemale: 0,
  medalWinners: 0,
};

const PODIUM_CONFIG = [
  { rank: 1, label: "Champion", variant: "gold" },
  { rank: 2, label: "Runner-up", variant: "silver" },
  { rank: 3, label: "Third place", variant: "bronze" },
];

const HeroDots = () => (
  <div className={styles.heroDots} aria-hidden="true">
    {Array.from({ length: HERO_DOT_COUNT }, (_, index) => (
      <span key={index} />
    ))}
  </div>
);

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (/^https?:\/\//i.test(filename)) return filename;

  const cleanFilename = String(filename).replace(/^.*[\\/]/, "");
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");

  return `${uploadsUrl}/uploads/${cleanFilename}`;
};

const safeFilePart = (value, fallback) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
};

const waitForImages = async (root) => {
  const images = Array.from(root?.querySelectorAll?.("img") || []);

  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }),
  );
};

const nextAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const openPDFPrintPreview = (pdfBlob) =>
  new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(pdfBlob);
    const printFrame = document.createElement("iframe");
    let settled = false;

    const cleanup = () => {
      window.setTimeout(() => {
        printFrame.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60_000);
    };

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    Object.assign(printFrame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });

    printFrame.setAttribute("title", "Team Championship print document");
    printFrame.setAttribute("aria-hidden", "true");

    printFrame.onload = () => {
      window.setTimeout(() => {
        try {
          const frameWindow = printFrame.contentWindow;

          if (!frameWindow) {
            throw new Error("The browser could not open the print preview.");
          }

          frameWindow.focus();
          frameWindow.print();
          window.focus();
          finish(resolve);
          cleanup();
        } catch (printError) {
          finish(() => reject(printError));
          cleanup();
        }
      }, 250);
    };

    printFrame.onerror = () => {
      finish(() => reject(new Error("The PDF could not be loaded for printing.")));
      cleanup();
    };

    document.body.appendChild(printFrame);
    printFrame.src = blobUrl;
  });

const PodiumTrophy = ({ rank }) => (
  <svg
    className={styles.premiumTrophy}
    viewBox="0 0 64 64"
    role="img"
    aria-label={`Rank ${rank}`}
  >
    <path
      className={styles.trophyHandle}
      d="M18 15H9v5c0 8 4.6 13 12.2 13M46 15h9v5c0 8-4.6 13-12.2 13"
    />
    <path
      className={styles.trophyBody}
      d="M17 9h30v11c0 13.2-6.6 22-15 22S17 33.2 17 20V9Z"
    />
    <path
      className={styles.trophyShine}
      d="M22 13h5v8.5c0 7.1 2.4 12.1 6.2 15.7C26.8 36.2 22 29.6 22 20.5V13Z"
    />
    <path className={styles.trophyStem} d="M29 40h6v9h-6z" />
    <path
      className={styles.trophyBase}
      d="M23 48h18a3 3 0 0 1 3 3v4H20v-4a3 3 0 0 1 3-3Z"
    />
    <path className={styles.trophyBaseLine} d="M18 56h28" />
    <text className={styles.trophyRank} x="32" y="29">
      {rank}
    </text>
  </svg>
);

const PodiumCard = ({ team, config }) => {
  if (!team || !config) return null;

  return (
    <article
      className={`${styles.podiumCard} ${styles[config.variant]}`}
      aria-label={`${config.label}: ${team.team || "Unknown team"}`}
    >
      <div className={styles.rankMedallion} aria-hidden="true">
        <PodiumTrophy rank={config.rank} />
      </div>

      <div className={styles.podiumContent}>
        <div className={styles.podiumHeading}>
          <div>
            <span className={styles.podiumEyebrow}>{config.label}</span>
            <h3 title={team.team || ""}>{team.team || "Unknown Team"}</h3>
          </div>

          <div className={styles.pointsPill}>
            <strong>{Number(team.total || 0)}</strong>
            <span>PTS</span>
          </div>
        </div>

        <div className={styles.podiumMedals}>
          <div>
            <span className={`${styles.smallMedal} ${styles.smallGold}`}>
              <Medal size={14} aria-hidden="true" />
            </span>
            <strong>{Number(team.gold || 0)}</strong>
            <small>Gold</small>
          </div>

          <div>
            <span className={`${styles.smallMedal} ${styles.smallSilver}`}>
              <Medal size={14} aria-hidden="true" />
            </span>
            <strong>{Number(team.silver || 0)}</strong>
            <small>Silver</small>
          </div>

          <div>
            <span className={`${styles.smallMedal} ${styles.smallBronze}`}>
              <Medal size={14} aria-hidden="true" />
            </span>
            <strong>{Number(team.bronze || 0)}</strong>
            <small>Bronze</small>
          </div>
        </div>
      </div>
    </article>
  );
};

const StatCard = ({ icon: Icon, label, value }) => (
  <article className={styles.statCard}>
    <div className={styles.statIcon} aria-hidden="true">
      <Icon size={25} strokeWidth={2.1} />
    </div>

    <div>
      <span>{label}</span>
      <strong>{Number(value || 0)}</strong>
    </div>
  </article>
);

const TeamChampionship = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [filteredTeams, setFilteredTeams] = useState([]);
  const [availableEvents, setAvailableEvents] = useState(["OVERALL"]);
  const [availableAges, setAvailableAges] = useState(["OVERALL"]);
  const [availableGenders, setAvailableGenders] = useState(["OVERALL"]);
  const [stats, setStats] = useState(EMPTY_STATS);

  const [selectedEvent, setSelectedEvent] = useState("KYORUGI");
  const [selectedAge, setSelectedAge] = useState("OVERALL");
  const [selectedGender, setSelectedGender] = useState("OVERALL");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const pdfPageRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) navigate("/login");
  }, [isAuthenticated, navigate]);

  const applyChampionshipResponse = useCallback((championshipData = {}) => {
    const nextEvents = Array.isArray(championshipData.availableEvents)
      ? championshipData.availableEvents
          .filter((eventName) => EVENT_FILTERS.includes(eventName))
          .sort(
            (left, right) =>
              EVENT_FILTERS.indexOf(left) - EVENT_FILTERS.indexOf(right),
          )
      : ["OVERALL"];

    setFilteredTeams(
      Array.isArray(championshipData.teams) ? championshipData.teams : [],
    );
    setAvailableEvents(nextEvents.length ? nextEvents : ["OVERALL"]);
    setAvailableAges(
      Array.isArray(championshipData.availableAges) &&
        championshipData.availableAges.length
        ? championshipData.availableAges
        : ["OVERALL"],
    );
    setAvailableGenders(
      Array.isArray(championshipData.availableGenders) &&
        championshipData.availableGenders.length
        ? championshipData.availableGenders
        : ["OVERALL"],
    );
    setStats({
      ...EMPTY_STATS,
      ...(championshipData.stats || {}),
    });
  }, []);

  const fetchChampionship = useCallback(async () => {
    const response = await api.get(
      `/tournament/${id}/team-championship?event=${encodeURIComponent(
        selectedEvent,
      )}&age=${encodeURIComponent(selectedAge)}&gender=${encodeURIComponent(
        selectedGender,
      )}&ts=${Date.now()}`,
    );

    applyChampionshipResponse(response.data || {});
  }, [
    applyChampionshipResponse,
    id,
    selectedAge,
    selectedEvent,
    selectedGender,
  ]);

  useEffect(() => {
    if (!id || !isAuthenticated) return undefined;

    let active = true;

    const loadPage = async () => {
      try {
        setIsLoading(true);
        setError("");

        const [tournamentResponse, championshipResponse] = await Promise.all([
          api.get(`/tournament/${id}`),
          api.get(
            `/tournament/${id}/team-championship?event=${encodeURIComponent(
              selectedEvent,
            )}&age=${encodeURIComponent(
              selectedAge,
            )}&gender=${encodeURIComponent(selectedGender)}&ts=${Date.now()}`,
          ),
        ]);

        if (!active) return;

        const tournamentData = tournamentResponse.data || {};
        setTournament({
          name: tournamentData.tournamentName || "Unnamed Tournament",
          federation: tournamentData.federation || "N/A",
          logos: Array.isArray(tournamentData.logos)
            ? tournamentData.logos
            : [],
        });

        applyChampionshipResponse(championshipResponse.data || {});
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            "Failed to load Team Championship.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadPage();

    return () => {
      active = false;
    };
  }, [
    applyChampionshipResponse,
    id,
    isAuthenticated,
    selectedAge,
    selectedEvent,
    selectedGender,
  ]);

  useEffect(() => {
    if (!availableEvents.includes(selectedEvent)) {
      setSelectedEvent(
        availableEvents.includes("KYORUGI")
          ? "KYORUGI"
          : availableEvents[0] || "OVERALL",
      );
    }
  }, [availableEvents, selectedEvent]);

  useEffect(() => {
    if (!availableAges.includes(selectedAge)) setSelectedAge("OVERALL");
  }, [availableAges, selectedAge]);

  useEffect(() => {
    if (!availableGenders.includes(selectedGender)) {
      setSelectedGender("OVERALL");
    }
  }, [availableGenders, selectedGender]);

  const podiumTeams = useMemo(
    () =>
      filteredTeams
        .slice(0, 3)
        .map((team, index) => ({ team, config: PODIUM_CONFIG[index] })),
    [filteredTeams],
  );

  const logoLeft = tournament?.logos?.[0]
    ? getFullImageUrl(tournament.logos[0])
    : "";
  const logoRight = tournament?.logos?.[1]
    ? getFullImageUrl(tournament.logos[1])
    : "";

  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      setError("");
      await fetchChampionship();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Failed to refresh Team Championship.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const generatePDFDoc = async () => {
    if (!pdfPageRef.current) {
      throw new Error("Championship page is not ready for export.");
    }

    const source = pdfPageRef.current;
    const exportWidth = PDF_EXPORT_WIDTH;
    const clone = source.cloneNode(true);
    const exportHost = document.createElement("div");

    clone.classList.add(styles.pdfExport);
    clone.style.width = `${PDF_EXPORT_WIDTH}px`;
    clone.style.maxWidth = "none";
    clone
      .querySelectorAll('[data-screen-only="true"]')
      .forEach((element) => element.remove());

    clone.querySelectorAll("select").forEach((select) => {
      const selectedOption = select.options?.[select.selectedIndex];
      const value = document.createElement("span");
      const isEventSelect = Boolean(
        select.closest(`.${styles.eventSelectWrapper}`),
      );

      value.className = isEventSelect
        ? `${styles.exportSelectValue} ${styles.exportEventSelectValue}`
        : styles.exportSelectValue;
      value.textContent = selectedOption?.textContent || select.value || "OVERALL";

      const wrapper = select.parentElement;
      select.replaceWith(value);
      wrapper?.querySelector("svg")?.remove();

      if (isEventSelect) {
        wrapper
          ?.querySelector(`.${styles.eventPrintValue}`)
          ?.remove();
      }
    });

    Object.assign(exportHost.style, {
      position: "fixed",
      left: "-12000px",
      top: "0",
      width: `${exportWidth}px`,
      background: "#ffffff",
      padding: "0",
      margin: "0",
      zIndex: "-1",
    });

    exportHost.appendChild(clone);
    document.body.appendChild(exportHost);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await waitForImages(clone);
      await nextAnimationFrame();
      await nextAnimationFrame();

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: exportWidth,
        windowHeight: Math.ceil(clone.scrollHeight),
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDocument) => {
          clonedDocument.documentElement.style.backgroundColor = "#ffffff";
          clonedDocument.body.style.backgroundColor = "#ffffff";
        },
      });

      const doc = new jsPDF("l", "mm", "a4");
      const pdfWidth = 297;
      const pdfHeight = 210;
      const safeMargin = 6;
      const usableWidth = pdfWidth - safeMargin * 2;
      const usableHeight = pdfHeight - safeMargin * 2;
      const ratio = Math.min(
        usableWidth / canvas.width,
        usableHeight / canvas.height,
      );
      const imageWidth = canvas.width * ratio;
      const imageHeight = canvas.height * ratio;

      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (pdfWidth - imageWidth) / 2,
        (pdfHeight - imageHeight) / 2,
        imageWidth,
        imageHeight,
        undefined,
        "NONE",
      );

      return doc;
    } finally {
      exportHost.remove();
    }
  };

  const saveAllPDF = async () => {
    try {
      setIsExporting(true);
      const doc = await generatePDFDoc();
      doc.save(
        `Team_Championship_${safeFilePart(
          selectedEvent,
          "Overall",
        )}_${safeFilePart(tournament?.name, "Tournament")}_${id}.pdf`,
      );
    } catch (exportError) {
      console.error("Team Championship PDF export failed:", exportError);
      setError(exportError?.message || "Failed to save Team Championship PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const printAllPDF = async () => {
    try {
      setIsExporting(true);
      const doc = await generatePDFDoc();
      await openPDFPrintPreview(doc.output("blob"));
    } catch (exportError) {
      console.error("Team Championship print export failed:", exportError);
      setError(
        exportError?.message || "Failed to prepare Team Championship print.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite">
        <span className={styles.loadingSpinner} />
        <strong>Loading Team Championship...</strong>
      </div>
    );
  }

  return (
    <PremiumAccessGuard tournamentId={id}>
      <main className={styles.container}>
        {error ? (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" onClick={refreshData}>
              Try again
            </button>
          </div>
        ) : null}

        <section ref={pdfPageRef} className={styles.championshipPage}>
          <header className={styles.hero}>
            <svg
              className={styles.heroAccent}
              viewBox="0 0 180 188"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                className={styles.heroAccentShape}
                d="M0 0H148L180 94L130 188H0Z"
              />
            </svg>

            <div className={styles.heroEmblem}>
              {logoLeft ? (
                <img src={logoLeft} alt="Tournament logo" />
              ) : (
                <Trophy size={57} strokeWidth={1.8} aria-hidden="true" />
              )}
            </div>

            <div className={styles.heroContent}>
              <h1>{tournament?.name || "Tournament"}</h1>
              <p>{tournament?.federation || "Tournament Federation"}</p>

              <h2>
                <Trophy size={30} strokeWidth={2} aria-hidden="true" />
                <span>Team Championship</span>
              </h2>

              <div className={styles.eventSelectWrapper}>
                <select
                  value={selectedEvent}
                  onChange={(event) => setSelectedEvent(event.target.value)}
                  aria-label="Championship event"
                >
                  {availableEvents.map((eventName) => (
                    <option key={eventName} value={eventName}>
                      {eventName}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
                <span className={styles.eventPrintValue} aria-hidden="true">
                  {selectedEvent}
                </span>
              </div>
            </div>

            <HeroDots />
            <div className={styles.heroStripes} aria-hidden="true" />

            {logoRight ? (
              <img
                src={logoRight}
                alt="Federation logo"
                className={styles.heroRightLogo}
              />
            ) : null}
          </header>

          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <label className={styles.filterControl}>
                <span className={styles.filterIcon}>
                  <Users size={23} aria-hidden="true" />
                </span>
                <span className={styles.filterText}>
                  <small>Age Category</small>
                  <span className={styles.selectShell}>
                    <select
                      value={selectedAge}
                      onChange={(event) => setSelectedAge(event.target.value)}
                    >
                      {availableAges.map((age) => (
                        <option key={age} value={age}>
                          {age}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} aria-hidden="true" />
                  </span>
                </span>
              </label>

              <span className={styles.filterDivider} aria-hidden="true" />

              <label className={styles.filterControl}>
                <span className={styles.filterIcon}>
                  <UserRound size={23} aria-hidden="true" />
                </span>
                <span className={styles.filterText}>
                  <small>Gender</small>
                  <span className={styles.selectShell}>
                    <select
                      value={selectedGender}
                      onChange={(event) =>
                        setSelectedGender(event.target.value)
                      }
                    >
                      {availableGenders.map((gender) => (
                        <option key={gender} value={gender}>
                          {gender}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} aria-hidden="true" />
                  </span>
                </span>
              </label>
            </div>

            <div
              className={styles.actionButtons}
              data-screen-only="true"
              aria-label="Team Championship actions"
            >
              <button
                type="button"
                onClick={refreshData}
                disabled={isRefreshing || isExporting}
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? styles.spinning : ""}
                  aria-hidden="true"
                />
                <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>

              <button
                type="button"
                onClick={printAllPDF}
                disabled={!filteredTeams.length || isExporting}
              >
                <Printer size={18} aria-hidden="true" />
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={saveAllPDF}
                disabled={!filteredTeams.length || isExporting}
              >
                <FileDown size={18} aria-hidden="true" />
                <span>{isExporting ? "Preparing..." : "Save PDF"}</span>
              </button>
            </div>
          </div>

          {podiumTeams.length ? (
            <section className={styles.podiumGrid} aria-label="Top teams">
              {podiumTeams.map(({ team, config }) => (
                <PodiumCard
                  key={`${config.rank}-${team.team}`}
                  team={team}
                  config={config}
                />
              ))}
            </section>
          ) : null}

          <section className={styles.leaderboardCard}>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>
                      <span className={styles.headingWithMedal}>
                        <Medal size={17} /> Gold
                      </span>
                    </th>
                    <th>
                      <span className={styles.headingWithMedal}>
                        <Medal size={17} /> Silver
                      </span>
                    </th>
                    <th>
                      <span className={styles.headingWithMedal}>
                        <Medal size={17} /> Bronze
                      </span>
                    </th>
                    <th>Total Points</th>
                  </tr>
                </thead>

                <tbody>
                  {!filteredTeams.length ? (
                    <tr>
                      <td colSpan={6} className={styles.noData}>
                        No team points are available for the selected filters.
                        Declare medals in Entry or winners in TieSheet first.
                      </td>
                    </tr>
                  ) : (
                    filteredTeams.map((team, index) => (
                      <tr key={`${team.team}-${index}`}>
                        <td className={styles.rankCell}>#{index + 1}</td>
                        <td className={styles.teamCell} title={team.team || ""}>
                          {team.team || "Unknown Team"}
                        </td>
                        <td>{Number(team.gold || 0)}</td>
                        <td>{Number(team.silver || 0)}</td>
                        <td>{Number(team.bronze || 0)}</td>
                        <td className={styles.totalCell}>
                          {Number(team.total || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.statsGrid} aria-label="Tournament summary">
            <StatCard
              icon={Users}
              label="Total Teams"
              value={stats.totalTeams}
            />
            <StatCard
              icon={UserRound}
              label="Total Players"
              value={stats.totalPlayers}
            />
            <StatCard icon={Mars} label="Total Male" value={stats.totalMale} />
            <StatCard
              icon={Venus}
              label="Total Female"
              value={stats.totalFemale}
            />
            <StatCard
              icon={Medal}
              label="Medal Winners"
              value={stats.medalWinners}
            />
          </section>
        </section>
      </main>
    </PremiumAccessGuard>
  );
};

export default TeamChampionship;