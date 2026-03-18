import express from "express";
import uploadImportFile from "../middleware/uploadImportFile.js";
import { analyzeImageImport, confirmImageImport } from "../controllers/importController.js";

const router = express.Router();

router.post("/image/analyze", uploadImportFile.single("image"), analyzeImageImport);
router.post("/image/confirm", confirmImageImport);

export default router;