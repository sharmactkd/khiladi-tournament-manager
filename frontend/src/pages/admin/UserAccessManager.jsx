import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const filters = ["all", "premium", "expired", "blocked", "trial", "lifetime"];

const dangerousActionConfig = {
  "grant-premium": {
    title: "Grant Premium Access",
    message: "This will manually grant premium access to this user.",
    confirmationText: "GRANT_PREMIUM",
  },
  "extend-premium": {
    title: "Extend Premium Access",
    message: "This will extend this user's premium access.",
    confirmationText: "EXTEND_PREMIUM",
  },
  "start-trial": {
    title: "Start Trial",
    message: "This will start a trial for this user.",
    confirmationText: "START_TRIAL",
  },
  lifetime: {
    title: "Grant Lifetime Access",
    message:
      "This will grant lifetime premium access. Use only for verified paid/manual cases.",
    confirmationText: "ENABLE_LIFETIME",
  },
  "enable-override": {
    title: "Enable Admin Override",
    message: "This will bypass normal billing checks while override is active.",
    confirmationText: "ENABLE_OVERRIDE",
  },
  "disable-override": {
    title: "Disable Admin Override",
    message: "This will disable admin override access.",
    confirmationText: "DISABLE_OVERRIDE",
  },
  "remove-premium": {
    title: "Remove Premium Access",
    message: "This will remove premium/lifetime/override access.",
    confirmationText: "REMOVE_PREMIUM",
  },
  "remove-trial": {
    title: "Remove Trial",
    message: "This will remove trial access.",
    confirmationText: "REMOVE_TRIAL",
  },
  block: {
    title: "Block User",
    message: "This will block the user and remove active refresh tokens.",
    confirmationText: "BLOCK_USER",
  },
  unblock: {
    title: "Unblock User",
    message: "This will unblock the user.",
    confirmationText: "UNBLOCK_USER",
  },
  "force-logout": {
    title: "Force Logout",
    message: "This will log the user out from all devices.",
    confirmationText: "FORCE_LOGOUT",
  },
};

const accessPriorityLabels = {
  1: "Global free access",
  2: "Admin override",
  3: "Lifetime access",
  4: "Coupon access",
  5: "User subscription",
  6: "Unlimited payment",
  7: "Tournament payment",
  8: "Trial access",
  50: "Migrated access",
  90: "System access",
};

const UserAccessManager = () => {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await api.get("/admin/billing/users", {
        params: { filter, search, limit: 50 },
      });

      setUsers(res.data?.users || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const confirmDangerousAction = ({ user, action }) => {
    const config = dangerousActionConfig[action];

    if (!config) {
      const confirmed = window.confirm(
        `Are you sure you want to ${action.replaceAll("-", " ")} for ${
          user.name || user.email || "this user"
        }?`
      );

      if (!confirmed) {
        return {
          confirmed: false,
          reason: "",
          confirmationText: "",
          adminPassword: "",
        };
      }

      const adminPassword = window.prompt("Enter your admin password to continue:");

      if (!adminPassword || !adminPassword.trim()) {
        alert("Admin password is required.");
        return {
          confirmed: false,
          reason: "",
          confirmationText: "",
          adminPassword: "",
        };
      }

      return {
        confirmed: true,
        reason: "Admin confirmed action",
        confirmationText: "",
        adminPassword: adminPassword.trim(),
      };
    }

    const reason = window.prompt(
      `${config.title}\n\nUser: ${
        user.name || user.email || user._id
      }\n\n${config.message}\n\nEnter reason for audit log:`
    );

    if (!reason || reason.trim().length < 5) {
      alert("Reason is required and must be at least 5 characters.");
      return {
        confirmed: false,
        reason: "",
        confirmationText: "",
        adminPassword: "",
      };
    }

    const typed = window.prompt(
      `${config.title}\n\nType ${config.confirmationText} to confirm.`
    );

    if (typed !== config.confirmationText) {
      alert(`Invalid confirmation. You must type ${config.confirmationText}.`);
      return {
        confirmed: false,
        reason: "",
        confirmationText: "",
        adminPassword: "",
      };
    }

    const adminPassword = window.prompt(
      `${config.title}\n\nEnter your admin password to continue:`
    );

    if (!adminPassword || !adminPassword.trim()) {
      alert("Admin password is required.");
      return {
        confirmed: false,
        reason: "",
        confirmationText: "",
        adminPassword: "",
      };
    }

    return {
      confirmed: true,
      reason: reason.trim(),
      confirmationText: typed,
      adminPassword: adminPassword.trim(),
    };
  };

  const runAction = async (user, action, body = {}) => {
    const confirmation = confirmDangerousAction({ user, action });

    if (!confirmation.confirmed) return;

    try {
      setActionLoadingId(`${user._id}:${action}`);

      await api.patch(`/admin/billing/users/${user._id}/${action}`, {
        ...body,
        reason: confirmation.reason,
        confirmationText: confirmation.confirmationText,
        adminPassword: confirmation.adminPassword,
      });

      await loadUsers();
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Action failed");
    } finally {
      setActionLoadingId("");
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-IN");
  };

  const getAccessReasonLabel = (user) => {
    const access = user.premiumAccess || {};

    if (!access.reason) return "-";

    const priority = access.accessPriority
      ? accessPriorityLabels[access.accessPriority] || `Priority ${access.accessPriority}`
      : "";

    return priority ? `${access.reason} (${priority})` : access.reason;
  };

  const actionDisabled = useMemo(() => Boolean(actionLoadingId), [actionLoadingId]);

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>User Access Management</h2>
            <p>Grant, remove, block, trial, lifetime and override premium access.</p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            placeholder="Search by name, email or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadUsers();
            }}
          />

          <select
            className={styles.searchInput}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {filters.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>

          <button type="button" className={styles.primaryBtn} onClick={loadUsers}>
            Search
          </button>
        </div>

        {loading && <div className={styles.stateBox}>Loading users...</div>}
        {error && <div className={styles.errorBox}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Access Reason</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const access = user.premiumAccess || {};

                  return (
                    <tr key={user._id}>
                      <td>
                        <strong>{user.name || "-"}</strong>
                        <br />
                        <span>{user.email || user.phone || "-"}</span>
                      </td>

                      <td>
                        {user.blocked ? (
                          <span className={styles.errorBadge}>Blocked</span>
                        ) : access.hasAccess ? (
                          <span className={styles.successBadge}>Active</span>
                        ) : (
                          <span className={styles.mutedBadge}>No Access</span>
                        )}
                      </td>

                      <td>{access.source || user.accessSource || "-"}</td>

                      <td>
                        <strong>{getAccessReasonLabel(user)}</strong>
                        <br />
                        <span>
                          Feature allowed:{" "}
                          {access.featureAllowed === false ? "No" : "Yes / Not checked"}
                        </span>
                      </td>

                      <td>{formatDate(access.expiresAt || user.premiumExpiresAt)}</td>

                      <td>
                        <div className={styles.actionGroup}>
                          <button
                            className={styles.primaryBtn}
                            disabled={actionDisabled}
                            onClick={() =>
                              runAction(user, "grant-premium", {
                                planType: "monthly",
                                days: 30,
                              })
                            }
                          >
                            Grant
                          </button>

                          <button
                            className={styles.secondaryBtn}
                            disabled={actionDisabled}
                            onClick={() =>
                              runAction(user, "extend-premium", {
                                days: 30,
                              })
                            }
                          >
                            Extend
                          </button>

                          <button
                            className={styles.secondaryBtn}
                            disabled={actionDisabled}
                            onClick={() => runAction(user, "start-trial", { days: 7 })}
                          >
                            Trial
                          </button>

                          <button
                            className={styles.secondaryBtn}
                            disabled={actionDisabled}
                            onClick={() => runAction(user, "lifetime")}
                          >
                            Lifetime
                          </button>

                          <button
                            className={styles.secondaryBtn}
                            disabled={actionDisabled}
                            onClick={() => runAction(user, "enable-override")}
                          >
                            Override
                          </button>

                          <button
                            className={styles.dangerBtn}
                            disabled={actionDisabled}
                            onClick={() => runAction(user, "remove-premium")}
                          >
                            Remove
                          </button>

                          {user.blocked ? (
                            <button
                              className={styles.secondaryBtn}
                              disabled={actionDisabled}
                              onClick={() => runAction(user, "unblock")}
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              className={styles.dangerBtn}
                              disabled={actionDisabled}
                              onClick={() => runAction(user, "block")}
                            >
                              Block
                            </button>
                          )}

                          <button
                            className={styles.dangerBtn}
                            disabled={actionDisabled}
                            onClick={() => runAction(user, "force-logout")}
                          >
                            Logout
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {users.length === 0 && (
                  <tr>
                    <td colSpan="6" className={styles.emptyCell}>
                      No users found.
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

export default UserAccessManager;