import mongoose from "mongoose";
import TeamEntrySubmission from "../models/TeamEntrySubmission.js";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";
import Entry from "../models/entry.js";
import { logActivitySafe } from "../utils/activityLogger.js";

const createEmptyEntryState = () => ({
  sorting: [],
  filters: {},
  columnWidths: [],
  searchTerm: "",
});

const isMeaningfulRow = (row) => {
  if (!row || typeof row !== "object") return false;

  return Object.entries(row).some(([key, value]) => {
    if (["sr", "srNo", "actions"].includes(key)) return false;
    return value !== "" && value !== null && value !== undefined;
  });
};

const toTitleCase = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeTextForKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeGender = (value = "") => {
  const v = String(value || "").trim().toLowerCase();

  if (["m", "male", "boy", "boys"].includes(v)) return "Male";
  if (["f", "female", "girl", "girls"].includes(v)) return "Female";

  return "";
};

const normalizeMedal = (value = "") => {
  const v = String(value || "").trim().toLowerCase();

  if (["g", "gold"].includes(v)) return "Gold";
  if (["s", "silver"].includes(v)) return "Silver";
  if (["b", "bronze"].includes(v)) return "Bronze";

  return "";
};

const parseWeight = (value) => {
  if (value === "" || value === null || value === undefined) return null;

  const num = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : null;
};

const parseDob = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const str = String(value).trim();
  if (!str) return null;

  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDobForKey = (value) => {
  const dob = parseDob(value);
  return dob ? dob.toISOString().slice(0, 10) : "";
};

const buildStrictDuplicateKey = (row = {}) =>
  [
    normalizeTextForKey(row.name),
    normalizeTextForKey(row.team),
    normalizeTextForKey(normalizeGender(row.gender)),
    normalizeDobForKey(row.dob),
    normalizeTextForKey(row.event),
    normalizeTextForKey(row.ageCategory),
    normalizeTextForKey(row.weightCategory),
  ].join("|||");

const normalizePlayers = (players = [], teamName = "") => {
  return (Array.isArray(players) ? players : [])
    .filter(isMeaningfulRow)
    .map((row) => ({
      ...row,
      actions: "",
      sr: "",
      team: String(row.team || teamName || "").trim().toUpperCase(),
      coach: String(row.coach || "").trim(),
      coachContact: String(row.coachContact || "").trim(),
      manager: String(row.manager || "").trim(),
      managerContact: String(row.managerContact || "").trim(),
      name: String(row.name || "").trim(),
      fathersName: String(row.fathersName || "").trim(),
      school: String(row.school ?? row.schoolName ?? "").trim(),
      class: String(row.class || "").trim(),
      title: String(row.title || "").trim(),
      gender: String(row.gender || "").trim(),
      dob: row.dob ?? null,
      weight: row.weight ?? null,
      event: String(row.event || "").trim(),
      subEvent: String(row.subEvent || "").trim(),
      ageCategory: String(row.ageCategory || "").trim(),
      weightCategory: String(row.weightCategory || "").trim(),
      medal: String(row.medal || "").trim(),
    }));
};

const normalizeEntryRowForEntryModel = (row, index) => {
  const school = String(row.school ?? row.schoolName ?? "").trim();

  return {
    srNo: index + 1,
    title: String(row.title || "").trim(),
    name: String(row.name || "").trim(),
    fathersName: String(row.fathersName || "").trim(),
    schoolName: school,
    class: String(row.class || "").trim(),
    team: String(row.team || "").trim().toUpperCase(),
    gender: normalizeGender(row.gender),
    dob: parseDob(row.dob),
    weight: parseWeight(row.weight),
    event: toTitleCase(row.event || ""),
    subEvent: String(row.subEvent || "").trim(),
    ageCategory: String(row.ageCategory || "").trim(),
    weightCategory: String(row.weightCategory || "").trim(),
    medal: normalizeMedal(row.medal),
    coach: String(row.coach || "").trim(),
    coachContact: String(row.coachContact || "").trim(),
    manager: String(row.manager || "").trim(),
    managerContact: String(row.managerContact || "").trim(),
  };
};

const getTournamentOwnerId = (tournament) => {
  const owner =
    tournament?.user ||
    tournament?.userId ||
    tournament?.organizerId ||
    tournament?.createdBy ||
    null;

  if (!owner) return null;
  if (typeof owner === "string") return owner;
  if (typeof owner === "object" && owner._id) return owner._id;

  return owner;
};

export const submitTeamSubmission = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { teamName, players } = req.body;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({ message: "Invalid tournament ID" });
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    const normalizedTeamName = String(teamName || "").trim().toUpperCase();
    if (!normalizedTeamName) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const normalizedPlayers = normalizePlayers(players, normalizedTeamName);
    if (normalizedPlayers.length === 0) {
      return res.status(400).json({ message: "At least one valid player is required" });
    }

    const submission = await TeamEntrySubmission.create({
      tournamentId,
      coachId: req.user._id,
      coachName: req.user.name,
      coachEmail: req.user.email || "",
      teamName: normalizedTeamName,
      players: normalizedPlayers,
      status: "submitted",
    });

    logger.info("Team submission created", {
      submissionId: submission._id,
      tournamentId,
      coachId: req.user._id,
      playerCount: normalizedPlayers.length,
    });

    logActivitySafe({
      req,
      user: req.user._id,
      actor: req.user._id,
      tournament: tournamentId,
      action: "TEAM_SUBMISSION_CREATED",
      module: "teamSubmission",
      title: "Team submission created",
      description: `${normalizedTeamName} submitted ${normalizedPlayers.length} entries.`,
      metadata: {
        submissionId: submission._id,
        tournamentId,
        tournamentName: tournament.tournamentName || "",
        teamName: normalizedTeamName,
        playersCount: normalizedPlayers.length,
        coachId: req.user._id,
        status: submission.status,
      },
    });

    res.status(201).json({
      message: "Team entries submitted successfully",
      submission,
    });
  } catch (error) {
    logger.error("submitTeamSubmission failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to submit team entries" });
  }
};

export const getTournamentTeamSubmissions = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({ message: "Invalid tournament ID" });
    }

    const tournament = await Tournament.findById(tournamentId).lean();
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    const isAdminUser = ["admin", "superadmin"].includes(req.user?.role);

    const ownerId = getTournamentOwnerId(tournament);
    if (!isAdminUser && (!ownerId || String(ownerId) !== String(req.user._id))) {
      return res.status(403).json({ message: "You do not own this tournament" });
    }

    const submissions = await TeamEntrySubmission.find({ tournamentId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ submissions });
  } catch (error) {
    logger.error("getTournamentTeamSubmissions failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to fetch team submissions" });
  }
};

export const approveTeamSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ message: "Invalid submission ID" });
    }

    const submission = await TeamEntrySubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.status !== "submitted") {
      return res.status(400).json({
        message: `Only submitted entries can be approved. Current status: ${submission.status}`,
      });
    }

    const tournament = await Tournament.findById(submission.tournamentId);
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    const ownerId = getTournamentOwnerId(tournament);
    if (!ownerId || String(ownerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You do not own this tournament" });
    }

    const entryDoc = await Entry.findOne({ tournamentId: submission.tournamentId });

    const existingEntries = Array.isArray(entryDoc?.entries) ? entryDoc.entries : [];
    const approvedPlayers = normalizePlayers(submission.players, submission.teamName);

    const existingNormalizedEntries = existingEntries
      .filter(isMeaningfulRow)
      .map((row, index) => normalizeEntryRowForEntryModel(row, index));

    const existingKeys = new Set(
      existingNormalizedEntries.map((entry) => buildStrictDuplicateKey(entry)).filter(Boolean)
    );

    const uniqueApprovedPlayers = [];
    const skippedDuplicatePlayers = [];

    approvedPlayers.forEach((player) => {
      const duplicateKey = buildStrictDuplicateKey(player);

      if (duplicateKey && existingKeys.has(duplicateKey)) {
        skippedDuplicatePlayers.push(player);
        return;
      }

      if (duplicateKey) {
        existingKeys.add(duplicateKey);
      }

      uniqueApprovedPlayers.push(player);
    });

    const mergedEntries = [...existingNormalizedEntries, ...uniqueApprovedPlayers]
      .filter(isMeaningfulRow)
      .map((row, index) => normalizeEntryRowForEntryModel(row, index));

    const userState =
      entryDoc?.userState && typeof entryDoc.userState === "object"
        ? entryDoc.userState
        : createEmptyEntryState();

    const updatedEntryDoc = await Entry.findOneAndUpdate(
      { tournamentId: submission.tournamentId },
      {
        $set: {
          entries: mergedEntries,
          userState,
          updatedBy: req.user._id,
        },
        $setOnInsert: {
          tournamentId: submission.tournamentId,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    );

    submission.status = "approved";
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    await submission.save();

    logger.info("Team submission approved", {
      submissionId,
      tournamentId: submission.tournamentId,
      approvedBy: req.user._id,
      submittedPlayers: approvedPlayers.length,
      mergedPlayers: uniqueApprovedPlayers.length,
      skippedDuplicates: skippedDuplicatePlayers.length,
      totalEntriesAfterMerge: mergedEntries.length,
    });

    logActivitySafe({
      req,
      user: submission.coachId,
      actor: req.user._id,
      tournament: submission.tournamentId,
      action: "TEAM_SUBMISSION_APPROVED",
      module: "teamSubmission",
      title: "Team submission approved",
      description: `${submission.teamName || "Team"} submission approved and merged into entries.`,
      metadata: {
        submissionId: submission._id,
        tournamentId: submission.tournamentId,
        tournamentName: tournament.tournamentName || "",
        teamName: submission.teamName || "",
        coachId: submission.coachId || null,
        reviewedBy: req.user._id,
        submittedPlayers: approvedPlayers.length,
        mergedPlayers: uniqueApprovedPlayers.length,
        skippedDuplicates: skippedDuplicatePlayers.length,
        totalEntriesAfterMerge: mergedEntries.length,
        status: submission.status,
      },
    });

    res.json({
      message:
        skippedDuplicatePlayers.length > 0
          ? "Submission approved. Duplicate players were skipped."
          : "Submission approved and merged into tournament entries",
      submission,
      tournamentId: String(submission.tournamentId),
      mergedCount: uniqueApprovedPlayers.length,
      skippedDuplicateCount: skippedDuplicatePlayers.length,
      totalEntries: mergedEntries.length,
      entries: mergedEntries,
      userState: updatedEntryDoc.userState,
    });
  } catch (error) {
    console.error("=== APPROVE ERROR ===");
    console.error(error);

    logger.error("approveTeamSubmission failed", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      message: "Failed to approve submission",
      error: error.message,
    });
  }
};

export const rejectTeamSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { reason = "" } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ message: "Invalid submission ID" });
    }

    const submission = await TeamEntrySubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.status !== "submitted") {
      return res.status(400).json({
        message: `Only submitted entries can be rejected. Current status: ${submission.status}`,
      });
    }

    const tournament = await Tournament.findById(submission.tournamentId).lean();
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    const ownerId = getTournamentOwnerId(tournament);
    if (!ownerId || String(ownerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You do not own this tournament" });
    }

    submission.status = "rejected";
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    submission.rejectionReason = String(reason || "").trim();
    await submission.save();

    logger.info("Team submission rejected", {
      submissionId,
      tournamentId: submission.tournamentId,
      rejectedBy: req.user._id,
    });

    logActivitySafe({
      req,
      user: submission.coachId,
      actor: req.user._id,
      tournament: submission.tournamentId,
      action: "TEAM_SUBMISSION_REJECTED",
      module: "teamSubmission",
      title: "Team submission rejected",
      description: `${submission.teamName || "Team"} submission rejected.`,
      metadata: {
        submissionId: submission._id,
        tournamentId: submission.tournamentId,
        tournamentName: tournament.tournamentName || "",
        teamName: submission.teamName || "",
        coachId: submission.coachId || null,
        reviewedBy: req.user._id,
        playersCount: Array.isArray(submission.players) ? submission.players.length : 0,
        status: submission.status,
        rejectionReason: submission.rejectionReason || "",
      },
    });

    res.json({
      message: "Submission rejected successfully",
      submission,
    });
  } catch (error) {
    logger.error("rejectTeamSubmission failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to reject submission" });
  }
};

export const getPendingTeamSubmissionCount = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
      return res.status(400).json({ message: "Invalid tournament ID" });
    }

    const tournament = await Tournament.findById(tournamentId).lean();
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    const ownerId = getTournamentOwnerId(tournament);
    if (!ownerId || String(ownerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You do not own this tournament" });
    }

    const pendingCount = await TeamEntrySubmission.countDocuments({
      tournamentId,
      status: "submitted",
    });

    res.json({
      pendingCount,
    });
  } catch (error) {
    logger.error("getPendingTeamSubmissionCount failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to fetch pending submission count" });
  }
};