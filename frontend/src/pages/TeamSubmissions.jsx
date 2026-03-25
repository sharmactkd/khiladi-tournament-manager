import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  approveTeamSubmission,
  getEntries,
  getTournamentTeamSubmissions,
  rejectTeamSubmission,
} from "../api";

const cardStyle = {
  background: "#fff",
  border: "1px solid #e6e6e6",
  borderRadius: "14px",
  padding: "18px",
  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
  marginBottom: "18px",
};

const badgeStyle = (status) => {
  const map = {
    submitted: {
      background: "#fff5db",
      color: "#9a6700",
      border: "1px solid #f2d184",
    },
    approved: {
      background: "#eaf8ef",
      color: "#1f7a38",
      border: "1px solid #a7dfb4",
    },
    rejected: {
      background: "#fdeceb",
      color: "#b42318",
      border: "1px solid #f3b2ad",
    },
  };

  return {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    ...(map[status] || map.submitted),
  };
};

const actionButtonBase = {
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
};

const TeamSubmissions = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

      const [tournamentRes, submissionsRes] = await Promise.all([
        axios.get(`${baseUrl}/tournament/${id}`),
        getTournamentTeamSubmissions(id),
      ]);

      setTournament(tournamentRes.data);
      setSubmissions(Array.isArray(submissionsRes?.submissions) ? submissionsRes.submissions : []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load team submissions.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const syncApprovedEntriesToLocal = async () => {
    try {
      const entriesPayload = await getEntries(id);
      const latestEntries = Array.isArray(entriesPayload?.entries) ? entriesPayload.entries : [];
      localStorage.setItem(`entryData_${id}`, JSON.stringify(latestEntries));
      window.dispatchEvent(new Event(`entryDataUpdated_${id}`));
    } catch (error) {
      console.warn("Failed to sync latest entries to local cache:", error);
      localStorage.removeItem(`entryData_${id}`);
      window.dispatchEvent(new Event(`entryDataUpdated_${id}`));
    }
  };

 const handleApprove = async (submissionId) => {
  try {
    setActingId(submissionId);

    await approveTeamSubmission(submissionId);
    await syncApprovedEntriesToLocal();
    await loadPage();
    window.dispatchEvent(new Event(`teamSubmissionCountUpdated_${id}`));

    alert("Submission approved and merged into entry data.");
  } catch (err) {
    alert(err?.message || "Failed to approve submission.");
  } finally {
    setActingId("");
  }
};

const handleReject = async (submissionId) => {
  const reason = window.prompt("Optional rejection reason:", "") || "";

  try {
    setActingId(submissionId);
    await rejectTeamSubmission(submissionId, { reason });
    await loadPage();
    window.dispatchEvent(new Event(`teamSubmissionCountUpdated_${id}`));

    alert("Submission rejected.");
  } catch (err) {
    alert(err?.message || "Failed to reject submission.");
  } finally {
    setActingId("");
  }
};

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <h2>Loading submissions...</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Team Submissions</h1>
          <p style={{ marginTop: "8px", color: "#666" }}>
            {tournament?.tournamentName || "Tournament"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/tournaments/${id}/team`)}
          style={{
            ...actionButtonBase,
            background: "#cf0006",
            color: "#fff",
          }}
        >
          Back to Team Page
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "10px",
            background: "#fdecec",
            color: "#b42318",
            border: "1px solid #f4b4ae",
          }}
        >
          {error}
        </div>
      ) : null}

      {submissions.length === 0 ? (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>No submissions yet</h3>
          <p style={{ marginBottom: 0, color: "#666" }}>
            Coaches have not submitted any team entries for review yet.
          </p>
        </div>
      ) : null}

      {submissions.map((submission) => {
        const isPending = submission.status === "submitted";
        const isBusy = actingId === submission._id;

        return (
          <div key={submission._id} style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "flex-start",
                marginBottom: "16px",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 8px 0" }}>{submission.teamName}</h3>
                <div style={{ color: "#555", lineHeight: 1.6 }}>
                  <div>
                    <strong>Coach:</strong> {submission.coachName || "-"}
                  </div>
                  <div>
                    <strong>Email:</strong> {submission.coachEmail || "-"}
                  </div>
                  <div>
                    <strong>Players:</strong> {submission.players?.length || 0}
                  </div>
                  <div>
                    <strong>Submitted:</strong>{" "}
                    {submission.createdAt
                      ? new Date(submission.createdAt).toLocaleString()
                      : "-"}
                  </div>
                  {submission.rejectionReason ? (
                    <div>
                      <strong>Reason:</strong> {submission.rejectionReason}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={badgeStyle(submission.status)}>{submission.status}</span>

                {isPending ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApprove(submission._id)}
                      disabled={isBusy}
                      style={{
                        ...actionButtonBase,
                        background: "#1f7a38",
                        color: "#fff",
                        opacity: isBusy ? 0.7 : 1,
                      }}
                    >
                      {isBusy ? "Processing..." : "Approve"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReject(submission._id)}
                      disabled={isBusy}
                      style={{
                        ...actionButtonBase,
                        background: "#b42318",
                        color: "#fff",
                        opacity: isBusy ? 0.7 : 1,
                      }}
                    >
                      {isBusy ? "Processing..." : "Reject"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "1100px",
                }}
              >
                <thead>
                  <tr style={{ background: "#cf0006", color: "#fff" }}>
                    <th style={{ padding: "10px", textAlign: "left" }}>#</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Gender</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>DOB</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Weight</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Event</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Sub Event</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Age Category</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Weight Category</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Coach</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Manager</th>
                  </tr>
                </thead>

                <tbody>
                  {(submission.players || []).map((player, index) => (
                    <tr key={`${submission._id}-${index}`} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "10px" }}>{index + 1}</td>
                      <td style={{ padding: "10px" }}>{player.name || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.gender || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.dob || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.weight || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.event || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.subEvent || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.ageCategory || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.weightCategory || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.coach || "-"}</td>
                      <td style={{ padding: "10px" }}>{player.manager || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TeamSubmissions;