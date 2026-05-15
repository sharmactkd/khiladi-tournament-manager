import React, { useEffect, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const filters = ["all", "premium", "expired", "blocked", "trial", "lifetime"];

const UserAccessManager = () => {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
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
  }, [filter]);

  const runAction = async (userId, action, body = {}) => {
    const ok = window.confirm(`Are you sure you want to ${action.replaceAll("-", " ")}?`);
    if (!ok) return;

    try {
      await api.patch(`/admin/billing/users/${userId}/${action}`, body);
      await loadUsers();
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Action failed");
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-IN");
  };

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
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <strong>{user.name || "-"}</strong>
                      <br />
                      <span>{user.email || user.phone || "-"}</span>
                    </td>

                    <td>
                      {user.blocked ? (
                        <span className={styles.errorBadge}>Blocked</span>
                      ) : user.premiumAccess?.hasAccess ? (
                        <span className={styles.successBadge}>Active</span>
                      ) : (
                        <span className={styles.mutedBadge}>No Access</span>
                      )}
                    </td>

                    <td>{user.premiumAccess?.source || user.accessSource || "-"}</td>
                    <td>{formatDate(user.premiumAccess?.expiresAt || user.premiumExpiresAt)}</td>

                    <td>
                      <div className={styles.actionGroup}>
                        <button
                          className={styles.primaryBtn}
                          onClick={() =>
                            runAction(user._id, "grant-premium", {
                              planType: "monthly",
                              days: 30,
                            })
                          }
                        >
                          Grant
                        </button>

                        <button
                          className={styles.secondaryBtn}
                          onClick={() =>
                            runAction(user._id, "extend-premium", {
                              days: 30,
                            })
                          }
                        >
                          Extend
                        </button>

                        <button
                          className={styles.secondaryBtn}
                          onClick={() => runAction(user._id, "start-trial", { days: 7 })}
                        >
                          Trial
                        </button>

                        <button
                          className={styles.secondaryBtn}
                          onClick={() => runAction(user._id, "lifetime")}
                        >
                          Lifetime
                        </button>

                        <button
                          className={styles.secondaryBtn}
                          onClick={() => runAction(user._id, "enable-override")}
                        >
                          Override
                        </button>

                        <button
                          className={styles.dangerBtn}
                          onClick={() => runAction(user._id, "remove-premium")}
                        >
                          Remove
                        </button>

                        {user.blocked ? (
                          <button
                            className={styles.secondaryBtn}
                            onClick={() => runAction(user._id, "unblock")}
                          >
                            Unblock
                          </button>
                        ) : (
                          <button
                            className={styles.dangerBtn}
                            onClick={() => runAction(user._id, "block")}
                          >
                            Block
                          </button>
                        )}

                        <button
                          className={styles.dangerBtn}
                          onClick={() => runAction(user._id, "force-logout")}
                        >
                          Logout
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan="5" className={styles.emptyCell}>
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