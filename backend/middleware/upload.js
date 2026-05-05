// FILE: backend/middleware/upload.js

import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import cloudinary from "cloudinary";
import pkg from "multer-storage-cloudinary";
const { CloudinaryStorage } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local fallback folder
const uploadsDir = join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory: ${uploadsDir}`);
  }
} catch (err) {
  console.error("Failed to create uploads directory", err.message);
}

// Cloudinary Config
const hasCloudinaryKeys =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;

if (hasCloudinaryKeys) {
  console.log("✅ Attempting Cloudinary storage setup");

  try {
    cloudinary.v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    storage = new CloudinaryStorage({
      cloudinary: cloudinary.v2,
      params: {
        folder: "khiladi-khoj/tournaments",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        public_id: (req, file) => `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        transformation: [
          { width: 1200, height: 1600, crop: "limit" },
          { quality: "auto:good" },
          { format: "auto" },
        ],
      },
    });

    console.log("✅ Cloudinary storage configured successfully");
  } catch (error) {
    console.error("❌ Cloudinary setup failed:", error.message);
    console.log("⚠️ Falling back to local storage");
  }
}

// Fallback to local storage
if (!storage) {
  console.log("⚠️ Using local disk storage");

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueName}${ext}`);
    },
  });
}

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }

  cb(new Error("Only JPG, PNG, and WebP images are allowed!"));
};

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});