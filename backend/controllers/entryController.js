import Entry from "../models/entry.js";
import logger from "../utils/logger.js";
import { logActivitySafe } from "../utils/activityLogger.js";
import mongoose from "mongoose";

const isDev = process.env.NODE_ENV !== "production";

const allowedMedals = ["Gold", "Silver", "Bronze", "X-X-X-X", ""];
const allowedMedalSources = ["", "manual", "tiesheet"];
const allowedEntrySources = ["", "manual", "teamSubmission", "import"];

const createEntryId = () => new mongoose.Types.ObjectId().toString();

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

const normalizeEntrySource = (value) => {
  const source = String(value || "").trim();

  if (source === "team-submission") return "teamSubmission";
  if (source === "manual-entry") return "manual";

  return allowedEntrySources.includes(source) ? source : "";
};

const normalizeGender = (value) => {
  const v = String(value || "")
    .trim()
    .toLowerCase();

  if (["male", "m", "boy", "boys"].includes(v)) return "Male";
  if (["female", "f", "girl", "girls"].includes(v)) return "Female";

  return "";
};

const normalizeWeight = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const cleaned = String(value)
    .replace(/[^0-9.]/g, "")
    .trim();

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
  const byEntryId = new Map();
  const strict = new Map();
  const medium = new Map();
  const loose = new Map();

  existingEntries.forEach((entry) => {
    const plain = entry?.toObject ? entry.toObject() : entry;

    const entryId = String(plain?.entryId || "").trim();
    const strictKey = buildStrictMatchKey(plain);
    const mediumKey = buildMediumMatchKey(plain);
    const looseKey = buildLooseMatchKey(plain);

    if (entryId && !byEntryId.has(entryId)) byEntryId.set(entryId, plain);
    if (strictKey && !strict.has(strictKey)) strict.set(strictKey, plain);
    if (mediumKey && !medium.has(mediumKey)) medium.set(mediumKey, plain);
    if (looseKey && !loose.has(looseKey)) loose.set(looseKey, plain);
  });

  return { byEntryId, strict, medium, loose };
};

const findExistingMatch = (entry, maps) => {
  const entryId = String(entry?.entryId || "").trim();

  if (entryId && maps.byEntryId.has(entryId)) {
    return maps.byEntryId.get(entryId);
  }

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

const getStableEntryId = (incomingEntry, existingMatch) => {
  const incomingId = String(incomingEntry?.entryId || "").trim();
  if (incomingId) return incomingId;

  const existingId = String(existingMatch?.entryId || "").trim();
  if (existingId) return existingId;

  return createEntryId();
};

const mapEntryForResponse = (e) => {
  const entry = e?.toObject ? e.toObject() : e || {};

  return {
    ...entry,
    entryId: String(entry.entryId || "").trim() || createEntryId(),
    school: entry.school ?? entry.schoolName ?? "",
    medal: normalizeMedal(entry.medal),
    medalSource: normalizeMedalSource(entry.medalSource),
    medalUpdatedAt: entry.medalUpdatedAt || null,
    entrySource: normalizeEntrySource(entry.entrySource),
    sourceSubmissionId: entry.sourceSubmissionId || null,
    sourcePlayerId: String(entry.sourcePlayerId || "").trim(),
  };
};

const getTeamsFromEntries = (entries = []) => [
  ...new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.team || "").trim())
      .filter(Boolean),
  ),
];

export const getEntries = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID format" });
    }

    const entryDoc = await Entry.findOne({ tournamentId: id }).lean();

    if (!entryDoc) {
      if (isDev) {
        logger.info("No entry doc found for tournament", {
          tournamentId: id,
          userId: req.user?._id,
        });
      }

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
      logger.info("Entry doc loaded", {
        tournamentId: id,
        count: mappedEntries.length,
        lastUpdated: entryDoc.updatedAt,
        userId: req.user?._id,
      });
    }

    return res.status(200).json({
      success: true,
      entries: mappedEntries,
      count: mappedEntries.length,
      userState: entryDoc.userState || {},
      lastUpdated: entryDoc.updatedAt,
    });
  } catch (error) {
    logger.error("Get entries failed", {
      error: error.message,
      stack: error.stack,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
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
      logger.info("Save entries request received", {
        method: req.method,
        url: req.originalUrl,
        tournamentId: id,
        userId: req.user?._id,
        hasEntries: Array.isArray(entries),
        entriesCount: Array.isArray(entries) ? entries.length : 0,
        hasState: Boolean(state),
      });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID" });
    }

    const existingEntryDoc = await Entry.findOne({ tournamentId: id }).lean();

    const existingEntriesCount = Array.isArray(existingEntryDoc?.entries)
      ? existingEntryDoc.entries.length
      : 0;

    const existingMaps = buildExistingEntryMaps(
      existingEntryDoc?.entries || [],
    );
    const now = new Date();

    const filteredEntries = (Array.isArray(entries) ? entries : []).filter(
      (entry) => {
        if (!entry || typeof entry !== "object") return false;

        return Object.entries(entry).some(([key, val]) => {
          if (
            [
              "sr",
              "srNo",
              "actions",
              "entryId",
              "entrySource",
              "sourceSubmissionId",
              "sourcePlayerId",
            ].includes(key)
          ) {
            return false;
          }

          return val !== undefined && val !== null && val !== "" && val !== 0;
        });
      },
    );

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

      const existingMatch = findExistingMatch(
        {
          ...baseEntry,
          entryId: e.entryId,
        },
        existingMaps,
      );

      const entryId = getStableEntryId(e, existingMatch);

      const enrichedBaseEntry = {
        ...baseEntry,
        entryId,
        entrySource:
          normalizeEntrySource(e.entrySource) ||
          normalizeEntrySource(existingMatch?.entrySource) ||
          "manual",
        sourceSubmissionId:
          e.sourceSubmissionId || existingMatch?.sourceSubmissionId || null,
        sourcePlayerId: String(
          e.sourcePlayerId || existingMatch?.sourcePlayerId || "",
        ).trim(),
      };

      const incomingMedal = normalizeMedal(e.medal);

      const existingMedal = normalizeMedal(existingMatch?.medal);
      const existingMedalSource = normalizeMedalSource(
        existingMatch?.medalSource,
      );
      const existingMedalUpdatedAt = existingMatch?.medalUpdatedAt || null;

      if (existingMedalSource === "tiesheet") {
        return {
          ...enrichedBaseEntry,
          medal: existingMedal,
          medalSource: "tiesheet",
          medalUpdatedAt: existingMedalUpdatedAt,
        };
      }

      if (incomingMedal) {
        return {
          ...enrichedBaseEntry,
          medal: incomingMedal,
          medalSource: "manual",
          medalUpdatedAt: now,
        };
      }

      return {
        ...enrichedBaseEntry,
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
      logger.info("Entries saved to DB", {
        tournamentId: id,
        storedCount: updated?.entries?.length || 0,
        lastUpdated: updated?.updatedAt,
        hasTournamentIdField: Boolean(updated?.tournamentId),
        userId: req.user?._id,
      });
    }

    logger.info("Entries updated real-time", {
      tournamentId: id,
      userId: req.user?._id,
      count: updated?.entries?.length || 0,
    });

    const updatedEntriesCount = updated?.entries?.length || 0;
    const addedCount = Math.max(updatedEntriesCount - existingEntriesCount, 0);
    const updatedCount =
      existingEntryDoc && updatedEntriesCount >= existingEntriesCount
        ? Math.min(existingEntriesCount, updatedEntriesCount)
        : updatedEntriesCount;

    logActivitySafe({
      req,
      user: req.user._id,
      actor: req.user._id,
      tournament: id,
      action: "ENTRIES_SAVED",
      module: "entry",
      title: "Entries saved",
      description: `${updatedEntriesCount} entries saved/updated.`,
      metadata: {
        tournamentId: id,
        entriesCount: updatedEntriesCount,
        previousEntriesCount: existingEntriesCount,
        addedCount,
        updatedCount,
        teams: getTeamsFromEntries(updated?.entries || []),
        source: "entry-page",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Saved successfully",
      lastUpdated: updated?.updatedAt || null,
      count: updated?.entries?.length || 0,
    });
  } catch (error) {
    logger.error("Real-time save failed", {
      error: error.message,
      stack: error.stack,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
      error: "Failed to save changes",
      details: error.message,
    });
  }
};

export const updateSingleEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const updates = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    if (!entryId || !String(entryId).trim()) {
      return res.status(400).json({
        success: false,
        message: "entryId is required",
      });
    }

    const allowedFields = [
      "title",
      "name",
      "fathersName",
      "school",
      "schoolName",
      "class",
      "team",
      "gender",
      "dob",
      "weight",
      "event",
      "subEvent",
      "ageCategory",
      "weightCategory",
      "coach",
      "coachContact",
      "manager",
      "managerContact",
      "medal",
      "medalSource",
      "medalUpdatedAt",
    ];

    const setObj = {};

   allowedFields.forEach((field) => {
  if (updates[field] === undefined) return;

  let value = updates[field];

  if (field === "gender") value = normalizeGender(value);
  if (field === "weight") value = normalizeWeight(value);
  if (field === "dob") value = normalizeDob(value);
  if (field === "medal") value = normalizeMedal(value);
  if (field === "medalSource") value = normalizeMedalSource(value);

  if (
    [
      "title",
      "name",
      "fathersName",
      "school",
      "schoolName",
      "class",
      "team",
      "event",
      "subEvent",
      "ageCategory",
      "weightCategory",
      "coach",
      "coachContact",
      "manager",
      "managerContact",
    ].includes(field)
  ) {
    value = String(value || "").trim();
  }

  setObj[`entries.$.${field}`] = value;
});

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const rootSetObj = {
      updatedBy: req.user._id,
    };

    const updated = await Entry.findOneAndUpdate(
      {
        tournamentId: id,
        "entries.entryId": String(entryId).trim(),
      },
      {
        $set: {
          ...setObj,
          ...rootSetObj,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Entry row not found",
      });
    }

    logger.info("Entry row updated", {
      entryId,
      tournamentId: id,
      userId: req.user._id,
      updatedFields: Object.keys(updates),
    });

    return res.status(200).json({
      success: true,
      message: "Entry updated successfully",
      entryId,
      lastUpdated: updated.updatedAt,
    });
  } catch (error) {
    logger.error("Single entry update failed", {
      error: error.message,
      stack: error.stack,
      entryId: req.params.entryId,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to update entry",
    });
  }
};

export const deleteSingleEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    if (!entryId || !String(entryId).trim()) {
      return res.status(400).json({
        success: false,
        message: "entryId is required",
      });
    }

    const updated = await Entry.findOneAndUpdate(
      { tournamentId: id },
      {
        $pull: { entries: { entryId: String(entryId).trim() } },
        $set: { updatedBy: req.user._id },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Entry document not found",
      });
    }

    logger.info("Entry row deleted", {
      entryId,
      tournamentId: id,
      userId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Entry deleted successfully",
      entryId,
      lastUpdated: updated.updatedAt,
      count: updated.entries?.length || 0,
    });
  } catch (error) {
    logger.error("Delete entry failed", {
      error: error.message,
      stack: error.stack,
      entryId: req.params.entryId,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to delete entry",
    });
  }
};
