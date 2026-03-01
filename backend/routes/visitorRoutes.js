import express from "express";
import { getVisitorCount } from "../controllers/visitorController.js";

const router = express.Router();

// Public endpoint (no auth)
router.get("/", getVisitorCount);

export default router;