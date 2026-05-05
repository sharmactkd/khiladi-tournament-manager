import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteAdminUser,
  getAdminUserDetails,
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

const AdminUserDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const isSuperadmin = currentUser?.role === "superadmin";

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminUserDetails(userId);
      setDetails(res.data || null);
    } catch (err) {
      setError(err.message || "Failed to load user details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const targetUser = details?.user;

  const canManageUser = () => {
    if (!isSuperadmin) return false;
    if (!targetUser?._id) return false;
    if (String(targetUser._id) === String(currentUser?.id || currentUser?._id)) {
      return false;
    }
    if (targetUser.role === "superadmin") return false;
    if (targetUser.isDeleted) return false;
    return true;
  };

  const openTournament = (tournament) => {
    if (tournament?._id) navigate(`/tournaments/${tournament._id}`);
  };

  const handleSuspend = async () => {
    if (!canManageUser()) return;

    const reason = window.prompt(
      `Reason for suspending ${targetUser.name || targetUser.email || "this user"}?`,
      targetUser.suspensionReason || ""
    );

    if (reason === null) return;

    try {
      setActionLoading(true);
      await suspendAdminUser(targetUser._id, reason);
      await loadDetails();
    } catch (err) {
      alert(err.message || "Failed to suspend user");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!canManageUser()) return;

    if (
      !window.confirm(
        `Unsuspend ${targetUser.name || targetUser.email || "this user"}?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      await unsuspendAdminUser(targetUser._id);
      await loadDetails();
    } catch (err) {
      alert(err.message || "Failed to unsuspend user");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!canManageUser()) return;

    const label = targetUser.name || targetUser.email || "this user";

    if (
      !window.confirm(
        `Delete ${label}? This will soft-delete the account and revoke all active sessions.`
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      await deleteAdminUser(targetUser._id);
      navigate("/admin/users", { replace: true });
    } catch (err) {
      alert(err.message || "Failed to delete user");
      setActionLoading(false);
    }
  };

  if (loading) return <div className={styles.stateBox}>Loading user details...</div>;
  if (error) return <div className={styles.errorBox}>{error}</div>;
  if (!details) return <div className={styles.stateBox}>User not found.</div>;

  return (
    <div className={styles.pageStack}>
      <section className={styles.profilePanel}>
        <div>
          <span className={styles.kicker}>User Profile</span>
          <h2>{details.user?.name || "-"}</h2>
          <p>{details.user?.email || details.user?.phone || "-"}</p>
          {details.user?.isSuspended && (
            <p style={{ color: "#b45309", marginTop: 8 }}>
              Suspended: {details.user?.suspensionReason || "No reason provided"}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className={styles.roleBadge}>{details.user?.role}</span>
          <span className={details.user?.isSuspended ? styles.mutedBadge : styles.successBadge}>
            {getStatusLabel(details.user)}
          </span>

          {canManageUser() && details.user?.isSuspended ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={actionLoading}
              onClick={handleUnsuspend}
            >
              {actionLoading ? "Working..." : "Unsuspend"}
            </button>
          ) : canManageUser() ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={actionLoading}
              onClick={handleSuspend}
            >
              {actionLoading ? "Working..." : "Suspend"}
            </button>
          ) : null}

          {canManageUser() && (
            <button
              type="button"
              className={styles.dangerBtn || styles.secondaryBtn}
              disabled={actionLoading}
              onClick={handleDelete}
              style={{ color: "#b91c1c" }}
            >
              Delete
            </button>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Account Status</h2>
        </div>
        <div className={styles.detailGrid}>
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(details.user)}</strong>
          </div>
          <div>
            <span>Login Provider</span>
            <strong>{details.user?.loginProvider || "-"}</strong>
          </div>
          <div>
            <span>Suspended At</span>
            <strong>{formatDate(details.user?.suspendedAt)}</strong>
          </div>
          <div>
            <span>Deleted At</span>
            <strong>{formatDate(details.user?.deletedAt)}</strong>
          </div>
        </div>
      </section>

      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span>Tournaments</span>
          <strong>{details.summary?.totalTournaments || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Entries</span>
          <strong>{details.summary?.totalEntries || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Payments</span>
          <strong>{details.summary?.totalPayments || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Total Paid</span>
          <strong>{formatCurrency(details.summary?.totalAmountPaid)}</strong>
        </article>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Tournaments Created</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Organizer</th>
                <th>Entries</th>
                <th>Collected</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(details.tournaments || []).map((tournament) => (
                <tr
                  key={tournament._id}
                  className={styles.clickableRow}
                  onClick={() => openTournament(tournament)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTournament(tournament);
                    }
                  }}
                >
                  <td>{tournament.tournamentName || "-"}</td>
                  <td>{tournament.organizer || "-"}</td>
                  <td>{tournament.entriesCount || 0}</td>
                  <td>{formatCurrency(tournament.totalCollected)}</td>
                  <td>{formatDate(tournament.createdAt)}</td>
                </tr>
              ))}
              {(!details.tournaments || details.tournaments.length === 0) && (
                <tr>
                  <td colSpan="5" className={styles.emptyCell}>
                    No tournaments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Payments</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Team</th>
                <th>Tournament</th>
                <th>Mode</th>
                <th>Amount</th>
                <th>Txn ID</th>
              </tr>
            </thead>
            <tbody>
              {(details.payments || []).map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.teamName || "-"}</td>
                  <td>{payment.tournament?.tournamentName || "-"}</td>
                  <td>{payment.mode || "-"}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.txnId || "-"}</td>
                </tr>
              ))}
              {(!details.payments || details.payments.length === 0) && (
                <tr>
                  <td colSpan="5" className={styles.emptyCell}>
                    No payment records found.
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

export default AdminUserDetails;