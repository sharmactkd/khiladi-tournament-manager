import express from "express";
import uploadImportFile from "../middleware/uploadImportFile.js";
import { analyzeImageImport, confirmImageImport } from "../controllers/importController.js";
import { sensitiveRateLimiter } from "../middleware/rateLimiter.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";

const router = express.Router();

router.post(
  "/image/analyze",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  uploadImportFile.single("image"),
  analyzeImageImport
);

router.post(
  "/image/confirm",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  confirmImageImport
);

export default router;