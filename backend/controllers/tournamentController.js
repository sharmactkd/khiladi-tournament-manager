import mongoose from "mongoose";
import Tournament from "../models/tournament.js";
import Entry from "../models/entry.js";
import EntryRow from "../models/entryRow.js";
import logger from "../utils/logger.js";
import { logActivitySafe } from "../utils/activityLogger.js";
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

  const maxSize = 10 * 1024 * 1024;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (file.size > maxSize) {
    throw new Error(`${fieldName} file size must be under 10MB`);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`${fieldName} must be JPG, PNG, or WebP`);
  }
};

const getFilenameFromPath = (fullPath) => {
  if (!fullPath) return null;
  return path.basename(fullPath);
};

const getStoredUploadValue = (file) => {
  if (!file) return undefined;

  const p = typeof file.path === "string" ? file.path.trim() : "";

  if (p && (p.startsWith("http://") || p.startsWith("https://"))) {
    return p;
  }

  if (p) return getFilenameFromPath(p);

  if (typeof file.filename === "string" && file.filename.trim()) {
    return file.filename.trim();
  }

  return undefined;
};

const processTournamentType = (tournamentType) => {
  if (!tournamentType) return ["Open"];

  if (typeof tournamentType === "string") {
    try {
      return JSON.parse(tournamentType);
    } catch (e) {
      return tournamentType
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  return Array.isArray(tournamentType)
    ? [
        ...new Set(
          tournamentType.flatMap((type) => (typeof type === "string" ? type.split(",") : type))
        ),
      ]
    : [tournamentType];
};

const normalizePath = (filePath) => {
  if (!filePath) return undefined;

  const s = String(filePath).trim();
  if (!s) return undefined;

  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  return path.normalize(s).replace(/\\/g, "/");
};

const getPublicVisibilityFilter = () => ({
  $or: [{ visibility: { $exists: false } }, { visibility: true }],
});

const buildPublicTournamentResponse = (tournament) => ({
  _id: tournament._id,
  id: tournament._id,
  tournamentName: tournament.tournamentName,
  organizer: tournament.organizer,
  federation: tournament.federation,
  email: tournament.email,
  contact: tournament.contact,
  dateFrom: tournament.dateFrom,
  dateTo: tournament.dateTo,
  venue: tournament.venue,
  tournamentLevel: tournament.tournamentLevel,
  tournamentType: tournament.tournamentType,
  ageCategories: tournament.ageCategories,
  ageGender: tournament.ageGender,
  eventCategories: tournament.eventCategories,
  entryFees: tournament.entryFees,
  foodAndLodging: tournament.foodAndLodging,
  medalPoints: tournament.medalPoints,
  description: tournament.description,
  matchSchedule: tournament.matchSchedule,
  visibility: tournament.visibility,
  poster: normalizePath(tournament.poster),
  logos: tournament.logos?.map(normalizePath) || [],
  createdBy: tournament.createdBy
    ? {
        _id: tournament.createdBy._id,
        name: tournament.createdBy.name,
        phone: tournament.createdBy.phone,
        email: tournament.createdBy.email,
      }
    : null,
  createdAt: tournament.createdAt,
  updatedAt: tournament.updatedAt,
});

const allowedResultMedals = ["Gold", "Silver", "Bronze"];

const normalizeResultText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeResultMedal = (value) => {
  const medal = String(value || "").trim();

  if (["g", "gold", "1", "first"].includes(medal.toLowerCase())) return "Gold";
  if (["s", "silver", "2", "second"].includes(medal.toLowerCase())) return "Silver";
  if (["b", "bronze", "3", "third"].includes(medal.toLowerCase())) return "Bronze";

  return allowedResultMedals.includes(medal) ? medal : "";
};

const normalizeResultWeight = (value) => {
  if (value === undefined || value === null || value === "") return "";

  const cleaned = String(value).replace(/[^0-9.]/g, "").trim();

  if (!cleaned) return "";

  const num = Number(cleaned);

  return Number.isFinite(num) ? String(num) : "";
};

const buildResultStrictKey = (row) =>
  [
    normalizeResultText(row?.name),
    normalizeResultText(row?.team),
    normalizeResultText(row?.gender),
    normalizeResultText(row?.event),
    normalizeResultText(row?.subEvent),
    normalizeResultText(row?.ageCategory),
    normalizeResultText(row?.weightCategory),
    normalizeResultWeight(row?.weight),
  ].join("|||");

const buildResultMediumKey = (row) =>
  [
    normalizeResultText(row?.name),
    normalizeResultText(row?.team),
    normalizeResultText(row?.gender),
    normalizeResultText(row?.event),
    normalizeResultText(row?.subEvent),
    normalizeResultText(row?.ageCategory),
    normalizeResultText(row?.weightCategory),
  ].join("|||");

const buildResultLooseKey = (row) =>
  [
    normalizeResultText(row?.name),
    normalizeResultText(row?.team),
    normalizeResultText(row?.gender),
    normalizeResultText(row?.ageCategory),
    normalizeResultText(row?.weightCategory),
  ].join("|||");

const getPlayerLikeValue = (obj, keys = []) => {
  if (!obj || typeof obj !== "object") return "";

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }

  return "";
};

const normalizeMedalPayloadItem = (item = {}, fallback = {}) => {
  const source = item?.player && typeof item.player === "object" ? item.player : item;

  const medal = normalizeResultMedal(
    item.medal ||
      item.result ||
      item.place ||
      item.position ||
      item.rank ||
      fallback.medal ||
      fallback.result ||
      fallback.place
  );

  if (!medal) return null;

  const normalized = {
    entryId: String(
  getPlayerLikeValue(source, ["entryId", "_entryId"]) ||
    getPlayerLikeValue(item, ["entryId", "_entryId"]) ||
    fallback.entryId ||
    ""
).trim(),
    name: String(
      getPlayerLikeValue(source, ["name", "playerName", "fullName", "athleteName"]) ||
        getPlayerLikeValue(item, ["name", "playerName", "fullName", "athleteName"])
    ).trim(),
    team: String(
      getPlayerLikeValue(source, ["team", "teamName", "club", "clubName", "school", "schoolName"]) ||
        getPlayerLikeValue(item, ["team", "teamName", "club", "clubName", "school", "schoolName"])
    ).trim(),
    gender: String(
      getPlayerLikeValue(source, ["gender"]) ||
        getPlayerLikeValue(item, ["gender"]) ||
        fallback.gender ||
        ""
    ).trim(),
    event: String(
      getPlayerLikeValue(source, ["event"]) ||
        getPlayerLikeValue(item, ["event"]) ||
        fallback.event ||
        ""
    ).trim(),
    subEvent: String(
      getPlayerLikeValue(source, ["subEvent", "sub_event"]) ||
        getPlayerLikeValue(item, ["subEvent", "sub_event"]) ||
        fallback.subEvent ||
        ""
    ).trim(),
    ageCategory: String(
      getPlayerLikeValue(source, ["ageCategory", "age"]) ||
        getPlayerLikeValue(item, ["ageCategory", "age"]) ||
        fallback.ageCategory ||
        ""
    ).trim(),
    weightCategory: String(
      getPlayerLikeValue(source, ["weightCategory", "weightCat"]) ||
        getPlayerLikeValue(item, ["weightCategory", "weightCat"]) ||
        fallback.weightCategory ||
        ""
    ).trim(),
    weight:
      getPlayerLikeValue(source, ["weight"]) ||
      getPlayerLikeValue(item, ["weight"]) ||
      fallback.weight ||
      "",
    medal,
  };

  return normalized.name ? normalized : null;
};

const collectMedalsFromObject = (node, fallback = {}, output = [], visited = new WeakSet()) => {
  if (!node || typeof node !== "object") return output;

  if (visited.has(node)) return output;
  visited.add(node);

  if (Array.isArray(node)) {
    node.forEach((item) => collectMedalsFromObject(item, fallback, output, visited));
    return output;
  }

  const nextFallback = {
    ...fallback,
     entryId: node.entryId || node._entryId || fallback.entryId || "",
    gender: node.gender || fallback.gender || "",
    event: node.event || fallback.event || "",
    subEvent: node.subEvent || fallback.subEvent || "",
    ageCategory: node.ageCategory || fallback.ageCategory || "",
    weightCategory: node.weightCategory || fallback.weightCategory || "",
    weight: node.weight || fallback.weight || "",
  };

  const direct = normalizeMedalPayloadItem(node, nextFallback);
  if (direct) output.push(direct);

  const medalBuckets = [
    ["gold", "Gold"],
    ["goldWinner", "Gold"],
    ["winner", "Gold"],
    ["first", "Gold"],
    ["silver", "Silver"],
    ["silverWinner", "Silver"],
    ["runnerUp", "Silver"],
    ["second", "Silver"],
    ["bronze", "Bronze"],
    ["bronzeWinner", "Bronze"],
    ["third", "Bronze"],
  ];

  medalBuckets.forEach(([key, medal]) => {
    if (node[key]) {
      const value = node[key];

      if (Array.isArray(value)) {
        value.forEach((item) => {
          const normalized = normalizeMedalPayloadItem(item, { ...nextFallback, medal });
          if (normalized) output.push(normalized);
        });
      } else {
        const normalized = normalizeMedalPayloadItem(value, { ...nextFallback, medal });
        if (normalized) output.push(normalized);
      }
    }
  });

  Object.entries(node).forEach(([key, value]) => {
    if (
      [
        "player",
        "gold",
        "goldWinner",
        "winner",
        "first",
        "silver",
        "silverWinner",
        "runnerUp",
        "second",
        "bronze",
        "bronzeWinner",
        "third",
      ].includes(key)
    ) {
      return;
    }

    if (value && typeof value === "object") {
      collectMedalsFromObject(value, nextFallback, output, visited);
    }
  });

  return output;
};

const buildUniqueMedalList = (items = []) => {
  const result = [];
  const seen = new Set();

  items.forEach((item) => {
    const normalized = normalizeMedalPayloadItem(item);
    if (!normalized) return;

    const key = [
  normalized.entryId || buildResultStrictKey(normalized),
  normalized.medal,
].join("###");

    if (seen.has(key)) return;

    seen.add(key);
    result.push(normalized);
  });

  return result;
};

const extractMedalsFromTieSheetPayload = ({ medals, brackets, outcomes, tiesheet }) => {
  if (Array.isArray(medals)) {
    return buildUniqueMedalList(medals);
  }

  const collected = [];

  if (Array.isArray(brackets)) {
    collectMedalsFromObject(brackets, {}, collected);
  }

  if (tiesheet && typeof tiesheet === "object") {
    collectMedalsFromObject(tiesheet, {}, collected);
  }

  if (outcomes && typeof outcomes === "object" && Array.isArray(brackets)) {
    const outcomeValues = new Set();

    const collectOutcomeValues = (node) => {
      if (!node || typeof node !== "object") return;

      if (Array.isArray(node)) {
        node.forEach(collectOutcomeValues);
        return;
      }

      Object.values(node).forEach((value) => {
        if (value && typeof value === "object") {
          collectOutcomeValues(value);
        } else if (value !== undefined && value !== null && String(value).trim()) {
          outcomeValues.add(normalizeResultText(value));
        }
      });
    };

    collectOutcomeValues(outcomes);

    const bracketPlayers = [];
    collectMedalsFromObject(brackets, {}, bracketPlayers);

    bracketPlayers.forEach((player) => {
      const nameKey = normalizeResultText(player.name);
      if (nameKey && outcomeValues.has(nameKey)) {
        collected.push({
          ...player,
          medal: player.medal || "Gold",
        });
      }
    });
  }

  return buildUniqueMedalList(collected);
};

const syncTieSheetMedalsToEntries = async ({ tournamentId, userId, medals }) => {
  const validMedals = buildUniqueMedalList(medals || []);

  if (!validMedals.length) {
    return {
      attempted: false,
      matchedCount: 0,
      clearedCount: 0,
      medalsReceived: 0,
      reason: "no-valid-medals",
    };
  }

  const rows = await EntryRow.find({ tournamentId }).sort({ srNo: 1, createdAt: 1 }).lean();

  if (!rows.length) {
    return {
      attempted: true,
      matchedCount: 0,
      clearedCount: 0,
      medalsReceived: validMedals.length,
      reason: "entry-rows-not-found",
    };
  }

  const targetByEntryId = new Map();
  const targetByStrictKey = new Map();
  const targetByMediumKey = new Map();
  const targetByLooseKey = new Map();

  validMedals.forEach((item) => {
    const entryId = String(item.entryId || "").trim();
    if (entryId && !targetByEntryId.has(entryId)) targetByEntryId.set(entryId, item);

    const strictKey = buildResultStrictKey(item);
    const mediumKey = buildResultMediumKey(item);
    const looseKey = buildResultLooseKey(item);

    if (strictKey && !targetByStrictKey.has(strictKey)) targetByStrictKey.set(strictKey, item);
    if (mediumKey && !targetByMediumKey.has(mediumKey)) targetByMediumKey.set(mediumKey, item);
    if (looseKey && !targetByLooseKey.has(looseKey)) targetByLooseKey.set(looseKey, item);
  });

  const now = new Date();
  let matchedCount = 0;
  let clearedCount = 0;

  const bulkOps = [];

  rows.forEach((row) => {
    const currentEntryId = String(row.entryId || "").trim();

    const matched =
      (currentEntryId ? targetByEntryId.get(currentEntryId) : null) ||
      targetByStrictKey.get(buildResultStrictKey(row)) ||
      targetByMediumKey.get(buildResultMediumKey(row)) ||
      targetByLooseKey.get(buildResultLooseKey(row));

    if (matched) {
      matchedCount += 1;

      bulkOps.push({
        updateOne: {
          filter: { tournamentId: row.tournamentId, entryId: row.entryId },
          update: {
            $set: {
              medal: matched.medal,
              medalSource: "tiesheet",
              medalUpdatedAt: now,
              updatedBy: userId || null,
            },
          },
        },
      });

      return;
    }

    if (row.medalSource === "tiesheet") {
      clearedCount += 1;

      bulkOps.push({
        updateOne: {
          filter: { tournamentId: row.tournamentId, entryId: row.entryId },
          update: {
            $set: {
              medal: "",
              medalSource: "",
              medalUpdatedAt: null,
              updatedBy: userId || null,
            },
          },
        },
      });
    }
  });

  if (bulkOps.length > 0) {
    await EntryRow.bulkWrite(bulkOps, { ordered: false });
  }

  const latestRows = await EntryRow.find({ tournamentId }).sort({ srNo: 1, createdAt: 1 }).lean();

  const legacyEntries = latestRows.map((row, index) => ({
    srNo: index + 1,
    entryId: row.entryId,
    entrySource: row.entrySource || "",
    sourceSubmissionId: row.sourceSubmissionId || null,
    sourcePlayerId: row.sourcePlayerId || "",
    title: row.title || "",
    name: row.name || "",
    fathersName: row.fathersName || "",
    school: row.school || "",
    schoolName: row.schoolName || row.school || "",
    class: row.class || "",
    team: row.team || "",
    gender: row.gender || "",
    dob: row.dob || null,
    weight: row.weight ?? null,
    event: row.event || "",
    subEvent: row.subEvent || "",
    ageCategory: row.ageCategory || "",
    weightCategory: row.weightCategory || "",
    medal: row.medal || "",
    medalSource: row.medalSource || "",
    medalUpdatedAt: row.medalUpdatedAt || null,
    coach: row.coach || "",
    coachContact: row.coachContact || "",
    manager: row.manager || "",
    managerContact: row.managerContact || "",
  }));

  await Entry.findOneAndUpdate(
    { tournamentId },
    {
      $set: {
        entries: legacyEntries,
        updatedBy: userId || null,
      },
      $setOnInsert: {
        tournamentId,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  return {
    attempted: true,
    matchedCount,
    clearedCount,
    medalsReceived: validMedals.length,
    lastUpdated: now,
    reason: null,
  };
}; 

// ================ PUBLIC ENDPOINTS (No Auth Required) ================

export const getAllTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

   const normalized = tournaments.map(buildPublicTournamentResponse);

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get all tournaments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load tournaments" });
  }
};

export const getOngoingTournaments = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tournaments = await Tournament.find({
      $and: [{ dateTo: { $gte: today } }, getPublicVisibilityFilter()],
    })
      .populate("createdBy", "name")
      .sort({ dateFrom: 1 })
      .lean();

   const normalized = tournaments.map(buildPublicTournamentResponse);

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get ongoing tournaments failed", { error: error.message });
    res.status(500).json({ message: "Failed to load ongoing tournaments" });
  }
};

export const getPreviousTournaments = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tournaments = await Tournament.find({
      $and: [{ dateTo: { $lt: today } }, getPublicVisibilityFilter()],
    })
      .populate("createdBy", "name")
      .sort({ dateTo: -1 })
      .lean();

const normalized = tournaments.map(buildPublicTournamentResponse);

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

    return res.status(200).json(buildPublicTournamentResponse(tournament));
  } catch (error) {
    logger.error("Get tournament by ID failed", {
      error: error.message,
      tournamentId: req.params.id,
    });
    res.status(500).json({ message: "Failed to load tournament details" });
  }
};

export const getPrivateTournamentById = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("createdBy", "name phone email role")
      .lean();

    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    // Do not return deprecated Tournament.entries.
    // Entry model is the single source of truth for player entries and medals.
    const { entries, ...safeTournament } = tournament;

    return res.status(200).json({
      ...safeTournament,
      poster: normalizePath(tournament.poster),
      logos: tournament.logos?.map(normalizePath) || [],
    });
  } catch (error) {
    logger.error("Get private tournament by ID failed", {
      error: error.message,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
      message: "Failed to load private tournament details",
    });
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

export const getTieSheetOutcomes = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).select("tiesheet").lean();

    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    res.status(200).json({
      outcomes: tournament?.tiesheet?.outcomes || {},
      outcomesUpdatedAt: tournament?.tiesheet?.outcomesUpdatedAt || null,
    });
  } catch (error) {
    logger.error("Get tiesheet outcomes failed", {
      error: error.message,
      tournamentId: req.params.id,
    });

    res.status(500).json({ message: "Failed to load tiesheet outcomes" });
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

export const saveTieSheetOutcomes = async (req, res) => {
  try {
    const { outcomes, brackets, medals, tiesheet } = req.body || {};

    if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) {
      return res.status(400).json({ message: "Invalid outcomes data" });
    }

    const updated = await Tournament.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          "tiesheet.outcomes": outcomes,
          "tiesheet.outcomesUpdatedAt": new Date(),
        },
      },
      { new: true, select: "tiesheet" }
    ).lean();

    const saved = updated?.tiesheet?.outcomes || {};

    const medalsToSync = extractMedalsFromTieSheetPayload({
      medals,
      brackets,
      outcomes,
      tiesheet,
    });

    let syncResult = {
      attempted: false,
      matchedCount: 0,
      clearedCount: 0,
      medalsReceived: 0,
      reason: "no-medal-payload",
    };

    if (medalsToSync.length > 0) {
      syncResult = await syncTieSheetMedalsToEntries({
        tournamentId: req.params.id,
        userId: req.user?._id,
        medals: medalsToSync,
      });

      logger.info("TieSheet outcomes saved and medals sync attempted", {
  tournamentId: req.params.id,
  matchedCount: syncResult.matchedCount,
  clearedCount: syncResult.clearedCount,
  medalsReceived: syncResult.medalsReceived,
  entryIdMatchesUsed: medalsToSync.some((m) => m.entryId),
  reason: syncResult.reason,
});
    }

    res.status(200).json({
      message: "TieSheet outcomes saved",
      outcomes: saved,
      medalSync: syncResult,
    });
  } catch (error) {
    logger.error("Save tiesheet outcomes failed", {
      error: error.message,
      tournamentId: req.params.id,
    });

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

    const requiredFields = [
      "organizer",
      "federation",
      "tournamentName",
      "email",
      "contact",
      "dateFrom",
      "dateTo",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ message: `Missing required fields: ${missingFields.join(", ")}` });
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

    const poster = req.files?.poster?.[0] ? getStoredUploadValue(req.files.poster[0]) : undefined;
    const logos = req.files?.logos ? req.files.logos.map((file) => getStoredUploadValue(file)) : [];

    if (process.env.NODE_ENV !== "production") {
      const posterPath = req.files?.poster?.[0]?.path;
      const logoPaths = (req.files?.logos || []).map((f) => f?.path);

      const isCloudinary =
        (typeof posterPath === "string" && /^https?:\/\//i.test(posterPath)) ||
        logoPaths.some((p) => typeof p === "string" && /^https?:\/\//i.test(p));

     logger.info("Upload debug during tournament creation", {
  storage: isCloudinary ? "cloudinary" : "disk/local",
  poster,
  logos,
});
    }

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

    const nestedFields = [
      "venue",
      "ageCategories",
      "ageGender",
      "eventCategories",
      "entryFees",
      "weightCategories",
      "foodAndLodging",
      "medalPoints",
    ];

    tournamentData = parseNestedFields(tournamentData, nestedFields);

    if (tournamentData.weightCategories?.selected) {
      if (typeof tournamentData.weightCategories.selected === "string") {
        try {
          tournamentData.weightCategories.selected = JSON.parse(
            tournamentData.weightCategories.selected
          );
        } catch (err) {
          logger.warn("Failed to parse weightCategories.selected", { error: err.message });
          tournamentData.weightCategories.selected = { male: [], female: [] };
        }
      }

      tournamentData.weightCategories.selected.male = Array.isArray(
        tournamentData.weightCategories.selected.male
      )
        ? tournamentData.weightCategories.selected.male
        : [];

      tournamentData.weightCategories.selected.female = Array.isArray(
        tournamentData.weightCategories.selected.female
      )
        ? tournamentData.weightCategories.selected.female
        : [];
    }

    if (tournamentData.weightCategories?.type === "custom") {
      tournamentData.weightCategories.selected = undefined;
    } else {
      tournamentData.weightCategories.custom = undefined;
    }

    if (tournamentData.foodAndLodging) {
      tournamentData.foodAndLodging = {
        ...tournamentData.foodAndLodging,
        option: tournamentData.foodAndLodging.option || "No",
        type:
          tournamentData.foodAndLodging.option === "No"
            ? "Free"
            : tournamentData.foodAndLodging.type || "Free",
        paymentMethod:
          tournamentData.foodAndLodging.option === "No" ||
          tournamentData.foodAndLodging.type === "Free"
            ? undefined
            : tournamentData.foodAndLodging.paymentMethod,
        amount:
          tournamentData.foodAndLodging.option === "No" ||
          tournamentData.foodAndLodging.type === "Free"
            ? undefined
            : Number(tournamentData.foodAndLodging.amount) || undefined,
      };
    }

    const tournament = new Tournament(tournamentData);
    const saved = await tournament.save({ session });

    await session.commitTransaction();

    logger.info("Tournament created successfully", { id: saved._id, createdBy: req.user._id });

    logActivitySafe({
      req,
      user: req.user._id,
      actor: req.user._id,
      tournament: saved._id,
      action: "TOURNAMENT_CREATED",
      module: "tournament",
      title: "Tournament created",
      description: `${saved.tournamentName || "Tournament"} was created.`,
      metadata: {
        tournamentId: saved._id,
        tournamentName: saved.tournamentName || "",
        organizer: saved.organizer || "",
        federation: saved.federation || "",
        dateFrom: saved.dateFrom || null,
        dateTo: saved.dateTo || null,
        visibility: saved.visibility,
      },
    });

    res.status(201).json(saved.toObject());
  } catch (error) {
    await session.abortTransaction();

    logger.error("Create tournament failed", { error: error.message });

    res.status(error.name === "ValidationError" ? 400 : 500).json({
      message: error.message || "Server error during creation",
      details:
        error.name === "ValidationError"
          ? Object.values(error.errors).map((e) => e.message)
          : undefined,
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

    const nestedFields = [
      "venue",
      "ageCategories",
      "ageGender",
      "eventCategories",
      "entryFees",
      "weightCategories",
      "foodAndLodging",
      "medalPoints",
    ];

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
        type:
          updates.foodAndLodging.option === "No"
            ? "Free"
            : updates.foodAndLodging.type || "Free",
        paymentMethod:
          updates.foodAndLodging.option === "No" || updates.foodAndLodging.type === "Free"
            ? undefined
            : updates.foodAndLodging.paymentMethod,
        amount:
          updates.foodAndLodging.option === "No" || updates.foodAndLodging.type === "Free"
            ? undefined
            : Number(updates.foodAndLodging.amount) || undefined,
      };
    }

    if (req.files?.poster?.[0]) {
      validateFile(req.files.poster[0], "Poster");
      updates.poster = getStoredUploadValue(req.files.poster[0]);
    }

    if (req.files?.logos?.length > 0) {
      req.files.logos.forEach((logo) => validateFile(logo, "Logo"));
      updates.logos = req.files.logos.map((file) => getStoredUploadValue(file));
    }

    if (process.env.NODE_ENV !== "production") {
      const posterPath = req.files?.poster?.[0]?.path;
      const logoPaths = (req.files?.logos || []).map((f) => f?.path);

      const isCloudinary =
        (typeof posterPath === "string" && /^https?:\/\//i.test(posterPath)) ||
        logoPaths.some((p) => typeof p === "string" && /^https?:\/\//i.test(p));

      if (req.files?.poster?.[0] || (req.files?.logos && req.files.logos.length > 0)) {
        logger.info("Upload debug during tournament update", {
  storage: isCloudinary ? "cloudinary" : "disk/local",
  poster: req.files?.poster?.[0] ? updates.poster : undefined,
  logos: req.files?.logos?.length > 0 ? updates.logos : undefined,
});
      }
    }

    if (updates.weightCategories?.selected) {
      if (typeof updates.weightCategories.selected === "string") {
        try {
          updates.weightCategories.selected = JSON.parse(updates.weightCategories.selected);
        } catch (err) {
          logger.warn("Failed to parse weightCategories.selected in update", {
            error: err.message,
          });
          updates.weightCategories.selected = { male: [], female: [] };
        }
      }

      updates.weightCategories.selected.male = Array.isArray(updates.weightCategories.selected.male)
        ? updates.weightCategories.selected.male
        : [];

      updates.weightCategories.selected.female = Array.isArray(
        updates.weightCategories.selected.female
      )
        ? updates.weightCategories.selected.female
        : [];
    }

    if (updates.weightCategories?.type === "custom") {
      updates.weightCategories.selected = undefined;
    } else {
      updates.weightCategories.custom = undefined;
    }

    const updated = await Tournament.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
      session,
    }).populate("createdBy", "name phone email");

    if (!updated) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Tournament not found" });
    }

    await session.commitTransaction();

    logger.info("Tournament updated successfully", { id: req.params.id, updatedBy: req.user?._id });

    logActivitySafe({
      req,
      user: updated.createdBy?._id || updated.createdBy || req.user?._id,
      actor: req.user?._id,
      tournament: updated._id,
      action: "TOURNAMENT_UPDATED",
      module: "tournament",
      title: "Tournament updated",
      description: `${updated.tournamentName || "Tournament"} was updated.`,
      metadata: {
        tournamentId: updated._id,
        tournamentName: updated.tournamentName || "",
        organizer: updated.organizer || "",
        federation: updated.federation || "",
        updatedFields: Object.keys(updates || {}),
        hasPosterUpload: Boolean(req.files?.poster?.[0]),
        logosUploaded: Array.isArray(req.files?.logos) ? req.files.logos.length : 0,
      },
    });

    res.status(200).json(updated.toObject());
  } catch (error) {
    await session.abortTransaction();

    logger.error("Update tournament failed", { error: error.message });

    res.status(error.name === "ValidationError" ? 400 : 500).json({
      message: error.message || "Server error during update",
      details:
        error.name === "ValidationError"
          ? Object.values(error.errors).map((e) => e.message)
          : undefined,
    });
  } finally {
    session.endSession();
  }
};