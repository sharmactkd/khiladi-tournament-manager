import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { FaPrint, FaFilePdf } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { getEntries } from "../api";
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

const Team = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token } = useAuth();

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

  const teamsPageRef = useRef(null);
  const playersPageRef = useRef(null);

  useEffect(() => {
    const loadPayments = async () => {
      if (!token || !id) return;

      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const res = await axios.get(`${baseUrl}/tournament/${id}/team-payments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPaymentData(res.data.teamPayments || {});
      } catch (err) {
        console.warn("No payment data on server or error:", err.message);
      }
    };

    if (teamStats.length > 0) {
      loadPayments();
    }
  }, [teamStats.length, id, token]);

  useEffect(() => {
    if (Object.keys(paymentData).length === 0 || !token || !id) return;

    const timeoutId = setTimeout(async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        await axios.put(
          `${baseUrl}/tournament/${id}/team-payments`,
          { teamPayments: paymentData },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } catch (err) {
        console.error("Auto-save failed:", err.message);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [paymentData, id, token]);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const res = await axios.get(`${baseUrl}/tournament/${id}`);
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
          } catch (serverError) {
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

  const generatePDFDoc = async (pageRef) => {
    if (!pageRef.current) {
      alert("Page not ready for PDF generation");
      return null;
    }

    const element = pageRef.current;
    const clone = element.cloneNode(true);

    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "absolute",
      left: "-9999px",
      top: "-9999px",
      width: "auto",
      maxWidth: "none",
      background: "#ffffff",
      boxSizing: "border-box",
    });

    container.appendChild(clone);
    document.body.appendChild(container);

    const style = document.createElement("style");
    style.textContent = ``;
    clone.appendChild(style);

    try {
      const scale = 2;
      const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const pdf = new jsPDF("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 1;
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
      document.body.removeChild(container);
    }
  };

  const savePDF = async () => {
    const ref = selectedTeam ? playersPageRef : teamsPageRef;
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
  };

  const printPDF = async () => {
    const ref = selectedTeam ? playersPageRef : teamsPageRef;
    const doc = await generatePDFDoc(ref);

    if (doc) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, "_blank");
      if (printWin) printWin.focus();
    }
  };

  if (loading) return <div className={styles.loading}>Loading Team Data...</div>;

  if (teamStats.length === 0) {
    return (
      <div className={styles.container}>
        <h2>No Teams Found</h2>
        <button onClick={() => navigate(`/tournaments/${id}/entry`)} className={styles.backButton}>
          Go to Entry Page
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PremiumAccessGuard tournamentId={id}>
        <div className={styles.buttonSection}>
          <div className={styles.buttonGroupLeft}>
            <button onClick={printPDF} className={styles.actionButton}>
              <FaPrint className={styles.buttonIcon} />
              <span>Print</span>
            </button>

            <button onClick={savePDF} className={styles.actionButton}>
              <FaFilePdf className={styles.buttonIcon} />
              <span>Save PDF</span>
            </button>
          </div>
        </div>

        {!selectedTeam ? (
          <div ref={teamsPageRef} className={styles.pageContent}>
            <div className={styles.header}>
              {logoLeft ? <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} /> : null}

              <div className={styles.headerContent}>
                <h1 className={styles.tournamentName}>
                  {tournament?.tournamentName
                    ? tournament.tournamentName.toUpperCase()
                    : "TOURNAMENT TEAMS"}
                </h1>
                <p className={styles.federation}>{tournament?.federation || "N/A"}</p>
                <h2 className={styles.title}>TOTAL TEAMS - {totalTeams}</h2>
              </div>

              {logoRight ? (
                <img src={logoRight} alt="Logo Right" className={styles.logoRight} />
              ) : null}
            </div>

            <div className={styles.tableWrapper} style={{ overflowX: "auto" }}>
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
                              />
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}

                        {hasFees ? (
                          <td className={`${styles.colPaymentStatus} ${statusCellClass}`}>
                            <strong>{isPaid ? "Paid" : isPartial ? "Partial Paid" : "Due"}</strong>
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
          </div>
        ) : (
          <div>
            <button onClick={handleBackToTeams} className={styles.backButton}>
              ← Back to Teams List
            </button>

            <div ref={playersPageRef} className={styles.pageContent}>
              <div className={styles.header}>
                {logoLeft ? <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} /> : null}

                <div className={styles.headerContent}>
                  <h1 className={styles.tournamentName}>
                    {tournament?.tournamentName
                      ? tournament.tournamentName.toUpperCase()
                      : "TOURNAMENT TEAMS"}
                  </h1>
                  <p className={styles.federation}>{tournament?.federation || "N/A"}</p>
                  <h2 className={styles.title}>TEAM - {selectedTeam.name.toUpperCase()}</h2>
                </div>

                {logoRight ? (
                  <img src={logoRight} alt="Logo Right" className={styles.logoRight} />
                ) : null}
              </div>

              <h3 className={styles.playersListHeading}>Players List</h3>
              <p className={styles.playersSummary}>
                Total Players: {selectedTeam.totalPlayers} | Male: {selectedTeam.malePlayers} |
                Female: {selectedTeam.femalePlayers}
              </p>

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
                      {selectedTeam.players[0]?.fathersName ? <th>Father's Name</th> : null}
                      {selectedTeam.players[0]?.school ? <th>School</th> : null}
                      {selectedTeam.players[0]?.class ? <th>Class</th> : null}
                    </tr>
                  </thead>

                  <tbody>
                    {selectedTeam.players.map((player, index) => (
                      <tr key={`${player.name || "player"}-${index}`}>
                        <td>{player.sr}</td>
                        <td>{player.title || "-"}</td>
                        <td>{player.name || "-"}</td>
                        <td>{player.gender || "-"}</td>
                        <td>{player.dob || "-"}</td>
                        <td>{player.weight || "-"}</td>
                        <td>{player.event || "-"}</td>
                        <td>{player.subEvent || "-"}</td>
                        <td>{player.ageCategory || "-"}</td>
                        <td>{player.weightCategory || "-"}</td>
                        <td>{player.medal || "-"}</td>
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
            </div>
          </div>
        )}
      </PremiumAccessGuard>
    </div>
  );
};

export default Team;