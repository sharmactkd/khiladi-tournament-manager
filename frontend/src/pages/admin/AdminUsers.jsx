import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteAdminUser,
  getAdminUsers,
  suspendAdminUser,
  unsuspendAdminUser,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import styles from "./Admin.module.css";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN");
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getStatusLabel = (user) => {
  if (user?.isDeleted) return "Deleted";
  if (user?.isSuspended) return "Suspended";
  return "Active";
};

const getStatusClass = (user) => {
  if (user?.isDeleted) return styles.errorBadge || styles.mutedBadge;
  if (user?.isSuspended) return styles.warningBadge || styles.mutedBadge;
  return styles.successBadge || styles.badge;
};

const AdminUsers = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [error, setError] = useState("");

  const isSuperadmin = currentUser?.role === "superadmin";

  const loadUsers = async (page = 1, searchValue = activeSearch) => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminUsers({ page, limit: 20, search: searchValue });
      setUsers(res.data || []);
      setPagination(res.pagination || { page, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setActiveSearch(search);
    loadUsers(1, search);
  };

  const canManageUser = (targetUser) => {
    if (!isSuperadmin) return false;
    if (!targetUser?._id) return false;
    if (String(targetUser._id) === String(currentUser?.id || currentUser?._id)) {
      return false;
    }
    if (targetUser.role === "superadmin") return false;
    if (targetUser.isDeleted) return false;
    return true;
  };

  const openUser = (targetUser) => {
    if (targetUser?._id) navigate(`/admin/users/${targetUser._id}`);
  };

  const stopRowNavigation = (event) => {
    event.stopPropagation();
  };

  const handleSuspend = async (event, targetUser) => {
    stopRowNavigation(event);
    if (!canManageUser(targetUser)) return;

    const reason = window.prompt(
      `Reason for suspending ${targetUser.name || targetUser.email || "this user"}?`,
      targetUser.suspensionReason || ""
    );

    if (reason === null) return;

    try {
      setActionLoadingId(targetUser._id);
      await suspendAdminUser(targetUser._id, reason);
      await loadUsers(pagination.page, activeSearch);
    } catch (err) {
      alert(err.message || "Failed to suspend user");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleUnsuspend = async (event, targetUser) => {
    stopRowNavigation(event);
    if (!canManageUser(targetUser)) return;

    if (
      !window.confirm(
        `Unsuspend ${targetUser.name || targetUser.email || "this user"}?`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(targetUser._id);
      await unsuspendAdminUser(targetUser._id);
      await loadUsers(pagination.page, activeSearch);
    } catch (err) {
      alert(err.message || "Failed to unsuspend user");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleDelete = async (event, targetUser) => {
    stopRowNavigation(event);
    if (!canManageUser(targetUser)) return;

    const label = targetUser.name || targetUser.email || "this user";

    if (
      !window.confirm(
        `Delete ${label}? This will soft-delete the account and revoke all active sessions.`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(targetUser._id);
      await deleteAdminUser(targetUser._id);
      await loadUsers(pagination.page, activeSearch);
    } catch (err) {
      alert(err.message || "Failed to delete user");
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Users</h2>
            <p>All registered KHILADI users with tournament and payment summary.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className={styles.toolbar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, role..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.primaryBtn}>
            Search
          </button>
        </form>

        {loading ? (
          <div className={styles.stateBox}>Loading users...</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email / Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Tournaments</th>
                    <th>Entries</th>
                    <th>Paid</th>
                    <th>Joined</th>
                    {isSuperadmin && <th>Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((targetUser) => {
                    const manageable = canManageUser(targetUser);
                    const busy = actionLoadingId === targetUser._id;

                    return (
                      <tr
                        key={targetUser._id}
                        className={styles.clickableRow}
                        onClick={() => openUser(targetUser)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openUser(targetUser);
                          }
                        }}
                      >
                        <td>{targetUser.name || "-"}</td>
                        <td>{targetUser.email || targetUser.phone || "-"}</td>
                        <td>
                          <span className={styles.badge}>{targetUser.role}</span>
                        </td>
                        <td>
                          <span className={getStatusClass(targetUser)}>
                            {getStatusLabel(targetUser)}
                          </span>
                        </td>
                        <td>{targetUser.totalTournaments || 0}</td>
                        <td>{targetUser.totalEntries || 0}</td>
                        <td>{formatCurrency(targetUser.totalAmountPaid)}</td>
                        <td>{formatDate(targetUser.createdAt)}</td>

                        {isSuperadmin && (
                          <td onClick={stopRowNavigation}>
                            <div
                              className={styles.actionGroup}
                              onClick={stopRowNavigation}
                              onKeyDown={stopRowNavigation}
                            >
                              {manageable && targetUser.isSuspended ? (
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  disabled={busy}
                                  onClick={(event) =>
                                    handleUnsuspend(event, targetUser)
                                  }
                                >
                                  {busy ? "..." : "Unsuspend"}
                                </button>
                              ) : manageable ? (
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  disabled={busy}
                                  onClick={(event) =>
                                    handleSuspend(event, targetUser)
                                  }
                                >
                                  {busy ? "..." : "Suspend"}
                                </button>
                              ) : null}

                              {manageable && (
                                <button
                                  type="button"
                                  className={styles.dangerBtn}
                                  disabled={busy}
                                  onClick={(event) => handleDelete(event, targetUser)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={isSuperadmin ? 9 : 8}
                        className={styles.emptyCell}
                      >
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadUsers(pagination.page - 1)}
                className={styles.secondaryBtn}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadUsers(pagination.page + 1)}
                className={styles.secondaryBtn}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default AdminUsers;