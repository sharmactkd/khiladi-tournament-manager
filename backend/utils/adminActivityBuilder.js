import mongoose from "mongoose";
import ActivityLog from "../models/activityLog.js";

const toId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const safeNumber = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const getTeamPaymentAmount = (payment = {}) =>
  safeNumber(payment.cash) + safeNumber(payment.online) + safeNumber(payment.amount);

export const buildTimelineItem = ({
  id,
  type,
  module,
  action,
  title,
  description = "",
  tournament = null,
  metadata = {},
  createdAt,
  source = "derived",
}) => ({
  id: String(id || `${source}-${action}-${createdAt || Date.now()}`),
  type: type || action,
  module: module || "system",
  action,
  title: title || action,
  description,
  tournament,
  metadata: metadata || {},
  createdAt: createdAt || null,
  source,
});

export const getTeamPaymentRowsFromTournament = (tournament) => {
  if (!tournament?.teamPayments) return [];

  const entries =
    tournament.teamPayments instanceof Map
      ? Array.from(tournament.teamPayments.entries())
      : Object.entries(tournament.teamPayments || {});

  return entries.map(([teamName, payment]) => ({
    _id: `${toId(tournament)}-${teamName}`,
    source: "teamPayments",
    tournament: {
      _id: tournament._id,
      tournamentName: tournament.tournamentName || "",
    },
    user: tournament.createdBy || null,
    teamName,
    foodMembers: safeNumber(payment?.foodMembers),
    mode: payment?.mode || "Cash",
    cash: safeNumber(payment?.cash),
    online: safeNumber(payment?.online),
    amount: safeNumber(payment?.cash) + safeNumber(payment?.online),
    status:
      safeNumber(payment?.cash) + safeNumber(payment?.online) > 0
        ? "paid"
        : "unpaid",
    txnId: payment?.txnId || "",
    createdAt: tournament.updatedAt || tournament.createdAt || null,
  }));
};

export const buildDerivedActivities = ({
  user = null,
  tournaments = [],
  entryDocs = [],
  payments = [],
  teamSubmissions = [],
} = {}) => {
  const activities = [];
  const userId = toId(user);

  if (user?.createdAt) {
    activities.push(
      buildTimelineItem({
        id: `derived-user-created-${userId}`,
        type: "account",
        module: "auth",
        action: "USER_CREATED",
        title: "Account created",
        description: `${user.name || "User"} account was created.`,
        metadata: {
          role: user.role || "",
          loginProvider: user.loginProvider || "email",
        },
        createdAt: user.createdAt,
        source: "derived",
      })
    );
  }

  if (user?.lastLogin) {
    activities.push(
      buildTimelineItem({
        id: `derived-last-login-${userId}`,
        type: "auth",
        module: "auth",
        action: "USER_LOGIN",
        title: "Last login",
        description: `${user.name || "User"} logged in using ${
          user.loginProvider || "email"
        }.`,
        metadata: {
          loginProvider: user.loginProvider || "email",
        },
        createdAt: user.lastLogin,
        source: "derived",
      })
    );
  }

  tournaments.forEach((tournament) => {
    const tournamentInfo = {
      _id: tournament._id,
      tournamentName: tournament.tournamentName || "",
    };

    if (tournament.createdAt) {
      activities.push(
        buildTimelineItem({
          id: `derived-tournament-created-${toId(tournament)}`,
          type: "tournament",
          module: "tournament",
          action: "TOURNAMENT_CREATED",
          title: "Tournament created",
          description: `${tournament.tournamentName || "Tournament"} was created.`,
          tournament: tournamentInfo,
          metadata: {
            organizer: tournament.organizer || "",
            federation: tournament.federation || "",
            dateFrom: tournament.dateFrom || null,
            dateTo: tournament.dateTo || null,
          },
          createdAt: tournament.createdAt,
          source: "derived",
        })
      );
    }

    if (
      tournament.updatedAt &&
      tournament.createdAt &&
      String(tournament.updatedAt) !== String(tournament.createdAt)
    ) {
      activities.push(
        buildTimelineItem({
          id: `derived-tournament-updated-${toId(tournament)}`,
          type: "tournament",
          module: "tournament",
          action: "TOURNAMENT_UPDATED",
          title: "Tournament updated",
          description: `${tournament.tournamentName || "Tournament"} was updated.`,
          tournament: tournamentInfo,
          metadata: {
            organizer: tournament.organizer || "",
            federation: tournament.federation || "",
          },
          createdAt: tournament.updatedAt,
          source: "derived",
        })
      );
    }

    if (tournament?.tiesheet?.outcomesUpdatedAt) {
      activities.push(
        buildTimelineItem({
          id: `derived-tiesheet-outcomes-${toId(tournament)}`,
          type: "result",
          module: "tiesheet",
          action: "TIESHEET_UPDATED",
          title: "TieSheet results updated",
          description: `TieSheet outcomes were updated for ${
            tournament.tournamentName || "Tournament"
          }.`,
          tournament: tournamentInfo,
          metadata: {
            outcomesUpdatedAt: tournament.tiesheet.outcomesUpdatedAt,
          },
          createdAt: tournament.tiesheet.outcomesUpdatedAt,
          source: "derived",
        })
      );
    }

    if (Array.isArray(tournament.officials) && tournament.officials.length > 0) {
      activities.push(
        buildTimelineItem({
          id: `derived-officials-${toId(tournament)}`,
          type: "official",
          module: "official",
          action: "OFFICIALS_UPDATED",
          title: "Officials added/updated",
          description: `${tournament.officials.length} officials available for ${
            tournament.tournamentName || "Tournament"
          }.`,
          tournament: tournamentInfo,
          metadata: {
            officialsCount: tournament.officials.length,
          },
          createdAt: tournament.updatedAt || tournament.createdAt,
          source: "derived",
        })
      );
    }
  });

  entryDocs.forEach((entryDoc) => {
    const tournamentId = toId(entryDoc.tournamentId);
    const tournament = tournaments.find((t) => toId(t) === tournamentId);
    const entriesCount = Array.isArray(entryDoc.entries)
      ? entryDoc.entries.length
      : 0;

    if (entriesCount > 0) {
      activities.push(
        buildTimelineItem({
          id: `derived-entries-${toId(entryDoc)}`,
          type: "entry",
          module: "entry",
          action: "ENTRIES_SAVED",
          title: "Entries saved",
          description: `${entriesCount} entries saved in ${
            tournament?.tournamentName || "Tournament"
          }.`,
          tournament: {
            _id: tournament?._id || entryDoc.tournamentId,
            tournamentName: tournament?.tournamentName || "",
          },
          metadata: {
            entriesCount,
            updatedBy: entryDoc.updatedBy || null,
          },
          createdAt: entryDoc.updatedAt || entryDoc.createdAt,
          source: "derived",
        })
      );
    }
  });

  payments.forEach((payment) => {
    const amount = getTeamPaymentAmount(payment);

    activities.push(
      buildTimelineItem({
        id: `derived-payment-${payment._id || `${payment.teamName}-${payment.createdAt}`}`,
        type: "payment",
        module: "payment",
        action: "PAYMENT_UPDATED",
        title: amount > 0 ? "Payment recorded" : "Payment row updated",
        description: `${payment.teamName || "Team"} payment updated${
          amount > 0 ? `: ₹${amount}` : ""
        }.`,
        tournament: payment.tournament || null,
        metadata: {
          teamName: payment.teamName || "",
          mode: payment.mode || "",
          cash: safeNumber(payment.cash),
          online: safeNumber(payment.online),
          amount,
          txnId: payment.txnId || "",
          status: payment.status || "",
        },
        createdAt: payment.createdAt || null,
        source: "derived",
      })
    );
  });

  teamSubmissions.forEach((submission) => {
    const status = String(submission.status || "").toLowerCase();
    const action =
      status === "approved"
        ? "TEAM_SUBMISSION_APPROVED"
        : status === "rejected"
          ? "TEAM_SUBMISSION_REJECTED"
          : "TEAM_SUBMISSION_CREATED";

    activities.push(
      buildTimelineItem({
        id: `derived-team-submission-${toId(submission)}-${status || "submitted"}`,
        type: "teamSubmission",
        module: "teamSubmission",
        action,
        title:
          status === "approved"
            ? "Team submission approved"
            : status === "rejected"
              ? "Team submission rejected"
              : "Team submission created",
        description: `${submission.teamName || "Team"} submission ${
          status || "submitted"
        }.`,
        tournament: {
          _id: submission.tournamentId,
          tournamentName: submission.tournamentName || "",
        },
        metadata: {
          teamName: submission.teamName || "",
          playersCount: Array.isArray(submission.players)
            ? submission.players.length
            : 0,
          status: submission.status || "",
          reviewedBy: submission.reviewedBy || null,
          rejectionReason: submission.rejectionReason || "",
        },
        createdAt:
          submission.reviewedAt ||
          submission.updatedAt ||
          submission.createdAt ||
          null,
        source: "derived",
      })
    );
  });

  return activities.filter((item) => toDate(item.createdAt));
};

export const getActivityLogsForUser = async ({
  userId,
  tournamentIds = [],
  page = 1,
  limit = 100,
} = {}) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    $or: [
      { user: userId },
      { actor: userId },
      ...(Array.isArray(tournamentIds) && tournamentIds.length
        ? [{ tournament: { $in: tournamentIds } }]
        : []),
    ],
  };

  return ActivityLog.find(filter)
    .populate("tournament", "tournamentName organizer")
    .populate("actor", "name email role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();
};

export const mapActivityLogToTimelineItem = (log) =>
  buildTimelineItem({
    id: log._id,
    type: log.action,
    module: log.module,
    action: log.action,
    title: log.title || log.action,
    description: log.description || "",
    tournament: log.tournament
      ? {
          _id: log.tournament._id || log.tournament,
          tournamentName: log.tournament.tournamentName || "",
          organizer: log.tournament.organizer || "",
        }
      : null,
    metadata: {
      ...(log.metadata || {}),
      actor: log.actor
        ? {
            _id: log.actor._id,
            name: log.actor.name || "",
            email: log.actor.email || "",
            role: log.actor.role || "",
          }
        : null,
      ipAddress: log.ipAddress || "",
    },
    createdAt: log.createdAt,
    source: "activityLog",
  });

export const combineActivityTimeline = ({
  derivedActivities = [],
  activityLogs = [],
} = {}) => {
  const loggedTimeline = activityLogs.map(mapActivityLogToTimelineItem);

  return [...loggedTimeline, ...derivedActivities]
    .filter((item) => toDate(item.createdAt))
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
};

export const buildActivitySummary = ({
  user = null,
  tournaments = [],
  entryDocs = [],
  payments = [],
  activityTimeline = [],
} = {}) => {
  const totalEntries = entryDocs.reduce(
    (sum, doc) => sum + (Array.isArray(doc.entries) ? doc.entries.length : 0),
    0
  );

  const totalRevenue = payments.reduce(
    (sum, payment) => sum + safeNumber(payment.amount),
    0
  );

  const lastTimelineDate = activityTimeline?.[0]?.createdAt || null;

  return {
    totalTournaments: tournaments.length,
    totalEntries,
    totalPayments: payments.length,
    totalRevenue,
    totalActivities: activityTimeline.length,
    lastActiveDate: lastTimelineDate || user?.lastLogin || user?.updatedAt || null,
  };
};

export default {
  buildTimelineItem,
  getTeamPaymentRowsFromTournament,
  buildDerivedActivities,
  getActivityLogsForUser,
  mapActivityLogToTimelineItem,
  combineActivityTimeline,
  buildActivitySummary,
};