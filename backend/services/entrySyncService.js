import mongoose from "mongoose";
import Entry from "../models/entry.js";
import EntryRow from "../models/entryRow.js";
import EntrySyncBatch from "../models/entrySyncBatch.js";
import Tournament from "../models/tournament.js";

export const ENTRY_SYNC_BATCH_LIMIT = 100;
const RECEIPT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const TEXT_FIELDS = new Set([
  "title",
  "name",
  "fathersName",
  "school",
  "schoolName",
  "class",
  "aadhaarNumber",
  "panNumber",
  "udiseCode",
  "team",
  "event",
  "subEvent",
  "fresherGroup",
  "ageCategory",
  "weightCategory",
  "coach",
  "coachContact",
  "manager",
  "managerContact",
]);

const ALLOWED_FIELDS = new Set([
  ...TEXT_FIELDS,
  "gender",
  "dob",
  "weight",
  "medal",
  "medalSource",
  "medalUpdatedAt",
  "entrySource",
  "sourceSubmissionId",
  "sourcePlayerId",
  "sr",
  "srNo",
]);

const DISPLAY_BRACKET_FIELDS = new Set(["name", "team"]);
const STRUCTURAL_BRACKET_FIELDS = new Set([
  "gender",
  "ageCategory",
  "weightCategory",
  "event",
  "subEvent",
  "fresherGroup",
]);

const normalizeGender = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["m", "male", "boy", "boys"].includes(normalized)) return "Male";
  if (["f", "female", "girl", "girls"].includes(normalized)) return "Female";
  return "";
};

const normalizeWeight = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 200 ? parsed : null;
};

const normalizeTwelveDigitIdentifier = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{12}$/.test(raw) && !/^\d{4}-\d{4}-\d{4}$/.test(raw)) {
    throw new Error("Identifier must contain exactly 12 digits");
  }
  const digits = raw.replace(/\D/g, "");
  return digits.match(/.{1,4}/g)?.join("-") || "";
};

const normalizeDob = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const input = String(value).trim();
  const match = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const parsed = match
    ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])))
    : new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMedal = (value) => {
  const medal = String(value || "").trim();
  return ["", "Gold", "Silver", "Bronze", "X-X-X-X"].includes(medal)
    ? medal
    : "";
};

const normalizeMedalSource = (value) => {
  const source = String(value || "").trim();
  return ["", "manual", "category-auto", "tiesheet"].includes(source)
    ? source
    : "";
};

const normalizeEntrySource = (value) => {
  const source = String(value || "").trim();
  return ["", "manual", "teamSubmission", "import"].includes(source)
    ? source
    : "manual";
};

const isFresherEntry = (row = {}) =>
  [row?.event, row?.subEvent].some((value) =>
    /\bfresh(?:er|ers)?\b/i.test(String(value || "").trim())
  );

const fresherGroupKey = (row = {}) => {
  if (!isFresherEntry(row)) return "";
  const gender = normalizeGender(row?.gender).toLowerCase();
  const group = String(row?.fresherGroup || "").trim().replace(/\s+/g, " ").toUpperCase();
  return gender && group ? `${gender}::${group}` : "";
};

const normalizeObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const comparable = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export const normalizeEntrySyncUpdates = (updates = {}) => {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updates must be an object");
  }

  const unknownFields = Object.keys(updates).filter(
    (field) => !ALLOWED_FIELDS.has(field)
  );
  if (unknownFields.length) {
    throw new Error(`Unsupported entry fields: ${unknownFields.join(", ")}`);
  }

  const normalized = {};
  for (const [field, rawValue] of Object.entries(updates)) {
    let value = rawValue;
    if (TEXT_FIELDS.has(field)) value = String(rawValue || "").trim();
    if (field === "gender") value = normalizeGender(rawValue);
    if (field === "fresherGroup") value = String(rawValue || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (field === "weight") value = normalizeWeight(rawValue);
    if (["aadhaarNumber", "panNumber", "udiseCode"].includes(field)) {
      value = normalizeTwelveDigitIdentifier(rawValue);
    }
    if (field === "dob") value = normalizeDob(rawValue);
    if (field === "medal") value = normalizeMedal(rawValue);
    if (field === "medalSource") value = normalizeMedalSource(rawValue);
    if (field === "entrySource") value = normalizeEntrySource(rawValue);
    if (field === "sourceSubmissionId") value = normalizeObjectId(rawValue);
    if (field === "sourcePlayerId") value = String(rawValue || "").trim();
    if (field === "medalUpdatedAt") value = normalizeDob(rawValue);
    if (field === "sr" || field === "srNo") {
      const srNo = Number.parseInt(rawValue, 10);
      value = Number.isFinite(srNo) && srNo > 0 ? srNo : 0;
    }
    normalized[field === "sr" ? "srNo" : field] = value;
  }

  if (normalized.school !== undefined && normalized.schoolName === undefined) {
    normalized.schoolName = normalized.school;
  }
  if (normalized.schoolName !== undefined && normalized.school === undefined) {
    normalized.school = normalized.schoolName;
  }
  return normalized;
};

const validateOperation = (operation, index) => {
  const operationId = String(operation?.operationId || "").trim();
  const entryId = String(operation?.entryId || "").trim();
  const type = String(operation?.type || "").trim();

  if (!operationId) throw new Error(`operations[${index}].operationId is required`);
  if (!entryId || entryId.length > 160) {
    throw new Error(`operations[${index}].entryId is invalid`);
  }
  if (!["upsert", "delete"].includes(type)) {
    throw new Error(`operations[${index}].type must be upsert or delete`);
  }

  return {
    operationId,
    entryId,
    type,
    updates: type === "upsert" ? normalizeEntrySyncUpdates(operation.updates) : {},
  };
};

const detectBracketChanges = (operations, existingByEntryId) => {
  let displayChanged = false;
  let structureChanged = false;
  const changedEntryIds = new Set();
  const changedFields = new Set();

  for (const operation of operations) {
    if (operation.type === "delete") {
      structureChanged = true;
      changedEntryIds.add(operation.entryId);
      changedFields.add("delete");
      continue;
    }
    const existing = existingByEntryId.get(operation.entryId) || {};
    for (const [field, value] of Object.entries(operation.updates)) {
      if (comparable(existing[field]) === comparable(value)) continue;
      if (DISPLAY_BRACKET_FIELDS.has(field)) {
        displayChanged = true;
        changedEntryIds.add(operation.entryId);
        changedFields.add(field);
      }
      if (STRUCTURAL_BRACKET_FIELDS.has(field)) {
        structureChanged = true;
        changedEntryIds.add(operation.entryId);
        changedFields.add(field);
      }
    }
  }
  return {
    displayChanged,
    structureChanged,
    changedEntryIds: [...changedEntryIds],
    changedFields: [...changedFields],
  };
};

export const markTieSheetEntriesChanged = async ({
  tournamentId,
  userId,
  displayChanged,
  structureChanged,
  changedEntryIds = [],
  changedFields = [],
}) => {
  if (!displayChanged && !structureChanged) return;

  const now = new Date();
  await Tournament.findByIdAndUpdate(tournamentId, {
    $set: {
      "tiesheet.invalidatedAt": now,
      "tiesheet.invalidationType": structureChanged ? "structure" : "display",
      "tiesheet.invalidatedEntryIds": changedEntryIds.map(String),
      "tiesheet.invalidatedFields": changedFields.map(String),
      updatedBy: userId,
    },
    $inc: { "tiesheet.entryRevision": 1 },
  });

  if (structureChanged && changedEntryIds.length > 0) {
    await EntryRow.updateMany(
      {
        tournamentId,
        entryId: { $in: changedEntryIds.map(String) },
        medalSource: "tiesheet",
      },
      {
        $set: {
          medal: "",
          medalSource: "",
          medalUpdatedAt: null,
          updatedBy: userId,
        },
      }
    );
  }
};

export const processEntrySyncBatch = async ({
  tournamentId,
  userId,
  clientMutationId,
  clientSeq,
  operations,
}) => {
  const tournamentObjectId = new mongoose.Types.ObjectId(tournamentId);
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const normalizedOperations = operations.map(validateOperation);
  const expiresAt = new Date(Date.now() + RECEIPT_TTL_MS);

  const existingReceipt = await EntrySyncBatch.findOne({
    tournamentId: tournamentObjectId,
    userId: userObjectId,
    clientMutationId,
  }).lean();
  if (existingReceipt?.status === "completed" && existingReceipt.result) {
    return { ...existingReceipt.result, idempotentReplay: true };
  }
  if (existingReceipt?.status === "processing") {
    const retryError = new Error("This synchronization batch is already processing");
    retryError.statusCode = 409;
    retryError.retryable = true;
    throw retryError;
  }
  if (existingReceipt?.status === "failed") {
    await EntrySyncBatch.deleteOne({ _id: existingReceipt._id });
  }

  let receipt;
  try {
    receipt = await EntrySyncBatch.create({
      tournamentId: tournamentObjectId,
      userId: userObjectId,
      clientMutationId,
      clientSeq,
      operationsCount: normalizedOperations.length,
      expiresAt,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicateReceipt = await EntrySyncBatch.findOne({
      tournamentId: tournamentObjectId,
      userId: userObjectId,
      clientMutationId,
    }).lean();
    if (duplicateReceipt?.status === "completed" && duplicateReceipt.result) {
      return { ...duplicateReceipt.result, idempotentReplay: true };
    }
    if (duplicateReceipt?.status === "failed") {
      await EntrySyncBatch.deleteOne({ _id: duplicateReceipt._id });
      return processEntrySyncBatch({
        tournamentId,
        userId,
        clientMutationId,
        clientSeq,
        operations,
      });
    }
    const retryError = new Error("This synchronization batch is already processing");
    retryError.statusCode = 409;
    retryError.retryable = true;
    throw retryError;
  }

  try {
    const entryIds = normalizedOperations.map((operation) => operation.entryId);
    const existingRows = await EntryRow.find({
      tournamentId: tournamentObjectId,
      entryId: { $in: entryIds },
    }).lean();
    const existingByEntryId = new Map(
      existingRows.map((row) => [String(row.entryId), row])
    );
    const allTournamentRows = await EntryRow.find({ tournamentId: tournamentObjectId })
      .select("entryId event subEvent gender fresherGroup")
      .lean();
    const projectedRows = new Map(
      allTournamentRows.map((row) => [String(row.entryId), { ...row }])
    );
    const touchedFresherKeys = new Set();
    for (const operation of normalizedOperations) {
      const previous = projectedRows.get(operation.entryId);
      const previousKey = fresherGroupKey(previous);
      if (previousKey) touchedFresherKeys.add(previousKey);
      if (operation.type === "delete") {
        projectedRows.delete(operation.entryId);
        continue;
      }
      const next = { ...(previous || {}), ...operation.updates, entryId: operation.entryId };
      projectedRows.set(operation.entryId, next);
      const nextKey = fresherGroupKey(next);
      if (nextKey) touchedFresherKeys.add(nextKey);
    }
    const fresherCounts = new Map();
    for (const row of projectedRows.values()) {
      const key = fresherGroupKey(row);
      if (!key || !touchedFresherKeys.has(key)) continue;
      fresherCounts.set(key, (fresherCounts.get(key) || 0) + 1);
    }
    const oversizedGroup = [...fresherCounts.entries()].find(([, count]) => count > 4);
    if (oversizedGroup) {
      const validationError = new Error(
        `Fresher group ${oversizedGroup[0].split("::")[1]} can contain maximum 4 players`
      );
      validationError.statusCode = 400;
      validationError.retryable = false;
      throw validationError;
    }
    const now = new Date();
    const confirmedOperationIds = [];
    const staleOperationIds = [];
    const effectiveOperations = [];
    const bulkOperations = [];

    for (const operation of normalizedOperations) {
      const existing = existingByEntryId.get(operation.entryId);
      if (Number(existing?.clientVersion || 0) > clientSeq) {
        confirmedOperationIds.push(operation.operationId);
        staleOperationIds.push(operation.operationId);
        continue;
      }

      if (operation.type === "delete") {
        effectiveOperations.push(operation);
        bulkOperations.push({
          deleteOne: {
            filter: {
              tournamentId: tournamentObjectId,
              entryId: operation.entryId,
            },
          },
        });
        confirmedOperationIds.push(operation.operationId);
        continue;
      }

      const updates = { ...operation.updates };
      if (existing?.medalSource === "tiesheet") {
        delete updates.medal;
        delete updates.medalSource;
        delete updates.medalUpdatedAt;
      } else if (updates.medal !== undefined) {
        const isValidCategoryAutoMedal =
          updates.medal === "X-X-X-X" &&
          updates.medalSource === "category-auto";
        updates.medalSource = updates.medal
          ? isValidCategoryAutoMedal
            ? "category-auto"
            : "manual"
          : "";
        updates.medalUpdatedAt = updates.medal ? now : null;
      }

      effectiveOperations.push({ ...operation, updates });
      bulkOperations.push({
        updateOne: {
          filter: {
            tournamentId: tournamentObjectId,
            entryId: operation.entryId,
          },
          update: {
            $set: {
              ...updates,
              updatedBy: userObjectId,
              clientVersion: clientSeq,
              lastMutationId: clientMutationId,
              syncUpdatedAt: now,
            },
            $setOnInsert: {
              tournamentId: tournamentObjectId,
              entryId: operation.entryId,
              createdBy: userObjectId,
            },
          },
          upsert: true,
        },
      });
      confirmedOperationIds.push(operation.operationId);
    }

    const bracketChanges = detectBracketChanges(
      effectiveOperations,
      existingByEntryId
    );

    if (bulkOperations.length) {
      await EntryRow.bulkWrite(bulkOperations, { ordered: true });
    }

    await markTieSheetEntriesChanged({
      tournamentId: tournamentObjectId,
      userId: userObjectId,
      ...bracketChanges,
    });

    const legacy = await Entry.findOneAndUpdate(
      { tournamentId: tournamentObjectId },
      {
        $set: {
          updatedBy: userObjectId,
          lastSyncedAt: now,
        },
        $inc: { syncVersion: 1 },
        $unset: { entries: "" },
        $setOnInsert: { tournamentId: tournamentObjectId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const result = {
      success: true,
      clientMutationId,
      clientSeq,
      serverVersion: legacy?.syncVersion || 0,
      confirmedOperationIds,
      failedOperations: [],
      staleOperationIds,
      entriesLastUpdated: now,
      bracketDataChanged:
        bracketChanges.displayChanged || bracketChanges.structureChanged,
      bracketStructureChanged: bracketChanges.structureChanged,
      bracketChangeType: bracketChanges.structureChanged
        ? "structure"
        : bracketChanges.displayChanged
          ? "display"
          : "none",
      changedEntryIds: bracketChanges.changedEntryIds,
      changedFields: bracketChanges.changedFields,
      changedBracketFields: bracketChanges.changedFields,
    };

    await EntrySyncBatch.findByIdAndUpdate(receipt._id, {
      $set: {
        status: "completed",
        confirmedOperationIds,
        result,
        processedAt: now,
      },
    });
    return result;
  } catch (error) {
    await EntrySyncBatch.findByIdAndUpdate(receipt._id, {
      $set: {
        status: "failed",
        failedOperations: [{ message: error.message }],
        processedAt: new Date(),
      },
    }).catch(() => {});
    throw error;
  }
};
