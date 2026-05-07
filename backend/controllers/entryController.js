import Entry from "../models/entry.js";
import EntryRow from "../models/entryRow.js";
import logger from "../utils/logger.js";
import { logActivitySafe } from "../utils/activityLogger.js";
import mongoose from "mongoose";

const isDev = process.env.NODE_ENV !== "production";
const MAX_ENTRY_SAVE_BYTES = 10 * 1024 * 1024;

const allowedMedals = ["Gold", "Silver", "Bronze", "X-X-X-X", ""];
const allowedMedalSources = ["", "manual", "tiesheet"];
const allowedEntrySources = ["", "manual", "teamSubmission", "import"];

const createEntryId = () => new mongoose.Types.ObjectId().toString();

const normalizeText = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

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
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return !isNaN(date.getTime()) ? date : null;
  }

  const parsed = new Date(str);
  return !isNaN(parsed.getTime()) ? parsed : null;
};

const normalizeDateKey = (value) => {
  const date = normalizeDob(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

const normalizeWeightKey = (value) => {
  const weight = normalizeWeight(value);
  return weight === null ? "" : String(weight);
};

const normalizeObjectIdOrNull = (value) => {
  if (!value) return null;
  const stringValue = String(value).trim();
  return mongoose.Types.ObjectId.isValid(stringValue)
    ? new mongoose.Types.ObjectId(stringValue)
    : null;
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

    if (entryId && !byEntryId.has(entryId)) byEntryId.set(entryId, plain);

    const strictKey = buildStrictMatchKey(plain);
    const mediumKey = buildMediumMatchKey(plain);
    const looseKey = buildLooseMatchKey(plain);

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

  return (
    maps.strict.get(buildStrictMatchKey(entry)) ||
    maps.medium.get(buildMediumMatchKey(entry)) ||
    maps.loose.get(buildLooseMatchKey(entry)) ||
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
    schoolName: entry.schoolName ?? entry.school ?? "",
    medal: normalizeMedal(entry.medal),
    medalSource: normalizeMedalSource(entry.medalSource),
    medalUpdatedAt: entry.medalUpdatedAt || null,
    entrySource: normalizeEntrySource(entry.entrySource),
    sourceSubmissionId: entry.sourceSubmissionId || null,
    sourcePlayerId: String(entry.sourcePlayerId || "").trim(),
  };
};

const mapEntryRowForResponse = (row) => {
  const plain = row?.toObject ? row.toObject() : row || {};
  const { _id, __v, tournamentId, createdBy, updatedBy, ...rest } = plain;

  return mapEntryForResponse({
    ...rest,
    id: _id,
    _id,
    tournamentId,
    createdBy,
    updatedBy,
  });
};

const normalizeEntryForEntryRow = ({ tournamentId, entry, index = 0, userId = null }) => {
  const source = entry?.toObject ? entry.toObject() : entry || {};
  const school = source.school ?? source.schoolName ?? "";
  const entryId = String(source.entryId || "").trim() || createEntryId();

  return {
    tournamentId: new mongoose.Types.ObjectId(tournamentId),
    entryId,
    srNo: Number(source.srNo || index + 1),

    title: String(source.title || "").trim(),
    name: String(source.name || "").trim(),
    fathersName: String(source.fathersName || "").trim(),

    school: String(school || "").trim(),
    schoolName: String(school || "").trim(),
    class: String(source.class || "").trim(),

    team: String(source.team || "").trim(),
    gender: normalizeGender(source.gender),
    dob: normalizeDob(source.dob),
    weight: normalizeWeight(source.weight),

    event: String(source.event || "").trim(),
    subEvent: String(source.subEvent || "").trim(),
    ageCategory: String(source.ageCategory || "").trim(),
    weightCategory: String(source.weightCategory || "").trim(),

    medal: normalizeMedal(source.medal),
    medalSource: normalizeMedalSource(source.medalSource),
    medalUpdatedAt: source.medalUpdatedAt || null,

    entrySource: normalizeEntrySource(source.entrySource) || "manual",
    sourceSubmissionId: normalizeObjectIdOrNull(source.sourceSubmissionId),
    sourcePlayerId: String(source.sourcePlayerId || "").trim(),

    coach: String(source.coach || "").trim(),
    coachContact: String(source.coachContact || "").trim(),
    manager: String(source.manager || "").trim(),
    managerContact: String(source.managerContact || "").trim(),

    createdBy: userId || null,
    updatedBy: userId || null,
  };
};

const getTeamsFromEntries = (entries = []) => [
  ...new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.team || "").trim())
      .filter(Boolean)
  ),
];

const getEntryRows = async (tournamentId) =>
  EntryRow.find({ tournamentId: new mongoose.Types.ObjectId(tournamentId) })
    .sort({ srNo: 1, createdAt: 1 })
    .lean();

const syncEntryRowsFromEntries = async ({
  tournamentId,
  entries = [],
  userId = null,
  removeMissingRows = true,
}) => {
  const normalizedRows = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeEntryForEntryRow({ tournamentId, entry, index, userId }))
    .filter((row) => row.entryId);

  const entryIds = normalizedRows.map((row) => row.entryId);

  const bulkOps = normalizedRows.map((row) => ({
    updateOne: {
      filter: {
        tournamentId: row.tournamentId,
        entryId: row.entryId,
      },
      update: {
        $set: {
          srNo: row.srNo,
          title: row.title,
          name: row.name,
          fathersName: row.fathersName,
          school: row.school,
          schoolName: row.schoolName,
          class: row.class,
          team: row.team,
          gender: row.gender,
          dob: row.dob,
          weight: row.weight,
          event: row.event,
          subEvent: row.subEvent,
          ageCategory: row.ageCategory,
          weightCategory: row.weightCategory,
          medal: row.medal,
          medalSource: row.medalSource,
          medalUpdatedAt: row.medalUpdatedAt,
          entrySource: row.entrySource,
          sourceSubmissionId: row.sourceSubmissionId,
          sourcePlayerId: row.sourcePlayerId,
          coach: row.coach,
          coachContact: row.coachContact,
          manager: row.manager,
          managerContact: row.managerContact,
          updatedBy: row.updatedBy,
        },
        $setOnInsert: {
          tournamentId: row.tournamentId,
          entryId: row.entryId,
          createdBy: row.createdBy,
        },
      },
      upsert: true,
    },
  }));

  let bulkResult = null;

  if (bulkOps.length) {
    bulkResult = await EntryRow.bulkWrite(bulkOps, { ordered: false });
  }

  let deletedCount = 0;

  if (removeMissingRows) {
    const deleteResult = await EntryRow.deleteMany({
      tournamentId: new mongoose.Types.ObjectId(tournamentId),
      entryId: { $nin: entryIds },
    });

    deletedCount = deleteResult.deletedCount || 0;
  }

  return {
    success: true,
    totalRows: normalizedRows.length,
    upsertedCount: bulkResult?.upsertedCount || 0,
    modifiedCount: bulkResult?.modifiedCount || 0,
    deletedCount,
  };
};

const mirrorEntryRowsToLegacyEntry = async ({
  tournamentId,
  entries,
  userState = {},
  userId,
}) => {
  const update = {
    $set: {
      entries,
      userState: userState && typeof userState === "object" ? userState : {},
      updatedBy: userId || null,
    },
    $setOnInsert: {
      tournamentId: new mongoose.Types.ObjectId(tournamentId),
    },
  };

  return Entry.findOneAndUpdate({ tournamentId }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  }).lean();
};

const getLegacyUserState = async (tournamentId) => {
  const legacyDoc = await Entry.findOne({ tournamentId }).select("userState updatedAt").lean();
  return {
    userState: legacyDoc?.userState || {},
    lastUpdated: legacyDoc?.updatedAt || null,
  };
};

const hydrateEntryRowsFromLegacyIfNeeded = async ({ tournamentId, userId }) => {
  const existingRowsCount = await EntryRow.countDocuments({
    tournamentId: new mongoose.Types.ObjectId(tournamentId),
  });

  if (existingRowsCount > 0) return;

  const legacyDoc = await Entry.findOne({ tournamentId }).lean();

  if (!legacyDoc?.entries?.length) return;

  await syncEntryRowsFromEntries({
    tournamentId,
    entries: legacyDoc.entries.map(mapEntryForResponse),
    userId,
    removeMissingRows: false,
  });
};

const buildSanitizedEntries = ({ incomingEntries, existingEntries }) => {
  const existingMaps = buildExistingEntryMaps(existingEntries);
  const now = new Date();

  const filteredEntries = (Array.isArray(incomingEntries) ? incomingEntries : []).filter((entry) => {
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
  });

  return filteredEntries.map((e, i) => {
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

    const existingMatch = findExistingMatch({ ...baseEntry, entryId: e.entryId }, existingMaps);
    const entryId = getStableEntryId(e, existingMatch);

    const enrichedBaseEntry = {
      ...baseEntry,
      entryId,
      entrySource:
        normalizeEntrySource(e.entrySource) ||
        normalizeEntrySource(existingMatch?.entrySource) ||
        "manual",
      sourceSubmissionId: e.sourceSubmissionId || existingMatch?.sourceSubmissionId || null,
      sourcePlayerId: String(e.sourcePlayerId || existingMatch?.sourcePlayerId || "").trim(),
    };

    const incomingMedal = normalizeMedal(e.medal);
    const existingMedal = normalizeMedal(existingMatch?.medal);
    const existingMedalSource = normalizeMedalSource(existingMatch?.medalSource);
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
};

const buildEntryRowSetFromUpdates = (updates = {}) => {
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

    setObj[field] = value;
  });

  if (setObj.school !== undefined && setObj.schoolName === undefined) {
    setObj.schoolName = setObj.school;
  }

  if (setObj.schoolName !== undefined && setObj.school === undefined) {
    setObj.school = setObj.schoolName;
  }

  return setObj;
};

const updateLegacySingleEntryMirror = async ({ tournamentId, entryId, setObj, userId }) => {
  const legacySet = {};

  Object.entries(setObj).forEach(([field, value]) => {
    legacySet[`entries.$.${field}`] = value;
  });

  if (!Object.keys(legacySet).length) return null;

  return Entry.findOneAndUpdate(
    {
      tournamentId,
      "entries.entryId": String(entryId).trim(),
    },
    {
      $set: {
        ...legacySet,
        updatedBy: userId,
      },
    },
    { new: true, runValidators: true }
  ).lean();
};

export const getEntries = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID format" });
    }

    await hydrateEntryRowsFromLegacyIfNeeded({
      tournamentId: id,
      userId: req.user?._id || null,
    });

    const [rows, legacyMeta] = await Promise.all([
      getEntryRows(id),
      getLegacyUserState(id),
    ]);

    const mappedEntries = rows.map(mapEntryRowForResponse);

    return res.status(200).json({
      success: true,
      entries: mappedEntries,
      count: mappedEntries.length,
      userState: legacyMeta.userState || {},
      lastUpdated:
        rows?.[0]?.updatedAt || legacyMeta.lastUpdated || null,
      ...(mappedEntries.length === 0 ? { message: "No entries found" } : {}),
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

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid tournament ID" });
    }

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        error: "Invalid entries payload",
        message: "entries must be an array",
      });
    }

    const approxSizeBytes = Buffer.byteLength(JSON.stringify(entries), "utf8");

    if (approxSizeBytes > MAX_ENTRY_SAVE_BYTES) {
      return res.status(413).json({
        message:
          "Entry data is too large for one save. Please use row-level updates.",
      });
    }

    await hydrateEntryRowsFromLegacyIfNeeded({
      tournamentId: id,
      userId: req.user._id,
    });

    const existingRows = await getEntryRows(id);
    const existingEntries = existingRows.map(mapEntryRowForResponse);
    const existingEntriesCount = existingEntries.length;

    const mappedEntries = buildSanitizedEntries({
      incomingEntries: entries,
      existingEntries,
    });

    await syncEntryRowsFromEntries({
      tournamentId: id,
      entries: mappedEntries,
      userId: req.user._id,
      removeMissingRows: true,
    });

    const updated = await mirrorEntryRowsToLegacyEntry({
      tournamentId: id,
      entries: mappedEntries,
      userState: state,
      userId: req.user._id,
    });

    const updatedEntriesCount = mappedEntries.length;
    const addedCount = Math.max(updatedEntriesCount - existingEntriesCount, 0);
    const updatedCount =
      updatedEntriesCount >= existingEntriesCount
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
        teams: getTeamsFromEntries(mappedEntries),
        source: "entry-page",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Saved successfully",
      lastUpdated: updated?.updatedAt || null,
      count: mappedEntries.length,
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

export const createSingleEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament ID",
      });
    }

    const currentCount = await EntryRow.countDocuments({
      tournamentId: new mongoose.Types.ObjectId(id),
    });

    const entryId = String(payload.entryId || "").trim() || createEntryId();

    const normalized = normalizeEntryForEntryRow({
      tournamentId: id,
      entry: {
        ...payload,
        entryId,
        srNo: payload.srNo || currentCount + 1,
        entrySource: payload.entrySource || "manual",
      },
      index: currentCount,
      userId: req.user._id,
    });

    const row = await EntryRow.findOneAndUpdate(
      {
        tournamentId: normalized.tournamentId,
        entryId: normalized.entryId,
      },
      {
        $set: {
          ...normalized,
          updatedBy: req.user._id,
        },
        $setOnInsert: {
          createdBy: req.user._id,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    ).lean();

    const rows = await getEntryRows(id);
    const mappedEntries = rows.map(mapEntryRowForResponse);

    const legacyMeta = await getLegacyUserState(id);
    await mirrorEntryRowsToLegacyEntry({
      tournamentId: id,
      entries: mappedEntries,
      userState: legacyMeta.userState,
      userId: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Entry created successfully",
      entry: mapEntryRowForResponse(row),
      entryId,
      count: mappedEntries.length,
    });
  } catch (error) {
    logger.error("Single entry create failed", {
      error: error.message,
      stack: error.stack,
      tournamentId: req.params.id,
      userId: req.user?._id,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to create entry",
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

    const setObj = buildEntryRowSetFromUpdates(updates);

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    setObj.updatedBy = req.user._id;

    const updatedRow = await EntryRow.findOneAndUpdate(
      {
        tournamentId: new mongoose.Types.ObjectId(id),
        entryId: String(entryId).trim(),
      },
      {
        $set: setObj,
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedRow) {
      return res.status(404).json({
        success: false,
        message: "Entry row not found",
      });
    }

    await updateLegacySingleEntryMirror({
      tournamentId: id,
      entryId,
      setObj,
      userId: req.user._id,
    });

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
      entry: mapEntryRowForResponse(updatedRow),
      lastUpdated: updatedRow.updatedAt,
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

    const deleted = await EntryRow.findOneAndDelete({
      tournamentId: new mongoose.Types.ObjectId(id),
      entryId: String(entryId).trim(),
    }).lean();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Entry row not found",
      });
    }

    const updatedLegacy = await Entry.findOneAndUpdate(
      { tournamentId: id },
      {
        $pull: { entries: { entryId: String(entryId).trim() } },
        $set: { updatedBy: req.user._id },
      },
      { new: true }
    ).lean();

    logger.info("Entry row deleted", {
      entryId,
      tournamentId: id,
      userId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Entry deleted successfully",
      entryId,
      lastUpdated: updatedLegacy?.updatedAt || null,
      count: updatedLegacy?.entries?.length || 0,
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