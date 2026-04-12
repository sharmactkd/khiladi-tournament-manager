import Entry from "../models/entry.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";

const isDev = process.env.NODE_ENV !== "production";

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

    // ✅ Backward/forward compatibility mapping:
    // - Frontend uses `school`
    // - Old docs might have `schoolName`
    const mappedEntries = (entryDoc.entries || []).map((e) => ({
      ...e,
      school: e.school ?? e.schoolName ?? "",
    }));

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

    const filteredEntries = (entries || []).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return Object.entries(entry).some(([key, val]) => {
        if (key === "sr" || key === "srNo" || key === "actions") return false;
        return val !== undefined && val !== null && val !== "" && val !== 0;
      });
    });

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

      // dd-mm-yyyy or dd/mm/yyyy
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

    const mappedEntries = filteredEntries.map((e, i) => {
      const { sr, actions, ...rest } = e;

      const school = e.school ?? e.schoolName ?? "";

      return {
        ...rest,
        srNo: i + 1,
        title: String(e.title || "").trim(),
        name: String(e.name || "").trim(),
        fathersName: String(e.fathersName || "").trim(),
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
        medal: ["Gold", "Silver", "Bronze", ""].includes(String(e.medal || "").trim())
          ? String(e.medal || "").trim()
          : "",
        coach: String(e.coach || "").trim(),
        coachContact: String(e.coachContact || "").trim(),
        manager: String(e.manager || "").trim(),
        managerContact: String(e.managerContact || "").trim(),
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

    const updated = await Entry.findOneAndUpdate(
      { tournamentId: id },
      update,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    ).lean();

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