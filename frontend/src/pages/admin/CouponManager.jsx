import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const defaultForm = {
  code: "",
  category: "discount_coupon",
  value: 0,
  type: "percentage",
  active: true,
  maxUses: "",
  expiresAt: "",
  applicablePlans: [],
};

const planOptions = ["single", "six_months", "one_year", "monthly", "yearly", "lifetime"];

const categoryOptions = [
  { value: "discount_coupon", label: "Discount Coupon" },
  { value: "trial_coupon", label: "Trial Coupon" },
  { value: "free_tournament_coupon", label: "Free Tournament Coupon" },
  { value: "academy_coupon", label: "Academy Coupon" },
  { value: "full_access_coupon", label: "Full Access Coupon" },
];

const formatDate = (value) => {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const CouponManager = () => {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await api.get("/admin/billing/coupons", {
        params: {
          includeDeleted: includeDeleted ? "true" : "false",
        },
      });

      setCoupons(res.data?.coupons || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDeleted]);

  const filteredCoupons = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return coupons;

    return coupons.filter((coupon) =>
     [
  coupon.code,
  coupon.category,
  coupon.type,
        coupon.createdBy?.name,
        coupon.createdBy?.email,
        coupon.deletedBy?.name,
        coupon.deletedBy?.email,
        coupon.deleteReason,
        coupon.applicablePlans?.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [coupons, search]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId("");
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const togglePlan = (plan) => {
    setForm((prev) => {
      const current = Array.isArray(prev.applicablePlans)
        ? prev.applicablePlans
        : [];

      const exists = current.includes(plan);

      return {
        ...prev,
        applicablePlans: exists
          ? current.filter((item) => item !== plan)
          : [...current, plan],
      };
    });
  };

  const buildPayload = () => {
    const payload = {
      code: form.code.trim().toUpperCase(),
      category: form.category,
      value: Number(form.value || 0),
      active: Boolean(form.active),
      applicablePlans: form.applicablePlans || [],
    };

    if (form.maxUses !== "" && form.maxUses !== null) {
      payload.maxUses = Number(form.maxUses);
    } else {
      payload.maxUses = null;
    }

    if (form.expiresAt) {
      payload.expiresAt = new Date(form.expiresAt).toISOString();
    } else {
      payload.expiresAt = null;
    }

    return payload;
  };

  const submitCoupon = async (event) => {
    event.preventDefault();

    if (!form.code.trim()) {
      alert("Coupon code is required");
      return;
    }

    try {
      setSaving(true);
      const payload = buildPayload();

      if (editingId) {
        await api.patch(`/admin/billing/coupons/${editingId}`, payload);
      } else {
        await api.post("/admin/billing/coupons", payload);
      }

      resetForm();
      await loadCoupons();
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  };

  const editCoupon = (coupon) => {
    if (coupon.deletedAt) {
      alert("Deleted coupons cannot be edited.");
      return;
    }

    setEditingId(coupon._id);

    setForm({
      code: coupon.code || "",
      category: coupon.category || "discount_coupon",
      value: coupon.value || 0,
      active: coupon.active !== false,
      maxUses: coupon.maxUses || "",
      expiresAt: coupon.expiresAt
        ? new Date(coupon.expiresAt).toISOString().slice(0, 10)
        : "",
      applicablePlans: coupon.applicablePlans || [],
    });
  };

  const disableCoupon = async (coupon) => {
    const typed = window.prompt(
      `Disable coupon ${coupon.code}?\n\nThis will prevent future usage but keep audit history.\n\nType DISABLE to confirm.`
    );

    if (typed !== "DISABLE") return;

    try {
      setActionLoadingId(`${coupon._id}:disable`);
      await api.patch(`/admin/billing/coupons/${coupon._id}/disable`);
      await loadCoupons();
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to disable coupon");
    } finally {
      setActionLoadingId("");
    }
  };

  const deleteCoupon = async (coupon) => {
    const typed = window.prompt(
      `Soft delete coupon ${coupon.code}?\n\nThis will disable the coupon and preserve audit history. It will not be permanently removed.\n\nType DELETE to confirm.`
    );

    if (typed !== "DELETE") return;

    const reason = window.prompt("Enter delete reason for audit log:") || "";

    if (!reason.trim()) {
      alert("Delete reason is required.");
      return;
    }

    try {
      setActionLoadingId(`${coupon._id}:delete`);
      await api.delete(`/admin/billing/coupons/${coupon._id}`, {
        data: { reason },
      });
      await loadCoupons();
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Failed to delete coupon");
    } finally {
      setActionLoadingId("");
    }
  };

  const isActionDisabled = Boolean(actionLoadingId);

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Coupon Manager</h2>
            <p>Create, edit, disable and monitor premium billing coupons.</p>
          </div>

          <button type="button" className={styles.secondaryBtn} onClick={loadCoupons}>
            Refresh
          </button>
        </div>

        <form onSubmit={submitCoupon} className={styles.pageStack}>
          <div className={styles.detailGrid}>
            <div>
              <span>Coupon Code</span>
              <input
                className={styles.searchInput}
                value={form.code}
                onChange={(e) => updateField("code", e.target.value.toUpperCase())}
                placeholder="WELCOME50"
              />
            </div>

            <div>
              <span>Type</span>
              <select
                className={styles.searchInput}
                value={form.type}
                onChange={(e) => updateField("type", e.target.value)}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
                <option value="full_access">Full Access</option>
              </select>
            </div>

            <div>
              <span>Value</span>
              <input
                className={styles.searchInput}
                type="number"
                min="0"
                value={form.value}
                onChange={(e) => updateField("value", e.target.value)}
              />
            </div>

            <div>
              <span>Max Uses</span>
              <input
                className={styles.searchInput}
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => updateField("maxUses", e.target.value)}
                placeholder="Unlimited"
              />
            </div>

            <div>
              <span>Expiry Date</span>
              <input
                className={styles.searchInput}
                type="date"
                value={form.expiresAt}
                onChange={(e) => updateField("expiresAt", e.target.value)}
              />
            </div>

            <div>
              <span>Status</span>
              <select
                className={styles.searchInput}
                value={form.active ? "active" : "inactive"}
                onChange={(e) => updateField("active", e.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Applicable Plans</h2>
                <p>Leave all unchecked to make coupon valid for every plan.</p>
              </div>
            </div>

            <div className={styles.actionGroup}>
              {planOptions.map((plan) => (
                <button
                  key={plan}
                  type="button"
                  className={
                    form.applicablePlans.includes(plan)
                      ? styles.primaryBtn
                      : styles.secondaryBtn
                  }
                  onClick={() => togglePlan(plan)}
                >
                  {plan}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.actionGroup}>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Coupon" : "Create Coupon"}
            </button>

            {editingId && (
              <button type="button" className={styles.secondaryBtn} onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>All Coupons</h2>
            <p>Search and manage existing coupon codes.</p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupons"
          />

          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            Include deleted
          </label>
        </div>

        {loading && <div className={styles.stateBox}>Loading coupons...</div>}
        {error && <div className={styles.errorBox}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Code</th>
                 <th>Category</th>
<th>Type</th>
<th>Value</th>
                  <th>Uses</th>
                  <th>Plans</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCoupons.map((coupon) => {
                  const deleted = Boolean(coupon.deletedAt);

                  return (
                    <tr key={coupon._id}>
                      <td>
                        <strong>{coupon.code}</strong>
                        {deleted && (
                          <>
                            <br />
                            <span>Deleted: {formatDate(coupon.deletedAt)}</span>
                          </>
                        )}
                      </td>

                     <td>
  <span className={styles.badge}>
    {coupon.category || "discount_coupon"}
  </span>
</td>

<td>
  <span className={styles.badge}>{coupon.type}</span>
</td>

<td>{coupon.value || 0}</td>

                     

                      <td>
                        {coupon.usedCount || 0}
                        {coupon.maxUses ? ` / ${coupon.maxUses}` : " / Unlimited"}
                      </td>

                      <td>
                        {coupon.applicablePlans?.length
                          ? coupon.applicablePlans.join(", ")
                          : "All"}
                      </td>

                      <td>
                        {deleted ? (
                          <span className={styles.errorBadge}>Deleted</span>
                        ) : coupon.active ? (
                          <span className={styles.successBadge}>Active</span>
                        ) : (
                          <span className={styles.mutedBadge}>Disabled</span>
                        )}
                      </td>

                      <td>{formatDate(coupon.expiresAt)}</td>

                      <td>
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() => editCoupon(coupon)}
                            disabled={deleted || isActionDisabled}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() => disableCoupon(coupon)}
                            disabled={deleted || !coupon.active || isActionDisabled}
                          >
                            Disable
                          </button>

                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() => deleteCoupon(coupon)}
                            disabled={deleted || isActionDisabled}
                          >
                            Delete
                          </button>
                        </div>

                        {deleted && coupon.deleteReason && (
                          <span>Reason: {coupon.deleteReason}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredCoupons.length === 0 && (
                  <tr>
                    <td colSpan="9" className={styles.emptyCell}>
                      No coupons found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default CouponManager;