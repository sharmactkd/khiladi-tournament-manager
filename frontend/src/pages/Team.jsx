import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CircleCheck,
  FileDown,
  Printer,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  VenusAndMars,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api, { getEntries } from "../api";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import styles from "./Team.module.css";

const CONDITIONAL_COLUMNS = {
  kyorugi: "Kyorugi",
  fresher: "Fresher",
  tagTeam: "Tag Team",
  poomsae: "Poomsae",
  individual: "Individual",
  pair: "Pair",
  teamPoomsae: "Team Poomsae",
};

const HERO_DOT_COUNT = 126;
const PDF_EXPORT_WIDTH = 1400;

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  const cleanFilename = filename.replace(/^.*[\\/]/, "");
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api$/, "");
  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

const extractEntryRows = (payload) => {
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload)) return payload;
  return [];
};

const filterNonEmptyTeamRows = (rows = []) =>
  rows.filter((row) => String(row?.team || "").trim() !== "");

const formatDobForDisplay = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;

  if (raw.includes("T")) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
        .format(date)
        .replace(/\//g, "-");
    }
  }

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    return `${isoDateOnly[3]}-${isoDateOnly[2]}-${isoDateOnly[1]}`;
  }

  return raw;
};

const formatWeightCategoryForDisplay = (value = "") => {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[–—−]/g, "-")
    .trim();

  if (!raw) return "-";

  const underMatch = raw.match(/under\s*-?\s*(\d+)/i);
  if (underMatch) return `Under - ${underMatch[1]} KG`;

  const overMatch = raw.match(/over\s*-?\s*(\d+)/i);
  if (overMatch) return `Over - ${overMatch[1]} KG`;

  return raw
    .split("(")[0]
    .split("[")[0]
    .split("|")[0]
    .split(":")[0]
    .replace(/\bkg\b/gi, "KG")
    .trim();
};

const HeroDots = () => (
  <div className={styles.heroDots} aria-hidden="true">
    {Array.from({ length: HERO_DOT_COUNT }, (_, index) => (
      <span key={index} style={{ opacity: 0.18 + (index % 14) * 0.035 }} />
    ))}
  </div>
);

const TeamEmblem = () => (
  <svg
    className={styles.teamEmblemIcon}
    viewBox="0 0 96 96"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="48" cy="48" r="42" />
    <circle cx="48" cy="48" r="35" />
    <circle cx="48" cy="32" r="10" />
    <circle cx="25" cy="39" r="8" />
    <circle cx="71" cy="39" r="8" />
    <path d="M29 71v-7c0-13 8-22 19-22s19 9 19 22v7" />
    <path d="M10 69v-5c0-11 6-18 15-18 6 0 11 3 14 8" />
    <path d="M86 69v-5c0-11-6-18-15-18-6 0-11 3-14 8" />
    <path d="M31 78h34" />
  </svg>
);

const StatCard = ({ icon: Icon, label, value, tone = "red" }) => (
  <div className={`${styles.statCard} ${styles[`stat${tone}`] || ""}`}>
    <span className={styles.statIcon} aria-hidden="true">
      <Icon size={21} strokeWidth={2.2} />
    </span>
    <span className={styles.statCopy}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  </div>
);

StatCard.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  tone: PropTypes.string,
};

const Team = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token } = useAuth();

  const outletContext = useOutletContext() || {};
  const access = outletContext.access || outletContext.tournament?.access || {};
  const isTournamentReadOnly = access?.isReadOnly === true;

  const canEditTeamPayments = Boolean(
    !isTournamentReadOnly &&
      access?.canEdit !== false &&
      (access?.hasPremiumAccess || access?.isAdmin)
  );

  const canPrintTeams = access?.canPrint !== false;
  const canExportTeams = access?.canExport !== false;

  const [entryData, setEntryData] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);

  const [visibleSubEventColumns, setVisibleSubEventColumns] = useState({
    ...CONDITIONAL_COLUMNS,
  });

  const [teamsSortConfig, setTeamsSortConfig] = useState({
    key: null,
    direction: "desc",
  });

  const [paymentData, setPaymentData] = useState({});
  const [saveStatus, setSaveStatus] = useState("idle");
  const [pageError, setPageError] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const teamsPageRef = useRef(null);
  const playersPageRef = useRef(null);
  const lastPaymentSnapshotRef = useRef("");

  useEffect(() => {
    const loadPayments = async () => {
      if (!token || !id) return;

      try {
        const res = await api.get(`/tournament/${id}/team-payments`);
        const loadedPayments = res.data.teamPayments || {};
        lastPaymentSnapshotRef.current = JSON.stringify(loadedPayments);
        setPaymentData(loadedPayments);
      } catch (err) {
        console.warn(
          "No payment data on server or error:",
          err?.response?.data?.message || err.message
        );
      }
    };

    if (teamStats.length > 0) {
      loadPayments();
    }
  }, [teamStats.length, id, token]);

  useEffect(() => {
    if (!canEditTeamPayments) return;
    if (Object.keys(paymentData).length === 0 || !token || !id) return;

    const snapshot = JSON.stringify(paymentData);
    if (snapshot === lastPaymentSnapshotRef.current) return;

    const timeoutId = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await api.put(`/tournament/${id}/team-payments`, {
          teamPayments: paymentData,
        });
        lastPaymentSnapshotRef.current = snapshot;
        setSaveStatus("saved");
        window.setTimeout(
          () => setSaveStatus((current) => (current === "saved" ? "idle" : current)),
          2200
        );
      } catch (err) {
        const message = err?.response?.data?.message || err.message || "Payment save failed";
        console.error("Team payment autosave failed:", message);
        setPageError(message);
        setSaveStatus("error");
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [paymentData, id, token, canEditTeamPayments]);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const res = await api.get(`/tournament/${id}`);
        setTournament(res.data);
      } catch (err) {
        console.warn("Could not load tournament details:", err);
        setTournament({ tournamentName: "Tournament Teams", federation: "N/A", logos: [] });
      }
    };

    if (id) {
      fetchTournament();
    }
  }, [id]);

  const processTeamStats = useCallback((data) => {
    const teamMap = new Map();
    const globalCounts = {
      kyorugi: 0,
      fresher: 0,
      tagTeam: 0,
      poomsae: 0,
      individual: 0,
      pair: 0,
      teamPoomsae: 0,
    };

    data.forEach((row) => {
      const teamName = String(row?.team || "").trim();
      if (!teamName) return;

      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          name: teamName,
          totalPlayers: 0,
          malePlayers: 0,
          femalePlayers: 0,
          kyorugi: 0,
          fresher: 0,
          tagTeam: 0,
          poomsae: 0,
          individual: 0,
          pair: 0,
          teamPoomsae: 0,
          coach: row.coach || "",
          coachContact: row.coachContact || "",
          manager: row.manager || "",
          managerContact: row.managerContact || "",
          players: [],
        });
      }

      const team = teamMap.get(teamName);
      team.totalPlayers += 1;

      if (row.gender === "Male") team.malePlayers += 1;
      if (row.gender === "Female") team.femalePlayers += 1;

      if (row.event === "Kyorugi") {
        if (row.subEvent === "Kyorugi") {
          team.kyorugi += 1;
          globalCounts.kyorugi += 1;
        } else if (row.subEvent === "Fresher") {
          team.fresher += 1;
          globalCounts.fresher += 1;
        } else if (row.subEvent === "Tag Team") {
          team.tagTeam += 1;
          globalCounts.tagTeam += 1;
        }
      } else if (row.event === "Poomsae") {
        team.poomsae += 1;
        globalCounts.poomsae += 1;

        if (row.subEvent === "Individual") {
          team.individual += 1;
          globalCounts.individual += 1;
        } else if (row.subEvent === "Pair") {
          team.pair += 1;
          globalCounts.pair += 1;
        } else if (row.subEvent === "Team") {
          team.teamPoomsae += 1;
          globalCounts.teamPoomsae += 1;
        }
      }

      if (!team.coach && row.coach) team.coach = row.coach;
      if (!team.coachContact && row.coachContact) team.coachContact = row.coachContact;
      if (!team.manager && row.manager) team.manager = row.manager;
      if (!team.managerContact && row.managerContact) team.managerContact = row.managerContact;

      team.players.push({ ...row });
    });

    const nextVisible = { ...CONDITIONAL_COLUMNS };
    Object.keys(CONDITIONAL_COLUMNS).forEach((key) => {
      if (globalCounts[key] === 0) delete nextVisible[key];
    });

    setVisibleSubEventColumns(nextVisible);

    const sortedTeams = Array.from(teamMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    setTeamStats(sortedTeams);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadEntryData = async () => {
      try {
        setLoading(true);

        let resolvedRows = [];

        if (token && id) {
          try {
            const serverPayload = await getEntries(id);
            resolvedRows = filterNonEmptyTeamRows(extractEntryRows(serverPayload));

            if (resolvedRows.length > 0) {
              localStorage.setItem(`entryData_${id}`, JSON.stringify(resolvedRows));
            }
          } catch {
            console.warn("Could not fetch entries from server, falling back to local cache.");
          }
        }

        if (resolvedRows.length === 0 && id) {
          const localRaw = localStorage.getItem(`entryData_${id}`);
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            resolvedRows = filterNonEmptyTeamRows(extractEntryRows(parsed));
          }
        }

        if (!mounted) return;

        setEntryData(resolvedRows);
        processTeamStats(resolvedRows);
      } catch (error) {
        console.error("Error loading entry data:", error);
        if (!mounted) return;
        setEntryData([]);
        setTeamStats([]);
        setVisibleSubEventColumns({});
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) {
      loadEntryData();
    }

    const handleDataUpdate = () => {
      if (id) {
        loadEntryData();
      }
    };

    if (id) {
      window.addEventListener(`entryDataUpdated_${id}`, handleDataUpdate);
    }

    return () => {
      mounted = false;
      if (id) {
        window.removeEventListener(`entryDataUpdated_${id}`, handleDataUpdate);
      }
    };
  }, [id, token, processTeamStats]);

  const handleTeamClick = (team) => setSelectedTeam(team);
  const handleBackToTeams = () => setSelectedTeam(null);

  const totalTeams = teamStats.length;

  const sortedTeamStats = useMemo(() => {
    const list = [...teamStats];

    if (teamsSortConfig.key) {
      list.sort((a, b) => {
        const aVal = a[teamsSortConfig.key];
        const bVal = b[teamsSortConfig.key];

        if (typeof aVal === "number") {
          return teamsSortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
        }

        return teamsSortConfig.direction === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [teamStats, teamsSortConfig]);

  const handleTeamsSort = (key) => {
    setTeamsSortConfig((curr) => {
      if (curr.key === key) {
        return curr.direction === "desc"
          ? { key: null, direction: "desc" }
          : { key, direction: "desc" };
      }
      return { key, direction: "desc" };
    });
  };

  const calculateEventFee = (teamName) => {
    if (!tournament?.entryFees || tournament.entryFees.amounts === undefined) return 0;

    const players = entryData.filter((p) => p.team === teamName);
    let total = 0;

    players.forEach((p) => {
      const eventKey = p.event?.toLowerCase();
      const subKey = p.subEvent;
      const feeObj = tournament.entryFees.amounts[eventKey]?.[subKey];

      if (feeObj && feeObj.type !== "Free") {
        total += feeObj.amount || 0;
      }
    });

    return total;
  };

  const foodLodgingFee =
    tournament?.foodAndLodging?.type === "Paid" ? tournament.foodAndLodging.amount || 0 : 0;

  const updatePayment = (teamName, field, value) => {
    if (!canEditTeamPayments) return;

    setPaymentData((prev) => ({
      ...prev,
      [teamName]: { ...prev[teamName], [field]: value },
    }));
  };

  const getTotalFee = (team) => {
    const eventFee = calculateEventFee(team.name);
    const flMembers = paymentData[team.name]?.foodMembers || 0;
    const flFee = foodLodgingFee * flMembers;
    return eventFee + flFee;
  };

  const hasFees =
    tournament?.entryFees &&
    Object.values(tournament.entryFees.amounts || {}).some((cat) =>
      Object.values(cat || {}).some((sub) => sub.type !== "Free")
    );

  const hasFoodLodging =
    tournament?.foodAndLodging?.option && tournament.foodAndLodging.type === "Paid";

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  const totalPlayers = teamStats.reduce((sum, team) => sum + team.totalPlayers, 0);
  const totalMale = teamStats.reduce((sum, team) => sum + team.malePlayers, 0);
  const totalFemale = teamStats.reduce((sum, team) => sum + team.femalePlayers, 0);
  const totalReceivable = teamStats.reduce((sum, team) => sum + getTotalFee(team), 0);
  const totalCollected = teamStats.reduce((sum, team) => {
    const payment = paymentData[team.name] || {};
    return sum + Number(payment.cash || 0) + Number(payment.online || 0);
  }, 0);

  const generatePDFDoc = async (pageRef) => {
    if (!pageRef.current) {
      alert("Page not ready for PDF generation");
      return null;
    }

    const clone = pageRef.current.cloneNode(true);
    clone.classList.add(styles.pdfExport);
    clone.querySelectorAll('[data-screen-only="true"]').forEach((node) => node.remove());
    clone.querySelectorAll("input, select").forEach((control) => {
      const value = control.tagName === "SELECT"
        ? control.options?.[control.selectedIndex]?.text || "-"
        : control.value || "-";
      const text = document.createElement("span");
      text.className = styles.exportControlValue;
      text.textContent = value;
      control.replaceWith(text);
    });

    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "fixed",
      left: "-20000px",
      top: "0",
      width: `${PDF_EXPORT_WIDTH}px`,
      maxWidth: "none",
      background: "#ffffff",
      boxSizing: "border-box",
      pointerEvents: "none",
      zIndex: "-1",
    });

    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(clone.querySelectorAll("img")).map(
          (image) =>
            image.complete ||
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            })
        )
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      const scale = 2;
      const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: PDF_EXPORT_WIDTH,
        height: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: PDF_EXPORT_WIDTH,
        windowHeight: clone.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const pdf = new jsPDF("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 4;
      const availableWidth = pdfWidth - 2 * margin;
      const availableHeight = pdfHeight - 2 * margin;

      const widthRatio = availableWidth / imgWidth;
      const scaledWidth = imgWidth * widthRatio;
      const scaledHeight = imgHeight * widthRatio;

      const totalPages = Math.ceil(scaledHeight / availableHeight);

      for (let i = 0; i < totalPages; i += 1) {
        if (i > 0) pdf.addPage();
        const yOffset = -i * availableHeight;
        pdf.addImage(imgData, "JPEG", margin, margin + yOffset, scaledWidth, scaledHeight);
      }

      return pdf;
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF");
      return null;
    } finally {
      container.remove();
    }
  };

  const savePDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const ref = selectedTeam ? playersPageRef : teamsPageRef;
    try {
      const doc = await generatePDFDoc(ref);
      if (doc) {
        const suffix = selectedTeam
          ? `_${selectedTeam.name.replace(/[^a-z0-9]/gi, "_")}`
          : "_Overview";
        doc.save(
          `Teams_${
            tournament?.tournamentName?.replace(/[^a-z0-9]/gi, "_") || "Tournament"
          }${suffix}_${id}.pdf`
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  const printPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const ref = selectedTeam ? playersPageRef : teamsPageRef;
    try {
      const doc = await generatePDFDoc(ref);
      if (doc) {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        const printWin = window.open(url, "_blank", "noopener,noreferrer");
        if (printWin) printWin.focus();
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.stateShell} role="status">
        <span className={styles.stateIcon}><RefreshCw size={30} /></span>
        <h2>Loading Team Directory</h2>
        <p>Entries, team totals and payments are being prepared.</p>
      </div>
    );
  }

  if (teamStats.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.stateShell}>
          <span className={styles.stateIcon}><Users size={32} /></span>
          <h2>No Teams Found</h2>
          <p>Add players with a Team name on the Entry page to generate this directory.</p>
          <button onClick={() => navigate(`/tournaments/${id}/entry`)} className={styles.primaryButton}>
            <ArrowLeft size={17} /> Go to Entry Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PremiumAccessGuard tournamentId={id}>
        {isTournamentReadOnly && (
          <div className={styles.readOnlyBanner} role="status">
            <ShieldCheck size={18} aria-hidden="true" />
            This tournament is archived and read-only. Team payment edits are locked.
            Print and PDF export remain available.
          </div>
        )}

        {pageError ? (
          <div className={styles.errorBanner} role="alert">
            {pageError}
            <button type="button" onClick={() => setPageError("")}>Dismiss</button>
          </div>
        ) : null}

        <div className={styles.buttonSection} data-screen-only="true">
          <div className={styles.buttonGroupLeft}>
            {selectedTeam ? (
              <button onClick={handleBackToTeams} className={styles.secondaryButton}>
                <ArrowLeft size={17} />
                <span>All Teams</span>
              </button>
            ) : (
              <div className={styles.pageEyebrow}>
                <Building2 size={17} /> Team Directory
              </div>
            )}
            {saveStatus !== "idle" ? (
              <span className={`${styles.saveStatus} ${styles[saveStatus] || ""}`}>
                {saveStatus === "saving" ? "Saving payments…" : null}
                {saveStatus === "saved" ? "All payment changes saved" : null}
                {saveStatus === "error" ? "Payment save failed" : null}
              </span>
            ) : null}
          </div>

          <div className={styles.buttonGroupRight}>
            <button
              onClick={printPDF}
              className={styles.actionButton}
              disabled={!canPrintTeams || isExporting}
            >
              <Printer size={17} />
              <span>{isExporting ? "Preparing…" : "Print"}</span>
            </button>

            <button
              onClick={savePDF}
              className={styles.primaryButton}
              disabled={!canExportTeams || isExporting}
            >
              <FileDown size={17} />
              <span>{isExporting ? "Preparing…" : "Save PDF"}</span>
            </button>
          </div>
        </div>

        {!selectedTeam ? (
          <div ref={teamsPageRef} className={styles.pageContent}>
            <header className={styles.header}>
              <svg className={styles.heroAccent} viewBox="0 0 190 190" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 0H150L190 95L140 190H0Z" />
              </svg>
              <div className={styles.heroEmblem} aria-hidden="true">
                {logoLeft ? <img src={logoLeft} alt="" /> : <TeamEmblem />}
              </div>

              <div className={styles.headerContent}>
                <h1 className={styles.tournamentName}>
                  {tournament?.tournamentName
                    ? tournament.tournamentName.toUpperCase()
                    : "TOURNAMENT TEAMS"}
                </h1>
                <p className={styles.federation}>{tournament?.federation || "N/A"}</p>
                <h2 className={styles.title}>
                  <TeamEmblem />
                  <span>Team Directory</span>
                </h2>
                <span className={styles.heroPill}>{totalTeams} Registered Teams</span>
              </div>

              <HeroDots />
              <span className={styles.heroStripeOne} aria-hidden="true" />
              <span className={styles.heroStripeTwo} aria-hidden="true" />
              {logoRight && logoRight !== logoLeft ? (
                <img src={logoRight} alt="" className={styles.heroLogoRight} />
              ) : null}
            </header>

            <section className={styles.statsGrid} aria-label="Team summary">
              <StatCard icon={Building2} label="Total Teams" value={totalTeams} />
              <StatCard icon={Users} label="Total Players" value={totalPlayers} />
              <StatCard icon={UserRound} label="Male Players" value={totalMale} />
              <StatCard icon={VenusAndMars} label="Female Players" value={totalFemale} />
              {hasFees ? (
                <StatCard icon={WalletCards} label="Total Fees" value={`₹${totalReceivable}`} />
              ) : null}
              {hasFees ? (
                <StatCard icon={CircleCheck} label="Collected" value={`₹${totalCollected}`} />
              ) : null}
            </section>

            <div className={styles.sectionHeading}>
              <span><Building2 size={18} /> Team Overview</span>
              <small>Click any team row to view its complete player list</small>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colSN}>S.N.</th>
                    <th className={styles.colTeamName}>Team Name</th>
                    <th
                      onClick={() => handleTeamsSort("totalPlayers")}
                      className={`${styles.sortableHeader} ${styles.colTotalPlayers}`}
                    >
                      Total
                      <br />
                      Players
                      {teamsSortConfig.key === "totalPlayers" ? (
                        <span className={styles.sortIndicator}>
                          {teamsSortConfig.direction === "desc" ? " ▼" : " ▲"}
                        </span>
                      ) : null}
                    </th>
                    <th className={styles.colGender}>Male</th>
                    <th className={styles.colGender}>Female</th>

                    {visibleSubEventColumns.kyorugi ? (
                      <th className={styles.colSubEvent}>Kyorugi</th>
                    ) : null}
                    {visibleSubEventColumns.fresher ? (
                      <th className={styles.colSubEvent}>Fresher</th>
                    ) : null}
                    {visibleSubEventColumns.tagTeam ? (
                      <th className={styles.colSubEvent}>Tag Team</th>
                    ) : null}
                    {visibleSubEventColumns.poomsae ? (
                      <th className={styles.colSubEvent}>Poomsae</th>
                    ) : null}
                    {visibleSubEventColumns.individual ? (
                      <th className={styles.colSubEvent}>Individual</th>
                    ) : null}
                    {visibleSubEventColumns.pair ? (
                      <th className={styles.colSubEvent}>Pair</th>
                    ) : null}
                    {visibleSubEventColumns.teamPoomsae ? (
                      <th className={styles.colSubEvent}>Team Poomsae</th>
                    ) : null}

                    {hasFoodLodging ? (
                      <th className={styles.colFoodLodging}>
                        Food & Lodging
                        <br />
                        (Members)
                      </th>
                    ) : null}
                    {hasFees ? <th className={styles.colTotalFee}>Total Fee</th> : null}
                    {hasFees ? <th className={styles.colDueAmount}>Due Amount</th> : null}
                    {hasFees ? <th className={styles.colPaymentMode}>Payment Mode</th> : null}
                    {hasFees ? <th className={styles.colCashOnline}>Cash Payment</th> : null}
                    {hasFees ? <th className={styles.colCashOnline}>Online Payment</th> : null}
                    {hasFees ? <th className={styles.colTxnId}>Transaction ID</th> : null}
                    {hasFees ? <th className={styles.colPaymentStatus}>Payment Status</th> : null}

                    <th className={styles.colCoachManager}>Coach</th>
                    <th className={styles.colContact}>Contact</th>
                    <th className={styles.colCoachManager}>Manager</th>
                    <th className={styles.colContact}>Contact</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedTeamStats.map((team, index) => {
                    const pay = paymentData[team.name] || {};
                    const mode = pay.mode || "Cash";
                    const showOnline = mode === "Online" || mode === "Cash + Online";
                    const showCash = mode === "Cash" || mode === "Cash + Online";

                    const paidAmount = Number(pay.cash || 0) + Number(pay.online || 0);
                    const totalDue = getTotalFee(team);

                    const isPaid = paidAmount >= totalDue && paidAmount > 0;
                    const isPartial = paidAmount > 0 && paidAmount < totalDue;

                    const statusCellClass = isPaid
                      ? styles.statusPaidCell
                      : isPartial
                      ? styles.statusPartialCell
                      : styles.statusDueCell;

                    return (
                      <tr
                        key={team.name}
                        onClick={() => handleTeamClick(team)}
                        className={styles.clickableRow}
                      >
                        <td className={styles.colSN}>{index + 1}</td>
                        <td className={styles.colTeamName}>{team.name}</td>
                        <td className={styles.colTotalPlayers}>{team.totalPlayers}</td>
                        <td className={styles.colGender}>{team.malePlayers}</td>
                        <td className={styles.colGender}>{team.femalePlayers}</td>

                        {visibleSubEventColumns.kyorugi ? (
                          <td className={styles.colSubEvent}>{team.kyorugi}</td>
                        ) : null}
                        {visibleSubEventColumns.fresher ? (
                          <td className={styles.colSubEvent}>{team.fresher}</td>
                        ) : null}
                        {visibleSubEventColumns.tagTeam ? (
                          <td className={styles.colSubEvent}>{team.tagTeam}</td>
                        ) : null}
                        {visibleSubEventColumns.poomsae ? (
                          <td className={styles.colSubEvent}>{team.poomsae}</td>
                        ) : null}
                        {visibleSubEventColumns.individual ? (
                          <td className={styles.colSubEvent}>{team.individual}</td>
                        ) : null}
                        {visibleSubEventColumns.pair ? (
                          <td className={styles.colSubEvent}>{team.pair}</td>
                        ) : null}
                        {visibleSubEventColumns.teamPoomsae ? (
                          <td className={styles.colSubEvent}>{team.teamPoomsae}</td>
                        ) : null}

                        {hasFoodLodging ? (
                          <td className={styles.colFoodLodging}>
                            <input
                              type="number"
                              min="0"
                              value={pay.foodMembers || 0}
                              onChange={(e) =>
                                updatePayment(team.name, "foodMembers", Number(e.target.value))
                              }
                              onClick={(e) => e.stopPropagation()}
                              className={styles.paymentInput}
                              disabled={!canEditTeamPayments}
                              readOnly={!canEditTeamPayments}
                            />
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={styles.colTotalFee}>
                            <strong>₹{totalDue}</strong>
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td
                            className={`${styles.colDueAmount} ${
                              !isPaid ? styles.dueAmountCell : ""
                            }`}
                          >
                            <strong>{isPaid ? "-" : `₹${totalDue - paidAmount}`}</strong>
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={styles.colPaymentMode}>
                            <select
                              value={mode}
                              onChange={(e) => updatePayment(team.name, "mode", e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className={styles.paymentInput}
                              disabled={!canEditTeamPayments}
                            >
                              <option>Cash</option>
                              <option>Online</option>
                              <option>Cash + Online</option>
                            </select>
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={styles.colCashOnline}>
                            {showCash ? (
                              <input
                                type="number"
                                value={pay.cash || ""}
                                onChange={(e) => updatePayment(team.name, "cash", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Cash"
                                className={styles.paymentInput}
                                disabled={!canEditTeamPayments}
                                readOnly={!canEditTeamPayments}
                              />
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={styles.colCashOnline}>
                            {showOnline ? (
                              <input
                                type="number"
                                value={pay.online || ""}
                                onChange={(e) => updatePayment(team.name, "online", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Online"
                                className={styles.paymentInput}
                                disabled={!canEditTeamPayments}
                                readOnly={!canEditTeamPayments}
                              />
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={styles.colTxnId}>
                            {showOnline ? (
                              <input
                                type="text"
                                value={pay.txnId || ""}
                                onChange={(e) => updatePayment(team.name, "txnId", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Txn ID"
                                className={styles.paymentInput}
                                disabled={!canEditTeamPayments}
                                readOnly={!canEditTeamPayments}
                              />
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={`${styles.colPaymentStatus} ${statusCellClass}`}>
                            <strong>
                              {isPaid ? "Paid" : isPartial ? "Partial Paid" : "Due"}
                            </strong>
                          </td>
                        ) : null}

                        <td className={styles.colCoachManager}>{team.coach || "-"}</td>
                        <td className={styles.colContact}>{team.coachContact || "-"}</td>
                        <td className={styles.colCoachManager}>{team.manager || "-"}</td>
                        <td className={styles.colContact}>{team.managerContact || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className={styles.pageFooter}>
              <span>Generated by <strong>KHILADI</strong> – Tournament Manager</span>
              <a href="https://khiladi-khoj.com" target="_blank" rel="noopener noreferrer">khiladi-khoj.com</a>
              <span>Team Directory</span>
            </footer>
          </div>
        ) : (
          <div className={styles.detailShell}>
            <div ref={playersPageRef} className={styles.pageContent}>
              <header className={styles.header}>
                <svg className={styles.heroAccent} viewBox="0 0 190 190" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 0H150L190 95L140 190H0Z" />
                </svg>
                <div className={styles.heroEmblem} aria-hidden="true">
                  {logoLeft ? <img src={logoLeft} alt="" /> : <TeamEmblem />}
                </div>

                <div className={styles.headerContent}>
                  <h1 className={styles.tournamentName}>
                    {tournament?.tournamentName
                      ? tournament.tournamentName.toUpperCase()
                      : "TOURNAMENT TEAMS"}
                  </h1>
                  <p className={styles.federation}>{tournament?.federation || "N/A"}</p>
                  <h2 className={styles.title}>
                    <TeamEmblem />
                    <span>{selectedTeam.name.toUpperCase()}</span>
                  </h2>
                  <span className={styles.heroPill}>Team Player Directory</span>
                </div>

                <HeroDots />
                <span className={styles.heroStripeOne} aria-hidden="true" />
                <span className={styles.heroStripeTwo} aria-hidden="true" />
                {logoRight && logoRight !== logoLeft ? (
                  <img src={logoRight} alt="" className={styles.heroLogoRight} />
                ) : null}
              </header>

              <section className={styles.statsGrid} aria-label="Selected team summary">
                <StatCard icon={Users} label="Total Players" value={selectedTeam.totalPlayers} />
                <StatCard icon={UserRound} label="Male Players" value={selectedTeam.malePlayers} />
                <StatCard icon={VenusAndMars} label="Female Players" value={selectedTeam.femalePlayers} />
                <StatCard icon={ShieldCheck} label="Coach" value={selectedTeam.coach || "Not Added"} />
                <StatCard icon={Banknote} label="Team Fee" value={`₹${getTotalFee(selectedTeam)}`} />
              </section>

              <div className={styles.sectionHeading}>
                <span><Users size={18} /> Players List</span>
                <small>{selectedTeam.name}</small>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sr.</th>
                      <th>Title</th>
                      <th>Name</th>
                      <th>Gender</th>
                      <th>DOB</th>
                      <th>Weight</th>
                      <th>Event</th>
                      <th>Sub Event</th>
                      <th>Age Category</th>
                      <th>Weight Category</th>
                      <th>Medal</th>
                      <th>Coach</th>
                      <th>Coach Contact</th>
                      <th>Manager</th>
                      <th>Manager Contact</th>
                      {selectedTeam.players[0]?.fathersName ? <th>Father&apos;s Name</th> : null}
                      {selectedTeam.players[0]?.school ? <th>School</th> : null}
                      {selectedTeam.players[0]?.class ? <th>Class</th> : null}
                    </tr>
                  </thead>

                  <tbody>
                    {selectedTeam.players.map((player, index) => (
                      <tr key={`${player.name || "player"}-${index}`}>
                        <td className={styles.centerCell}>{index + 1}</td>
                        <td>{player.title || "-"}</td>
                        <td>{player.name || "-"}</td>
                        <td className={styles.centerCell}>{player.gender || "-"}</td>
                        <td>{formatDobForDisplay(player.dob)}</td>
                        <td>{player.weight || "-"}</td>
                        <td>{player.event || "-"}</td>
                        <td>{player.subEvent || "-"}</td>
                        <td className={styles.centerCell}>{player.ageCategory || "-"}</td>
                        <td>{formatWeightCategoryForDisplay(player.weightCategory)}</td>
                        <td className={styles.centerCell}>{player.medal || "-"}</td>
                        <td>{player.coach || "-"}</td>
                        <td>{player.coachContact || "-"}</td>
                        <td>{player.manager || "-"}</td>
                        <td>{player.managerContact || "-"}</td>
                        {player.fathersName ? <td>{player.fathersName}</td> : null}
                        {player.school ? <td>{player.school}</td> : null}
                        {player.class ? <td>{player.class}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className={styles.pageFooter}>
                <span>Generated by <strong>KHILADI</strong> – Tournament Manager</span>
                <a href="https://khiladi-khoj.com" target="_blank" rel="noopener noreferrer">khiladi-khoj.com</a>
                <span>{selectedTeam.name}</span>
              </footer>
            </div>
          </div>
        )}
      </PremiumAccessGuard>
    </div>
  );
};

export default Team;