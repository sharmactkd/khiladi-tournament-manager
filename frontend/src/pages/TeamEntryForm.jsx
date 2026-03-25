import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import AddTeamEntriesModal from "../components/Team/AddTeamEntriesModal";
import { submitTeamSubmission } from "../api";

const defaultVisibleColumns = {
  fathersName: false,
  school: false,
  class: false,
};

const TeamEntryForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTournament = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const res = await axios.get(`${baseUrl}/tournament/${id}`);
        setTournament(res.data);
      } catch (error) {
        console.error("Failed to load tournament:", error);
        setTournament(null);
      } finally {
        setLoading(false);
      }
    };

    const loadVisibleColumns = () => {
      try {
        const saved = localStorage.getItem(`visibleColumns_${id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setVisibleColumns({
            fathersName: !!parsed?.fathersName,
            school: !!parsed?.school,
            class: !!parsed?.class,
          });
        }
      } catch (error) {
        console.error("Failed to load visible columns:", error);
      }
    };

    loadVisibleColumns();
    loadTournament();
  }, [id]);

  const handleSubmit = async (preparedRows, teamInfo) => {
    const cleanRows = Array.isArray(preparedRows)
      ? preparedRows.filter((row) =>
          Object.entries(row || {}).some(
            ([key, value]) =>
              key !== "sr" &&
              key !== "actions" &&
              value !== "" &&
              value !== null &&
              value !== undefined
          )
        )
      : [];

    if (cleanRows.length === 0) {
      throw new Error("No valid player rows to submit.");
    }

    await submitTeamSubmission(id, {
      teamName: teamInfo?.team || "",
      players: cleanRows,
    });

    alert("Team submission sent successfully. Organizer will review it.");
    navigate(`/tournaments/${id}`);
  };

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        Loading team entry form...
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <h2>Tournament not found</h2>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            marginTop: "12px",
            padding: "10px 16px",
            border: "none",
            borderRadius: "8px",
            background: "#cf0006",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <AddTeamEntriesModal
        show
        onClose={() => navigate(`/tournaments/${id}`)}
        onSubmit={handleSubmit}
        tournamentData={tournament}
        visibleColumns={visibleColumns}
        title={`Submit Team Entries - ${tournament?.tournamentName || "Tournament"}`}
        submitButtonText="Submit for Review"
      />
    </div>
  );
};

export default TeamEntryForm;