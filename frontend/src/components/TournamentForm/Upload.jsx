// src/components/TournamentForm/Upload.jsx

import React from 'react';
import imageCompression from 'browser-image-compression';
import { getFullImageUrl, getFileNameFromPath } from './helpers';
import { ErrorMessage } from 'formik';
import styles from "../../pages/TournamentForm.module.css";

const Upload = ({ values, setFieldValue, errors, touched }) => {
  const handlePosterChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file.');
    return;
  }

  try {
    let finalFile = file;

    if (file.size > 3 * 1024 * 1024) {
      const options = {
        maxSizeMB: 3,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.92,
        maxIteration: 10,
      };

      const compressedBlob = await imageCompression(file, options);
      finalFile = new File([compressedBlob], file.name, {
        type: 'image/webp',
        lastModified: Date.now(),
      });
    }

    setFieldValue('poster', finalFile);
  } catch (error) {
    console.error("Compression failed:", error);
    // Fallback: original file allow if compression fails
    if (file.size <= 20 * 1024 * 1024) {
      setFieldValue('poster', file);
    } else {
      alert("Image is too large and could not be compressed. Please use a smaller file.");
    }
  }
};

  const handleLogoChange = async (e, index) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please upload only JPG, PNG, or WebP images.');
      return;
    }

    try {
      let finalFile = file;

      if (file.size > 3 * 1024 * 1024) {
        const options = {
          maxSizeMB: 3,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/webp',
          initialQuality: 0.92,
        };

        const compressedBlob = await imageCompression(file, options);
        finalFile = new File([compressedBlob], file.name, {
          type: compressedBlob.type || file.type,
          lastModified: Date.now(),
        });
      }

      const newLogos = [...(values.logos || [null, null])];
      newLogos[index] = finalFile;
      setFieldValue('logos', newLogos);
    } catch (error) {
      console.error("Logo compression error:", error);
      alert("Failed to process logo image. Please try a smaller file.");
    }
  };

  return (
    <div className={styles.section}>
      <h2>Upload Files</h2>

      {/* Poster Upload – बिल्कुल वैसी ही styling */}
      <div className={styles.posterUploadContainer}>
        <label htmlFor="posterUpload" className={styles.posterLabel}>
          Tournament Poster:
          {values.poster && (
            <span className={styles.fileName}>
              {typeof values.poster === 'string'
                ? getFileNameFromPath(values.poster)
                : values.poster.name}
            </span>
          )}
        </label>

        <div className={styles.posterInputWrapper}>
          <input
            id="posterUpload"
            type="file"
            accept="image/*"
            onChange={handlePosterChange}
            className={styles.posterInputFile}
            aria-label="Upload tournament poster image"
          />

          {/* Preview – वैसा ही */}
          {values.poster && (
            <img
              src={getFullImageUrl(values.poster)}
              alt="Poster Preview"
              className={styles.posterPreviewImage}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}

          {!values.poster && <span className={styles.noFileText}>No file chosen</span>}

          <ErrorMessage name="poster" component="div" className={styles.errorText} />
        </div>
      </div>

      {/* Logos Upload – बिल्कुल वैसी ही */}
      <div className={styles.logoContainer}>
        {[0, 1].map((index) => {
          const logo = values.logos?.[index] || null;
          return (
            <div key={index} className={styles.logoItem}>
              <label htmlFor={`logoUpload${index}`} className={styles.logoLabel}>
                Logo {index + 1}:
                {logo && (
                  <span className={styles.fileName}>
                    {typeof logo === 'string' ? getFileNameFromPath(logo) : logo.name}
                  </span>
                )}
              </label>

              <div className={styles.logoInputWrapper}>
                <input
                  id={`logoUpload${index}`}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoChange(e, index)}
                  className={styles.logoInputFile}
                  aria-label={`Upload logo ${index + 1}`}
                />

                {/* Preview – वैसा ही */}
                {logo && (
                  <img
                    src={getFullImageUrl(logo)}
                    alt={`Logo ${index + 1} Preview`}
                    className={styles.logoPreviewImage}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}

                {!logo && <span className={styles.noFileText}>No file chosen</span>}

                <ErrorMessage
                  name={`logos.${index}`}
                  component="div"
                  className={styles.errorText}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Upload;