// src/pages/TieSheetRecord.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import jsPDF from "jspdf";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import styles from "./TieSheetRecord.module.css";
import DOMPurify from "dompurify";

const TieSheetRecord = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const { token } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Prevent StrictMode/dev double-run from causing infinite preview regen or wiping previews
  const previewGenRunningRef = useRef(false);

  const safeJsonParse = useCallback((value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }, []);

  const sanitizeHtml = useCallback((html) => {
    // Keep visuals same but remove unsafe stuff
    // (no scripts, no event handlers, etc.)
    return DOMPurify.sanitize(String(html || ""), {
      USE_PROFILES: { html: true },
      // allow common safe attrs; DOMPurify by default strips on* handlers
      ADD_ATTR: ["data-bracket-key", "data-match-position", "data-participant-position"],
    });
  }, []);

  // Generate preview image for a record's HTML
  const generatePreview = useCallback(
    async (htmlContent) => {
      if (!htmlContent) return null;

      const tempDiv = document.createElement("div");

      // ✅ SECURITY: sanitize before innerHTML
      tempDiv.innerHTML = sanitizeHtml(htmlContent);

      tempDiv.className = styles.previewTempDiv;

      const allElements = tempDiv.querySelectorAll("*");
      allElements.forEach((el) => {
        el.style.margin = "0";
        el.style.padding = "0";
        el.style.boxSizing = "border-box";
      });

      tempDiv.style.margin = "0";
      tempDiv.style.padding = "20px";
      tempDiv.style.width = "fit-content";
      tempDiv.style.height = "fit-content";
      tempDiv.style.background = "#ffffff";
      tempDiv.style.position = "absolute";
      tempDiv.style.left = "-9999px";
      tempDiv.style.top = "-9999px";
      tempDiv.style.overflow = "hidden";

      document.body.appendChild(tempDiv);

      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(tempDiv, {
          scale: 1,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: tempDiv.scrollWidth,
          height: tempDiv.scrollHeight,
        });
        const imgData = canvas.toDataURL("image/png");
        document.body.removeChild(tempDiv);
        return imgData;
      } catch (err) {
        console.error("Preview generation failed:", err);
        try {
          document.body.removeChild(tempDiv);
        } catch {}
        return null;
      }
    },
    [sanitizeHtml]
  );

  // Load records from server/local
  useEffect(() => {
    const loadRecords = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/tournament/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let serverRecords = res?.data?.tieSheetRecords || [];

        if (serverRecords.length === 0) {
          // Fallback local
          const local = localStorage.getItem(`tiesheet_records_${id}`);
          if (local) {
            const parsed = safeJsonParse(local, []);
            serverRecords = Array.isArray(parsed) ? parsed : [];
          }
        }

        // Sort latest first
        serverRecords.sort((a, b) => new Date(b.printedAt) - new Date(a.printedAt));

        // ✅ IMPORTANT: do NOT wipe previews on re-load; merge by record.id
        setRecords((prev) => {
          const prevMap = new Map((prev || []).map((r) => [r.id, r]));
          return serverRecords.map((record) => {
            const old = prevMap.get(record.id);
            const oldPreview = old?.preview || null;

            return {
              ...record,
              preview: oldPreview,
              previewLoading: oldPreview ? false : true,
            };
          });
        });
      } catch (err) {
        console.error("Failed to fetch from server, using local", err);

        const local = localStorage.getItem(`tiesheet_records_${id}`);
        if (local) {
          const parsed = safeJsonParse(local, []);
          const list = Array.isArray(parsed) ? parsed : [];
          list.sort((a, b) => new Date(b.printedAt) - new Date(a.printedAt));

          setRecords((prev) => {
            const prevMap = new Map((prev || []).map((r) => [r.id, r]));
            return list.map((r) => {
              const old = prevMap.get(r.id);
              const oldPreview = old?.preview || null;

              return {
                ...r,
                preview: oldPreview,
                previewLoading: oldPreview ? false : true,
              };
            });
          });
        } else {
          setRecords([]);
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) loadRecords();
  }, [id, token, safeJsonParse]);

  // Only run preview generation if there exists at least one pending preview
  const hasPendingPreview = useMemo(() => {
    return records.some((r) => !r?.preview && r?.previewLoading !== false);
  }, [records]);

  // Generate previews one by one after records load
  useEffect(() => {
    if (loading || records.length === 0) return;
    if (!hasPendingPreview) return;
    if (previewGenRunningRef.current) return;

    let cancelled = false;
    previewGenRunningRef.current = true;

    const generateAllPreviews = async () => {
      try {
        for (const r of records) {
          if (cancelled) return;

          if (r.preview) continue;
          if (r.previewLoading === false) continue;

          const preview = await generatePreview(r.htmlContent);
          if (cancelled) return;

          setRecords((prev) =>
            (prev || []).map((x) => (x.id === r.id ? { ...x, preview, previewLoading: false } : x))
          );
        }
      } finally {
        previewGenRunningRef.current = false;
      }
    };

    generateAllPreviews();

    return () => {
      cancelled = true;
    };
  }, [loading, records, hasPendingPreview, generatePreview]);

  const openFullPreview = (previewSrc) => {
    if (!previewSrc) return;
    const win = window.open("", "_blank");
    win.document.write(`
      <html>
        <head><title>Bracket Preview</title></head>
        <body style="margin:0;padding:40px 20px;background:#f0f0f0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;font-family:Arial,sans-serif;">
          <h2 style="color:#cf0006;font-size:2.2rem;font-weight:bold;margin:0 0 30px;width:100%;">Bracket Preview</h2>
          <img src="${previewSrc}" style="max-width:95vw;max-height:80vh;width:auto;height:auto;box-shadow:0 10px 30px rgba(0,0,0,0.3);border-radius:12px;" alt="Full Preview" />
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleRePrint = (record) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const tempDiv = document.createElement("div");

    // ✅ SECURITY: sanitize before innerHTML
    tempDiv.innerHTML = sanitizeHtml(record?.htmlContent);

    tempDiv.className = styles.printTempDiv;
    document.body.appendChild(tempDiv);

    import("html2canvas").then((html2canvas) => {
      html2canvas
        .default(tempDiv, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        })
        .then((canvas) => {
          const imgData = canvas.toDataURL("image/png");
          const imgWidth = 297;
          const imgHeight = 210;

          let heightLeft = imgHeight;
          let position = 0;

          doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= 210;

          while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            doc.addPage();
            doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
            heightLeft -= 210;
          }

          const blob = doc.output("blob");
          const url = URL.createObjectURL(blob);

          window.open(url, "_blank");

          // ✅ Prevent memory leak
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {}
          }, 10_000);

          document.body.removeChild(tempDiv);
        })
        .catch(() => {
          alert("Failed to regenerate PDF.");
          document.body.removeChild(tempDiv);
        });
    });
  };

  const groupedRecords = records.reduce((acc, record) => {
    const baseKey = record.bracketKey.split("_Pool")[0];
    if (!acc[baseKey]) acc[baseKey] = [];
    acc[baseKey].push(record);
    return acc;
  }, {});

  if (loading) {
    return <div className={styles.loading}>Loading history and generating previews...</div>;
  }

  return (
    <div className={styles.container}>
       <PremiumAccessGuard tournamentId={id}>
      <h1 className={styles.title}>Tie-Sheet History</h1>

      {records.length === 0 ? (
        <div className={styles.noRecords}>
          <p>No tie-sheets printed or saved yet.</p>
        </div>
      ) : (
        Object.entries(groupedRecords).map(([baseKey, categoryRecords]) => {
          const sample = categoryRecords[0];
          return (
            <div key={baseKey} className={styles.categorySection}>
              <div className={styles.categoryHeader}>
                {sample.category} — {sample.playerCount} Players
              </div>

              <div className={styles.cardsGrid}>
                {categoryRecords.map((record, idx) => (
                  <div key={record.id} className={`${styles.card} ${idx === 0 ? styles.latestCard : ""}`}>
                    <div className={styles.versionTitle}>
                      Version {categoryRecords.length - idx} {idx === 0 && "(Latest)"}
                    </div>

                    <div className={styles.dateLabel}>
                      {record.actionType === "save" ? "Saved on:" : "Printed on:"}{" "}
                      <strong>{record.printedAt}</strong>
                    </div>

                    <div className={styles.previewContainer} onClick={() => openFullPreview(record.preview)}>
                      {record.preview ? (
                        <img
                          src={record.preview}
                          alt={`Preview Version ${categoryRecords.length - idx}`}
                          className={styles.previewImg}
                        />
                      ) : record.previewLoading ? (
                        <div className={styles.previewPlaceholder}>Generating preview...</div>
                      ) : (
                        <div className={styles.previewPlaceholder}>Preview not available</div>
                      )}
                      <p className={styles.clickHint}>← Click to view full size</p>
                    </div>

                    <button onClick={() => handleRePrint(record)} className={styles.reprintButton}>
                      Re-Print This Version
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      </PremiumAccessGuard>
    </div>
  );
};

export default TieSheetRecord;