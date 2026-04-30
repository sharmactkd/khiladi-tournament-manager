import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createTournament, updateTournament } from "../api";
import { Country, State, City } from "country-state-city";

import { Formik, Form } from "formik";
import validationSchema from "../components/TournamentForm/validationSchema";

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
    selected: initialTournament
      ? initialTournament?.eventCategories?.kyorugi?.selected
      : true, // ✅ default ON for new form

    sub: initialTournament?.eventCategories?.kyorugi?.sub || {
      Kyorugi: true,   // ✅ main sub-event ON
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
    custom: initialTournament?.weightCategories?.custom || {},
    selected: initialTournament?.weightCategories?.selected || { male: [], female: [] },
  },
  cadetCategoryType: initialTournament?.cadetCategoryType || "weight",
  foodAndLodging: {
    option: initialTournament?.foodAndLodging?.option || "No",
    type: initialTournament?.foodAndLodging?.type || "Free",
    paymentMethod: initialTournament?.foodAndLodging?.paymentMethod || "",
    amount: initialTournament?.foodAndLodging?.amount || "",
  },
  medalPoints: initialTournament?.medalPoints || { gold: 5, silver: 3, bronze: 1 },
  description: initialTournament?.description || "",
  matchSchedule: initialTournament?.matchSchedule || "",
  poster: initialTournament?.poster || null,
  logos: initialTournament?.logos || [null, null],
  tournamentType: [],
});

const flattenErrors = (errors, prefix = "") => {
  let result = {};

  Object.keys(errors || {}).forEach((key) => {
    const value = errors[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result = { ...result, ...flattenErrors(value, path) };
    } else {
      result[path] = value;
    }
  });

  return result;
};

const TournamentForm = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const initialTournament = location.state?.tournament || null;

  const [showErrors, setShowErrors] = useState(false);

  const startDatePickerRef = useRef(null);
  const endDatePickerRef = useRef(null);

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!token || !user) {
      navigate("/login");
    }
  }, [token, user, navigate]);

  useEffect(() => {
    setCountries(Country.getAllCountries());
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

            return {
              value: code,
              label: `${code} (${symbol}) – ${name}`,
              symbol,
            };
          })
          .sort((a, b) => a.value.localeCompare(b.value));

        setCurrencyOptions(opts);
      })
      .catch(() => setCurrencyOptions([]));
  }, []);

  const scrollToFirstError = (errors) => {
    const flatErrors = flattenErrors(errors);
    const firstErrorKey = Object.keys(flatErrors)[0];

    if (!firstErrorKey) return;

    setTimeout(() => {
      let element =
        document.querySelector(`[data-field="${firstErrorKey}"]`) ||
        document.querySelector(`[name="${firstErrorKey}"]`) ||
        document.querySelector(`[id="${firstErrorKey}"]`);

      if (!element) {
        const rootKey = firstErrorKey.split(".")[0];

        element =
          document.querySelector(`[data-field="${rootKey}"]`) ||
          document.querySelector(`[name="${rootKey}"]`) ||
          document.querySelector(`[id="${rootKey}"]`);
      }

      if (!element) {
        console.warn("Scroll target not found:", firstErrorKey);
        return;
      }

      const scrollContainer = document.querySelector(`.${styles.container}`);

      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const scrollTop =
          scrollContainer.scrollTop +
          elementRect.top -
          containerRect.top -
          scrollContainer.clientHeight / 2 +
          elementRect.height / 2;

        scrollContainer.scrollTo({
          top: Math.max(0, scrollTop),
          behavior: "smooth",
        });
      } else {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

     const isGroupError = ["ageCategories", "eventCategories"].includes(
  firstErrorKey.split(".")[0]
);

const highlightTarget = isGroupError
  ? element
  : element.querySelector(".react-select__control") ||
    element.querySelector("input") ||
    element;

      highlightTarget.classList.add(styles.errorHighlight);

      setTimeout(() => {
        highlightTarget.classList.remove(styles.errorHighlight);
      }, 3000);

      setTimeout(() => {
        highlightTarget.focus?.();
      }, 400);
    }, 150);
  };

  return (
    <div className={styles.container}>
      <Formik
        initialValues={getInitialValues(initialTournament)}
        validationSchema={validationSchema}
        validateOnChange={true}
        validateOnBlur={true}
        validateOnMount={false}
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

            if (cleanedValues.playerLimit) {
              data.append("playerLimit", cleanedValues.playerLimit);
            }

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
        {({
          values,
          setFieldValue,
          errors,
          touched,
          isSubmitting,
          handleSubmit,
          validateForm,
          setTouched,
        }) => {
          const onFormSubmit = async (e) => {
            e.preventDefault();

            setShowErrors(true);

            const validationErrors = await validateForm();

            setTouched({
              organizer: true,
              federation: true,
              tournamentName: true,
              email: true,
              contact: true,
              dateFrom: true,
              dateTo: true,
              venue: {
                name: true,
                country: true,
                state: true,
                district: true,
              },
              ageCategories: {
                open: true,
                official: true,
              },
              eventCategories: {
                kyorugi: {
                  selected: true,
                  sub: true,
                },
                poomsae: {
                  selected: true,
                  categories: true,
                },
              },
              weightCategories: true,
            });

            if (Object.keys(validationErrors).length > 0) {
              scrollToFirstError(validationErrors);
              return;
            }

            setShowErrors(false);
            handleSubmit(e);
          };

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
              setFieldValue(`entryFees.amounts.kyorugi.${subKey}`, {
                type: "Free",
                amount: undefined,
              });
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
              setFieldValue(`entryFees.amounts.poomsae.${category}`, {
                type: "Free",
                amount: undefined,
              });
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
            setFieldValue(
              `entryFees.amounts.${category}.${sub}.amount`,
              value ? Number(value) : 0
            );
          };

          const selectedAges = [
            ...(values.ageCategories?.open || []),
            ...(values.ageCategories?.official || []),
          ];

          const hasOpen = values.ageCategories.open.length > 0;
          const hasOfficial = values.ageCategories.official.length > 0;

          const newType = [];
          if (hasOpen) newType.push("Open");
          if (hasOfficial) newType.push("Official");
          if (newType.length === 0) newType.push("Open");

          if (JSON.stringify(values.tournamentType || []) !== JSON.stringify(newType)) {
            setTimeout(() => {
              setFieldValue("tournamentType", newType);
            }, 0);
          }

          const wtAges = ["Sub-Junior", "Cadet", "Junior", "Senior"];
          const sgfiAges = ["Under - 14", "Under - 17", "Under - 19"];

          if (selectedAges.length > 0 && values.weightCategories?.type !== "custom") {
            const hasOnlySGFI = selectedAges.every((age) => sgfiAges.includes(age));
            const hasOnlyWT = selectedAges.every((age) => wtAges.includes(age));

            let suggestedType = "WT";

            if (hasOnlySGFI) suggestedType = "SGFI";
            else if (hasOnlyWT) suggestedType = "WT";

            if (values.weightCategories?.type !== suggestedType) {
              setTimeout(() => {
                setFieldValue("weightCategories.type", suggestedType);
                setFieldValue("weightCategories.selected", { male: [], female: [] });
                setFieldValue("weightCategories.custom", {});
              }, 0);
            }
          }

          if (initialTournament?.venue && countries.length > 0) {
            const countryCode = initialTournament.venue.country;

            if (countryCode && states.length === 0) {
              setTimeout(() => {
                const stateList = State.getStatesOfCountry(countryCode);
                setStates(stateList);

                const stateCode = initialTournament.venue.state;

                if (stateCode && cities.length === 0) {
                  const cityList = City.getCitiesOfState(countryCode, stateCode);
                  setCities(cityList);
                }
              }, 0);
            }
          }

          const flatErrors = flattenErrors(errors);

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

              {showErrors && Object.keys(flatErrors).length > 0 && (
                <div className={styles.generalError}>
                  <strong>Please fix the following errors:</strong>

                  <ul style={{ margin: "8px 0 0 20px", color: "#cf0006" }}>
                    {Object.entries(flatErrors).map(([key, message]) => (
                      <li key={key}>
                        {key.replace(/\./g, " → ").replace(/([A-Z])/g, " $1")}: {message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div data-field="basicInfo">
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
              </div>

              <div data-field="tournamentLevel">
                <TournamentLevel values={values} setFieldValue={setFieldValue} />
              </div>

              <div data-field="ageCategories">
                <AgeCategories
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                  handleAgeChange={handleAgeChange}
                  handleAgeGenderChange={handleAgeGenderChange}
                  handleSelectAllAges={handleSelectAllAges}
                />
              </div>

              <div data-field="eventCategories">
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
              </div>

              <div className={styles.section} data-field="weightCategories">
                <h2>Weight Categories</h2>
                <Weights values={values} setFieldValue={setFieldValue} />
              </div>

              <div data-field="foodAndLodging">
                <FoodLodging
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                />
              </div>

              <div data-field="medalPoints">
                <MedalPoints
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                />
              </div>

              <div data-field="matchSchedule">
                <MatchSchedule
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                />
              </div>

              <div data-field="description">
                <TournamentDescription
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                />
              </div>

              <div data-field="upload">
                <Upload
                  values={values}
                  setFieldValue={setFieldValue}
                  errors={errors}
                  touched={touched}
                />
              </div>

              <Submit initialTournament={initialTournament} isSubmitting={isSubmitting} />
            </Form>
          );
        }}
      </Formik>
    </div>
  );
};

export default TournamentForm;