// src/components/TournamentForm/WeightCategories.jsx

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { WT_WEIGHTS, SGFI_WEIGHTS } from "./constants";
import styles from "../../pages/TournamentForm.module.css";

import api from "../../api.js"; // default export
import { getWeightPresets, saveWeightPreset } from "../../api.js";

const EMPTY_ROW = { min: "", max: "", category: "", description: "" };

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const normalizeAgeGenderCustom = (ageValue) => {
  // Accept legacy format: [rows]
  if (Array.isArray(ageValue)) {
    return {
      Male: Array.isArray(ageValue) && ageValue.length > 0 ? ageValue : [EMPTY_ROW],
      Female: Array.isArray(ageValue) && ageValue.length > 0 ? ageValue : [EMPTY_ROW],
    };
  }

  // New format: { Male: [...], Female: [...] }
  if (isPlainObject(ageValue)) {
    const male = Array.isArray(ageValue.Male) ? ageValue.Male : [];
    const female = Array.isArray(ageValue.Female) ? ageValue.Female : [];
    return {
      Male: male.length > 0 ? male : [EMPTY_ROW],
      Female: female.length > 0 ? female : [EMPTY_ROW],
    };
  }

  // Missing/invalid
  return { Male: [EMPTY_ROW], Female: [EMPTY_ROW] };
};

const Weights = ({ values, setFieldValue }) => {
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState([]);
  const [presetLoading, setPresetLoading] = useState(false);

  const selectedAges = useMemo(
    () => [
      ...(values.ageCategories?.open || []),
      ...(values.ageCategories?.official || []),
    ],
    [values.ageCategories?.open, values.ageCategories?.official]
  );

  const ageOrder = useMemo(
    () => [
      "Sub-Junior",
      "Cadet",
      "Junior",
      "Senior",
      "Under - 14",
      "Under - 17",
      "Under - 19",
    ],
    []
  );

  const getStandardForAge = useCallback((age) => {
    const wtAges = ["Sub-Junior", "Cadet", "Junior", "Senior"];
    const sgfiAges = ["Under - 14", "Under - 17", "Under - 19"];
    if (wtAges.includes(age)) return "WT";
    if (sgfiAges.includes(age)) return "SGFI";
    return null;
  }, []);

  const sortedSelectedAges = useMemo(() => {
    return selectedAges
      .filter((age) => getStandardForAge(age))
      .sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b));
  }, [selectedAges, getStandardForAge, ageOrder]);

  const showCadetToggle =
    sortedSelectedAges.includes("Cadet") && values.weightCategories?.type === "WT";

  // Refs for input focus
  const inputRefs = useRef({});

  // ===== Presets =====
  useEffect(() => {
    const fetchPresets = async () => {
      if (values.weightCategories?.type !== "custom") {
        setPresets([]);
        return;
      }

      setPresetLoading(true);
      try {
        const res = await getWeightPresets();

        let presetsArray = [];
        if (res?.data?.presets && Array.isArray(res.data.presets)) {
          presetsArray = res.data.presets;
        } else if (res?.presets && Array.isArray(res.presets)) {
          presetsArray = res.presets;
        } else if (Array.isArray(res?.data)) {
          presetsArray = res.data;
        } else if (Array.isArray(res)) {
          presetsArray = res;
        } else {
          console.warn("Unexpected presets response format:", res);
          presetsArray = [];
        }

        setPresets(
          presetsArray.map((p) => ({
            id: p._id || p.id,
            name: p.name,
            data: p.data || null,
          }))
        );
      } catch (err) {
        console.error("Failed to load presets:", err);
        setPresets([]);
      } finally {
        setPresetLoading(false);
      }
    };

    fetchPresets();
  }, [values.weightCategories?.type]);

  // ===== Ensure custom structure exists for selected ages (AGE + GENDER) =====
  useEffect(() => {
    if (values.weightCategories?.type !== "custom") return;

    const currentCustom = values.weightCategories?.custom || {};
    let changed = false;
    const nextCustom = { ...(currentCustom || {}) };

    selectedAges.forEach((age) => {
      const normalized = normalizeAgeGenderCustom(nextCustom[age]);
      const existing = nextCustom[age];

      // Decide if we need to replace
      const shouldReplace =
        Array.isArray(existing) ||
        !isPlainObject(existing) ||
        !Array.isArray(existing?.Male) ||
        !Array.isArray(existing?.Female) ||
        existing.Male.length === 0 ||
        existing.Female.length === 0;

      if (shouldReplace) {
        nextCustom[age] = normalized;
        changed = true;
      } else {
        // Ensure at least one row each
        if (existing.Male.length === 0) {
          nextCustom[age] = { ...existing, Male: [EMPTY_ROW] };
          changed = true;
        }
        if (existing.Female.length === 0) {
          nextCustom[age] = { ...(nextCustom[age] || existing), Female: [EMPTY_ROW] };
          changed = true;
        }
      }
    });

    // Optional cleanup: remove custom ages that are no longer selected (keep minimal behavior)
    // Not doing removal to avoid unexpected data loss.

    if (changed) {
      setFieldValue("weightCategories.custom", nextCustom);
    }
  }, [values.weightCategories?.type, selectedAges, values.weightCategories?.custom, setFieldValue]);

  // ===== Helpers for custom rows =====
  const getRows = useCallback(
    (age, gender) => {
      const ageVal = values.weightCategories?.custom?.[age];
      const normalized = normalizeAgeGenderCustom(ageVal);
      return gender === "Male" ? normalized.Male : normalized.Female;
    },
    [values.weightCategories?.custom]
  );

  const setRows = useCallback(
    (age, gender, rows) => {
      const currentCustom = values.weightCategories?.custom || {};
      const normalizedAge = normalizeAgeGenderCustom(currentCustom[age]);
      const nextAge = {
        ...normalizedAge,
        [gender]: rows && rows.length > 0 ? rows : [EMPTY_ROW],
      };
      setFieldValue(`weightCategories.custom.${age}`, nextAge);
    },
    [values.weightCategories?.custom, setFieldValue]
  );

  // Add new row and focus on Max field of new row
  const addRowAndFocus = useCallback(
    (age, gender) => {
      const rows = getRows(age, gender);

      const lastMax = rows.length > 0 ? rows[rows.length - 1].max : "";
      const lastMaxNum =
        lastMax !== "" && lastMax != null && !Number.isNaN(Number(lastMax))
          ? parseFloat(lastMax)
          : null;

      const suggestedMin =
        lastMaxNum != null ? (lastMaxNum + 0.1).toFixed(1) : "";

      const newRowIndex = rows.length;
      const newRows = [...rows, { min: suggestedMin, max: "", category: "", description: "" }];

      setRows(age, gender, newRows);

      setTimeout(() => {
        const maxKey = `${age}-${gender}-${newRowIndex}-max`;
        if (inputRefs.current[maxKey]) {
          inputRefs.current[maxKey].focus();
          inputRefs.current[maxKey].select();
        }
      }, 0);
    },
    [getRows, setRows]
  );

  const handleKeyDown = useCallback(
    (e, age, gender, rowIndex, field) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (field === "max") {
        addRowAndFocus(age, gender);
        return;
      }

      if (field === "min") {
        const maxKey = `${age}-${gender}-${rowIndex}-max`;
        if (inputRefs.current[maxKey]) {
          inputRefs.current[maxKey].focus();
          inputRefs.current[maxKey].select();
        }
      }
    },
    [addRowAndFocus]
  );

  const updateRow = useCallback(
    (age, gender, index, field, value) => {
      const rows = [...getRows(age, gender)];
      const next = { ...rows[index] };

      if (field === "min" || field === "max") {
        // Keep empty string as empty to allow open-ended max
        next[field] = value === "" ? "" : parseFloat(value);
      } else {
        next[field] = value;
      }

      rows[index] = next;
      setRows(age, gender, rows);
    },
    [getRows, setRows]
  );

  // ===== Auto-generate category & description for CUSTOM (supports open-ended max) =====
  useEffect(() => {
    if (values.weightCategories?.type !== "custom") return;

    const currentCustom = values.weightCategories?.custom || {};
    const nextCustom = { ...(currentCustom || {}) };
    let hasChanges = false;

    selectedAges.forEach((age) => {
      const normalizedAge = normalizeAgeGenderCustom(nextCustom[age]);

      ["Male", "Female"].forEach((gender) => {
        const rows = Array.isArray(normalizedAge[gender]) ? normalizedAge[gender] : [];
        if (rows.length === 0) return;

        const updatedRows = rows.map((row, idx) => {
          const min =
            row.min !== "" && row.min != null && !Number.isNaN(Number(row.min))
              ? parseFloat(row.min)
              : null;

          const max =
            row.max !== "" && row.max != null && !Number.isNaN(Number(row.max))
              ? parseFloat(row.max)
              : null;

          // Case 1: open-ended last category (max blank)
          if (min !== null && (row.max === "" || row.max == null)) {
            const category = `${min}+ KG`;
            const description = `(Over ${min}kg)`;

            if (row.category !== category || row.description !== description) {
              hasChanges = true;
              return { ...row, category, description };
            }
            return row;
          }

          // Case 2: invalid or incomplete
          if (min === null || max === null || min >= max) {
            if (row.category || row.description) {
              hasChanges = true;
              return { ...row, category: "", description: "" };
            }
            return row;
          }

          // Case 3: bounded category
          const category = `Under - ${max} KG`;
          let description = "";

          if (idx === 0) {
            if (min === 0) {
              description = `(Not exceeding ${max}kg)`;
            } else {
              const lowerBound = (min - 0.1).toFixed(1);
              description = `(Over ${lowerBound}kg & Not exceeding ${max}kg)`;
            }
          } else {
            const prevMaxRaw = rows[idx - 1]?.max;
            const prevMax =
              prevMaxRaw !== "" && prevMaxRaw != null && !Number.isNaN(Number(prevMaxRaw))
                ? parseFloat(prevMaxRaw)
                : null;
            description =
              prevMax != null
                ? `(Over ${prevMax}kg & Not exceeding ${max}kg)`
                : `(Not exceeding ${max}kg)`;
          }

          if (row.category !== category || row.description !== description) {
            hasChanges = true;
            return { ...row, category, description };
          }
          return row;
        });

        normalizedAge[gender] = updatedRows;
      });

      nextCustom[age] = normalizedAge;
    });

    if (hasChanges) {
      setFieldValue("weightCategories.custom", nextCustom);
    }
  }, [values.weightCategories?.type, values.weightCategories?.custom, selectedAges, setFieldValue]);

  // ===== Auto-save STANDARD weights (unchanged behavior) =====
  useEffect(() => {
    if (values.weightCategories?.type === "custom") return;

    let allMale = [];
    let allFemale = [];

    sortedSelectedAges.forEach((age) => {
      const standard = getStandardForAge(age);
      let maleWeights = [];
      let femaleWeights = [];

      if (standard === "WT") {
        if (age === "Cadet") {
          const cadetData =
            values.cadetCategoryType === "height"
              ? WT_WEIGHTS.Cadet.height
              : WT_WEIGHTS.Cadet.weight;
          maleWeights = cadetData.Male || [];
          femaleWeights = cadetData.Female || [];
        } else {
          maleWeights = WT_WEIGHTS[age]?.Male || [];
          femaleWeights = WT_WEIGHTS[age]?.Female || [];
        }
      } else if (standard === "SGFI") {
        maleWeights = SGFI_WEIGHTS[age]?.Male || [];
        femaleWeights = SGFI_WEIGHTS[age]?.Female || [];
      }

      const extractLabel = (str) => String(str).split(" (")[0].trim();
      allMale = [...allMale, ...maleWeights.map(extractLabel)];
      allFemale = [...allFemale, ...femaleWeights.map(extractLabel)];
    });

    const uniqueMale = [...new Set(allMale)];
    const uniqueFemale = [...new Set(allFemale)];

    const currentMale = values.weightCategories?.selected?.male || [];
    const currentFemale = values.weightCategories?.selected?.female || [];

    if (
      JSON.stringify([...uniqueMale].sort()) !== JSON.stringify([...currentMale].sort()) ||
      JSON.stringify([...uniqueFemale].sort()) !== JSON.stringify([...currentFemale].sort())
    ) {
      setFieldValue("weightCategories.selected.male", uniqueMale);
      setFieldValue("weightCategories.selected.female", uniqueFemale);
    }
  }, [
    sortedSelectedAges,
    values.cadetCategoryType,
    values.weightCategories?.type,
    values.weightCategories?.selected?.male,
    values.weightCategories?.selected?.female,
    getStandardForAge,
    setFieldValue,
  ]);

  if (selectedAges.length === 0 && values.weightCategories?.type !== "custom") {
    return (
      <p className={styles.infoText}>
        Select age categories above to view corresponding weight categories.
      </p>
    );
  }

  return (
    <>
      {/* Weight Type Dropdown */}
      <div className={styles.fieldWrapper}>
        <label htmlFor="weightTypeSelect"></label>
        <select
          id="weightTypeSelect"
          className={styles.select}
          value={values.weightCategories?.type || "WT"}
          onChange={(e) => {
            const newType = e.target.value;
            setFieldValue("weightCategories.type", newType);
            setFieldValue("weightCategories.selected", { male: [], female: [] });

            if (newType === "custom") {
              const currentCustom = values.weightCategories?.custom || {};
              const initCustom = { ...(currentCustom || {}) };

              selectedAges.forEach((age) => {
                initCustom[age] = normalizeAgeGenderCustom(initCustom[age]);
              });

              setFieldValue("weightCategories.custom", initCustom);
            } else {
              setFieldValue("weightCategories.custom", {});
            }
          }}
        >
          <option value="WT">WT Standard Weights</option>
          <option value="SGFI">SGFI Standard Weights</option>
          <option value="custom">Custom Weight Categories</option>
        </select>
      </div>

      {/* Standard Weights */}
      {values.weightCategories?.type !== "custom" && (
        <>
          {sortedSelectedAges.map((age) => {
            const standard = getStandardForAge(age);
            let maleWeights = [];
            let femaleWeights = [];

            if (standard === "WT") {
              if (age === "Cadet") {
                const cadetData =
                  values.cadetCategoryType === "height"
                    ? WT_WEIGHTS.Cadet.height
                    : WT_WEIGHTS.Cadet.weight;
                maleWeights = cadetData.Male || [];
                femaleWeights = cadetData.Female || [];
              } else {
                maleWeights = WT_WEIGHTS[age]?.Male || [];
                femaleWeights = WT_WEIGHTS[age]?.Female || [];
              }
            } else if (standard === "SGFI") {
              maleWeights = SGFI_WEIGHTS[age]?.Male || [];
              femaleWeights = SGFI_WEIGHTS[age]?.Female || [];
            }

            return (
              <div key={age} className={styles.ageGroupSection}>
                {/* Cadet Toggle - Above Table */}
                {age === "Cadet" && showCadetToggle && (
                  <div className={styles.cadetToggleContainer}>
                    <div className={styles.cadetRadioGroup}>
                      <label
                        className={`${styles.cadetRadioLabel} ${
                          values.cadetCategoryType === "weight" ? styles.cadetRadioSelected : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="cadetCategoryType"
                          value="weight"
                          checked={values.cadetCategoryType === "weight"}
                          onChange={(e) => setFieldValue("cadetCategoryType", e.target.value)}
                        />
                        Cadet Weight-based Categories
                      </label>
                      <label
                        className={`${styles.cadetRadioLabel} ${
                          values.cadetCategoryType === "height" ? styles.cadetRadioSelected : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="cadetCategoryType"
                          value="height"
                          checked={values.cadetCategoryType === "height"}
                          onChange={(e) => setFieldValue("cadetCategoryType", e.target.value)}
                        />
                        Cadet Height-based Categories
                      </label>
                    </div>
                  </div>
                )}

                <h3 className={styles.ageGroupTitle}>
                  {age} ({standard === "WT" ? "WT Standard" : "SGFI Standard"})
                </h3>

                <div className={styles.genderSections}>
                  <div className={styles.genderColumn}>
                    <h4 style={{ color: "#cf0006" }}>Male</h4>
                    <div className={styles.weightTableContainer}>
                      <table className={styles.weightTable}>
                        <thead>
                          <tr>
                            <th>S.No.</th>
                            <th>Category</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {maleWeights.length > 0 ? (
                            maleWeights.map((cat, i) => {
                              const parts = String(cat).split(" (");
                              const label = parts[0];
                              const desc = parts[1] ? parts[1].replace(")", "") : "";
                              return (
                                <tr key={`${age}-male-${i}`}>
                                  <td>{i + 1}</td>
                                  <td>{label}</td>
                                  <td>{desc}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="3">No weights defined</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.genderColumn}>
                    <h4 style={{ color: "#cf0006" }}>Female</h4>
                    <div className={styles.weightTableContainer}>
                      <table className={styles.weightTable}>
                        <thead>
                          <tr>
                            <th>S.No.</th>
                            <th>Category</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {femaleWeights.length > 0 ? (
                            femaleWeights.map((cat, i) => {
                              const parts = String(cat).split(" (");
                              const label = parts[0];
                              const desc = parts[1] ? parts[1].replace(")", "") : "";
                              return (
                                <tr key={`${age}-female-${i}`}>
                                  <td>{i + 1}</td>
                                  <td>{label}</td>
                                  <td>{desc}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="3">No weights defined</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

          {/* Custom Weight Categories (AGE + GENDER) */}
      {values.weightCategories?.type === 'custom' && (
        <div className={`${styles.fieldWrapper} ${styles.customWeightWrapper}`}>
          {/* Preset Controls - Server Based */}
          <div className={styles.presetControls}>
            <select
             onChange={async (e) => {
  const presetId = e.target.value;
  if (!presetId) {
    e.target.value = "";
    return;
  }

  const selectedPreset = presets.find((preset) => String(preset.id) === String(presetId));

  try {
    const res = await api.get(`/weight-presets/${presetId}`);
    const presetData = res.data?.data || res.data?.preset?.data || res.data;

    if (presetData && typeof presetData === "object") {
      // Normalize incoming preset to ensure age+gender structure
      const nextCustom = { ...(presetData || {}) };
      selectedAges.forEach((age) => {
        nextCustom[age] = normalizeAgeGenderCustom(nextCustom[age]);
      });

      setFieldValue("weightCategories.custom", nextCustom);

      // Show loaded preset name in input field
      if (selectedPreset?.name) {
        setPresetName(selectedPreset.name);
      }

      alert("Preset loaded successfully!");
    } else {
      alert("Preset data not found");
    }
  } catch (err) {
    console.error("Failed to load preset:", err);
    alert("Failed to load preset. Please try again.");
  }

  e.target.value = "";
}}
              value=""
              disabled={presetLoading}
            >
              <option value="">
                {presetLoading ? "-- Loading Presets... --" : "-- Load Saved Preset --"}
              </option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Enter Preset Name (e.g. State Championship 2026)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className={styles.presetInput}
            />

            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={async () => {
                if (!presetName.trim()) return;

                try {
                  // Save what is currently in form (already normalized)
                  await saveWeightPreset(presetName.trim(), values.weightCategories.custom);
                  setPresetName("");
                  alert("Preset saved successfully on server!");

                  const res = await getWeightPresets();
                  const list = res?.presets || res?.data?.presets || [];
                  setPresets(
                    (Array.isArray(list) ? list : []).map((p) => ({
                      id: p._id || p.id,
                      name: p.name,
                      createdAt: p.createdAt,
                    }))
                  );
                } catch (err) {
                  console.error("Save preset failed:", err);
                  alert("Failed to save preset. Please try again.");
                }
              }}
              className={styles.savePresetBtn}
            >
              Save Preset
            </button>
          </div>

          {/* Single global hint - shown only once */}
          <div className={styles.openCategoryHint}>
            💡 <strong>To create "Over" (Open-Ended) category:</strong>
            <br />
            Simply leave the <strong>Max. Weight</strong> field blank in the last row;
           
            It will automatically become <strong>"Over Category"</strong> with description, Example "(Over 80kg)".
          </div>

          {/* Age-wise + Gender-wise Custom Tables */}
          {selectedAges.map((age) => {
            const maleRows = getRows(age, "Male");
            const femaleRows = getRows(age, "Female");

            return (
              <div key={age} className={styles.ageCustomTable}>
                <h3>{age} - Custom Weight Divisions</h3>

                <div className={styles.genderSections}>
                  {/* Male */}
                  <div className={styles.genderColumn}>
                    <h4 style={{ color: "#cf0006" }}>Male</h4>

                    <div className={styles.weightTableContainer}>
                      <table className={styles.weightTable}>
                        <thead>
                          <tr>
                            <th>S.No.</th>
                            <th>Min. Weight (kg)</th>
                            <th>Max. Weight (kg)</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {maleRows.map((row, idx) => {
                            const minKey = `${age}-Male-${idx}-min`;
                            const maxKey = `${age}-Male-${idx}-max`;

                            const prevMaxRaw = idx > 0 ? maleRows[idx - 1]?.max : "";
                            const prevMax =
                              prevMaxRaw !== "" && prevMaxRaw != null && !Number.isNaN(Number(prevMaxRaw))
                                ? parseFloat(prevMaxRaw)
                                : null;

                            const minPlaceholder =
                              idx > 0 && prevMax != null ? (prevMax + 0.1).toFixed(1) : "e.g. 30";

                            return (
                              <tr key={`male-${idx}`}>
                                <td>{idx + 1}</td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder={minPlaceholder}
                                    value={row.min ?? ""}
                                    onChange={(e) => updateRow(age, "Male", idx, "min", e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, age, "Male", idx, "min")}
                                    ref={(el) => (inputRefs.current[minKey] = el)}
                                    className={styles.numberInput}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder="e.g. 35"
                                    value={row.max ?? ""}
                                    onChange={(e) => updateRow(age, "Male", idx, "max", e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, age, "Male", idx, "max")}
                                    ref={(el) => (inputRefs.current[maxKey] = el)}
                                    className={styles.numberInput}
                                  />
                                </td>
                                <td>
                                  <strong>{row.category || ""}</strong>
                                </td>
                                <td>{row.description || ""}</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newRows = maleRows.filter((_, i) => i !== idx);
                                      setRows(age, "Male", newRows.length > 0 ? newRows : [EMPTY_ROW]);
                                    }}
                                    className={styles.removeRowBtn}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={() => addRowAndFocus(age, "Male")}
                      className={styles.addRowButton}
                    >
                      + Add Division for {age} (Male)
                    </button>
                  </div>

                  {/* Female */}
                  <div className={styles.genderColumn}>
                    <h4 style={{ color: "#cf0006" }}>Female</h4>

                    <div className={styles.weightTableContainer}>
                      <table className={styles.weightTable}>
                        <thead>
                          <tr>
                            <th>S.No.</th>
                            <th>Min. Weight (kg)</th>
                            <th>Max. Weight (kg)</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {femaleRows.map((row, idx) => {
                            const minKey = `${age}-Female-${idx}-min`;
                            const maxKey = `${age}-Female-${idx}-max`;

                            const prevMaxRaw = idx > 0 ? femaleRows[idx - 1]?.max : "";
                            const prevMax =
                              prevMaxRaw !== "" && prevMaxRaw != null && !Number.isNaN(Number(prevMaxRaw))
                                ? parseFloat(prevMaxRaw)
                                : null;

                            const minPlaceholder =
                              idx > 0 && prevMax != null ? (prevMax + 0.1).toFixed(1) : "e.g. 30";

                            return (
                              <tr key={`female-${idx}`}>
                                <td>{idx + 1}</td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder={minPlaceholder}
                                    value={row.min ?? ""}
                                    onChange={(e) =>
                                      updateRow(age, "Female", idx, "min", e.target.value)
                                    }
                                    onKeyDown={(e) => handleKeyDown(e, age, "Female", idx, "min")}
                                    ref={(el) => (inputRefs.current[minKey] = el)}
                                    className={styles.numberInput}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder="e.g. 35"
                                    value={row.max ?? ""}
                                    onChange={(e) =>
                                      updateRow(age, "Female", idx, "max", e.target.value)
                                    }
                                    onKeyDown={(e) => handleKeyDown(e, age, "Female", idx, "max")}
                                    ref={(el) => (inputRefs.current[maxKey] = el)}
                                    className={styles.numberInput}
                                  />
                                </td>
                                <td>
                                  <strong>{row.category || ""}</strong>
                                </td>
                                <td>{row.description || ""}</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newRows = femaleRows.filter((_, i) => i !== idx);
                                      setRows(age, "Female", newRows.length > 0 ? newRows : [EMPTY_ROW]);
                                    }}
                                    className={styles.removeRowBtn}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={() => addRowAndFocus(age, "Female")}
                      className={styles.addRowButton}
                    >
                      + Add Division for {age} (Female)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Weights;