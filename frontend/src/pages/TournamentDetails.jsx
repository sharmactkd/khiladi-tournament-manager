import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ReactCountryFlag from "react-country-flag";
import styles from "./TournamentDetails.module.css";
import { Country, State } from "country-state-city";
import { WT_WEIGHTS, SGFI_WEIGHTS } from "../components/TournamentForm/constants";

const ErrorBoundary = ({ section, children }) => {
  const [hasError] = useState(false);

  if (hasError) {
    return (
      <div style={{ color: "red", padding: "1rem" }}>
        Error in {section}
      </div>
    );
  }
  return children;
};

// Keep this local helper (behavior-preserving), but make URL building correct for filename-only
const getFullImageUrl = (url) => {
  if (!url) return "/default-poster.jpg";

  let cleanUrl = String(url).trim();

  // Fix broken protocol: https:/ → https://  and http:/ → http://
  cleanUrl = cleanUrl.replace(/^https?:\/(?!\/)/g, (match) => match + "/");
  cleanUrl = cleanUrl.replace(/^http?:\/(?!\/)/g, (match) => match + "/");

  // If full URL → return as-is
  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    return cleanUrl;
  }

  // Build uploads URL from API base (VITE_API_URL can include /api)
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const uploadsBase = String(baseUrl).replace(/\/api\/?$/, "");
  const filename = cleanUrl.replace(/^\/+/, "");
  return `${uploadsBase}/uploads/${filename}`;
};

const getAgeCriteria = (currentYear) => ({
  WT: {
    Senior: {
      description: "17 & above",
      criteria: `Born on or before 31 December ${
        currentYear - 17
      } (i.e., born in ${currentYear - 17} or earlier)`,
      example: `Example: If you were born in ${
        currentYear - 18
      }, ${currentYear - 19}, ${currentYear - 20}, etc., you are eligible for Senior competitions.`,
    },
    Junior: {
      description: "15 to 17 years",
      criteria: `Born between 1 January ${currentYear - 17} and 31 December ${
        currentYear - 15
      }`,
      example: `Example: If you were born in ${
        currentYear - 17
      }, ${currentYear - 16}, or ${currentYear - 15}, you are eligible for Junior competitions.`,
    },
    Cadet: {
      description: "12 to 14 years",
      criteria: `Born between 1 January ${currentYear - 14} and 31 December ${
        currentYear - 12
      }`,
      example: `Example: If you were born in ${
        currentYear - 14
      }, ${currentYear - 13}, or ${currentYear - 12}, you are eligible for Cadet competitions.`,
    },
    "Sub-Junior": {
      description: "Under 12",
      criteria: `Born on or after 1 January ${currentYear - 11}`,
      example: `Example: If you were born in ${
        currentYear - 11
      } or later, you are eligible for Sub-Junior competitions.`,
    },
  },
  SGFI: {
    "Under - 19": {
      description: "Under-19 (Senior)",
      criteria: `Born between 1 January ${currentYear - 19} and 31 December ${
        currentYear - 17
      }`,
      example: `Example: If you were born in ${
        currentYear - 19
      }, ${currentYear - 18}, or ${currentYear - 17}, you are eligible for U-19 competitions.`,
    },
    "Under - 17": {
      description: "Under-17 (Junior)",
      criteria: `Born between 1 January ${currentYear - 17} and 31 December ${
        currentYear - 15
      }`,
      example: `Example: If you were born in ${
        currentYear - 17
      }, ${currentYear - 16}, or ${currentYear - 15}, you are eligible for U-17 competitions.`,
    },
    "Under - 14": {
      description: "U-14 (Sub-Junior)",
      criteria: `Born on or after 1 January ${currentYear - 13}`,
      example: `Example: If you were born in ${
        currentYear - 13
      }, ${currentYear - 12}, or ${currentYear - 11}, you are eligible for U-14 competitions.`,
    },
  },
});

const TournamentDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ✅ Single source of truth: TournamentLayout passes tournament via Outlet context
  const outletCtx = useOutletContext() || {};
  const tournamentFromLayout = outletCtx.tournament || null;

  const [posterFailed, setPosterFailed] = useState(false);
  const [leftLogoFailed, setLeftLogoFailed] = useState(false);
  const [rightLogoFailed, setRightLogoFailed] = useState(false);

  // Keep same UI: show loading like before, but now driven by layout state
  const loading = outletCtx.loading || false;
  const error = outletCtx.error || "";
  const tournament = tournamentFromLayout;

  // Reset broken image states when tournament changes
  useEffect(() => {
    setPosterFailed(false);
    setLeftLogoFailed(false);
    setRightLogoFailed(false);
  }, [id, tournament?._id]);

  const formatDate = useMemo(
    () => (dateFrom, dateTo) => {
      if (!dateFrom || !dateTo) return "N/A";
      const startDate = new Date(dateFrom).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        weekday: "long",
      });
      const endDate = new Date(dateTo).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        weekday: "long",
      });
      return `From ${startDate} to ${endDate}`;
    },
    []
  );

  const isCreator = useMemo(() => {
    return (
      user &&
      tournament?.createdBy &&
      user.id === tournament.createdBy._id?.toString()
    );
  }, [user, tournament?.createdBy]);

  const isOngoing = useMemo(() => {
    if (!tournament?.dateFrom || !tournament?.dateTo) return false;

    const normalize = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const today = normalize(new Date());
    const tournamentEnd = normalize(tournament.dateTo);

    // Ongoing if tournament has NOT ended yet (end date is today or future)
    return today <= tournamentEnd;
  }, [tournament?.dateFrom, tournament?.dateTo]);

  const showEditButton = isCreator && isOngoing;

  const handleEdit = () => {
    navigate("/tournament-form", { state: { tournament } });
  };

  const logos = tournament?.logos || [];
  const logoLeft = logos[0] || null;
  const logoRight = logos.length > 1 ? logos[1] : logos[0] || null;

  const currentYear = new Date().getFullYear();
  const ageCriteria = getAgeCriteria(currentYear);

  const selectedAgeCategories = useMemo(() => {
    if (!tournament?.ageCategories) return { wt: [], sgfi: [] };
    const wtCategories = ["Senior", "Junior", "Cadet", "Sub-Junior"];
    const sgfiCategories = ["Under - 19", "Under - 17", "Under - 14"];
    const wtSelected = [];
    const sgfiSelected = [];

    const allCategories = [
      ...(tournament.ageCategories.open || []),
      ...(tournament.ageCategories.official || []),
    ];

    allCategories.forEach((category) => {
      if (wtCategories.includes(category)) wtSelected.push(category);
      if (sgfiCategories.includes(category)) sgfiSelected.push(category);
    });

    return {
      wt: [...new Set(wtSelected)],
      sgfi: [...new Set(sgfiSelected)],
    };
  }, [tournament]);

  if (loading) return <div className={styles.container}>Loading...</div>;
  if (error)
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  if (!tournament)
    return (
      <div className={styles.container}>
        <div className={styles.error}>Tournament not found</div>
      </div>
    );

  // ===== Custom weights compatibility helpers =====
  const getCustomGenderRows = (ageGroup, gender) => {
    const custom = tournament?.weightCategories?.custom || {};
    const ageVal = custom?.[ageGroup];

    // legacy: array
    if (Array.isArray(ageVal)) return ageVal;

    // new: object { Male: [...], Female: [...] }
    if (ageVal && typeof ageVal === "object") {
      const g = ageVal?.[gender];
      if (Array.isArray(g)) return g;
    }

    return [];
  };

  return (
    <div className={styles.container}>
      <ErrorBoundary section="Poster Section">
        <div className={styles.posterSection}>
          {tournament.poster && !posterFailed ? (
            <img
              src={getFullImageUrl(tournament.poster)}
              alt="Tournament Poster"
              className={styles.posterImage}
              onError={() => setPosterFailed(true)}
            />
          ) : (
            <p className={styles.error}>Poster not available</p>
          )}
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Header Container">
        <div className={styles.headerContainer}>
          {/* Left Logo */}
          <div className={styles.logoWrapper}>
            {logoLeft && !leftLogoFailed ? (
              <img
                src={getFullImageUrl(logoLeft)}
                alt="Logo Left"
                className={styles.headerLogo}
                onError={(e) => {
                  setLeftLogoFailed(true);
                  if (e?.target) e.target.style.display = "none";
                }}
              />
            ) : null}
            <p
              className={styles.logoNotAvailable}
              style={{
                display: logoLeft && !leftLogoFailed ? "none" : "block",
              }}
            >
              Logo Not Available
            </p>
          </div>

          {/* Center - Name + Edit Button */}
          <div className={styles.nameupdate}>
            {showEditButton && (
              <button className={styles.editButton} onClick={handleEdit}>
                Update Tournament
              </button>
            )}
            <h1 className={styles.headerRow}>{tournament.tournamentName}</h1>
          </div>

          {/* Right Logo */}
          <div className={styles.logoWrapper}>
            {logoRight && !rightLogoFailed ? (
              <img
                src={getFullImageUrl(logoRight)}
                alt="Logo Right"
                className={styles.headerLogo}
                onError={(e) => {
                  setRightLogoFailed(true);
                  if (e?.target) e.target.style.display = "none";
                }}
              />
            ) : null}
            <p
              className={styles.logoNotAvailable}
              style={{
                display: logoRight && !rightLogoFailed ? "none" : "block",
              }}
            >
              Logo Not Available
            </p>
          </div>
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Basic Information">
        <div className={styles.section}>
          <h2>Basic Information</h2>
          <div className={styles.detailsGrid}>
            <div className={styles.infoPart}>
              <div className={styles.detailRow}>
                <p className={styles.leftItem}>
                  <strong>Federation:</strong> {tournament.federation || "N/A"}
                </p>
                <p className={styles.rightItem}>
                  <strong>Organized by:</strong> {tournament.organizer || "N/A"}
                </p>
              </div>
              <div className={styles.detailRow}>
                <p className={styles.leftItem}>
                  <strong>Email:</strong> {tournament.email || "N/A"}
                </p>
                <p className={styles.rightItem}>
                  <strong>Contact:</strong> {tournament.contact || "N/A"}
                </p>
              </div>
            </div>
            <div className={styles.infoPart}>
              <p className={styles.dateRow}>
                <strong>Date:</strong>{" "}
                {formatDate(tournament.dateFrom, tournament.dateTo)}
              </p>
            </div>
            <div className={styles.infoPart}>
              <p>
                <strong>Venue:</strong> {tournament.venue?.name || "N/A"}
              </p>
            </div>
            <div className={styles.infoPart}>
              <p className={styles.locationRow}>
                <strong>Location:</strong>{" "}
                {tournament.venue ? (
                  (() => {
                    const countryObj = Country.getAllCountries().find(
                      (c) => c.isoCode === tournament.venue.country
                    );
                    const stateObj = countryObj
                      ? State.getStatesOfCountry(tournament.venue.country).find(
                          (s) => s.isoCode === tournament.venue.state
                        )
                      : null;
                    return (
                      <>
                        {tournament.venue.district},{" "}
                        {stateObj ? stateObj.name : tournament.venue.state},{" "}
                        {countryObj ? countryObj.name : tournament.venue.country}{" "}
                        {countryObj && (
                          <ReactCountryFlag
                            countryCode={tournament.venue.country}
                            svg
                            style={{
                              marginLeft: "0.5em",
                              width: "1.5em",
                              height: "1.5em",
                            }}
                            title={countryObj.name}
                          />
                        )}
                      </>
                    );
                  })()
                ) : (
                  "N/A"
                )}
              </p>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Age Categories & Genders">
        <div className={styles.section}>
          <h2>Tournament Level | Type | Age & Gender Categories</h2>
          <p>
            <strong>Level:</strong> {tournament.tournamentLevel || "N/A"}
          </p>
          <p>
            <strong>Type:</strong>{" "}
            {tournament.tournamentType?.join(", ") || "N/A"}
          </p>

          {["open", "official"].map((type) => {
            const ages = tournament.ageCategories?.[type] || [];
            if (ages.length === 0) return null;

            return (
              <div key={type}>
                <h3>{type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                <ul>
                  {ages.map((age) => {
                    const criteria =
                      ageCriteria.WT[age] || ageCriteria.SGFI[age] || {};
                    return (
                      <li key={age}>
                        <strong>
                          {age} ({criteria.description || "N/A"})
                        </strong>
                        <br />
                        {criteria.criteria || "N/A"}
                        <br />
                        {criteria.example || "N/A"}
                        <br />
                        Gender:{" "}
                        {tournament.ageGender?.[type]?.[age]?.join(", ") ||
                          "Male, Female"}
                      </li>
                    );
                  })}
                </ul>
                {type === "official" && tournament.playerLimit != null && (
                  <p>
                    <strong>Max Players per Team (Weight Category):</strong>{" "}
                    {tournament.playerLimit}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Event Categories & Entry Fees">
        <div className={styles.section}>
          <h2>Event Categories & Entry Fees</h2>
          <p>
            <strong>Currency:</strong> {tournament.entryFees?.currency || "N/A"} (
            {tournament.entryFees?.currencySymbol || "N/A"})
          </p>
          {tournament.eventCategories?.kyorugi?.selected && (
            <div>
              <h3>Kyorugi</h3>
              <ul>
                {Object.entries(tournament.eventCategories.kyorugi.sub || {}).map(
                  ([sub, enabled]) =>
                    enabled && (
                      <li key={sub}>
                        {sub}:{" "}
                        {tournament.entryFees?.amounts?.kyorugi?.[sub]?.type ===
                        "Free"
                          ? "Free"
                          : `${tournament.entryFees?.currencySymbol || ""}${
                              tournament.entryFees?.amounts?.kyorugi?.[sub]
                                ?.amount || 0
                            }`}
                      </li>
                    )
                )}
              </ul>
            </div>
          )}
          {tournament.eventCategories?.poomsae?.selected && (
            <div>
              <h3>Poomsae</h3>
              <ul>
                {Array.isArray(tournament.eventCategories.poomsae.categories) &&
                  tournament.eventCategories.poomsae.categories.map((sub) => (
                    <li key={sub}>
                      {sub}:{" "}
                      {tournament.entryFees?.amounts?.poomsae?.[sub]?.type ===
                      "Free"
                        ? "Free"
                        : `${tournament.entryFees?.currencySymbol || ""}${
                            tournament.entryFees?.amounts?.poomsae?.[sub]
                              ?.amount || 0
                          }`}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {!tournament.eventCategories && <p>No event categories specified</p>}
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Weight Categories">
        <div className={styles.section}>
          <h2>Weight Categories</h2>
          {tournament.weightCategories ? (
            <>
              <p>
                <strong>Type:</strong>{" "}
                {tournament.weightCategories.type === "custom"
                  ? "Custom Weight Categories"
                  : tournament.weightCategories.type === "WT"
                  ? "WT Standard Weights"
                  : "SGFI Standard Weights"}
              </p>

              {(() => {
                const allSelectedAges = [
                  ...(tournament.ageCategories?.open || []),
                  ...(tournament.ageCategories?.official || []),
                ];

                if (allSelectedAges.length === 0) {
                  return <p>No age categories selected</p>;
                }

                const ageOrder = [
                  "Sub-Junior",
                  "Cadet",
                  "Junior",
                  "Senior",
                  "Under - 14",
                  "Under - 17",
                  "Under - 19",
                ];

                const sortedAges = [...new Set(allSelectedAges)].sort(
                  (a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b)
                );

                return sortedAges.map((ageGroup) => {
                  let maleRows = [];
                  let femaleRows = [];

                  if (tournament.weightCategories.type === "custom") {
                    // NEW: gender-wise custom, but still support legacy array
                    maleRows = getCustomGenderRows(ageGroup, "Male");
                    femaleRows = getCustomGenderRows(ageGroup, "Female");
                  } else {
                    const standard = tournament.weightCategories.type;
                    let maleWeights = [];
                    let femaleWeights = [];

                    if (standard === "WT") {
                      if (ageGroup === "Cadet") {
                        const cadetData =
                          tournament.cadetCategoryType === "height"
                            ? WT_WEIGHTS.Cadet.height
                            : WT_WEIGHTS.Cadet.weight;
                        maleWeights = cadetData.Male || [];
                        femaleWeights = cadetData.Female || [];
                      } else {
                        maleWeights = WT_WEIGHTS[ageGroup]?.Male || [];
                        femaleWeights = WT_WEIGHTS[ageGroup]?.Female || [];
                      }
                    } else if (standard === "SGFI") {
                      maleWeights = SGFI_WEIGHTS[ageGroup]?.Male || [];
                      femaleWeights = SGFI_WEIGHTS[ageGroup]?.Female || [];
                    }

                    const parseWeight = (str) => {
                      const parts = String(str).split(" (");
                      return {
                        category: parts[0].trim(),
                        description: parts[1]
                          ? parts[1].replace(")", "").trim()
                          : "",
                      };
                    };

                    maleRows = maleWeights.map(parseWeight);
                    femaleRows = femaleWeights.map(parseWeight);
                  }

                  if (maleRows.length === 0 && femaleRows.length === 0) return null;

                  return (
                    <div key={ageGroup} className={styles.ageGroupSection}>
                      <h3 className={styles.ageGroupTitle}>
                        {ageGroup}{" "}
                        {tournament.weightCategories.type === "custom"
                          ? "(Custom)"
                          : tournament.weightCategories.type === "WT"
                          ? "(WT Standard)"
                          : "(SGFI Standard)"}
                      </h3>

                      <div className={styles.genderSections}>
                        <div className={styles.genderColumn}>
                          <h4 style={{ color: "#cf0006" }}>Male</h4>
                          {maleRows.length > 0 ? (
                            <ul className={styles.weightList}>
                              {maleRows.map((row, index) => (
                                <li key={`male-${index}`}>
                                  <strong>{row.category}</strong>
                                  {row.description && (
                                    <span style={{ color: "#666", fontSize: "0.9em" }}>
                                      {" "}
                                      {row.description}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={styles.noData}>No weights defined</p>
                          )}
                        </div>

                        <div className={styles.genderColumn}>
                          <h4 style={{ color: "#cf0006" }}>Female</h4>
                          {femaleRows.length > 0 ? (
                            <ul className={styles.weightList}>
                              {femaleRows.map((row, index) => (
                                <li key={`female-${index}`}>
                                  <strong>{row.category}</strong>
                                  {row.description && (
                                    <span style={{ color: "#666", fontSize: "0.9em" }}>
                                      {" "}
                                      {row.description}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={styles.noData}>No weights defined</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </>
          ) : (
            <p>Weight categories not specified</p>
          )}
        </div>
      </ErrorBoundary>

      

    <ErrorBoundary section="Food & Lodging">
  <div className={styles.section}>
    <h2>Food & Lodging</h2>
    <div className={styles.foodsection}>
      <p>
        <strong>Provided:</strong>{" "}
        {tournament.foodAndLodging?.option &&
        tournament.foodAndLodging.option !== "No"
          ? "Yes"
          : "No"}
      </p>

      {tournament.foodAndLodging?.option &&
      tournament.foodAndLodging.option !== "No" ? (
        <>
          <p>
            <strong>Fooding & Lodging:</strong>{" "}
            {tournament.foodAndLodging.option || "N/A"}
          </p>
          <p>
            <strong>Cost:</strong>{" "}
            {tournament.foodAndLodging.type === "Paid" &&
            tournament.foodAndLodging.amount !== undefined
              ? `Paid (${tournament.entryFees?.currencySymbol || "₹"}${
                  tournament.foodAndLodging.amount || 0
                }${
                  tournament.foodAndLodging.paymentMethod
                    ? ` ${tournament.foodAndLodging.paymentMethod}`
                    : ""
                })`
              : "Free"}
          </p>
        </>
      ) : (
        <p>
          <strong>Fooding & Lodging:</strong> Not Provided
        </p>
      )}
    </div>
  </div>
</ErrorBoundary>

      <ErrorBoundary section="Medal Points">
        <div className={styles.section}>
          <h2>Medal Points for Team Championship</h2>
          <div className={styles.pointSystem}>
            <p>
              <strong>Gold:</strong> {tournament.medalPoints?.gold || 0}
            </p>
            <p>
              <strong>Silver:</strong> {tournament.medalPoints?.silver || 0}
            </p>
            <p>
              <strong>Bronze:</strong> {tournament.medalPoints?.bronze || 0}
            </p>
          </div>
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Match Schedule">
        <div className={styles.section}>
          <h2>Match Schedule</h2>
          <p>{tournament.matchSchedule || "Not specified"}</p>
        </div>
      </ErrorBoundary>

      <ErrorBoundary section="Description">
        <div className={styles.section}>
          <h2>Description</h2>
          <p>{tournament.description || "No description provided."}</p>
        </div>
      </ErrorBoundary>
    </div>
  );
};

export default TournamentDetails;