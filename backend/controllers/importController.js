import { analyzeImportedImage, confirmImportedImageRows } from "../services/imageImportService.js";

export const analyzeImageImport = async (req, res, next) => {
  try {
    console.log("📥 /image/analyze hit", {
      fileName: req.file?.originalname,
      size: req.file?.size,
      mimetype: req.file?.mimetype,
    });

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    const result = await analyzeImportedImage(req.file);

    console.log("📤 /image/analyze success", {
      fileName: result?.fileName,
      documentTitle: result?.documentTitle,
      headersCount: Array.isArray(result?.headers) ? result.headers.length : 0,
      rowsCount: Array.isArray(result?.rows) ? result.rows.length : 0,
      warningsCount: Array.isArray(result?.warnings) ? result.warnings.length : 0,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 /image/analyze controller error", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
    });

    return next(error);
  }
};

export const confirmImageImport = async (req, res, next) => {
  try {
    const { headers, rows, mapping } = req.body || {};

    console.log("📥 /image/confirm hit", {
      headersCount: Array.isArray(headers) ? headers.length : 0,
      rowsCount: Array.isArray(rows) ? rows.length : 0,
      mappingKeysCount: mapping && typeof mapping === "object" ? Object.keys(mapping).length : 0,
    });

    const result = await confirmImportedImageRows({
      headers,
      rows,
      mapping,
    });

    console.log("📤 /image/confirm success", {
      rowsCount: Array.isArray(result?.rows) ? result.rows.length : 0,
      warningsCount: Array.isArray(result?.warnings) ? result.warnings.length : 0,
      rejectedRowsCount: result?.rejectedRowsCount ?? 0,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("💥 /image/confirm controller error", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
    });

    return next(error);
  }
};