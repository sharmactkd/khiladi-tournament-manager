import Entry from "../models/entry.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";

const isDev = process.env.NODE_ENV !== "production";

const allowedMedals = ["Gold", "Silver", "Bronze", "X-X-X-X", ""];
const allowedMedalSources = ["", "manual", "tiesheet"];

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeMedal = (value) => {
  const medal = String(value || "").trim();
  return allowedMedals.includes(medal) ? medal : "";
};

const normalizeMedalSource = (value) => {
  const source = String(value || "").trim();

  if (source === "manual-entry") return "manual";

  return allowedMedalSources.includes(source) ? source : "";
};

const normalizeGender = (value) => {
  const v = String(value || "").trim().toLowerCase();

  if (["male", "m", "boy", "boys"].includes(v)) return "Male";
  if (["female", "f", "girl", "girls"].includes(v)) return "Female";

  return "";
};

const normalizeWeight = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const cleaned = String(value).replace(/[^0-9.]/g, "").trim();

  if (!cleaned) return null;

  const num = Number(cleaned);

  return Number.isFinite(num) ? num : null;
};

const normalizeDob = (value) => {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const str = String(value).trim();

  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);

    const date = new Date(year, month, day);

    if (!isNaN(date.getTime())) return date;

    return null;
  }

  const parsed = new Date(str);

  if (!isNaN(parsed.getTime())) return parsed;

  return null;
};

const normalizeDateKey = (value) => {
  const date = normalizeDob(value);

  if (!date) return "";

  return date.toISOString().slice(0, 10);
};

const normalizeWeightKey = (value) => {
  const weight = normalizeWeight(value);

  if (weight === null) return "";

  return String(weight);
};

const buildStrictMatchKey = (row) =>
  [
    normalizeText(row?.name),
    normalizeText(row?.team),
    normalizeText(row?.gender),
    normalizeText(row?.event),
    normalizeText(row?.subEvent),
    normalizeText(row?.ageCategory),
    normalizeText(row?.weightCategory),
    normalizeWeightKey(row?.weight),
    normalizeDateKey(row?.dob),
  ].join("|||");

const buildMediumMatchKey = (row) =>
  [
    normalizeText(row?.name),
    normalizeText(row?.team),
    normalizeText(row?.gender),
    normalizeText(row?.event),
    normalizeText(row?.subEvent),
    normalizeText(row?.ageCategory),
    normalizeText(row?.weightCategory),
  ].join("|||");

const buildLooseMatchKey = (row) =>
  [
    normalizeText(row?.name),
    normalizeText(row?.team),
    normalizeText(row?.gender),
    normalizeText(row?.ageCategory),
    normalizeText(row?.weightCategory),
  ].join("|||");

const buildExistingEntryMaps = (existingEntries = []) => {
  const strict = new Map();
  const medium = new Map();
  const loose = new Map();

  existingEntries.forEach((entry) => {
    const plain = entry?.toObject ? entry.toObject() : entry;

    const strictKey = buildStrictMatchKey(plain);
    const mediumKey = buildMediumMatchKey(plain);
    const looseKey = buildLooseMatchKey(plain);

    if (strictKey && !strict.has(strictKey)) strict.set(strictKey, plain);
    if (mediumKey && !medium.has(mediumKey)) medium.set(mediumKey, plain);
    if (looseKey && !loose.has(looseKey)) loose.set(looseKey, plain);
  });

  return { strict, medium, loose };
};

const findExistingMatch = (entry, maps) => {
  const strictKey = buildStrictMatchKey(entry);
  const mediumKey = buildMediumMatchKey(entry);
  const looseKey = buildLooseMatchKey(entry);

  return (
    maps.strict.get(strictKey) ||
    maps.medium.get(mediumKey) ||
    maps.loose.get(looseKey) ||
    null
  );
};

const mapEntryForResponse = (e) => ({
  ...e,
  school: e.school ?? e.schoolName ?? "",
  medal: normalizeMedal(e.medal),
  medalSource: normalizeMedalSource(e.medalSource),
  medalUpdatedAt: e.medalUpdatedAt || null,
});

export const getEntries = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID format" });
    }

    const entryDoc = await Entry.findOne({ tournamentId: id }).lean();

    if (!entryDoc) {
      if (isDev) console.log("[getEntries] No entry doc found for tournament:", id);

      return res.status(200).json({
        success: true,
        entries: [],
        count: 0,
        userState: {},
        lastUpdated: null,
        message: "No entries found",
      });
    }

    const mappedEntries = (entryDoc.entries || []).map(mapEntryForResponse);

    if (isDev) {
      console.log("[getEntries] Found entry doc:", {
        tournamentId: id,
        count: mappedEntries.length,
        lastUpdated: entryDoc.updatedAt,
      });
    }

    res.status(200).json({
      success: true,
      entries: mappedEntries,
      count: mappedEntries.length,
      userState: entryDoc.userState || {},
      lastUpdated: entryDoc.updatedAt,
    });
  } catch (error) {
    console.error("Get entries error:", error);

    res.status(500).json({
      error: "Failed to retrieve entries",
      details: error.message,
    });
  }
};

export const saveEntries = async (req, res) => {
  try {
    const { id } = req.params;
    const { entries, state } = req.body || {};

    if (isDev) {
      console.log("[saveEntries] request received:", {
        method: req.method,
        url: req.originalUrl,
        tournamentId: id,
        userId: req.user?._id?.toString?.(),
        hasEntries: Array.isArray(entries),
        entriesCount: Array.isArray(entries) ? entries.length : 0,
        hasState: !!state,
      });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID" });
    }

    const existingEntryDoc = await Entry.findOne({ tournamentId: id }).lean();
    const existingMaps = buildExistingEntryMaps(existingEntryDoc?.entries || []);
    const now = new Date();

    const filteredEntries = (entries || []).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;

      return Object.entries(entry).some(([key, val]) => {
        if (key === "sr" || key === "srNo" || key === "actions") return false;
        return val !== undefined && val !== null && val !== "" && val !== 0;
      });
    });

    const mappedEntries = filteredEntries.map((e, i) => {
      const { sr, actions, ...rest } = e;

      const school = e.school ?? e.schoolName ?? "";

      const baseEntry = {
        ...rest,
        srNo: i + 1,
        title: String(e.title || "").trim(),
        name: String(e.name || "").trim(),
        fathersName: String(e.fathersName || "").trim(),
        school: String(school || "").trim(),
        schoolName: String(school || "").trim(),
        class: String(e.class || "").trim(),
        team: String(e.team || "").trim(),
        gender: normalizeGender(e.gender),
        dob: normalizeDob(e.dob),
        weight: normalizeWeight(e.weight),
        event: String(e.event || "").trim(),
        subEvent: String(e.subEvent || "").trim(),
        ageCategory: String(e.ageCategory || "").trim(),
        weightCategory: String(e.weightCategory || "").trim(),
        coach: String(e.coach || "").trim(),
        coachContact: String(e.coachContact || "").trim(),
        manager: String(e.manager || "").trim(),
        managerContact: String(e.managerContact || "").trim(),
      };

      const incomingMedal = normalizeMedal(e.medal);
      const existingMatch = findExistingMatch(baseEntry, existingMaps);

      const existingMedal = normalizeMedal(existingMatch?.medal);
      const existingMedalSource = normalizeMedalSource(existingMatch?.medalSource);
      const existingMedalUpdatedAt = existingMatch?.medalUpdatedAt || null;

      if (existingMedalSource === "tiesheet") {
        return {
          ...baseEntry,
          medal: existingMedal,
          medalSource: "tiesheet",
          medalUpdatedAt: existingMedalUpdatedAt,
        };
      }

      if (incomingMedal) {
        return {
          ...baseEntry,
          medal: incomingMedal,
          medalSource: "manual",
          medalUpdatedAt: now,
        };
      }

      return {
        ...baseEntry,
        medal: "",
        medalSource: "",
        medalUpdatedAt: null,
      };
    });

    const update = {
      $set: {
        entries: mappedEntries,
        userState: state && typeof state === "object" ? state : {},
        updatedBy: req.user._id,
      },
      $setOnInsert: {
        tournamentId: new mongoose.Types.ObjectId(id),
      },
    };

    const updated = await Entry.findOneAndUpdate({ tournamentId: id }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }).lean();

    if (isDev) {
      console.log("[saveEntries] DB write OK:", {
        tournamentId: id,
        storedCount: updated?.entries?.length || 0,
        lastUpdated: updated?.updatedAt,
        hasTournamentIdField: !!updated?.tournamentId,
      });
    }

    logger.info("Entries updated real-time", {
      tournamentId: id,
      count: updated?.entries?.length || 0,
    });

    res.status(200).json({
      success: true,
      message: "Saved successfully",
      lastUpdated: updated?.updatedAt || null,
      count: updated?.entries?.length || 0,
    });
  } catch (error) {
    console.error("Real-time save failed:", error);

    logger.error("Real-time save failed", {
      error: error.message,
      stack: error.stack,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    res.status(500).json({
      error: "Failed to save changes",
      details: error.message,
    });
  }
};