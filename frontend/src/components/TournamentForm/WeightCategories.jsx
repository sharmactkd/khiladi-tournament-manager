// src/components/TournamentForm/WeightCategories.jsx


import React, { useEffect, useRef, useState } from 'react';
import { WT_WEIGHTS, SGFI_WEIGHTS } from './constants';
import styles from "../../pages/TournamentForm.module.css";

import api from "../../api.js";  // ← default export है इसलिए यह तरीका
import { getWeightPresets, saveWeightPreset, deleteWeightPreset } from "../../api.js";

const Weights = ({ values, setFieldValue }) => {
  const [presetName, setPresetName] = useState("");
const [presets, setPresets] = useState([]);
const [presetLoading, setPresetLoading] = useState(false);

useEffect(() => {
  const fetchPresets = async () => {
  if (values.weightCategories?.type !== 'custom') {
    setPresets([]);
    return;
  }

  setPresetLoading(true);
  try {
    const res = await getWeightPresets();

    // Safe access – multiple possible formats handle करो
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

    setPresets(presetsArray.map(p => ({
      id: p._id || p.id,
      name: p.name,
      data: p.data || null  // अगर data नहीं है तो null (load के लिए अलग call करना पड़ेगा)
    })));

  } catch (err) {
    console.error("Failed to load presets:", err);
    setPresets([]);
    // Optional: alert("Could not load saved presets. Please try again.");
  } finally {
    setPresetLoading(false);
  }
};

  fetchPresets();
}, [values.weightCategories?.type]);

  const selectedAges = [
    ...(values.ageCategories?.open || []),
    ...(values.ageCategories?.official || []),
  ];

  const ageOrder = ["Sub-Junior", "Cadet", "Junior", "Senior", "Under - 14", "Under - 17", "Under - 19"];

  const getStandardForAge = (age) => {
    const wtAges = ["Sub-Junior", "Cadet", "Junior", "Senior"];
    const sgfiAges = ["Under - 14", "Under - 17", "Under - 19"];
    if (wtAges.includes(age)) return 'WT';
    if (sgfiAges.includes(age)) return 'SGFI';
    return null;
  };

  const sortedSelectedAges = selectedAges
    .filter(age => getStandardForAge(age))
    .sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b));

  const showCadetToggle = sortedSelectedAges.includes('Cadet') && values.weightCategories?.type === 'WT';

  // Refs for input focus
  const inputRefs = useRef({});

  // Add new row and focus on Max field of new row
  const addRowAndFocus = (age) => {
    const rows = values.weightCategories.custom?.[age] || [];
    const lastMax = rows.length > 0 ? rows[rows.length - 1].max : '';
    const suggestedMin = lastMax ? (parseFloat(lastMax) + 0.1).toFixed(1) : '';

    const newRowIndex = rows.length;
    const newRows = [...rows, { min: suggestedMin, max: '', category: '', description: '' }];

    setFieldValue(`weightCategories.custom.${age}`, newRows);

    setTimeout(() => {
      const maxKey = `${age}-${newRowIndex}-max`;
      if (inputRefs.current[maxKey]) {
        inputRefs.current[maxKey].focus();
        inputRefs.current[maxKey].select();
      }
    }, 0);
  };

  // Handle Enter key
  const handleKeyDown = (e, age, rowIndex, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (field === 'max') {
        addRowAndFocus(age);
      } else if (field === 'min') {
        const maxKey = `${age}-${rowIndex}-max`;
        if (inputRefs.current[maxKey]) {
          inputRefs.current[maxKey].focus();
          inputRefs.current[maxKey].select();
        }
      }
    }
  };

  // Update row field
  const updateRow = (age, index, field, value) => {
    const rows = [...(values.weightCategories.custom?.[age] || [])];
    rows[index][field] = value ? parseFloat(value) : '';
    setFieldValue(`weightCategories.custom.${age}`, rows);
  };

  // Auto generate category & description — NOW SUPPORTS "80+" OPEN-ENDED
  useEffect(() => {
    if (values.weightCategories?.type !== 'custom') return;

    let hasChanges = false;
    const newCustom = { ...values.weightCategories.custom };

    selectedAges.forEach(age => {
      const rows = newCustom[age] || [];
      if (rows.length === 0) return;

      const updatedRows = rows.map((row, idx) => {
        const min = row.min !== '' ? parseFloat(row.min) : null;
        const max = row.max !== '' ? parseFloat(row.max) : null;

        // Case 1: Max is blank → Open-ended category (e.g., 80+)
        if (min !== null && (max === null || max === '')) {
          const category = `${min}+ KG`;
          const description = `(Over ${min}kg)`;

          if (row.category !== category || row.description !== description) {
            hasChanges = true;
            return { ...row, category, description };
          }
          return row;
        }

        // Case 2: Normal bounded category
        if (min === null || max === null || min >= max) {
          if (row.category || row.description) {
            hasChanges = true;
            return { ...row, category: '', description: '' };
          }
          return row;
        }

        let category = `Under - ${max} KG`;
        let description = '';

        if (idx === 0) {
          if (min === 0) {
            description = `(Not exceeding ${max}kg)`;
          } else {
            const lowerBound = (min - 0.1).toFixed(1);
            description = `(Over ${lowerBound}kg & Not exceeding ${max}kg)`;
          }
        } else {
          const prevMax = parseFloat(rows[idx - 1].max);
          description = `(Over ${prevMax}kg & Not exceeding ${max}kg)`;
        }

        if (row.category !== category || row.description !== description) {
          hasChanges = true;
          return { ...row, category, description };
        }
        return row;
      });

      newCustom[age] = updatedRows;
    });

    if (hasChanges) {
      setFieldValue('weightCategories.custom', newCustom);
    }
  }, [values.weightCategories?.custom, selectedAges, setFieldValue]);

  // Auto save standard weights
  useEffect(() => {
    if (values.weightCategories?.type === 'custom') return;

    let allMale = [];
    let allFemale = [];

    sortedSelectedAges.forEach(age => {
      const standard = getStandardForAge(age);
      let maleWeights = [];
      let femaleWeights = [];

      if (standard === 'WT') {
        if (age === 'Cadet') {
          const cadetData = values.cadetCategoryType === 'height'
            ? WT_WEIGHTS.Cadet.height
            : WT_WEIGHTS.Cadet.weight;
          maleWeights = cadetData.Male || [];
          femaleWeights = cadetData.Female || [];
        } else {
          maleWeights = WT_WEIGHTS[age]?.Male || [];
          femaleWeights = WT_WEIGHTS[age]?.Female || [];
        }
      } else if (standard === 'SGFI') {
        maleWeights = SGFI_WEIGHTS[age]?.Male || [];
        femaleWeights = SGFI_WEIGHTS[age]?.Female || [];
      }

      const extractLabel = (str) => str.split(' (')[0].trim();
      allMale = [...allMale, ...maleWeights.map(extractLabel)];
      allFemale = [...allFemale, ...femaleWeights.map(extractLabel)];
    });

    const uniqueMale = [...new Set(allMale)];
    const uniqueFemale = [...new Set(allFemale)];

    const currentMale = values.weightCategories?.selected?.male || [];
    const currentFemale = values.weightCategories?.selected?.female || [];

    if (
      JSON.stringify(uniqueMale.sort()) !== JSON.stringify(currentMale.sort()) ||
      JSON.stringify(uniqueFemale.sort()) !== JSON.stringify(currentFemale.sort())
    ) {
      setFieldValue('weightCategories.selected.male', uniqueMale);
      setFieldValue('weightCategories.selected.female', uniqueFemale);
    }
  }, [
    sortedSelectedAges,
    values.cadetCategoryType,
    values.weightCategories?.type,
    setFieldValue
  ]);

  if (selectedAges.length === 0 && values.weightCategories?.type !== 'custom') {
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
          value={values.weightCategories?.type || 'WT'}
          onChange={(e) => {
            const newType = e.target.value;
            setFieldValue('weightCategories.type', newType);
            setFieldValue('weightCategories.selected', { male: [], female: [] });

            if (newType === 'custom') {
              const initCustom = {};
              selectedAges.forEach(age => {
                initCustom[age] = values.weightCategories.custom?.[age] || [{ min: '', max: '', category: '', description: '' }];
              });
              setFieldValue('weightCategories.custom', initCustom);
            } else {
              setFieldValue('weightCategories.custom', {});
            }
          }}
        >
         <option value="WT">WT Standard Weights</option>
          <option value="SGFI">SGFI Standard Weights</option>
          <option value="custom">Custom Weight Categories</option>
        </select>
      </div>

      {/* Standard Weights */}
      {values.weightCategories?.type !== 'custom' && (
        <>
         

          {sortedSelectedAges.map((age) => {
            const standard = getStandardForAge(age);
            let maleWeights = [];
            let femaleWeights = [];

            if (standard === 'WT') {
              if (age === 'Cadet') {
                const cadetData = values.cadetCategoryType === 'height'
                  ? WT_WEIGHTS.Cadet.height
                  : WT_WEIGHTS.Cadet.weight;
                maleWeights = cadetData.Male || [];
                femaleWeights = cadetData.Female || [];
              } else {
                maleWeights = WT_WEIGHTS[age]?.Male || [];
                femaleWeights = WT_WEIGHTS[age]?.Female || [];
              }
            } else if (standard === 'SGFI') {
              maleWeights = SGFI_WEIGHTS[age]?.Male || [];
              femaleWeights = SGFI_WEIGHTS[age]?.Female || [];
            }

            return (
              <div key={age} className={styles.ageGroupSection}>
                {/* Cadet Toggle - Above Table */}
                {age === 'Cadet' && showCadetToggle && (
                  <div className={styles.cadetToggleContainer}>
                    <div className={styles.cadetRadioGroup}>
                      <label className={`${styles.cadetRadioLabel} ${values.cadetCategoryType === 'weight' ? styles.cadetRadioSelected : ''}`}>
                        <input
                          type="radio"
                          name="cadetCategoryType"
                          value="weight"
                          checked={values.cadetCategoryType === 'weight'}
                          onChange={(e) => setFieldValue('cadetCategoryType', e.target.value)}
                        />
                        Cadet Weight-based Categories
                      </label>
                      <label className={`${styles.cadetRadioLabel} ${values.cadetCategoryType === 'height' ? styles.cadetRadioSelected : ''}`}>
                        <input
                          type="radio"
                          name="cadetCategoryType"
                          value="height"
                          checked={values.cadetCategoryType === 'height'}
                          onChange={(e) => setFieldValue('cadetCategoryType', e.target.value)}
                        />
                        Cadet Height-based Categories
                      </label>
                    </div>
                  </div>
                )}

                <h3 className={styles.ageGroupTitle}>
                  {age} ({standard === 'WT' ? 'WT Standard' : 'SGFI Standard'})
                </h3>

                <div className={styles.genderSections}>
                  <div className={styles.genderColumn}>
                    <h4 style={{ color: '#cf0006' }}>Male</h4>
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
                          {maleWeights.length > 0 ? maleWeights.map((cat, i) => {
                            const parts = cat.split(' (');
                            const label = parts[0];
                            const desc = parts[1] ? parts[1].replace(')', '') : '';
                            return (
                              <tr key={`${age}-male-${i}`}>
                                <td>{i + 1}</td>
                                <td>{label}</td>
                                <td>{desc}</td>
                              </tr>
                            );
                          }) : <tr><td colSpan="3">No weights defined</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.genderColumn}>
                    <h4 style={{ color: '#cf0006' }}>Female</h4>
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
                          {femaleWeights.length > 0 ? femaleWeights.map((cat, i) => {
                            const parts = cat.split(' (');
                            const label = parts[0];
                            const desc = parts[1] ? parts[1].replace(')', '') : '';
                            return (
                              <tr key={`${age}-female-${i}`}>
                                <td>{i + 1}</td>
                                <td>{label}</td>
                                <td>{desc}</td>
                              </tr>
                            );
                          }) : <tr><td colSpan="3">No weights defined</td></tr>}
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

      {/* Custom Weight Categories */}
    {values.weightCategories?.type === 'custom' && (
        <div className={styles.fieldWrapper}>
          {/* Preset Controls - Server Based */}
          <div className={styles.presetControls}>
            {/* Only ONE <select> - Removed duplicate */}
            <select
              onChange={async (e) => {
                const presetId = e.target.value;
                if (!presetId) {
                  e.target.value = ""; // reset
                  return;
                }

                try {
                  const res = await api.get(`/weight-presets/${presetId}`);
                  const presetData = res.data?.data || res.data?.preset?.data || res.data;

                  if (presetData) {
                    setFieldValue('weightCategories.custom', presetData);
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
            >
              <option value="">-- Load Saved Preset --</option>
              {presets.map(preset => (
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
                  await saveWeightPreset(presetName.trim(), values.weightCategories.custom);
                  setPresetName('');
                  alert('Preset saved successfully on server!');

                  // Refetch to update dropdown
                  const res = await getWeightPresets();
                  setPresets(res.presets || res.data.presets || []);
                } catch (err) {
                  alert("Failed to save preset. Please try again.");
                }
              }}
              className={styles.savePresetBtn}
            >
              Save Preset
            </button>
          </div>

          {/* Age-wise Custom Tables */}
          {selectedAges.map(age => {
            const rows = values.weightCategories.custom?.[age] || [];

            return (
              <div key={age} className={styles.ageCustomTable}>
                <h3>{age} - Custom Weight Divisions</h3>
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
                      {rows.map((row, idx) => {
                        const minKey = `${age}-${idx}-min`;
                        const maxKey = `${age}-${idx}-max`;

                        return (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder={idx > 0 ? (parseFloat(rows[idx - 1].max) + 0.1).toFixed(1) : 'e.g. 30'}
                                value={row.min ?? ''}
                                onChange={(e) => updateRow(age, idx, 'min', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, age, idx, 'min')}
                                ref={(el) => (inputRefs.current[minKey] = el)}
                                className={styles.numberInput}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                               placeholder="e.g. 35"  // Simple aur clean
                                value={row.max ?? ''}
                                onChange={(e) => updateRow(age, idx, 'max', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, age, idx, 'max')}
                                ref={(el) => (inputRefs.current[maxKey] = el)}
                                className={styles.numberInput}
                              />
                            </td>
                            <td><strong>{row.category || ''}</strong></td>
                            <td>{row.description || ''}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => {
                                  const newRows = rows.filter((_, i) => i !== idx);
                                  setFieldValue(`weightCategories.custom.${age}`, newRows.length > 0 ? newRows : [{ min: '', max: '', category: '', description: '' }]);
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

               <div className={styles.openCategoryHint}>
        💡 <strong>To create "Over" (Open-Ended) category:</strong><br/>
        Simply leave the <strong>Max. Weight</strong> field blank in the last row.<br/>
        It will automatically become <strong>"Over Category"</strong> with description, Example "(Over 80kg)".
      </div>

                <button
                  type="button"
                  onClick={() => addRowAndFocus(age)}
                  className={styles.addRowButton}
                >
                  + Add Division for {age}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Weights;