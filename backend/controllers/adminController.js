import mongoose from "mongoose";
import User from "../models/user.js";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const sanitizeUser = (user) => {
  if (!user) return null;

  return {
    _id: user._id,
    id: user._id,
    name: user.name || "",
    email: user.email || null,
    phone: user.phone || null,
    role: user.role || "player",
    loginProvider: user.loginProvider || "email",
    profilePicture: user.profilePicture || null,
    isVerified: Boolean(user.isVerified),
    phoneVerified: Boolean(user.phoneVerified),
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};

const getEntryCount = (tournament) => {
  if (!tournament) return 0;
  return Array.isArray(tournament.entries) ? tournament.entries.length : 0;
};

const getTournamentPaidStatus = (tournament) => {
  const entryAmounts = tournament?.entryFees?.amounts;
  let hasPaidEntryFee = false;

  if (entryAmounts?.kyorugi instanceof Map) {
    for (const fee of entryAmounts.kyorugi.values()) {
      if (fee?.type === "Paid" && Number(fee?.amount || 0) > 0) {
        hasPaidEntryFee = true;
        break;
      }
    }
  } else if (entryAmounts?.kyorugi && typeof entryAmounts.kyorugi === "object") {
    for (const fee of Object.values(entryAmounts.kyorugi)) {
      if (fee?.type === "Paid" && Number(fee?.amount || 0) > 0) {
        hasPaidEntryFee = true;
        break;
      }
    }
  }

  if (!hasPaidEntryFee) {
    if (entryAmounts?.poomsae instanceof Map) {
      for (const fee of entryAmounts.poomsae.values()) {
        if (fee?.type === "Paid" && Number(fee?.amount || 0) > 0) {
          hasPaidEntryFee = true;
          break;
        }
      }
    } else if (entryAmounts?.poomsae && typeof entryAmounts.poomsae === "object") {
      for (const fee of Object.values(entryAmounts.poomsae)) {
        if (fee?.type === "Paid" && Number(fee?.amount || 0) > 0) {
          hasPaidEntryFee = true;
          break;
        }
      }
    }
  }

  const hasFoodPayment =
    tournament?.foodAndLodging?.type === "Paid" &&
    Number(tournament?.foodAndLodging?.amount || 0) > 0;

  const teamPaymentRevenue = getTeamPaymentRevenue(tournament);

  return {
    isPaidTournament: Boolean(hasPaidEntryFee || hasFoodPayment),
    hasCollectedPayment: teamPaymentRevenue > 0,
    totalCollected: teamPaymentRevenue,
  };
};

const getTeamPaymentRevenue = (tournament) => {
  if (!tournament?.teamPayments) return 0;

  let total = 0;

  const values =
    tournament.teamPayments instanceof Map
      ? Array.from(tournament.teamPayments.values())
      : Object.values(tournament.teamPayments || {});

  values.forEach((payment) => {
    total += Number(payment?.cash || 0);
    total += Number(payment?.online || 0);
  });

  return total;
};

const getTeamPaymentRows = (tournament) => {
  if (!tournament?.teamPayments) return [];

  const entries =
    tournament.teamPayments instanceof Map
      ? Array.from(tournament.teamPayments.entries())
      : Object.entries(tournament.teamPayments || {});

  return entries.map(([teamName, payment]) => ({
    _id: `${tournament._id}-${teamName}`,
    source: "teamPayments",
    tournament: {
      _id: tournament._id,
      tournamentName: tournament.tournamentName,
    },
    user: tournament.createdBy || null,
    teamName,
    foodMembers: Number(payment?.foodMembers || 0),
    mode: payment?.mode || "Cash",
    cash: Number(payment?.cash || 0),
    online: Number(payment?.online || 0),
    amount: Number(payment?.cash || 0) + Number(payment?.online || 0),
    status: Number(payment?.cash || 0) + Number(payment?.online || 0) > 0 ? "paid" : "unpaid",
    txnId: payment?.txnId || "",
    createdAt: tournament.updatedAt || tournament.createdAt,
  }));
};

const formatTournamentListItem = (tournament) => {
  const paidStatus = getTournamentPaidStatus(tournament);

  return {
    _id: tournament._id,
    id: tournament._id,
    tournamentName: tournament.tournamentName || "",
    organizer: tournament.organizer || "",
    federation: tournament.federation || "",
    email: tournament.email || null,
    contact: tournament.contact || null,
    dateFrom: tournament.dateFrom || null,
    dateTo: tournament.dateTo || null,
    venue: tournament.venue || null,
    tournamentLevel: tournament.tournamentLevel || null,
    tournamentType: tournament.tournamentType || [],
    createdBy: sanitizeUser(tournament.createdBy),
    entriesCount: getEntryCount(tournament),
    isPaidTournament: paidStatus.isPaidTournament,
    hasCollectedPayment: paidStatus.hasCollectedPayment,
    totalCollected: paidStatus.totalCollected,
    createdAt: tournament.createdAt || null,
    updatedAt: tournament.updatedAt || null,
  };
};

const getPagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildSearchRegex = (search) => {
  const value = String(search || "").trim();
  if (!value) return null;
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

export const getAdminDashboard = async (req, res) => {
  try {
    const [totalUsers, totalTournaments, tournamentsForStats, recentUsers, recentTournaments] =
      await Promise.all([
        User.countDocuments({}),
        Tournament.countDocuments({}),
        Tournament.find({})
          .select("entries teamPayments createdAt updatedAt tournamentName createdBy entryFees foodAndLodging")
          .populate("createdBy", "name email phone role createdAt")
          .sort({ createdAt: -1 })
          .lean(),
        User.find({})
          .select("-password -refreshTokens -weightPresets")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
        Tournament.find({})
          .select("tournamentName organizer createdBy entries teamPayments createdAt updatedAt entryFees foodAndLodging")
          .populate("createdBy", "name email phone role createdAt")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
      ]);

    const totalEntries = tournamentsForStats.reduce(
      (sum, tournament) => sum + getEntryCount(tournament),
      0
    );

    const paymentRows = tournamentsForStats.flatMap((tournament) => getTeamPaymentRows(tournament));
    const paidPaymentRows = paymentRows.filter((payment) => Number(payment.amount || 0) > 0);
    const totalRevenue = paidPaymentRows.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const paidUserIds = new Set(
      paidPaymentRows
        .map((payment) => String(payment.user?._id || payment.user || ""))
        .filter(Boolean)
    );

    const monthlyMap = new Map();
    paidPaymentRows.forEach((payment) => {
      const date = payment.createdAt ? new Date(payment.createdAt) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(payment.amount || 0));
    });

    const monthlyRevenue = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    const recentPayments = paymentRows
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8);

    return res.json({
      success: true,
      data: {
        totalUsers,
        totalTournaments,
        totalEntries,
        totalPaidUsers: paidUserIds.size,
        totalRevenue,
        recentUsers: recentUsers.map(sanitizeUser),
        recentTournaments: recentTournaments.map(formatTournamentListItem),
        recentPayments,
        monthlyRevenue,
      },
    });
  } catch (error) {
    logger.error("Admin dashboard failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load admin dashboard",
    });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const searchRegex = buildSearchRegex(req.query.search);

    const filter = searchRegex
      ? {
          $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }, { role: searchRegex }],
        }
      : {};

    const [users, total, tournaments] = await Promise.all([
      User.find(filter)
        .select("-password -refreshTokens -weightPresets")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
      Tournament.find({})
        .select("createdBy entries teamPayments")
        .lean(),
    ]);

    const statsByUser = new Map();

    tournaments.forEach((tournament) => {
      const userId = String(tournament.createdBy || "");
      if (!userId) return;

      const current = statsByUser.get(userId) || {
        totalTournaments: 0,
        totalEntries: 0,
        totalAmountPaid: 0,
        paidTournamentCount: 0,
      };

      const revenue = getTeamPaymentRevenue(tournament);

      current.totalTournaments += 1;
      current.totalEntries += getEntryCount(tournament);
      current.totalAmountPaid += revenue;
      if (revenue > 0) current.paidTournamentCount += 1;

      statsByUser.set(userId, current);
    });

    const data = users.map((user) => ({
      ...sanitizeUser(user),
      ...(statsByUser.get(String(user._id)) || {
        totalTournaments: 0,
        totalEntries: 0,
        totalAmountPaid: 0,
        paidTournamentCount: 0,
      }),
    }));

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error("Admin users failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load users",
    });
  }
};

export const getAdminUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const [user, tournaments] = await Promise.all([
      User.findById(userId).select("-password -refreshTokens").lean(),
      Tournament.find({ createdBy: userId })
        .populate("createdBy", "name email phone role createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const payments = tournaments.flatMap((tournament) => getTeamPaymentRows(tournament));
    const totalAmountPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalEntries = tournaments.reduce((sum, tournament) => sum + getEntryCount(tournament), 0);

    return res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        tournaments: tournaments.map(formatTournamentListItem),
        entries: tournaments.flatMap((tournament) =>
          (Array.isArray(tournament.entries) ? tournament.entries : []).map((entry, index) => ({
            ...entry,
            _rowIndex: index + 1,
            tournamentId: tournament._id,
            tournamentName: tournament.tournamentName,
          }))
        ),
        payments,
        summary: {
          totalTournaments: tournaments.length,
          totalEntries,
          totalPayments: payments.length,
          totalAmountPaid,
        },
      },
    });
  } catch (error) {
    logger.error("Admin user details failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load user details",
    });
  }
};

export const getAdminTournaments = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const searchRegex = buildSearchRegex(req.query.search);

    const filter = searchRegex
      ? {
          $or: [
            { tournamentName: searchRegex },
            { organizer: searchRegex },
            { federation: searchRegex },
            { email: searchRegex },
            { contact: searchRegex },
            { "venue.name": searchRegex },
            { "venue.state": searchRegex },
            { "venue.district": searchRegex },
          ],
        }
      : {};

    const [tournaments, total] = await Promise.all([
      Tournament.find(filter)
        .populate("createdBy", "name email phone role createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Tournament.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: tournaments.map(formatTournamentListItem),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error("Admin tournaments failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load tournaments",
    });
  }
};

export const getAdminTournamentDetails = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    if (!isValidObjectId(tournamentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament id",
      });
    }

    const tournament = await Tournament.findById(tournamentId)
      .populate("createdBy", "name email phone role createdAt")
      .lean();

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const payments = getTeamPaymentRows(tournament);

    return res.json({
      success: true,
      data: {
        tournament: formatTournamentListItem(tournament),
        rawTournament: {
          ...tournament,
          createdBy: sanitizeUser(tournament.createdBy),
        },
        owner: sanitizeUser(tournament.createdBy),
        entries: Array.isArray(tournament.entries) ? tournament.entries : [],
        payments,
        summary: {
          entriesCount: getEntryCount(tournament),
          totalAmountPaid: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
          totalPaymentRows: payments.length,
        },
      },
    });
  } catch (error) {
    logger.error("Admin tournament details failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load tournament details",
    });
  }
};

export const getAdminPayments = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const searchRegex = buildSearchRegex(req.query.search);

    const tournaments = await Tournament.find({})
      .select("tournamentName organizer createdBy teamPayments createdAt updatedAt")
      .populate("createdBy", "name email phone role createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    let rows = tournaments.flatMap((tournament) => getTeamPaymentRows(tournament));

    if (searchRegex) {
      rows = rows.filter((row) => {
        const text = [
          row.teamName,
          row.mode,
          row.txnId,
          row.status,
          row.tournament?.tournamentName,
          row.user?.name,
          row.user?.email,
          row.user?.phone,
        ]
          .filter(Boolean)
          .join(" ");

        return searchRegex.test(text);
      });
    }

    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = rows.length;
    const data = rows.slice(skip, skip + limit);

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error("Admin payments failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load payments",
    });
  }
};

export const getAdminEntries = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const searchRegex = buildSearchRegex(req.query.search);

    const tournaments = await Tournament.find({})
      .select("tournamentName organizer createdBy entries createdAt")
      .populate("createdBy", "name email phone role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    let rows = tournaments.flatMap((tournament) =>
      (Array.isArray(tournament.entries) ? tournament.entries : []).map((entry, index) => ({
        ...entry,
        _id: `${tournament._id}-${index}`,
        _rowIndex: index + 1,
        tournamentId: tournament._id,
        tournamentName: tournament.tournamentName,
        organizer: tournament.organizer,
        owner: sanitizeUser(tournament.createdBy),
        createdAt: tournament.createdAt,
      }))
    );

    if (searchRegex) {
      rows = rows.filter((row) => {
        const text = Object.values(row)
          .map((value) => {
            if (value === null || value === undefined) return "";
            if (typeof value === "object") return JSON.stringify(value);
            return String(value);
          })
          .join(" ");

        return searchRegex.test(text);
      });
    }

    const total = rows.length;
    const data = rows.slice(skip, skip + limit);

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error("Admin entries failed", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to load entries",
    });
  }
};