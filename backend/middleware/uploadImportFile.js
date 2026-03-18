import multer from "multer";

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!file) {
    return cb(new Error("Image file is required."));
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    const error = new Error("Only PNG, JPG, JPEG, and WEBP image files are allowed.");
    error.status = 400;
    return cb(error);
  }

  return cb(null, true);
};

const uploadImportFile = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

export default uploadImportFile;