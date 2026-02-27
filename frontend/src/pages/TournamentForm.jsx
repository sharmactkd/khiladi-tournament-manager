// src/pages/TournamentForm.jsx

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createTournament, updateTournament } from "../api";
import { Country, State, City } from "country-state-city";

// Formik
import { Formik, Form, ErrorMessage } from "formik";
import validationSchema from "../components/TournamentForm/validationSchema";

// Components
import BasicInfo from "../components/TournamentForm/BasicInfo";
import TournamentLevel from "../components/TournamentForm/TournamentLevel";
import AgeCategories from "../components/TournamentForm/AgeCategories";
import EventCategories from "../components/TournamentForm/EventCategories";
import Weights from "../components/TournamentForm/WeightCategories";
import FoodLodging from "../components/TournamentForm/FoodLodging";
import MedalPoints from "../components/TournamentForm/MedalPoints";
import MatchSchedule from "../components/TournamentForm/MatchSchedule";
import TournamentDescription from "../components/TournamentForm/TournamentDescription";
import Upload from "../components/TournamentForm/Upload";
import Submit from "../components/TournamentForm/Submit";

// Constants
import { MAIN_AGE_CATEGORIES } from "../components/TournamentForm/constants";

import styles from "./TournamentForm.module.css";

const getInitialValues = (initialTournament) => ({
  organizer: initialTournament?.organizer || "",
  federation: initialTournament?.federation || "",
  tournamentName: initialTournament?.tournamentName || "",
  dateFrom: initialTournament?.dateFrom ? new Date(initialTournament.dateFrom) : null,
  dateTo: initialTournament?.dateTo ? new Date(initialTournament.dateTo) : null,
  email: initialTournament?.email || "",
  contact: initialTournament?.contact || "",
  venue: {
    name: initialTournament?.venue?.name || "",
    country: initialTournament?.venue?.country || "",
    state: initialTournament?.venue?.state || "",
    district: initialTournament?.venue?.district || "",
  },
  visibility: initialTournament?.visibility ?? true,
  tournamentLevel: initialTournament?.tournamentLevel || "Inter School",
  playerLimit: initialTournament?.playerLimit || null,
  ageCategories: {
    open: initialTournament?.ageCategories?.open || [],
    official: initialTournament?.ageCategories?.official || [],
  },
  ageGender: {
    open: initialTournament?.ageGender?.open || {},
    official: initialTournament?.ageGender?.official || {},
  },
  eventCategories: {
    kyorugi: {
      selected: initialTournament?.eventCategories?.kyorugi?.selected || false,
      sub: initialTournament?.eventCategories?.kyorugi?.sub || {
        Kyorugi: false,
        Fresher: false,
        TagTeam: false,
      },
    },
    poomsae: {
      selected: initialTournament?.eventCategories?.poomsae?.selected || false,
      categories: initialTournament?.eventCategories?.poomsae?.categories || [],
    },
  },
  entryFees: {
    currency: initialTournament?.entryFees?.currency || "INR",
    currencySymbol: initialTournament?.entryFees?.currencySymbol || "₹",
    amounts: {
      kyorugi: initialTournament?.entryFees?.amounts?.kyorugi || {},
      poomsae: initialTournament?.entryFees?.amounts?.poomsae || {},
    },
  },
  weightCategories: {
    type: initialTournament?.weightCategories?.type || "WT",
    custom: initialTournament?.weightCategories?.custom || "",
    selected: initialTournament?.weightCategories?.selected || { male: [], female: [] },
  },
  cadetCategoryType: initialTournament?.cadetCategoryType || "weight",
  foodAndLodging: {
    option: initialTournament?.foodAndLodging?.option || "No",
    type: initialTournament?.foodAndLodging?.type || "Free",
    paymentMethod: initialTournament?.foodAndLodging?.paymentMethod || "",
    amount: initialTournament?.foodAndLodging?.amount || "",
  },
  medalPoints: initialTournament?.medalPoints || { gold: 12, silver: 7, bronze: 5 },
  description: initialTournament?.description || "",
  matchSchedule: initialTournament?.matchSchedule || "",
  poster: initialTournament?.poster || null,
  logos: initialTournament?.logos || [null, null],
  tournamentType: [],
});

const TournamentForm = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialTournament = location.state?.tournament || null;

  const startDatePickerRef = useRef(null);
  const endDatePickerRef = useRef(null);

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [serverError, setServerError] = useState("");
const [presetName, setPresetName] = useState("");

  useEffect(() => {
    if (!token || !user) {
      navigate("/login");
    }
  }, [token, user, navigate]);

  useEffect(() => {
    const allCountries = Country.getAllCountries();
    setCountries(allCountries);
  }, []);

  useEffect(() => {
    fetch("https://openexchangerates.org/api/currencies.json")
      .then((res) => res.json())
      .then((data) => {
        const opts = Object.entries(data)
          .map(([code, name]) => {
            const parts = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: code,
              minimumFractionDigits: 0,
            }).formatToParts(0);
            const symbol = parts.find((part) => part.type === "currency")?.value || code;
            return { value: code, label: `${code} (${symbol}) – ${name}`, symbol };
          })
          .sort((a, b) => a.value.localeCompare(b.value));
        setCurrencyOptions(opts);
      })
      .catch(() => setCurrencyOptions([]));
  }, []);

 const scrollToFirstError = (errors) => {
  if (Object.keys(errors).length === 0) return;

  // Find the first error key
  const firstErrorKey = Object.keys(errors)[0];

  // Handle nested fields like venue.country
  let selector;
  if (firstErrorKey.includes('.')) {
    selector = `[name="${firstErrorKey.replace('.', '\\.')}"]`;
  } else {
    selector = `[name="${firstErrorKey}"]`;
  }

  // Special handling for venue dropdowns (React Select)
  if (firstErrorKey.startsWith('venue.')) {
    const fieldMap = {
      'venue.country': 'country',
      'venue.state': 'state',
      'venue.district': 'district',
    };
    const className = fieldMap[firstErrorKey];
    if (className) {
      const element = document.querySelector(`.react-select__${className} .react-select__control`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus();
        element.style.borderColor = '#cf0006';
        element.style.boxShadow = '0 0 0 3px rgba(207, 0, 6, 0.2)';
        return;
      }
    }
  }

  // For regular inputs (text, textarea, etc.)
  const element = document.querySelector(selector);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus();
    element.style.borderColor = '#cf0006';
    element.style.boxShadow = '0 0 0 3px rgba(207, 0, 6, 0.2)';

    // Optional: Highlight removal after 3 seconds
    setTimeout(() => {
      element.style.borderColor = '#ccc';
      element.style.boxShadow = 'none';
    }, 3000);
  } else {
    // Fallback: If not found, scroll to top error message
    const errorContainer = document.querySelector(`.${styles.generalError}`);
    if (errorContainer) {
      errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
};

  // Preset functions
  const savePreset = (name, customData) => {
    if (!name.trim()) return;
    localStorage.setItem(`customPreset_${name}`, JSON.stringify(customData));
  };

  const loadPreset = (name) => {
    const data = localStorage.getItem(`customPreset_${name}`);
    return data ? JSON.parse(data) : {};
  };

  const getPresetNames = () => {
    return Object.keys(localStorage)
      .filter(key => key.startsWith('customPreset_'))
      .map(key => key.replace('customPreset_', ''));
  };

  return (
    <div className={styles.container}>
      <Formik
        initialValues={getInitialValues(initialTournament)}
        validationSchema={validationSchema}
        validateOnChange={false}
        validateOnBlur={false}
        onSubmit={async (values, { setSubmitting }) => {
          setServerError("");
          setSubmitting(true);

          try {
            const data = new FormData();

            const cleanedValues = {
              ...values,
              description: values.description || "No description provided",
              matchSchedule: values.matchSchedule || "Schedule to be announced",
              playerLimit: values.playerLimit ? Number(values.playerLimit) : undefined,
            };

            data.append("organizer", cleanedValues.organizer);
            data.append("federation", cleanedValues.federation);
            data.append("tournamentName", cleanedValues.tournamentName);
            data.append("dateFrom", cleanedValues.dateFrom.toISOString());
            data.append("dateTo", cleanedValues.dateTo.toISOString());
            data.append("email", cleanedValues.email);
            data.append("contact", cleanedValues.contact);
            data.append("visibility", cleanedValues.visibility);
            data.append("tournamentLevel", cleanedValues.tournamentLevel);
            if (cleanedValues.playerLimit) data.append("playerLimit", cleanedValues.playerLimit);
            data.append("description", cleanedValues.description);
            data.append("matchSchedule", cleanedValues.matchSchedule);
            data.append("tournamentType", cleanedValues.tournamentType.join(","));

            data.append("venue", JSON.stringify(cleanedValues.venue));
            data.append("ageCategories", JSON.stringify(cleanedValues.ageCategories));
            data.append("ageGender", JSON.stringify(cleanedValues.ageGender));
            data.append("eventCategories", JSON.stringify(cleanedValues.eventCategories));
            data.append("entryFees", JSON.stringify(cleanedValues.entryFees));
            data.append("weightCategories", JSON.stringify(cleanedValues.weightCategories));
            data.append("cadetCategoryType", cleanedValues.cadetCategoryType);
            data.append("foodAndLodging", JSON.stringify(cleanedValues.foodAndLodging));
            data.append("medalPoints", JSON.stringify(cleanedValues.medalPoints));

            if (values.poster && values.poster instanceof File) {
              data.append("poster", values.poster);
            }
            values.logos.forEach((logo) => {
              if (logo && logo instanceof File) {
                data.append("logos", logo);
              }
            });

            let response;
            if (initialTournament) {
              response = await updateTournament(initialTournament._id, data);
            } else {
              response = await createTournament(data);
            }

            navigate(`/tournaments/${initialTournament?._id || response._id}`);
          } catch (err) {
            console.error("Submit error:", err);
            if (err.response?.status === 401) {
              logout();
              navigate("/login");
            } else {
              setServerError(err.message || "Failed to save tournament. Please try again.");
            }
          } finally {
            setSubmitting(false);
          }
        }}
      >
       {({ values, setFieldValue, errors, touched, isSubmitting, handleSubmit, validateForm, setTouched }) => {
          useEffect(() => {
            if (isSubmitting && Object.keys(errors).length > 0) {
              scrollToFirstError(errors);
            }
          }, [isSubmitting, errors]);

         const onFormSubmit = async (e) => {
  e.preventDefault();
  const validationErrors = await validateForm();
  setTouched(true);

  if (Object.keys(validationErrors).length > 0) {
    scrollToFirstError(validationErrors); // ← यह call already है – good!
  } else {
    handleSubmit(e);
  }
};
          
          // Country/State handlers
          const handleCountryChange = (countryCode) => {
            const stateList = State.getStatesOfCountry(countryCode);
            setStates(stateList);
            setCities([]);
            setFieldValue("venue.country", countryCode);
            setFieldValue("venue.state", "");
            setFieldValue("venue.district", "");
          };

          const handleStateChange = (stateCode) => {
            const cityList = City.getCitiesOfState(values.venue.country, stateCode);
            setCities(cityList);
            setFieldValue("venue.state", stateCode);
            setFieldValue("venue.district", "");
          };

          // Age handlers
          const handleAgeChange = (e, age, type) => {
            e.preventDefault();
            const isSelected = values.ageCategories[type].includes(age);
            const newAges = isSelected
              ? values.ageCategories[type].filter((a) => a !== age)
              : [...values.ageCategories[type], age];

            const newGender = { ...values.ageGender[type] };
            if (isSelected) {
              delete newGender[age];
            } else {
              newGender[age] = ["Male", "Female"];
            }

            setFieldValue(`ageCategories.${type}`, newAges);
            setFieldValue(`ageGender.${type}`, newGender);
          };

          const handleAgeGenderChange = (e, age, gender, type) => {
            e.preventDefault();
            const current = values.ageGender[type][age] || [];
            const newGenders = current.includes(gender)
              ? current.filter((g) => g !== gender)
              : [...current, gender];

            setFieldValue(`ageGender.${type}.${age}`, newGenders);
          };

          const handleSelectAllAges = (type) => {
            const allSelected = MAIN_AGE_CATEGORIES.every((age) =>
              values.ageCategories[type].includes(age)
            );

            const newAges = allSelected
              ? values.ageCategories[type].filter((a) => !MAIN_AGE_CATEGORIES.includes(a))
              : [...new Set([...values.ageCategories[type], ...MAIN_AGE_CATEGORIES])];

            const newGender = { ...values.ageGender[type] };
            MAIN_AGE_CATEGORIES.forEach((age) => {
              if (newAges.includes(age)) {
                newGender[age] = ["Male", "Female"];
              } else {
                delete newGender[age];
              }
            });

            setFieldValue(`ageCategories.${type}`, newAges);
            setFieldValue(`ageGender.${type}`, newGender);
          };

          // Event handlers
          const handleKyorugiSubEventToggle = (subKey) => {
            const currentSub = values.eventCategories.kyorugi.sub;
            const newSubValue = !currentSub[subKey];

            setFieldValue(`eventCategories.kyorugi.sub.${subKey}`, newSubValue);

            const anySubSelected = Object.values({
              ...currentSub,
              [subKey]: newSubValue,
            }).some((v) => v);
            setFieldValue("eventCategories.kyorugi.selected", anySubSelected);

            if (newSubValue) {
              setFieldValue(`entryFees.amounts.kyorugi.${subKey}`, { type: "Free", amount: undefined });
            } else {
              setFieldValue(`entryFees.amounts.kyorugi.${subKey}`, undefined);
            }
          };

          const handlePoomsaeCategoryToggle = (category) => {
            const currentCategories = values.eventCategories.poomsae.categories;
            const isSelected = currentCategories.includes(category);
            const newCategories = isSelected
              ? currentCategories.filter((c) => c !== category)
              : [...currentCategories, category];

            setFieldValue("eventCategories.poomsae.categories", newCategories);
            setFieldValue("eventCategories.poomsae.selected", newCategories.length > 0);

            if (!isSelected) {
              setFieldValue(`entryFees.amounts.poomsae.${category}`, { type: "Free", amount: undefined });
            } else {
              setFieldValue(`entryFees.amounts.poomsae.${category}`, undefined);
            }
          };

          const handleFeeTypeChange = (category, sub, type) => {
            setFieldValue(`entryFees.amounts.${category}.${sub}.type`, type);
            if (type === "Free") {
              setFieldValue(`entryFees.amounts.${category}.${sub}.amount`, undefined);
            } else {
              setFieldValue(`entryFees.amounts.${category}.${sub}.amount`, 0);
            }
          };

          const handleAmountChange = (category, sub, value) => {
            setFieldValue(`entryFees.amounts.${category}.${sub}.amount`, value ? Number(value) : 0);
          };

          // Auto-update Tournament Type (Open/Official)
         useEffect(() => {
            const hasOpen = values.ageCategories.open.length > 0;
            const hasOfficial = values.ageCategories.official.length > 0;

            const newType = [];
            if (hasOpen) newType.push("Open");
            if (hasOfficial) newType.push("Official");
            if (newType.length === 0) newType.push("Open");

            if (JSON.stringify(values.tournamentType || []) !== JSON.stringify(newType)) {
              setFieldValue("tournamentType", newType);
            }
          }, [values.ageCategories.open, values.ageCategories.official, setFieldValue]);

          // Venue pre-fill
          useEffect(() => {
            if (!initialTournament?.venue || countries.length === 0) return;

            const countryCode = initialTournament.venue.country;
            if (countryCode) {
              const stateList = State.getStatesOfCountry(countryCode);
              setStates(stateList);
              setFieldValue("venue.country", countryCode);

              const stateCode = initialTournament.venue.state;
              if (stateCode) {
                const cityList = City.getCitiesOfState(countryCode, stateCode);
                setCities(cityList);
                setFieldValue("venue.state", stateCode);
                setFieldValue("venue.district", initialTournament.venue.district || "");
              }
            }
          }, [countries.length, initialTournament?.venue]);

useEffect(() => {
            const selectedAges = [
              ...(values.ageCategories?.open || []),
              ...(values.ageCategories?.official || []),
            ];

            const wtAges = ["Sub-Junior", "Cadet", "Junior", "Senior"];
            const sgfiAges = ["Under - 14", "Under - 17", "Under - 19"];

            const currentType = values.weightCategories?.type;

            let suggestedType = "WT";

            if (selectedAges.length > 0) {
              const hasOnlySGFI = selectedAges.every(age => sgfiAges.includes(age));
              const hasOnlyWT = selectedAges.every(age => wtAges.includes(age));

              if (hasOnlySGFI) suggestedType = "SGFI";
              else if (hasOnlyWT) suggestedType = "WT";
            }

            if (currentType !== suggestedType && currentType !== "custom") {
              setFieldValue("weightCategories.type", suggestedType);
              setFieldValue("weightCategories.selected", { male: [], female: [] });
              setFieldValue("weightCategories.custom", {});
            }
          }, [
            values.ageCategories?.open,
            values.ageCategories?.official,
            values.weightCategories?.type,
            setFieldValue
          ]);

          return (
            <Form className={styles.form} onSubmit={onFormSubmit}>
              <div className={styles.headerRow}>
                <h1>{initialTournament ? "Edit Tournament" : "Create New Tournament"}</h1>
                <label className={styles.visibilityToggle}>
                  <input
                    type="checkbox"
                    checked={values.visibility}
                    onChange={(e) => setFieldValue("visibility", e.target.checked)}
                  />
                  <span className={styles.slider}></span>
                  <span className={styles.visibilityText}>
                    {values.visibility ? "Public" : "Private"}
                  </span>
                </label>
              </div>

              {serverError && <div className={styles.error}>{serverError}</div>}

           {Object.keys(errors).length > 0 && (
                <div className={styles.generalError}>
                  <strong>Please fix the following errors:</strong>
                  <ul style={{ margin: '8px 0 0 20px', color: '#cf0006' }}>
                    {Object.keys(errors).map((key) => {
                      const errorMsg = errors[key];
                      // Fixed: Convert object to string
                      const displayMsg = typeof errorMsg === 'object'
                        ? JSON.stringify(errorMsg, null, 2)  // Pretty print
                        : errorMsg;

                      return (
                        <li key={key}>
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: {displayMsg}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <BasicInfo
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
                startDatePickerRef={startDatePickerRef}
                endDatePickerRef={endDatePickerRef}
                countries={countries}
                states={states}
                cities={cities}
                handleCountryChange={handleCountryChange}
                handleStateChange={handleStateChange}
              />

              <TournamentLevel values={values} setFieldValue={setFieldValue} />

              <AgeCategories
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
                handleAgeChange={handleAgeChange}
                handleAgeGenderChange={handleAgeGenderChange}
                handleSelectAllAges={handleSelectAllAges}
              />

              <EventCategories
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
                currencyOptions={currencyOptions}
                handleKyorugiSubEventToggle={handleKyorugiSubEventToggle}
                handlePoomsaeCategoryToggle={handlePoomsaeCategoryToggle}
                handleFeeTypeChange={handleFeeTypeChange}
                handleAmountChange={handleAmountChange}
              />

{/* Weight Categories - Now fully handled by Weights component */}
              <div className={styles.section}>
                <h2>Weight Categories</h2>
                <Weights values={values} setFieldValue={setFieldValue} />
              </div>

              <FoodLodging values={values} setFieldValue={setFieldValue} errors={errors} touched={touched} />

              <MedalPoints values={values} setFieldValue={setFieldValue} errors={errors} touched={touched} />

              <MatchSchedule values={values} setFieldValue={setFieldValue} errors={errors} touched={touched} />

              <TournamentDescription values={values} setFieldValue={setFieldValue} errors={errors} touched={touched} />

              <Upload values={values} setFieldValue={setFieldValue} errors={errors} touched={touched} />

              <Submit initialTournament={initialTournament} isSubmitting={isSubmitting} />
            </Form>
          );
        }}
      </Formik>
    </div>
  );
};

export default TournamentForm;