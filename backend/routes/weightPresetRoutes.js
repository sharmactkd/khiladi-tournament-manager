import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/user.js";
import logger from "../utils/logger.js";

const router = express.Router();

// POST /api/weight-presets → Save new preset
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, data } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Preset name is required" });
    }

    if (!data || typeof data !== "object") {
      return res.status(400).json({ message: "Invalid preset data" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for duplicate name (case-insensitive)
    const duplicate = user.weightPresets.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ message: "A preset with this name already exists" });
    }

    user.weightPresets.push({
      name: name.trim(),
      data,
    });

    user.markModified('weightPresets');
    await user.save();

    const newPreset = user.weightPresets[user.weightPresets.length - 1];

    logger.info("Weight preset saved successfully", {
      userId: user._id,
      presetName: newPreset.name,
    });

    res.status(201).json({
      message: "Preset saved successfully",
      preset: {
        id: newPreset._id,
        name: newPreset.name,
        createdAt: newPreset.createdAt,
      },
    });
  } catch (error) {
    logger.error("Save weight preset failed", { error: error.message });
    res.status(500).json({ message: "Failed to save preset" });
  }
});

// GET /api/weight-presets → Get all presets (ADDED THIS - Fixes 404)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("weightPresets");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      presets: user.weightPresets.map(p => ({
        id: p._id,
        name: p.name,
        createdAt: p.createdAt
      }))
    });
  } catch (error) {
    logger.error("Get weight presets failed", { error: error.message });
    res.status(500).json({ message: "Failed to load presets" });
  }
});

// GET /api/weight-presets/:id → Get single preset data
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const preset = user.weightPresets.id(req.params.id);
    if (!preset) return res.status(404).json({ message: "Preset not found" });

    res.json({ data: preset.data });
  } catch (error) {
    logger.error("Get single preset failed", { error: error.message });
    res.status(500).json({ message: "Failed to load preset data" });
  }
});

// DELETE /api/weight-presets/:id → Delete preset
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const preset = user.weightPresets.id(req.params.id);
    if (!preset) {
      return res.status(404).json({ message: "Preset not found" });
    }

    preset.remove();
    user.markModified('weightPresets');
    await user.save();

    res.json({ message: "Preset deleted successfully" });
  } catch (error) {
    logger.error("Delete weight preset failed", { error: error.message });
    res.status(500).json({ message: "Failed to delete preset" });
  }
});

export default router;