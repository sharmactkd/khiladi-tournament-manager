// src/pages/Official.jsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import api from "../api";
import OfficialImportModal from "../components/Official/ImportModal";
import { useAuth } from "../context/AuthContext";
import styles from "./Official.module.css";

const PDF_EXPORT_WIDTH = 1400;
const HERO_DOT_COUNT = 126;

const RANK_OPTIONS = [
  "State Referee",
  "National Referee",
  "International Referee",
];

const DAN_OPTIONS = [
  "Ist Dan",
  "IInd Dan",
  "III Dan",
  "IV Dan",
  "V Dan",
  "VI Dan",
  "VII Dan",
  "VIII Dan",
  "IX Dan",
  "X Dan",
];

const CLASS_OPTIONS = [
  "Class P",
  "Class I",
  "Class II",
  "Class III",
  "Other",
];

const ROLE_OPTIONS = [
  "Referee Incharge",
  "Arena Incharge",
  "Center Referee",
  "Referee",
  "Sensor Operator",
  "Official Management",
  "Other",
];

const ARENA_OPTIONS = ["All Arenas", "Arena 1", "Arena 2", "Arena 3"];

const OFFICIAL_FIELDS = [
  "name",
  "districtState",
  "contact",
  "dan",
  "danNumber",
  "rank",
  "officialClass",
  "role",
  "arena",
  "mark",
];

const EMPTY_OFFICIAL = Object.freeze({
  name: "",
  districtState: "",
  contact: "",
  dan: "Ist Dan",
  danNumber: "",
  rank: "National Referee",
  officialClass: "Class P",
  role: "Referee",
  arena: "Arena 1",
  mark: "",
});

const createEmptyOfficial = () => ({ ...EMPTY_OFFICIAL });

const formatContact = (value = "") => {
  const digits = String(value).replace(/\D/g, "").slice(0, 10);
  const first = digits.slice(0, 4);
  const second = digits.slice(4, 6);
  const third = digits.slice(6, 10);

  if (digits.length <= 4) return first;
  if (digits.length <= 6) return `${first}-${second}`;
  return `${first}-${second}-${third}`;
};

const normalizeOfficial = (official = {}) => ({
  name: String(official?.name || ""),
  districtState: String(official?.districtState || ""),
  contact: formatContact(official?.contact),
  dan: String(official?.dan || EMPTY_OFFICIAL.dan),
  danNumber: String(official?.danNumber || ""),
  rank: String(official?.rank || EMPTY_OFFICIAL.rank),
  officialClass: String(
    official?.officialClass || official?.class || EMPTY_OFFICIAL.officialClass,
  ),
  role: String(official?.role || EMPTY_OFFICIAL.role),
  arena: String(official?.arena || EMPTY_OFFICIAL.arena),
  mark: String(official?.mark || ""),
});

const isMeaningfulOfficial = (official) => {
  const hasEnteredIdentity = [
    "name",
    "districtState",
    "contact",
    "danNumber",
    "mark",
  ].some((field) => String(official?.[field] || "").trim());

  const hasChangedAssignmentDefaults =
    String(official?.dan || "").trim() !== EMPTY_OFFICIAL.dan ||
    String(official?.rank || "").trim() !== EMPTY_OFFICIAL.rank ||
    String(official?.officialClass || "").trim() !== EMPTY_OFFICIAL.officialClass ||
    String(official?.role || "").trim() !== EMPTY_OFFICIAL.role ||
    String(official?.arena || "").trim() !== EMPTY_OFFICIAL.arena;

  return hasEnteredIdentity || hasChangedAssignmentDefaults;
};

const normalizeOfficialsForSave = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map(normalizeOfficial)
    .map((row) =>
      Object.fromEntries(
        OFFICIAL_FIELDS.map((field) => [field, String(row[field] || "").trim()]),
      ),
    )
    .filter(isMeaningfulOfficial);

const stableStringify = (value) => {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.keys(input)
        .sort()
        .reduce((output, key) => {
          output[key] = sort(input[key]);
          return output;
        }, {});
    }
    return input;
  };
  return JSON.stringify(sort(value));
};

const djb2Hash = (value) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (/^https?:\/\//i.test(filename)) return filename;
  const cleanFilename = String(filename).replace(/^.*[\\/]/, "");
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  return `${baseUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "")}/uploads/${cleanFilename}`;
};

const waitForImages = async (root) => {
  const images = Array.from(root?.querySelectorAll?.("img") || []);
  await Promise.all(
    images.map(
      (image) =>
        image.complete ||
        new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
    ),
  );
};

const nextAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const openPDFPrintPreview = (blob) =>
  new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const cleanup = () => {
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60_000);
    };

    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    frame.title = "Official directory print document";
    frame.setAttribute("aria-hidden", "true");
    frame.onload = () => {
      window.setTimeout(() => {
        try {
          if (!frame.contentWindow) throw new Error("Print preview unavailable.");
          frame.contentWindow.focus();
          frame.contentWindow.print();
          window.focus();
          finish(resolve);
        } catch (error) {
          finish(() => reject(error));
        } finally {
          cleanup();
        }
      }, 300);
    };
    frame.onerror = () => {
      finish(() => reject(new Error("The print document could not be loaded.")));
      cleanup();
    };
    document.body.appendChild(frame);
    frame.src = blobUrl;
  });

const HeroDots = () => (
  <div className={styles.heroDots} aria-hidden="true">
    {Array.from({ length: HERO_DOT_COUNT }, (_, index) => (
      <span key={index} style={{ opacity: 0.2 + (index % 14) * 0.035 }} />
    ))}
  </div>
);

const OfficialPersonIcon = () => (
  <svg
    className={styles.officialPersonIcon}
    viewBox="0 0 64 64"
    role="img"
    aria-label="Official"
  >
    <circle cx="32" cy="18" r="10" />
    <path d="M12 58v-8c0-11 9-20 20-20s20 9 20 20v8H12Z" />
    <path className={styles.officialShirt} d="M22 32l10 9 10-9-4 26H26l-4-26Z" />
    <path className={styles.officialTie} d="M29 39h6l2 5-5 11-5-11 2-5Z" />
  </svg>
);

const optionsWithLegacyValue = (options, value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed || options.includes(trimmed)) return options;
  return [trimmed, ...options];
};

const Official = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token, isAuthenticated, loading: authLoading } = useAuth();
  const outletContext = useOutletContext() || {};
  const access = outletContext.access || outletContext.tournament?.access || {};
  const isTournamentReadOnly = access?.isReadOnly === true;
  const canEditOfficials = Boolean(
    !isTournamentReadOnly &&
      access?.canEdit !== false &&
      (access?.hasPremiumAccess || access?.isAdmin),
  );
  const canPrintOfficials = access?.canPrint !== false;
  const canExportOfficials = access?.canExport !== false;

  const [tournament, setTournament] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState(null);

  const pdfPageRef = useRef(null);
  const mountedRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const lastSavedHashRef = useRef("");
  const isSavingRef = useRef(false);
  const fileInputRef = useRef(null);

  const meaningfulOfficials = useMemo(
    () => officials.filter(isMeaningfulOfficial),
    [officials],
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const performSave = useCallback(
    async (rows) => {
      if (!canEditOfficials || !id || !token || isSavingRef.current) return;
      const payload = { officials: normalizeOfficialsForSave(rows) };
      const payloadHash = djb2Hash(stableStringify(payload));
      if (payloadHash === lastSavedHashRef.current) return;

      isSavingRef.current = true;
      setSaveStatus("saving");
      try {
        await api.put(`/tournament/${id}/officials`, payload);
        lastSavedHashRef.current = payloadHash;
        localStorage.setItem(`officialsData_${id}`, JSON.stringify(rows));
        setError("");
        setSaveStatus("saved");
        window.setTimeout(
          () => setSaveStatus((current) => (current === "saved" ? "idle" : current)),
          2200,
        );
      } catch (requestError) {
        const message =
          requestError?.response?.data?.message ||
          requestError?.response?.data?.reason ||
          requestError?.message ||
          "Failed to save officials";
        console.error("Official autosave failed:", {
          status: requestError?.response?.status,
          message,
          response: requestError?.response?.data,
        });
        setError(message);
        setSaveStatus("error");
      } finally {
        isSavingRef.current = false;
      }
    },
    [canEditOfficials, id, token],
  );

  const flushSaveNow = useCallback(async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    await performSave(officials);
  }, [officials, performSave]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !id) return undefined;
    let active = true;
    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        const [tournamentResponse, officialsResponse] = await Promise.all([
          api.get(`/tournament/${id}`),
          api
            .get(`/tournament/${id}/officials`)
            .catch(() => ({ data: { officials: [] } })),
        ]);
        if (!active) return;
        const tournamentData = tournamentResponse.data || {};
        setTournament({
          name: tournamentData.tournamentName || "Unnamed Tournament",
          federation: tournamentData.federation || "N/A",
          logos: Array.isArray(tournamentData.logos) ? tournamentData.logos : [],
        });

        let loaded = Array.isArray(officialsResponse.data?.officials)
          ? officialsResponse.data.officials.map(normalizeOfficial)
          : [];
        if (!loaded.length) {
          try {
            const local = JSON.parse(localStorage.getItem(`officialsData_${id}`) || "[]");
            loaded = Array.isArray(local) ? local.map(normalizeOfficial) : [];
          } catch {
            loaded = [];
          }
        }
        if (!loaded.length) loaded = [createEmptyOfficial()];
        setOfficials(loaded);
        lastSavedHashRef.current = djb2Hash(
          stableStringify({ officials: normalizeOfficialsForSave(loaded) }),
        );
      } catch (requestError) {
        if (active) {
          setError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              "Failed to load officials.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [authLoading, id, isAuthenticated, token]);

  useEffect(() => {
    if (isLoading) return undefined;
    localStorage.setItem(`officialsData_${id}`, JSON.stringify(officials));
    if (!canEditOfficials) return undefined;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return undefined;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => performSave(officials), 1000);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [canEditOfficials, id, isLoading, officials, performSave]);

  const updateRow = (rowIndex, field, value) => {
    if (!canEditOfficials || !OFFICIAL_FIELDS.includes(field)) return;
    setOfficials((current) =>
      current.map((official, index) =>
        index === rowIndex ? { ...official, [field]: value } : official,
      ),
    );
  };

  const deleteRow = (rowIndex) => {
    if (!canEditOfficials) return;
    setOfficials((current) => {
      const next = current.filter((_, index) => index !== rowIndex);
      return next.length ? next : [createEmptyOfficial()];
    });
  };

  const insertRowAfter = (rowIndex) => {
    if (!canEditOfficials) return;
    setOfficials((current) => {
      const next = [...current];
      next.splice(rowIndex + 1, 0, createEmptyOfficial());
      return next;
    });
    window.setTimeout(() => {
      const rows = document.querySelectorAll(`.${styles.table} tbody tr`);
      rows[rowIndex + 1]?.querySelector("input")?.focus();
    }, 0);
  };

  const handleEnterKey = (event, rowIndex, field) => {
    if (event.key !== "Enter" || field !== "mark" || !canEditOfficials) return;
    event.preventDefault();
    if (rowIndex === officials.length - 1) {
      setOfficials((current) => [...current, createEmptyOfficial()]);
      window.setTimeout(() => {
        const rows = document.querySelectorAll(`.${styles.table} tbody tr`);
        rows[rows.length - 1]?.querySelector("input")?.focus();
      }, 0);
    }
  };

  const handleFileUpload = (event) => {
    if (!canEditOfficials) return;
    const file = event.target?.files?.[0];
    if (!file) return;
    setSelectedImportFile(file);
    setShowImportModal(true);
    event.target.value = "";
  };

  const handleImportedOfficials = (rows) => {
    if (!canEditOfficials) return;
    const imported = (Array.isArray(rows) ? rows : [])
      .map(normalizeOfficial)
      .filter(isMeaningfulOfficial);
    if (!imported.length) return;
    setOfficials((current) => [
      ...current.filter(isMeaningfulOfficial),
      ...imported,
    ]);
    setShowImportModal(false);
    setSelectedImportFile(null);
  };

  const generatePDFDoc = async () => {
    if (canEditOfficials) await flushSaveNow();
    if (!pdfPageRef.current) throw new Error("Official report is not ready.");

    const clone = pdfPageRef.current.cloneNode(true);
    const host = document.createElement("div");
    clone.classList.add(styles.pdfExport);
    clone.querySelectorAll('[data-screen-only="true"]').forEach((node) => node.remove());
    clone.querySelectorAll("input, select").forEach((control) => {
      const value = document.createElement("span");
      value.className = styles.exportValue;
      value.textContent = control.value || "";
      if (control.dataset.mark === "true" && !control.value) {
        value.classList.add(styles.exportMarkLine);
      }
      control.replaceWith(value);
    });
    Object.assign(host.style, {
      position: "fixed",
      left: "-12000px",
      top: "0",
      width: `${PDF_EXPORT_WIDTH}px`,
      background: "#ffffff",
      zIndex: "-1",
    });
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await waitForImages(clone);
      await nextAnimationFrame();
      await nextAnimationFrame();
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: PDF_EXPORT_WIDTH,
        windowHeight: Math.ceil(clone.scrollHeight),
        scrollX: 0,
        scrollY: 0,
      });
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 5;
      const ratio = Math.min(
        (pageWidth - margin * 2) / canvas.width,
        (pageHeight - margin * 2) / canvas.height,
      );
      const imageWidth = canvas.width * ratio;
      const imageHeight = canvas.height * ratio;
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (pageWidth - imageWidth) / 2,
        margin,
        imageWidth,
        imageHeight,
        undefined,
        "NONE",
      );
      return doc;
    } finally {
      host.remove();
    }
  };

  const runExport = async (mode) => {
    try {
      setIsExporting(true);
      setError("");
      const doc = await generatePDFDoc();
      if (mode === "print") await openPDFPrintPreview(doc.output("blob"));
      else {
        const safeName = String(tournament?.name || "Tournament").replace(
          /[^a-z0-9]+/gi,
          "_",
        );
        doc.save(`Officials_${safeName}_${id}.pdf`);
      }
    } catch (exportError) {
      console.error("Official export failed:", exportError?.message);
      setError(exportError?.message || "Failed to export officials.");
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading || isLoading) {
    return <div className={styles.loading}>Loading Officials...</div>;
  }

  if (!isAuthenticated) return null;

  const logoLeft = tournament?.logos?.[0]
    ? getFullImageUrl(tournament.logos[0])
    : "";

  return (
    <main className={styles.container}>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {isTournamentReadOnly ? (
        <div className={styles.readOnlyBanner} role="status">
          This tournament is archived and read-only. Print and PDF remain available.
        </div>
      ) : null}

      <section ref={pdfPageRef} className={styles.officialPage}>
        <header className={styles.hero}>
          <svg
            className={styles.heroAccent}
            viewBox="0 0 190 190"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 0H150L190 95L140 190H0Z" />
          </svg>
          <div className={styles.heroEmblem} aria-hidden="true">
            {logoLeft ? (
              <img src={logoLeft} alt="" />
            ) : (
              <OfficialPersonIcon />
            )}
          </div>
          <div className={styles.heroContent}>
            <h1>{tournament?.name || "Tournament"}</h1>
            <p>{tournament?.federation || "Tournament Federation"}</p>
            <h2>
              <OfficialPersonIcon />
              <span>Tournament Officials</span>
            </h2>
          </div>
          <HeroDots />
          <div className={styles.heroStripes} aria-hidden="true">
            <span />
            <span />
          </div>
        </header>

        <div className={styles.toolbar} data-screen-only="true">
          <div className={styles.directoryTitle}>
            <h2>Official Directory</h2>
            <span>{meaningfulOfficials.length} Officials</span>
          </div>
          <div className={styles.toolbarRight}>
            <label
              className={`${styles.toolbarButton} ${!canEditOfficials ? styles.disabled : ""}`}
              htmlFor="officialExcelImport"
            >
              <FileSpreadsheet size={18} aria-hidden="true" />
              Import Excel
            </label>
            <input
              id="officialExcelImport"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsb,.xlsm"
              onChange={handleFileUpload}
              disabled={!canEditOfficials}
              hidden
            />
            <button
              type="button"
              className={styles.toolbarButton}
              onClick={() => runExport("print")}
              disabled={!canPrintOfficials || !meaningfulOfficials.length || isExporting}
            >
              <Printer size={18} aria-hidden="true" />
              Print
            </button>
            <button
              type="button"
              className={`${styles.toolbarButton} ${styles.primaryButton}`}
              onClick={() => runExport("save")}
              disabled={!canExportOfficials || !meaningfulOfficials.length || isExporting}
            >
              <FileDown size={18} aria-hidden="true" />
              {isExporting ? "Preparing..." : "Save PDF"}
            </button>
            <div
              className={`${styles.saveStatus} ${styles[saveStatus] || ""}`}
              role="status"
            >
              {isTournamentReadOnly
                ? "Read-only"
                : saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                    ? "All changes saved"
                    : saveStatus === "error"
                      ? "Save failed"
                      : ""}
            </div>
          </div>
        </div>

        <div className={styles.printDirectoryHeading}>
          <strong>Official Directory</strong>
          <span>{meaningfulOfficials.length} Officials</span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>S.N.</th>
                <th>Name</th>
                <th>District / State</th>
                <th>Contact</th>
                <th>Dan</th>
                <th>Dan Number</th>
                <th>Rank</th>
                <th>Class</th>
                <th>Role</th>
                <th>Arena</th>
                <th>Mark</th>
                <th data-screen-only="true">Actions</th>
              </tr>
            </thead>
            <tbody>
              {officials.map((official, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex + 1}</td>
                  <td>
                    <input value={official.name} onChange={(e) => updateRow(rowIndex, "name", e.target.value)} placeholder="Name" disabled={!canEditOfficials} />
                  </td>
                  <td>
                    <input value={official.districtState} onChange={(e) => updateRow(rowIndex, "districtState", e.target.value)} placeholder="District / State" disabled={!canEditOfficials} />
                  </td>
                  <td>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={12}
                      value={official.contact}
                      onChange={(e) =>
                        updateRow(rowIndex, "contact", formatContact(e.target.value))
                      }
                      placeholder="0000-00-0000"
                      aria-label={`Contact for official row ${rowIndex + 1}`}
                      disabled={!canEditOfficials}
                    />
                  </td>
                  <td>
                    <div className={styles.selectShell}>
                      <select
                        value={official.dan}
                        onChange={(e) => updateRow(rowIndex, "dan", e.target.value)}
                        disabled={!canEditOfficials}
                      >
                        {optionsWithLegacyValue(DAN_OPTIONS, official.dan).map(
                          (option) => (
                            <option key={option} value={option}>{option}</option>
                          ),
                        )}
                      </select>
                      <ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </td>
                  <td>
                    <input value={official.danNumber} onChange={(e) => updateRow(rowIndex, "danNumber", e.target.value)} placeholder="Dan Number" disabled={!canEditOfficials} />
                  </td>
                  <td>
                    <div className={styles.selectShell}>
                      <select value={official.rank} onChange={(e) => updateRow(rowIndex, "rank", e.target.value)} disabled={!canEditOfficials}>
                        <option value="">Rank</option>
                        {optionsWithLegacyValue(RANK_OPTIONS, official.rank).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select><ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </td>
                  <td>
                    <div className={styles.selectShell}>
                      <select value={official.officialClass} onChange={(e) => updateRow(rowIndex, "officialClass", e.target.value)} disabled={!canEditOfficials}>
                        <option value="">Class</option>
                        {optionsWithLegacyValue(CLASS_OPTIONS, official.officialClass).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select><ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </td>
                  <td>
                    <div className={styles.selectShell}>
                      <select value={official.role} onChange={(e) => updateRow(rowIndex, "role", e.target.value)} disabled={!canEditOfficials}>
                        <option value="">Role</option>
                        {optionsWithLegacyValue(ROLE_OPTIONS, official.role).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select><ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </td>
                  <td>
                    <div className={styles.selectShell}>
                      <select value={official.arena} onChange={(e) => updateRow(rowIndex, "arena", e.target.value)} disabled={!canEditOfficials}>
                        <option value="">Arena</option>
                        {optionsWithLegacyValue(ARENA_OPTIONS, official.arena).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select><ChevronDown size={14} aria-hidden="true" />
                    </div>
                  </td>
                  <td>
                    <input data-mark="true" value={official.mark} onChange={(e) => updateRow(rowIndex, "mark", e.target.value)} onKeyDown={(e) => handleEnterKey(e, rowIndex, "mark")} placeholder="Mark" disabled={!canEditOfficials} />
                  </td>
                  <td data-screen-only="true">
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.addRowButton} onClick={() => insertRowAfter(rowIndex)} disabled={!canEditOfficials} aria-label={`Add a new official below row ${rowIndex + 1}`} title="Add row below">
                        <Plus size={18} aria-hidden="true" />
                      </button>
                      <button type="button" className={styles.deleteButton} onClick={() => deleteRow(rowIndex)} disabled={!canEditOfficials} aria-label={`Delete official row ${rowIndex + 1}`} title="Delete row">
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={styles.pageFooter}>
          <span>Generated by <strong>KHILADI</strong> – Tournament Manager</span>
          <a href="https://khiladi-khoj.com" target="_blank" rel="noopener noreferrer">khiladi-khoj.com</a>
          <span>Official Directory</span>
        </footer>
      </section>

      <OfficialImportModal
        show={showImportModal}
        selectedFile={selectedImportFile}
        onClose={() => {
          setShowImportModal(false);
          setSelectedImportFile(null);
        }}
        onImportSuccess={handleImportedOfficials}
      />
    </main>
  );
};

export default Official;