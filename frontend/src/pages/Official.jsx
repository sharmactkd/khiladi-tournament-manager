// src/pages/Official.jsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import OfficialImportModal from "../components/Official/ImportModal";
import styles from "./Official.module.css";

const EMPTY_OFFICIAL = {
  name: "",
  rank: "",
  dan: "",
  danNumber: "",
  mark: "",
};

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  const cleanFilename = filename.replace(/^.*[\\/]/, "");
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api$/, "");
  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

const getTextWidth = (text = "", font = '16px "Helvetica Neue", Arial, sans-serif') => {
  if (typeof document === "undefined") return 120;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 120;
  context.font = font;
  const metrics = context.measureText(String(text));
  return Math.ceil(metrics.width) + 28;
};

const stableStringify = (obj) => {
  const seen = new WeakSet();

  const sort = (value) => {
    if (value && typeof value === "object") {
      if (seen.has(value)) return value;
      seen.add(value);

      if (Array.isArray(value)) return value.map(sort);

      const keys = Object.keys(value).sort();
      const out = {};
      for (const key of keys) out[key] = sort(value[key]);
      return out;
    }
    return value;
  };

  return JSON.stringify(sort(obj));
};

const djb2Hash = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const normalizeOfficialsForSave = (rows = []) => {
  const normalized = Array.isArray(rows)
    ? rows.map((row) => ({
        name: String(row?.name || ""),
        rank: String(row?.rank || ""),
        dan: String(row?.dan || ""),
        danNumber: String(row?.danNumber || ""),
        mark: String(row?.mark || ""),
      }))
    : [];

  return normalized.filter((row) =>
    Object.values(row).some((value) => String(value || "").trim() !== "")
  );
};

const Official = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token, isAuthenticated, loading: authLoading } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [columnWidths, setColumnWidths] = useState({
    sn: 70,
    name: 220,
    rank: 180,
    dan: 120,
    danNumber: 180,
    mark: 140,
    actions: 100,
  });

  const pdfPageRef = useRef(null);
  const mountedRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const lastSavedHashRef = useRef("");
  const isSavingRef = useRef(false);
  const fileInputRef = useRef(null);

  const getApiBase = useCallback(() => {
    return import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  }, []);

  const recalculateColumnWidths = useCallback((rows = []) => {
    const safeRows = Array.isArray(rows) ? rows : [];

    const headers = {
      sn: "S.N.",
      name: "Name",
      rank: "Rank",
      dan: "Dan",
      danNumber: "Dan Number",
      mark: "Mark",
      actions: "Actions",
    };

    const nextWidths = {
      sn: Math.max(getTextWidth(headers.sn), 70),
      name: Math.max(getTextWidth(headers.name), 180),
      rank: Math.max(getTextWidth(headers.rank), 140),
      dan: Math.max(getTextWidth(headers.dan), 100),
      danNumber: Math.max(getTextWidth(headers.danNumber), 160),
      mark: Math.max(getTextWidth(headers.mark), 120),
      actions: 100,
    };

    safeRows.forEach((official, index) => {
      nextWidths.sn = Math.max(nextWidths.sn, getTextWidth(String(index + 1)));
      nextWidths.name = Math.max(nextWidths.name, getTextWidth(official?.name || ""));
      nextWidths.rank = Math.max(nextWidths.rank, getTextWidth(official?.rank || ""));
      nextWidths.dan = Math.max(nextWidths.dan, getTextWidth(official?.dan || ""));
      nextWidths.danNumber = Math.max(nextWidths.danNumber, getTextWidth(official?.danNumber || ""));
      nextWidths.mark = Math.max(nextWidths.mark, getTextWidth(official?.mark || ""));
    });

    setColumnWidths({
      sn: Math.min(nextWidths.sn, 100),
      name: Math.min(nextWidths.name, 320),
      rank: Math.min(nextWidths.rank, 260),
      dan: Math.min(nextWidths.dan, 160),
      danNumber: Math.min(nextWidths.danNumber, 260),
      mark: Math.min(nextWidths.mark, 200),
      actions: 100,
    });
  }, []);

  const totalTableMinWidth = useMemo(() => {
    return (
      columnWidths.sn +
      columnWidths.name +
      columnWidths.rank +
      columnWidths.dan +
      columnWidths.danNumber +
      columnWidths.mark +
      columnWidths.actions
    );
  }, [columnWidths]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const performSave = useCallback(
    async (rows, reason = "unknown") => {
      if (!id || !token) {
        return { ok: false, skipped: true, reason: "missing-id-or-token" };
      }

      if (isSavingRef.current) {
        return { ok: false, skipped: true, reason: "already-saving" };
      }

      const cleanedOfficials = normalizeOfficialsForSave(rows);
      const payload = { officials: cleanedOfficials };
      const payloadHash = djb2Hash(stableStringify(payload));

      if (lastSavedHashRef.current && lastSavedHashRef.current === payloadHash) {
        return { ok: true, skipped: true, reason: "unchanged" };
      }

      isSavingRef.current = true;
      setSaveStatus("saving");

      try {
        const baseUrl = getApiBase();

        await axios.put(`${baseUrl}/tournament/${id}/officials`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

        lastSavedHashRef.current = payloadHash;

        localStorage.setItem(`officialsData_${id}`, JSON.stringify(rows));

        setSaveStatus("saved");
        setTimeout(() => {
          setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 1500);

        return { ok: true, skipped: false, reason };
      } catch (err) {
        console.error("Silent auto-save failed:", err);
        setSaveStatus("error");
        setTimeout(() => {
          setSaveStatus((prev) => (prev === "error" ? "idle" : prev));
        }, 3000);

        return {
          ok: false,
          skipped: false,
          message: err?.message || "Failed to save officials",
          reason,
        };
      } finally {
        isSavingRef.current = false;
      }
    },
    [getApiBase, id, token]
  );

  const flushSaveNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    return performSave(officials, "flush");
  }, [officials, performSave]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !id) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const baseUrl = getApiBase();
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

        const tournamentRes = await axios.get(`${baseUrl}/tournament/${id}`, config);

        setTournament({
          name: tournamentRes.data?.tournamentName || "Unnamed Tournament",
          federation: tournamentRes.data?.federation || "N/A",
          logos: tournamentRes.data?.logos || [],
        });

        let loadedOfficials = [];

        try {
          const officialsRes = await axios.get(`${baseUrl}/tournament/${id}/officials`, config);
          loadedOfficials = Array.isArray(officialsRes.data?.officials)
            ? officialsRes.data.officials
            : [];
          console.log("Officials loaded from server");
        } catch (serverErr) {
          console.warn("No officials on server:", serverErr.message);
        }

        if (loadedOfficials.length === 0) {
          const saved = localStorage.getItem(`officialsData_${id}`);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              loadedOfficials = Array.isArray(parsed) ? parsed : [];
              console.log("Officials loaded from localStorage");
            } catch (parseErr) {
              console.warn("Failed to parse officials localStorage:", parseErr);
            }
          }
        }

        if (loadedOfficials.length === 0) {
          loadedOfficials = [{ ...EMPTY_OFFICIAL }];
        }

        setOfficials(loadedOfficials);
        recalculateColumnWidths(loadedOfficials);

        const initialHash = djb2Hash(
          stableStringify({ officials: normalizeOfficialsForSave(loadedOfficials) })
        );
        lastSavedHashRef.current = initialHash;

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load official page data:", err);
        setError(err.message || "Failed to load data");
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, token, authLoading, isAuthenticated, getApiBase, recalculateColumnWidths]);

  useEffect(() => {
    if (isLoading) return;

    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    localStorage.setItem(`officialsData_${id}`, JSON.stringify(officials));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave(officials, "officials-change");
    }, 1000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [officials, id, isLoading, performSave]);

  useEffect(() => {
    recalculateColumnWidths(officials);
  }, [officials, recalculateColumnWidths]);

  const updateRow = useCallback((index, field, value) => {
    setOfficials((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });

    if (["name", "rank", "dan", "danNumber", "mark"].includes(field)) {
      setColumnWidths((prev) => {
        const minMap = {
          name: 180,
          rank: 140,
          dan: 100,
          danNumber: 160,
          mark: 120,
        };

        const maxMap = {
          name: 320,
          rank: 260,
          dan: 160,
          danNumber: 260,
          mark: 200,
        };

        const textWidth = getTextWidth(value || "");
        return {
          ...prev,
          [field]: Math.min(Math.max(textWidth, minMap[field]), maxMap[field]),
        };
      });
    }
  }, []);

  const deleteRow = useCallback((index) => {
    setOfficials((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ ...EMPTY_OFFICIAL }];
    });
  }, []);

  const handleEnterKey = useCallback(
    (e, rowIndex, field) => {
      if (e.key === "Enter") {
        e.preventDefault();

        const fields = ["name", "rank", "dan", "danNumber", "mark"];
        const currentFieldIndex = fields.indexOf(field);

        if (currentFieldIndex === fields.length - 1) {
          setOfficials((prev) => [...prev, { ...EMPTY_OFFICIAL }]);

          setTimeout(() => {
            const rows = document.querySelectorAll(`.${styles.table} tbody tr`);
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
              const firstInput = lastRow.querySelector("input");
              if (firstInput) firstInput.focus();
            }
          }, 0);
        }
      }
    },
    [styles.table]
  );

  const handleFileUpload = useCallback((e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    setSelectedImportFile(file);
    setShowImportModal(true);

    if (e.target) {
      e.target.value = "";
    }
  }, []);

  const handleImportedOfficials = useCallback((importedRows) => {
    const normalizedRows = (Array.isArray(importedRows) ? importedRows : [])
      .map((row) => ({
        name: String(row?.name || "").trim(),
        rank: String(row?.rank || "").trim(),
        dan: String(row?.dan || "").trim(),
        danNumber: String(row?.danNumber || "").trim(),
        mark: String(row?.mark || "").trim(),
      }))
      .filter((row) => Object.values(row).some((value) => value !== ""));

    if (normalizedRows.length === 0) return;

    setOfficials((prev) => {
      const existingMeaningful = (Array.isArray(prev) ? prev : []).filter((row) =>
        Object.values(row || {}).some((value) => String(value || "").trim() !== "")
      );

      const merged = [...existingMeaningful, ...normalizedRows];
      return merged.length > 0 ? merged : [{ ...EMPTY_OFFICIAL }];
    });

    setShowImportModal(false);
    setSelectedImportFile(null);
  }, []);

  const generatePDFDoc = async () => {
    await flushSaveNow();

    if (!pdfPageRef.current) {
      console.error("PDF page ref not found");
      alert("Page not ready for PDF generation");
      return null;
    }

    const page = pdfPageRef.current;
    const doc = new jsPDF("l", "mm", "a4");

    const clone = page.cloneNode(true);
    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "absolute",
      left: "-9999px",
      top: "-9999px",
      width: "297mm",
      height: "210mm",
      background: "#ffffff",
      padding: "15mm",
      boxSizing: "border-box",
    });
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2.2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdfWidth = 297;
      const pdfHeight = 210;

      const ratio = Math.min(
        (pdfWidth - 30) / canvas.width,
        (pdfHeight - 30) / canvas.height
      );

      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;

      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;

      doc.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

      return doc;
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF");
      return null;
    } finally {
      document.body.removeChild(container);
    }
  };

  const saveAllPDF = async () => {
    const doc = await generatePDFDoc();
    if (doc) {
      doc.save(
        `Officials_${tournament?.name?.replace(/[^a-z0-9]/gi, "_") || "Tournament"}_${id}.pdf`
      );
    }
  };

  const printAllPDF = async () => {
    const doc = await generatePDFDoc();
    if (doc) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, "_blank");
      if (printWin) printWin.focus();
    }
  };

  if (authLoading || isLoading) {
    return <div className={styles.loading}>Loading Officials...</div>;
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h2>Error: {error}</h2>
      </div>
    );
  }

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  const hasOfficials = Array.isArray(officials) && officials.some((o) =>
    (o?.name || "").trim() ||
    (o?.rank || "").trim() ||
    (o?.dan || "").trim() ||
    (o?.danNumber || "").trim() ||
    (o?.mark || "").trim()
  );

  return (
    <div className={styles.container}>
      <div className={styles.buttonSection}>
        <div className={styles.pdfButtonWrapper}>
          <label
            htmlFor="officialExcelImport"
            className={styles.pdfButton}
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Import Excel
          </label>

          <input
            id="officialExcelImport"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsb,.xlsm"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />

          <button
            onClick={printAllPDF}
            className={styles.printButton}
            disabled={!hasOfficials}
          >
            Print
          </button>
          <button
            onClick={saveAllPDF}
            className={styles.pdfButton}
            disabled={!hasOfficials}
          >
            Save PDF
          </button>
        </div>
      </div>

      <div ref={pdfPageRef} className={styles.officialPage}>
        <div className={styles.header}>
          {logoLeft && (
            <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} />
          )}

          <div className={styles.headerContent}>
            <h1 className={styles.tournamentName}>
              {tournament?.name?.toUpperCase()}
            </h1>
            <p className={styles.federation}>{tournament?.federation}</p>
            <h2 className={styles.title}>OFFICIALS</h2>
          </div>

          {logoRight && (
            <img src={logoRight} alt="Logo Right" className={styles.logoRight} />
          )}
        </div>

        <div className={styles.tableWrapper}>
          <table
            className={styles.table}
            style={{
              tableLayout: "fixed",
              width: "100%",
              minWidth: `${totalTableMinWidth}px`,
            }}
          >
            <thead>
              <tr>
                <th style={{ width: columnWidths.sn }}>S.N.</th>
                <th style={{ width: columnWidths.name }}>Name</th>
                <th style={{ width: columnWidths.rank }}>Rank</th>
                <th style={{ width: columnWidths.dan }}>Dan</th>
                <th style={{ width: columnWidths.danNumber }}>Dan Number</th>
                <th style={{ width: columnWidths.mark }}>Mark</th>
                <th style={{ width: columnWidths.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {officials.map((official, index) => (
                <tr key={index}>
                  <td style={{ width: columnWidths.sn }}>{index + 1}</td>

                  <td style={{ width: columnWidths.name }}>
                    <input
                      type="text"
                      value={official.name}
                      onChange={(e) => updateRow(index, "name", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "name")}
                      placeholder="Name"
                      className={styles.input}
                    />
                  </td>

                  <td style={{ width: columnWidths.rank }}>
                    <input
                      type="text"
                      value={official.rank}
                      onChange={(e) => updateRow(index, "rank", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "rank")}
                      placeholder="Rank"
                      className={styles.input}
                    />
                  </td>

                  <td style={{ width: columnWidths.dan }}>
                    <input
                      type="text"
                      value={official.dan}
                      onChange={(e) => updateRow(index, "dan", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "dan")}
                      placeholder="Dan"
                      className={styles.input}
                    />
                  </td>

                  <td style={{ width: columnWidths.danNumber }}>
                    <input
                      type="text"
                      value={official.danNumber}
                      onChange={(e) => updateRow(index, "danNumber", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "danNumber")}
                      placeholder="Dan Number"
                      className={styles.input}
                    />
                  </td>

                  <td style={{ width: columnWidths.mark }}>
                    <input
                      type="text"
                      value={official.mark}
                      onChange={(e) => updateRow(index, "mark", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "mark")}
                      placeholder="Mark"
                      className={styles.input}
                    />
                  </td>

                  <td style={{ width: columnWidths.actions }}>
                    <button
                      onClick={() => deleteRow(index)}
                      className={styles.deleteButton}
                      aria-label="Delete row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <OfficialImportModal
        show={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setSelectedImportFile(null);
        }}
        onImportSuccess={handleImportedOfficials}
        selectedFile={selectedImportFile}
      />

      {saveStatus !== "idle" && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            padding: "10px 20px",
            borderRadius: "8px",
            background:
              saveStatus === "saving"
                ? "#ff9800"
                : saveStatus === "saved"
                ? "#4caf50"
                : "#f44336",
            color: "white",
            fontWeight: "bold",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "saved"
            ? "Saved!"
            : "Error saving"}
        </div>
      )}
    </div>
  );
};

export default Official;