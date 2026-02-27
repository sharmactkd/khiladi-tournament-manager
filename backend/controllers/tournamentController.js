import mongoose from "mongoose";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import path from "path";

// Helper Functions
const parseNestedFields = (data, fields) => {
  const result = { ...data };
  fields.forEach((field) => {
    if (result[field] && typeof result[field] === "string") {
      try {
        result[field] = JSON.parse(result[field]);
      } catch (err) {
        logger.warn(`Could not parse nested field: ${field}`, { error: err.message });
        result[field] = undefined;
      }
    }
  });
  return result;
};

const validatePhoneNumber = (contact) => {
  const parsed = parsePhoneNumberFromString(contact);
  if (!parsed || !parsed.isValid()) {
    throw new Error("Invalid phone number format. Must include country code (e.g., +91).");
  }
  const countryCode = parsed.countryCallingCode;
  const nationalNumber = parsed.nationalNumber;

  if (countryCode === "91" && nationalNumber.length !== 10) {
    throw new Error("Indian phone numbers must have exactly 10 digits.");
  }
  if (countryCode !== "91" && nationalNumber.length > 15) {
    throw new Error("International numbers cannot exceed 15 digits.");
  }
  return parsed.number;
};

const validateFile = (file, fieldName) => {
  if (!file) return;
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

  if (file.size > maxSize) {
    throw new Error(`${fieldName} file size must be under 10MB`);
  }
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`${fieldName} must be JPG, PNG, WebP, or SVG`);
  }
};

// Helper Functions के section में add करो (validateFile के नीचे)
const getFilenameFromPath = (fullPath) => {
  if (!fullPath) return null;
  return path.basename(fullPath); // सिर्फ filename return करेगा, path नहीं
};

const processTournamentType = (tournamentType) => {
  if (!tournamentType) return ["Open"];
  if (typeof tournamentType === "string") {
    try {
      return JSON.parse(tournamentType);
    } catch (e) {
      return tournamentType.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  return Array.isArray(tournamentType)
    ? [...new Set(tournamentType.flatMap((type) => (typeof type === "string" ? type.split(",") : type)))]
    : [tournamentType];
};

const normalizePath = (filePath) => {
  return filePath ? path.normalize(filePath).replace(/\\/g, "/") : undefined;
};

// ================ PUBLIC ENDPOINTS (No Auth Required) ================

export const getAllTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const normalized = tournaments.map((t) => ({
      ...t,
      poster: normalizePath(t.poster),
      logos: t.logos?.map(normalizePath),
    }));

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get all tournaments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load tournaments" });
  }
};

export const getOngoingTournaments = async (req, res) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // midnight today

    const tournaments = await Tournament.find({
      $or: [
        // 1. Already started and not ended (real ongoing)
        { dateFrom: { $lte: now }, dateTo: { $gte: now } },
        // 2. Starting today or tomorrow (upcoming but show as "ongoing/soon")
        { dateFrom: { $gte: now, $lte: new Date(now.getTime() + 48*60*60*1000) } } // next 2 days
      ]
    })
      .populate("createdBy", "name")
      .sort({ dateFrom: 1 })
      .lean();

    const normalized = tournaments.map((t) => ({
      ...t,
      poster: normalizePath(t.poster),
      logos: t.logos?.map(normalizePath),
    }));

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get ongoing tournaments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load ongoing tournaments" });
  }
};

export const getPreviousTournaments = async (req, res) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const tournaments = await Tournament.find({
      dateTo: { $lt: now }  // end date aaj se pehle → only truly previous
    })
      .populate("createdBy", "name")
      .sort({ dateTo: -1 })
      .lean();

    const normalized = tournaments.map((t) => ({
      ...t,
      poster: normalizePath(t.poster),
      logos: t.logos?.map(normalizePath),
    }));

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get previous tournaments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load previous tournaments" });
  }
};

export const getTournamentById = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("createdBy", "name phone email")
      .lean();

    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    tournament.poster = normalizePath(tournament.poster);
    tournament.logos = tournament.logos?.map(normalizePath);

    res.status(200).json(tournament);
  } catch (error) {
    logger.error("Get tournament by ID failed", { error: error.message, tournamentId: req.params.id });
    res.status(500).json({ message: "Failed to load tournament details" });
  }
};

// ================ PROTECTED ENDPOINTS (Require Auth + Ownership) ================

export const getOutcomes = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select("outcomes").lean();
    res.status(200).json({ outcomes: tournament?.outcomes || {} });
  } catch (error) {
    logger.error("Get outcomes failed", { error: error.message, tournamentId: req.params.id });
    res.status(500).json({ message: "Failed to load results" });
  }
};

export const saveOutcomes = async (req, res) => {
  try {
    const { outcomes } = req.body;
    if (!outcomes || typeof outcomes !== "object") {
      return res.status(400).json({ message: "Invalid results data" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      { outcomes },
      { new: true, select: "outcomes" }
    );

    res.status(200).json({ message: "Results saved successfully", outcomes: updated.outcomes });
  } catch (error) {
    logger.error("Save outcomes failed", { error: error.message });
    res.status(500).json({ message: "Failed to save results" });
  }
};

export const getTieSheet = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select("tiesheet").lean();
    res.json({ tiesheet: tournament?.tiesheet || { brackets: [], outcomes: {}, filters: {} } });
  } catch (error) {
    logger.error("Get tiesheet failed", { error: error.message });
    res.status(500).json({ message: "Failed to load bracket" });
  }
};

export const saveTieSheet = async (req, res) => {
  try {
    const { tiesheet } = req.body;
    if (!tiesheet || typeof tiesheet !== "object" || !Array.isArray(tiesheet.brackets)) {
      return res.status(400).json({ message: "Invalid bracket data" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      { tiesheet },
      { new: true, select: "tiesheet" }
    );

    res.json({ message: "Bracket saved successfully", tiesheet: updated.tiesheet });
  } catch (error) {
    logger.error("Save tiesheet failed", { error: error.message });
    res.status(500).json({ message: "Failed to save bracket" });
  }
};

// ✅ NEW: lightweight real-time outcomes save (tiesheet.outcomes only)
export const saveTieSheetOutcomes = async (req, res) => {
  try {
    const { outcomes } = req.body;

    if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) {
      return res.status(400).json({ message: "Invalid outcomes data" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      { $set: { "tiesheet.outcomes": outcomes } },
      { new: true, select: "tiesheet" }
    ).lean();

    const saved = updated?.tiesheet?.outcomes || {};
    res.status(200).json({ message: "TieSheet outcomes saved", outcomes: saved });
  } catch (error) {
    logger.error("Save tiesheet outcomes failed", { error: error.message, tournamentId: req.params.id });
    res.status(500).json({ message: "Failed to save outcomes" });
  }
};

export const getOfficials = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select("officials").lean();
    res.json({ officials: tournament?.officials || [] });
  } catch (error) {
    logger.error("Get officials failed", { error: error.message });
    res.status(500).json({ message: "Failed to load officials" });
  }
};

export const saveOfficials = async (req, res) => {
  try {
    const { officials } = req.body;
    if (!Array.isArray(officials)) {
      return res.status(400).json({ message: "Officials must be an array" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      { officials },
      { new: true, select: "officials" }
    );

    res.json({ message: "Officials saved successfully", officials: updated.officials });
  } catch (error) {
    logger.error("Save officials failed", { error: error.message });
    res.status(500).json({ message: "Failed to save officials" });
  }
};

export const getTeamPayments = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select("teamPayments").lean();
    res.json({ teamPayments: tournament?.teamPayments || {} });
  } catch (error) {
    logger.error("Get team payments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load payments" });
  }
};

export const saveTeamPayments = async (req, res) => {
  try {
    const { teamPayments } = req.body;
    if (typeof teamPayments !== "object" || teamPayments === null) {
      return res.status(400).json({ message: "Invalid payment data" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      { teamPayments },
      { new: true, select: "teamPayments" }
    );

    res.json({ message: "Team payments saved successfully", teamPayments: updated.teamPayments });
  } catch (error) {
    logger.error("Save team payments failed", { error: error.message });
    res.status(500).json({ message: "Failed to save payments" });
  }
};

export const saveTieSheetRecord = async (req, res) => {
  try {
    const record = req.body;
    if (!record || typeof record !== "object") {
      return res.status(400).json({ message: "Invalid record data" });
    }

    await Tournament.findByIdAndUpdate(req.params.id, {
      $push: { tieSheetRecords: record },
    });

    res.json({ success: true, message: "Record added successfully" });
  } catch (error) {
    logger.error("Save tieSheet record failed", { error: error.message });
    res.status(500).json({ message: "Failed to save record" });
  }
};

// ================ CREATE & UPDATE TOURNAMENT ================

export const createTournament = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user?._id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Authentication required" });
    }

    const requiredFields = ["organizer", "federation", "tournamentName", "email", "contact", "dateFrom", "dateTo"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    const contact = validatePhoneNumber(req.body.contact);

    const tournamentType = processTournamentType(req.body.tournamentType);

    const dateFrom = new Date(req.body.dateFrom);
    const dateTo = new Date(req.body.dateTo);
    if (isNaN(dateFrom) || isNaN(dateTo) || dateFrom > dateTo) {
      await session.abortTransaction();
      return res.status(400).json({ message: "End date must be same day or after start date" });
    }

    if (req.files?.poster?.[0]) {
      validateFile(req.files.poster[0], "Poster");
    }
    if (req.files?.logos) {
      req.files.logos.forEach((logo) => validateFile(logo, "Logo"));
    }

    // सिर्फ filename save करो
    const poster = req.files?.poster?.[0] ? getFilenameFromPath(req.files.poster[0].path) : undefined;
    const logos = req.files?.logos
      ? req.files.logos.map(file => getFilenameFromPath(file.path))
      : [];

    let tournamentData = {
      ...req.body,
      contact,
      tournamentType,
      playerLimit: req.body.playerLimit ? parseInt(req.body.playerLimit, 10) : undefined,
      createdBy: req.user._id,
      dateFrom,
      dateTo,
      visibility: req.body.visibility === "true" || req.body.visibility === true,
      poster,
      logos,
    };

    delete tournamentData._id;
    delete tournamentData.__v;

    const nestedFields = ["venue", "ageCategories", "ageGender", "eventCategories", "entryFees", "weightCategories", "foodAndLodging", "medalPoints"];
    tournamentData = parseNestedFields(tournamentData, nestedFields);

    // ====== SPECIAL HANDLING FOR weightCategories.selected ======
    if (tournamentData.weightCategories?.selected) {
      if (typeof tournamentData.weightCategories.selected === "string") {
        try {
          tournamentData.weightCategories.selected = JSON.parse(tournamentData.weightCategories.selected);
        } catch (err) {
          logger.warn("Failed to parse weightCategories.selected", { error: err.message });
          tournamentData.weightCategories.selected = { male: [], female: [] };
        }
      }

      // Ensure arrays exist
      tournamentData.weightCategories.selected.male = Array.isArray(tournamentData.weightCategories.selected.male)
        ? tournamentData.weightCategories.selected.male
        : [];
      tournamentData.weightCategories.selected.female = Array.isArray(tournamentData.weightCategories.selected.female)
        ? tournamentData.weightCategories.selected.female
        : [];
    }

    // Custom vs Standard cleanup
    // createTournament और updateTournament में यह part हटाओ या update करो

    if (tournamentData.weightCategories?.type === "custom") {
      // custom अब object है, string नहीं
      tournamentData.weightCategories.selected = undefined;
    } else {
      tournamentData.weightCategories.custom = undefined;
    }
    // ===========================================================

    if (tournamentData.foodAndLodging) {
      tournamentData.foodAndLodging = {
        ...tournamentData.foodAndLodging,
        option: tournamentData.foodAndLodging.option || "No",
        type: tournamentData.foodAndLodging.option === "No" ? "Free" : tournamentData.foodAndLodging.type || "Free",
        paymentMethod: tournamentData.foodAndLodging.option === "No" || tournamentData.foodAndLodging.type === "Free" ? undefined : tournamentData.foodAndLodging.paymentMethod,
        amount: tournamentData.foodAndLodging.option === "No" || tournamentData.foodAndLodging.type === "Free" ? undefined : Number(tournamentData.foodAndLodging.amount) || undefined,
      };
    }

    const tournament = new Tournament(tournamentData);
    const saved = await tournament.save({ session });

    await session.commitTransaction();
    logger.info("Tournament created successfully", { id: saved._id, createdBy: req.user._id });

    res.status(201).json(saved.toObject());
  } catch (error) {
    await session.abortTransaction();
    logger.error("Create tournament failed", { error: error.message });
    res.status(error.name === "ValidationError" ? 400 : 500).json({
      message: error.message || "Server error during creation",
      details: error.name === "ValidationError" ? Object.values(error.errors).map((e) => e.message) : undefined,
    });
  } finally {
    session.endSession();
  }
};

export const updateTournament = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let updates = { ...req.body };
    delete updates._id;
    delete updates.__v;
    delete updates.createdBy;

    const nestedFields = ["venue", "ageCategories", "ageGender", "eventCategories", "entryFees", "weightCategories", "foodAndLodging", "medalPoints"];
    updates = parseNestedFields(updates, nestedFields);

    if (updates.contact) {
      updates.contact = validatePhoneNumber(updates.contact);
    }
    if (updates.tournamentType) {
      updates.tournamentType = processTournamentType(updates.tournamentType);
    }
    if (updates.dateFrom) {
      updates.dateFrom = new Date(updates.dateFrom);
    }
    if (updates.dateTo) {
      updates.dateTo = new Date(updates.dateTo);
    }
    if (updates.playerLimit) {
      updates.playerLimit = parseInt(updates.playerLimit, 10);
    }
    if (updates.visibility !== undefined) {
      updates.visibility = updates.visibility === "true" || updates.visibility === true;
    }

    if (updates.foodAndLodging) {
      updates.foodAndLodging = {
        ...updates.foodAndLodging,
        option: updates.foodAndLodging.option || "No",
        type: updates.foodAndLodging.option === "No" ? "Free" : updates.foodAndLodging.type || "Free",
        paymentMethod: updates.foodAndLodging.option === "No" || updates.foodAndLodging.type === "Free" ? undefined : updates.foodAndLodging.paymentMethod,
        amount: updates.foodAndLodging.option === "No" || updates.foodAndLodging.type === "Free" ? undefined : Number(updates.foodAndLodging.amount) || undefined,
      };
    }

    if (req.files?.poster?.[0]) {
      validateFile(req.files.poster[0], "Poster");
      updates.poster = getFilenameFromPath(req.files.poster[0].path);
    }
    if (req.files?.logos?.length > 0) {
      req.files.logos.forEach((logo) => validateFile(logo, "Logo"));
      updates.logos = req.files.logos.map((file) => getFilenameFromPath(file.path));
    }

    // ====== SPECIAL HANDLING FOR weightCategories.selected (UPDATE) ======
    if (updates.weightCategories?.selected) {
      if (typeof updates.weightCategories.selected === "string") {
        try {
          updates.weightCategories.selected = JSON.parse(updates.weightCategories.selected);
        } catch (err) {
          logger.warn("Failed to parse weightCategories.selected in update", { error: err.message });
          updates.weightCategories.selected = { male: [], female: [] };
        }
      }

      updates.weightCategories.selected.male = Array.isArray(updates.weightCategories.selected.male)
        ? updates.weightCategories.selected.male
        : [];
      updates.weightCategories.selected.female = Array.isArray(updates.weightCategories.selected.female)
        ? updates.weightCategories.selected.female
        : [];
    }

    if (updates.weightCategories?.type === "custom") {
      if (typeof updates.weightCategories.custom === "string") {
        updates.weightCategories.custom = updates.weightCategories.custom.trim();
      }
      updates.weightCategories.selected = undefined;
    } else {
      updates.weightCategories.custom = undefined;
    }
    // ====================================================================

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true, session }
    ).populate("createdBy", "name phone email");

    if (!updated) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Tournament not found" });
    }

    await session.commitTransaction();
    logger.info("Tournament updated successfully", { id: req.params.id, updatedBy: req.user?._id });

    res.status(200).json(updated.toObject());
  } catch (error) {
    await session.abortTransaction();
    logger.error("Update tournament failed", { error: error.message });
    res.status(error.name === "ValidationError" ? 400 : 500).json({
      message: error.message || "Server error during update",
      details: error.name === "ValidationError" ? Object.values(error.errors).map((e) => e.message) : undefined,
    });
  } finally {
    session.endSession();
  }
};