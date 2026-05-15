import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const emptyPlan = {
  label: "",
  enabled: true,
  price: 0,
  durationDays: "",
  currency: "INR",
  accessType: "unlimited",
  description: "",
};

const normalizePlans = (plans) => {
  if (!plans) return {};
  return { ...plans };
};

const BillingSettings = () => {
  const [settings, setSettings] = useState(null);
  const [newPlanKey, setNewPlanKey] = useState("");
  const [newPlan, setNewPlan] = useState(emptyPlan);
  const [saving, setSaving] = useState(false);

  const plans = useMemo(() => normalizePlans(settings?.plans), [settings]);

  const loadSettings = async () => {
    try {
      const res = await api.get("/admin/billing/settings");
      setSettings(res.data.settings);
    } catch (err) {
      console.error(err);
      alert("Failed to load billing settings");
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateField = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updatePlan = (planKey, field, value) => {
    setSettings((prev) => ({
      ...prev,
      plans: {
        ...(prev.plans || {}),
        [planKey]: {
          ...(prev.plans?.[planKey] || {}),
          [field]: value,
        },
      },
    }));
  };

  const deletePlan = (planKey) => {
    const ok = window.confirm(`Delete plan "${planKey}"?`);
    if (!ok) return;

    setSettings((prev) => {
      const updatedPlans = { ...(prev.plans || {}) };
      delete updatedPlans[planKey];

      return {
        ...prev,
        plans: updatedPlans,
      };
    });
  };

  const addPlan = () => {
    const key = newPlanKey
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    if (!key) {
      alert("Plan key is required. Example: three_months");
      return;
    }

    if (plans[key]) {
      alert("Plan key already exists");
      return;
    }

    if (!newPlan.label.trim()) {
      alert("Plan label is required");
      return;
    }

    setSettings((prev) => ({
      ...prev,
      plans: {
        ...(prev.plans || {}),
        [key]: {
          ...newPlan,
          price: Number(newPlan.price || 0),
          durationDays:
            newPlan.durationDays === "" ? null : Number(newPlan.durationDays),
        },
      },
    }));

    setNewPlanKey("");
    setNewPlan(emptyPlan);
  };

  const sanitizePlans = () => {
    const cleaned = {};

    Object.entries(plans).forEach(([key, plan]) => {
      cleaned[key] = {
        label: plan.label || key,
        enabled: Boolean(plan.enabled),
        price: Number(plan.price || 0),
        durationDays:
          plan.durationDays === "" ||
          plan.durationDays === null ||
          plan.durationDays === undefined
            ? null
            : Number(plan.durationDays),
        currency: plan.currency || settings.defaultCurrency || "INR",
        accessType: plan.accessType || "unlimited",
        description: plan.description || "",
      };
    });

    return cleaned;
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      await api.patch("/admin/billing/settings", {
        paymentsEnabled: settings.paymentsEnabled,
        maintenanceFreeAccess: settings.maintenanceFreeAccess,
        registrationEnabled: settings.registrationEnabled,
        couponSystemEnabled: settings.couponSystemEnabled,
        trialEnabled: settings.trialEnabled,
        defaultCurrency: settings.defaultCurrency || "INR",
        defaultTrialDays: Number(settings.defaultTrialDays || 7),
        plans: sanitizePlans(),
      });

      alert("Billing settings updated successfully");
      await loadSettings();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className={styles.pageStack}>
        <div className={styles.stateBox}>Loading billing settings...</div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Global Billing Controls</h2>
            <p>Manage platform-wide payment, coupon, trial and free access settings.</p>
          </div>
        </div>

        <div className={styles.detailGrid}>
          <label>
            <span>Payments Enabled</span>
            <select
              className={styles.searchInput}
              value={settings.paymentsEnabled ? "true" : "false"}
              onChange={(e) =>
                updateField("paymentsEnabled", e.target.value === "true")
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label>
            <span>Free Access Mode</span>
            <select
              className={styles.searchInput}
              value={settings.maintenanceFreeAccess ? "true" : "false"}
              onChange={(e) =>
                updateField("maintenanceFreeAccess", e.target.value === "true")
              }
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </label>

          <label>
            <span>Registration Enabled</span>
            <select
              className={styles.searchInput}
              value={settings.registrationEnabled ? "true" : "false"}
              onChange={(e) =>
                updateField("registrationEnabled", e.target.value === "true")
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label>
            <span>Coupon System</span>
            <select
              className={styles.searchInput}
              value={settings.couponSystemEnabled ? "true" : "false"}
              onChange={(e) =>
                updateField("couponSystemEnabled", e.target.value === "true")
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label>
            <span>Trial Enabled</span>
            <select
              className={styles.searchInput}
              value={settings.trialEnabled ? "true" : "false"}
              onChange={(e) =>
                updateField("trialEnabled", e.target.value === "true")
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label>
            <span>Default Trial Days</span>
            <input
              type="number"
              className={styles.searchInput}
              value={settings.defaultTrialDays || 7}
              onChange={(e) =>
                updateField("defaultTrialDays", Number(e.target.value))
              }
            />
          </label>

          <label>
            <span>Currency</span>
            <input
              className={styles.searchInput}
              value={settings.defaultCurrency || "INR"}
              onChange={(e) =>
                updateField("defaultCurrency", e.target.value.toUpperCase())
              }
            />
          </label>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Create New Plan</h2>
            <p>
              Example keys: <strong>single</strong>, <strong>six_months</strong>,{" "}
              <strong>one_year</strong>, <strong>three_months</strong>
            </p>
          </div>
        </div>

        <div className={styles.detailGrid}>
          <label>
            <span>Plan Key</span>
            <input
              className={styles.searchInput}
              value={newPlanKey}
              onChange={(e) => setNewPlanKey(e.target.value)}
              placeholder="three_months"
            />
          </label>

          <label>
            <span>Plan Label</span>
            <input
              className={styles.searchInput}
              value={newPlan.label}
              onChange={(e) =>
                setNewPlan((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="3 Months"
            />
          </label>

          <label>
            <span>Price</span>
            <input
              type="number"
              className={styles.searchInput}
              value={newPlan.price}
              onChange={(e) =>
                setNewPlan((prev) => ({ ...prev, price: Number(e.target.value) }))
              }
            />
          </label>

          <label>
            <span>Duration Days</span>
            <input
              type="number"
              className={styles.searchInput}
              value={newPlan.durationDays}
              onChange={(e) =>
                setNewPlan((prev) => ({
                  ...prev,
                  durationDays: e.target.value,
                }))
              }
              placeholder="180"
            />
          </label>

          <label>
            <span>Access Type</span>
            <select
              className={styles.searchInput}
              value={newPlan.accessType}
              onChange={(e) =>
                setNewPlan((prev) => ({ ...prev, accessType: e.target.value }))
              }
            >
              <option value="tournament">Single Tournament</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              className={styles.searchInput}
              value={newPlan.enabled ? "true" : "false"}
              onChange={(e) =>
                setNewPlan((prev) => ({
                  ...prev,
                  enabled: e.target.value === "true",
                }))
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            value={newPlan.description}
            onChange={(e) =>
              setNewPlan((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Plan description"
          />

          <button type="button" className={styles.primaryBtn} onClick={addPlan}>
            Add Plan
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Manage Plans</h2>
            <p>Create, modify, disable or delete billing plans.</p>
          </div>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save All Changes"}
          </button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Plan Key</th>
                <th>Label</th>
                <th>Price</th>
                <th>Duration</th>
                <th>Access</th>
                <th>Status</th>
                <th>Description</th>
                <th>Delete</th>
              </tr>
            </thead>

            <tbody>
              {Object.entries(plans).map(([planKey, plan]) => (
                <tr key={planKey}>
                  <td>
                    <strong>{planKey}</strong>
                  </td>

                  <td>
                    <input
                      className={styles.searchInput}
                      value={plan.label || ""}
                      onChange={(e) =>
                        updatePlan(planKey, "label", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      className={styles.searchInput}
                      value={plan.price || 0}
                      onChange={(e) =>
                        updatePlan(planKey, "price", Number(e.target.value))
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      className={styles.searchInput}
                      value={plan.durationDays ?? ""}
                      onChange={(e) =>
                        updatePlan(planKey, "durationDays", e.target.value)
                      }
                      placeholder="No expiry"
                    />
                  </td>

                  <td>
                    <select
                      className={styles.searchInput}
                      value={plan.accessType || "unlimited"}
                      onChange={(e) =>
                        updatePlan(planKey, "accessType", e.target.value)
                      }
                    >
                      <option value="tournament">Tournament</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                  </td>

                  <td>
                    <select
                      className={styles.searchInput}
                      value={plan.enabled ? "true" : "false"}
                      onChange={(e) =>
                        updatePlan(planKey, "enabled", e.target.value === "true")
                      }
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </td>

                  <td>
                    <input
                      className={styles.searchInput}
                      value={plan.description || ""}
                      onChange={(e) =>
                        updatePlan(planKey, "description", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => deletePlan(planKey)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {Object.keys(plans).length === 0 && (
                <tr>
                  <td colSpan="8" className={styles.emptyCell}>
                    No plans created.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default BillingSettings;