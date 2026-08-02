// src/pages/Winner.jsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  FileDown,
  Mars,
  Medal,
  Printer,
  RefreshCw,
  Trophy,
  Users,
  Venus,
  Weight,
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "../api";
import PremiumAccessGuard from "../components/payment/PremiumAccessGuard";
import { useAuth } from "../context/AuthContext";
import styles from "./Winner.module.css";

const EVENT_ORDER = ["OVERALL", "KYORUGI", "POOMSAE", "FRESHER", "TAG TEAM"];
const AGE_ORDER = [
  "Sub-Junior",
  "Cadet",
  "Junior",
  "Senior",
  "Under - 14",
  "Under - 17",
  "Under - 19",
];
const GENDER_ORDER = ["Male", "Female"];
const PDF_EXPORT_WIDTH = 794;
const HERO_DOT_COUNT = 126;

const normalizeText = (value) => String(value || "").trim();

const normalizeGender = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (["male", "m", "boy", "boys"].includes(normalized)) return "Male";
  if (["female", "f", "girl", "girls"].includes(normalized)) return "Female";
  return normalizeText(value);
};

const normalizeAgeCategory = (value) => {
  const original = normalizeText(value);
  const normalized = original.toLowerCase().replace(/\s+/g, " ");

  if (["sub-junior", "sub junior", "sub - junior", "subjunior"].includes(normalized)) {
    return "Sub-Junior";
  }
  if (normalized === "cadet") return "Cadet";
  if (normalized === "junior") return "Junior";
  if (normalized === "senior") return "Senior";
  if (["under-14", "under - 14", "under 14"].includes(normalized)) return "Under - 14";
  if (["under-17", "under - 17", "under 17"].includes(normalized)) return "Under - 17";
  if (["under-19", "under - 19", "under 19"].includes(normalized)) return "Under - 19";
  return original;
};

const getWeightSortValue = (weightCategory = "") => {
  const text = String(weightCategory).toLowerCase();
  const underMatch = text.match(/under\s*-?\s*(\d+)|u\s*-?\s*(\d+)/);
  if (underMatch) return Number(underMatch[1] || underMatch[2]);

  const overMatch = text.match(/over\s*-?\s*(\d+)/);
  if (overMatch) return Number(overMatch[1]) + 1000;

  const anyNumber = text.match(/(\d+)/);
  return anyNumber ? Number(anyNumber[1]) : 9999;
};

const indexOrLast = (items, value) => {
  const index = items.indexOf(value);
  return index === -1 ? 999 : index;
};

const sortWinnerPages = (left, right) => {
  const ageDifference =
    indexOrLast(AGE_ORDER, normalizeAgeCategory(left?.age)) -
    indexOrLast(AGE_ORDER, normalizeAgeCategory(right?.age));
  if (ageDifference) return ageDifference;

  const genderDifference =
    indexOrLast(GENDER_ORDER, normalizeGender(left?.gender)) -
    indexOrLast(GENDER_ORDER, normalizeGender(right?.gender));
  if (genderDifference) return genderDifference;

  const leftWeight = left?.weights?.[0]?.weightCategory;
  const rightWeight = right?.weights?.[0]?.weightCategory;
  return getWeightSortValue(leftWeight) - getWeightSortValue(rightWeight);
};

const uniqueSorted = (values, preferredOrder) =>
  [...new Set(values.map(normalizeText).filter(Boolean))].sort(
    (left, right) =>
      indexOrLast(preferredOrder, left) - indexOrLast(preferredOrder, right) ||
      left.localeCompare(right),
  );

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (/^https?:\/\//i.test(filename)) return filename;

  const cleanFilename = String(filename).replace(/^.*[\\/]/, "");
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  return `${uploadsUrl}/uploads/${cleanFilename}`;
};

const safeFilePart = (value, fallback) => {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

const waitForImages = async (root) => {
  const images = Array.from(root?.querySelectorAll?.("img") || []);
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }),
  );
};

const nextAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const openPDFPrintPreview = (pdfBlob) =>
  new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(pdfBlob);
    const printFrame = document.createElement("iframe");
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const cleanup = () => {
      window.setTimeout(() => {
        printFrame.remove();
        URL.revokeObjectURL(blobUrl);
      }, 60_000);
    };

    Object.assign(printFrame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    printFrame.title = "Winner report print document";
    printFrame.setAttribute("aria-hidden", "true");

    printFrame.onload = () => {
      window.setTimeout(() => {
        try {
          if (!printFrame.contentWindow) {
            throw new Error("The browser could not open the print preview.");
          }
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
          window.focus();
          finish(resolve);
          cleanup();
        } catch (printError) {
          finish(() => reject(printError));
          cleanup();
        }
      }, 250);
    };

    printFrame.onerror = () => {
      finish(() => reject(new Error("The PDF could not be loaded for printing.")));
      cleanup();
    };

    document.body.appendChild(printFrame);
    printFrame.src = blobUrl;
  });

const HeroDots = () => (
  <div className={styles.heroDots} aria-hidden="true">
    {Array.from({ length: HERO_DOT_COUNT }, (_, index) => (
      <span key={index} style={{ opacity: 0.2 + (index % 14) * 0.035 }} />
    ))}
  </div>
);

const WinnerHero = ({
  tournament = null,
  selectedEvent,
  logoLeft = "",
  logoRight = "",
}) => (
  <header className={styles.hero} data-winner-hero="true">
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
        <Medal size={61} strokeWidth={1.7} />
      )}
    </div>

    <div className={styles.heroContent}>
      <h1>{tournament?.name || "Tournament"}</h1>
      <p>{tournament?.federation || "Tournament Federation"}</p>
      <h2>
        <Medal size={31} strokeWidth={2} aria-hidden="true" />
        <span>Medal Winners</span>
      </h2>
     
    </div>

    <HeroDots />
    <div className={styles.heroStripes} aria-hidden="true">
      <span />
      <span />
    </div>

    {logoRight ? (
      <img src={logoRight} alt="Federation logo" className={styles.heroRightLogo} />
    ) : null}
  </header>
);

const FilterSelect = ({ icon: Icon, label, value, onChange, options }) => (
  <label className={styles.filterControl}>
    <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
    <span>
      <small>{label}</small>
      <span className={styles.selectWrapper}>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </span>
  </label>
);

const MedalBadge = ({ medal = "" }) => {
  const normalized = ["Gold", "Silver", "Bronze"].includes(medal) ? medal : "Bronze";
  return (
    <span className={`${styles.medalBadge} ${styles[`medal${normalized}`]}`}>
      <Medal size={17} strokeWidth={2} aria-hidden="true" />
      <span>{medal || "Medal"}</span>
    </span>
  );
};

const PageSummary = ({ page = null }) => {
  const rows = (page?.weights || []).flatMap((group) => group?.rows || []);
  const teams = new Set(rows.map((row) => normalizeText(row?.team)).filter(Boolean));

  const items = [
    { icon: Trophy, label: "Winners", value: rows.length },
    { icon: Weight, label: "Weight Categories", value: page?.weights?.length || 0 },
    { icon: Users, label: "Teams", value: teams.size },
  ];

  return (
    <div className={styles.summaryGrid}>
      {items.map(({ icon: Icon, label, value }) => (
        <article key={label} className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <Icon size={23} strokeWidth={2} />
          </span>
          <span>
            <strong>{value}</strong>
            <small>{label}</small>
          </span>
        </article>
      ))}
    </div>
  );
};

const WinnerReport = ({
  page,
  pageIndex,
  totalPages,
  selectedEvent,
  onPrintPage,
  onSavePage,
  isExporting,
}) => (
  <article className={styles.winnerPage} data-winner-page="true">
    <div className={styles.reportHeading}>
      <div>
        <span className={styles.reportKicker}>Official Winner Report</span>
        <h2>
          {normalizeAgeCategory(page?.age) || "Age Category"}
          <span aria-hidden="true">•</span>
          {normalizeGender(page?.gender).toUpperCase() || "GENDER"}
        </h2>
      </div>
      <div className={styles.reportHeadingRight}>
        <span className={styles.reportEvent}>{selectedEvent}</span>
        <div className={styles.sheetActions} data-screen-only="true">
          <button
            type="button"
            onClick={() => onPrintPage(pageIndex, page)}
            disabled={isExporting}
            aria-label={`Print ${page?.age || "winner"} ${page?.gender || ""} sheet`}
          >
            <Printer size={16} aria-hidden="true" />
            Print Sheet
          </button>
          <button
            type="button"
            onClick={() => onSavePage(pageIndex, page)}
            disabled={isExporting}
            aria-label={`Save ${page?.age || "winner"} ${page?.gender || ""} sheet as PDF`}
          >
            <FileDown size={16} aria-hidden="true" />
            Save PDF
          </button>
        </div>
      </div>
    </div>

    <div className={styles.tableContainer}>
      <table className={styles.medalTable}>
        <thead>
          <tr>
            <th className={styles.weightHeader}>Weight Category</th>
            <th className={styles.medalHeader}>Medal</th>
            <th className={styles.participantHeader}>Player Name</th>
            <th className={styles.teamHeader}>Team</th>
            <th className={styles.markHeader}>Mark</th>
          </tr>
        </thead>
        <tbody>
          {(page?.weights || []).map((group) =>
            (group?.rows || []).map((row, rowIndex) => (
              <tr
                key={`${group?.weightCategory}_${row?.medal}_${row?.name}_${rowIndex}`}
                className={rowIndex === 0 ? styles.weightGroupStart : undefined}
              >
                {rowIndex === 0 ? (
                  <td rowSpan={group.rows.length} className={styles.weightCell}>
                    {group?.weightCategory || "-"}
                  </td>
                ) : null}
                <td className={styles.medalCell}>
                  <MedalBadge medal={row?.medal} />
                </td>
                <td className={styles.participantCell}>
                  <strong>{row?.name || "TBD"}</strong>
                </td>
                <td className={styles.teamCell}>
                  {row?.team ? <strong>{row.team}</strong> : <span className={styles.noTeam}>-</span>}
                </td>
                <td className={styles.markCell}>
                  <span aria-hidden="true" />
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>

    <PageSummary page={page} />

    <footer className={styles.pageFooter}>
  <span>
    Generated by <strong>KHILADI</strong> – Tournament Manager
  </span>

  <a
    href="https://khiladi-khoj.com"
    target="_blank"
    rel="noopener noreferrer"
    className={styles.footerWebsite}
  >
    khiladi-khoj.com
  </a>

  <span>Page {pageIndex + 1} of {totalPages}</span>
</footer>
  </article>
);

const winnerRowShape = PropTypes.shape({
  medal: PropTypes.string,
  name: PropTypes.string,
  team: PropTypes.string,
});

const weightGroupShape = PropTypes.shape({
  weightCategory: PropTypes.string,
  rows: PropTypes.arrayOf(winnerRowShape),
});

const winnerPageShape = PropTypes.shape({
  age: PropTypes.string,
  gender: PropTypes.string,
  weights: PropTypes.arrayOf(weightGroupShape),
});

WinnerHero.propTypes = {
  tournament: PropTypes.shape({
    name: PropTypes.string,
    federation: PropTypes.string,
  }),
  selectedEvent: PropTypes.string.isRequired,
  logoLeft: PropTypes.string,
  logoRight: PropTypes.string,
};

FilterSelect.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
};

MedalBadge.propTypes = {
  medal: PropTypes.string,
};

PageSummary.propTypes = {
  page: winnerPageShape,
};

WinnerReport.propTypes = {
  page: winnerPageShape.isRequired,
  pageIndex: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  selectedEvent: PropTypes.string.isRequired,
  onPrintPage: PropTypes.func.isRequired,
  onSavePage: PropTypes.func.isRequired,
  isExporting: PropTypes.bool.isRequired,
};

const Winner = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const heroRef = useRef(null);

  const [tournament, setTournament] = useState(null);
  const [groupedFromServer, setGroupedFromServer] = useState([]);
  const [availableEventsFromServer, setAvailableEventsFromServer] = useState(["OVERALL"]);
  const [selectedEvent, setSelectedEvent] = useState("KYORUGI");
  const [selectedAge, setSelectedAge] = useState("ALL CATEGORIES");
  const [selectedGender, setSelectedGender] = useState("ALL GENDERS");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { replace: true });
  }, [isAuthenticated, navigate]);

  const applyWinnerResponse = useCallback((responseData = {}) => {
    setGroupedFromServer(Array.isArray(responseData.pages) ? responseData.pages : []);
    setAvailableEventsFromServer(
      Array.isArray(responseData.availableEvents) && responseData.availableEvents.length
        ? responseData.availableEvents
        : ["OVERALL"],
    );
  }, []);

  const fetchWinnerData = useCallback(async () => {
    const [tournamentResponse, winnerResponse] = await Promise.all([
      api.get(`/tournament/${id}`),
      api.get(
        `/tournament/${id}/winners?event=${encodeURIComponent(selectedEvent)}&ts=${Date.now()}`,
      ),
    ]);

    const tournamentData = tournamentResponse.data || {};
    setTournament({
      name: tournamentData.tournamentName || "Unnamed Tournament",
      federation: tournamentData.federation || "N/A",
      logos: Array.isArray(tournamentData.logos) ? tournamentData.logos : [],
    });
    applyWinnerResponse(winnerResponse.data || {});
  }, [applyWinnerResponse, id, selectedEvent]);

  useEffect(() => {
    if (!id || !isAuthenticated) return undefined;
    let active = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        await fetchWinnerData();
      } catch (requestError) {
        if (active) {
          setError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              "Failed to load medal winners.",
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
  }, [fetchWinnerData, id, isAuthenticated]);

  const availableEvents = useMemo(() => {
    const events = uniqueSorted(availableEventsFromServer, EVENT_ORDER);
    return events.length ? events : ["OVERALL"];
  }, [availableEventsFromServer]);

  useEffect(() => {
    if (!availableEvents.includes(selectedEvent)) {
      setSelectedEvent(availableEvents.includes("KYORUGI") ? "KYORUGI" : availableEvents[0]);
    }
  }, [availableEvents, selectedEvent]);

  const sortedPages = useMemo(
    () => [...(Array.isArray(groupedFromServer) ? groupedFromServer : [])].sort(sortWinnerPages),
    [groupedFromServer],
  );

  const availableAges = useMemo(
    () => ["ALL CATEGORIES", ...uniqueSorted(sortedPages.map((page) => normalizeAgeCategory(page.age)), AGE_ORDER)],
    [sortedPages],
  );
  const availableGenders = useMemo(
    () => ["ALL GENDERS", ...uniqueSorted(sortedPages.map((page) => normalizeGender(page.gender)), GENDER_ORDER)],
    [sortedPages],
  );

  useEffect(() => {
    if (!availableAges.includes(selectedAge)) setSelectedAge("ALL CATEGORIES");
  }, [availableAges, selectedAge]);
  useEffect(() => {
    if (!availableGenders.includes(selectedGender)) setSelectedGender("ALL GENDERS");
  }, [availableGenders, selectedGender]);

  const visiblePages = useMemo(
    () =>
      sortedPages.filter(
        (page) =>
          (selectedAge === "ALL CATEGORIES" || normalizeAgeCategory(page.age) === selectedAge) &&
          (selectedGender === "ALL GENDERS" || normalizeGender(page.gender) === selectedGender),
      ),
    [selectedAge, selectedGender, sortedPages],
  );

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : "";
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : "";

  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      setError("");
      await fetchWinnerData();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message || requestError?.message || "Failed to refresh winners.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const generatePDFDoc = async (requestedPageIndexes = null) => {
    const allPageNodes = Array.from(document.querySelectorAll('[data-winner-page="true"]'));
    const pageIndexes = Array.isArray(requestedPageIndexes)
      ? requestedPageIndexes.filter(
          (pageIndex) => Number.isInteger(pageIndex) && allPageNodes[pageIndex],
        )
      : allPageNodes.map((_, pageIndex) => pageIndex);
    const pageNodes = pageIndexes.map((pageIndex) => allPageNodes[pageIndex]);

    if (!pageNodes.length || !heroRef.current) return null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const margin = 4;

    for (let pageIndex = 0; pageIndex < pageNodes.length; pageIndex += 1) {
      if (pageIndex > 0) doc.addPage("a4", "portrait");

      const exportHost = document.createElement("div");
      const exportPage = document.createElement("div");
      exportPage.className = styles.pdfExport;
      exportPage.appendChild(heroRef.current.cloneNode(true));
      exportPage.appendChild(pageNodes[pageIndex].cloneNode(true));
      exportPage
        .querySelectorAll('[data-screen-only="true"]')
        .forEach((element) => element.remove());

      Object.assign(exportHost.style, {
        position: "fixed",
        left: "-12000px",
        top: "0",
        width: `${PDF_EXPORT_WIDTH}px`,
        background: "#ffffff",
        zIndex: "-1",
      });
      exportHost.appendChild(exportPage);
      document.body.appendChild(exportHost);

      try {
        if (document.fonts?.ready) await document.fonts.ready;
        await waitForImages(exportPage);
        await nextAnimationFrame();
        await nextAnimationFrame();

        const canvas = await html2canvas(exportPage, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          width: PDF_EXPORT_WIDTH,
          windowWidth: PDF_EXPORT_WIDTH,
          windowHeight: Math.ceil(exportPage.scrollHeight),
          scrollX: 0,
          scrollY: 0,
        });

        const availableWidth = pdfWidth - margin * 2;
        const availableHeight = pdfHeight - margin * 2;
        const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
        const imageWidth = canvas.width * ratio;
        const imageHeight = canvas.height * ratio;

        doc.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          (pdfWidth - imageWidth) / 2,
         margin,
          imageWidth,
          imageHeight,
          undefined,
          "NONE",
        );
      } finally {
        exportHost.remove();
      }
    }

    return doc;
  };

  const saveAllPDF = async () => {
    try {
      setIsExporting(true);
      setError("");
      const doc = await generatePDFDoc();
      if (!doc) return;
      doc.save(
        `Medal_Winners_${safeFilePart(selectedEvent, "Overall")}_${safeFilePart(
          tournament?.name,
          "Tournament",
        )}_${id}.pdf`,
      );
    } catch (exportError) {
      console.error("Winner PDF export failed:", exportError);
      setError(exportError?.message || "Failed to save the Winner PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const printAllPDF = async () => {
    try {
      setIsExporting(true);
      setError("");
      const doc = await generatePDFDoc();
      if (!doc) return;
      await openPDFPrintPreview(doc.output("blob"));
    } catch (exportError) {
      console.error("Winner print export failed:", exportError);
      setError(exportError?.message || "Failed to prepare the Winner print.");
    } finally {
      setIsExporting(false);
    }
  };

  const savePagePDF = async (pageIndex, page) => {
    try {
      setIsExporting(true);
      setError("");
      const doc = await generatePDFDoc([pageIndex]);
      if (!doc) return;

      doc.save(
        `Medal_Winners_${safeFilePart(selectedEvent, "Overall")}_${safeFilePart(
          page?.age,
          "Age_Category",
        )}_${safeFilePart(page?.gender, "Gender")}_${safeFilePart(
          tournament?.name,
          "Tournament",
        )}_${id}.pdf`,
      );
    } catch (exportError) {
      console.error("Winner single-page PDF export failed:", exportError);
      setError(exportError?.message || "Failed to save this Winner sheet.");
    } finally {
      setIsExporting(false);
    }
  };

  const printPagePDF = async (pageIndex) => {
    try {
      setIsExporting(true);
      setError("");
      const doc = await generatePDFDoc([pageIndex]);
      if (!doc) return;
      await openPDFPrintPreview(doc.output("blob"));
    } catch (exportError) {
      console.error("Winner single-page print failed:", exportError);
      setError(exportError?.message || "Failed to print this Winner sheet.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite">
        <span className={styles.spinner} />
        <strong>Loading medal winners...</strong>
      </div>
    );
  }

  return (
    <PremiumAccessGuard tournamentId={id}>
      <main className={styles.winnerContainer}>
        {error ? (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" onClick={refreshData}>Retry</button>
          </div>
        ) : null}

        <div ref={heroRef}>
          <WinnerHero
            tournament={tournament}
            selectedEvent={selectedEvent}
            logoLeft={logoLeft}
            logoRight={logoRight}
          />
        </div>

        <section className={styles.toolbar} aria-label="Winner report filters and actions">
          <div className={styles.filters}>
            <FilterSelect
              icon={Medal}
              label="Event"
              value={selectedEvent}
              onChange={setSelectedEvent}
              options={availableEvents}
            />
            <FilterSelect
              icon={Weight}
              label="Age Category"
              value={selectedAge}
              onChange={setSelectedAge}
              options={availableAges}
            />
            <FilterSelect
              icon={selectedGender === "Female" ? Venus : Mars}
              label="Gender"
              value={selectedGender}
              onChange={setSelectedGender}
              options={availableGenders}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={refreshData} disabled={isRefreshing || isExporting}>
              <RefreshCw size={18} className={isRefreshing ? styles.spinning : undefined} />
              Refresh
            </button>
            <button type="button" onClick={printAllPDF} disabled={!visiblePages.length || isExporting}>
              <Printer size={18} />
              Print All
            </button>
            <button type="button" onClick={saveAllPDF} disabled={!visiblePages.length || isExporting}>
              <FileDown size={18} />
              {isExporting ? "Preparing..." : "Save All to PDF"}
            </button>
          </div>
        </section>

        {visiblePages.length ? (
          <section className={styles.reportList} aria-label="Winner reports">
            {visiblePages.map((page, pageIndex) => (
              <WinnerReport
                key={`${selectedEvent}_${page?.gender}_${page?.age}_${pageIndex}`}
                page={page}
                pageIndex={pageIndex}
                totalPages={visiblePages.length}
                selectedEvent={selectedEvent}
                onPrintPage={printPagePDF}
                onSavePage={savePagePDF}
                isExporting={isExporting}
              />
            ))}
          </section>
        ) : (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon}><Medal size={46} /></span>
            <h2>No {selectedEvent} winners found</h2>
            <p>
              Declare medals in the <strong>Entry</strong> section or declare winners in the
              <strong> Tie Sheet</strong> section first.
            </p>
            <button type="button" onClick={() => navigate(`/tournaments/${id}/tie-sheet`)}>
              Go to Tie Sheet
            </button>
          </section>
        )}
      </main>
    </PremiumAccessGuard>
  );
};

export default Winner;