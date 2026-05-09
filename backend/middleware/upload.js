// FILE: backend/middleware/upload.js

import multer from "multer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import cloudinary from "cloudinary";

const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const hasCloudinaryKeys =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryKeys) {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 3,
  },
});

const validateAndProcessImage = async (file) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error("Only JPG, PNG, and WebP images are allowed");
  }

  let metadata;

  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    throw new Error("Invalid or corrupted image file");
  }

  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("Invalid image format");
  }

  return sharp(file.buffer)
    .rotate()
    .resize({
      width: 1200,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
};

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.v2.uploader
      .upload_stream(
        {
          folder: "khiladi-khoj/tournaments",
          resource_type: "image",
          format: "webp",
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      )
      .end(buffer);
  });

const saveLocally = async (buffer) => {
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const filepath = path.join(uploadsDir, filename);

  await fs.promises.writeFile(filepath, buffer);

  return {
    filename,
    path: `/uploads/${filename}`,
    url: `/uploads/${filename}`,
  };
};

const secureImageUploadMiddleware = (fields) => {
  const uploadFields = multerUpload.fields(fields);

  return async (req, res, next) => {
    uploadFields(req, res, async (err) => {
      if (err) return next(err);

      try {
        if (!req.files) return next();

        const processedFiles = {};

        for (const [fieldName, files] of Object.entries(req.files)) {
          processedFiles[fieldName] = [];

          for (const file of files) {
            const processedBuffer = await validateAndProcessImage(file);

            let savedFile;

            if (hasCloudinaryKeys) {
              const uploaded = await uploadToCloudinary(processedBuffer);

              savedFile = {
                ...file,
                filename: uploaded.public_id,
                originalname: file.originalname,
                mimetype: "image/webp",
                size: processedBuffer.length,
                path: uploaded.secure_url,
                url: uploaded.secure_url,
                secure_url: uploaded.secure_url,
                public_id: uploaded.public_id,
              };
            } else {
              const local = await saveLocally(processedBuffer);

              savedFile = {
                ...file,
                filename: local.filename,
                originalname: file.originalname,
                mimetype: "image/webp",
                size: processedBuffer.length,
                path: local.path,
                url: local.url,
              };
            }

            processedFiles[fieldName].push(savedFile);
          }
        }

        req.files = processedFiles;
        next();
      } catch (error) {
        next(error);
      }
    });
  };
};

export const upload = {
  fields: secureImageUploadMiddleware,
};