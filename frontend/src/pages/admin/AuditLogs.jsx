import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";
import styles from "./Admin.module.css";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatAction = (action = "") =>
  String(action || "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/admin/billing/audit-logs");
      setLogs(res.data?.logs || []);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to load audit logs"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const actions = useMemo(() => {
    const unique = new Set(logs.map((log) => log.action).filter(Boolean));
    return ["all", ...Array.from(unique).sort()];
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    const haystack = [
      log.action,
      log.adminId?.name,
      log.adminId?.email,
      log.targetUserId?.name,
      log.targetUserId?.email,
      log.ip,
      JSON.stringify(log.details || {}),
    ]
      .join(" ")
      .toLowerCase();

    const searchMatch = !search.trim() || haystack.includes(search.toLowerCase());
    const actionMatch = actionFilter === "all" || log.action === actionFilter;

    return searchMatch && actionMatch;
  });

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Admin Audit Logs</h2>
            <p>Review all billing and access-control actions performed by admins.</p>
          </div>

          <button type="button" className={styles.secondaryBtn} onClick={loadLogs}>
            Refresh
          </button>
        </div>

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search admin, target user, action, IP or details"
          />

          <select
            className={styles.searchInput}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            {actions.map((action) => (
              <option key={action} value={action}>
                {action === "all" ? "ALL ACTIONS" : formatAction(action)}
              </option>
            ))}
          </select>
        </div>

        {loading && <div className={styles.stateBox}>Loading audit logs...</div>}
        {error && <div className={styles.errorBox}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableWrap}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Admin</th>
                  <th>Target User</th>
                  <th>IP</th>
                  <th>Details</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <span className={styles.badge}>{formatAction(log.action)}</span>
                    </td>

                    <td>
                      <strong>{log.adminId?.name || "-"}</strong>
                      <br />
                      <span>{log.adminId?.email || "-"}</span>
                    </td>

                    <td>
                      <strong>{log.targetUserId?.name || "-"}</strong>
                      <br />
                      <span>{log.targetUserId?.email || "-"}</span>
                    </td>

                    <td>{log.ip || "-"}</td>

                    <td>
                      <pre className={styles.metadataBox}>
                        {JSON.stringify(log.details || {}, null, 2)}
                      </pre>
                    </td>

                    <td>{formatDate(log.timestamp || log.createdAt)}</td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan="6" className={styles.emptyCell}>
                      No audit logs found.
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

export default AuditLogs;