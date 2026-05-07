import mongoose from "mongoose";
import Payment from "../models/payment.js";
import User from "../models/user.js";
import Tournament from "../models/tournament.js";
import EntryRow from "../models/entryRow.js";
import logger from "../utils/logger.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

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
    isProfileComplete: user.isProfileComplete === undefined ? true : Boolean(user.isProfileComplete),
    isSuspended: Boolean(user.isSuspended),
    suspendedAt: user.suspendedAt || null,
    suspendedBy: user.suspendedBy || null,
    suspensionReason: user.suspensionReason || "",
    isDeleted: Boolean(user.isDeleted),
    deletedAt: user.deletedAt || null,
    deletedBy: user.deletedBy || null,
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};

const getEntryCount = (tournament) => {
  if (!tournament) return 0;
  return Number(tournament.entriesCount || tournament._entryRowsCount || 0);
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
    isDeleted: Boolean(tournament.isDeleted),
    deletedAt: tournament.deletedAt || null,
    deletedBy: tournament.deletedBy || null,
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

const assertNotSelfOrSuperadmin = async ({ targetUserId, currentUserId, action }) => {
  if (String(targetUserId) === String(currentUserId)) {
    return {
      allowed: false,
      status: 400,
      message: `You cannot ${action} your own superadmin account`,
    };
  }

  const targetUser = await User.findById(targetUserId).setOptions({ includeDeleted: true });

  if (!targetUser) {
    return {
      allowed: false,
      status: 404,
      message: "User not found",
    };
  }

  if (targetUser.role === "superadmin") {
    return {
      allowed: false,
      status: 403,
      message: `You cannot ${action} another superadmin account`,
    };
  }

  return {
    allowed: true,
    targetUser,
  };
};

export const getAdminDashboard = async (req, res) => {
  try {
    const [totalUsers, totalTournaments, recentUsers, recentTournaments] =
      await Promise.all([
        User.countDocuments({ isDeleted: { $ne: true } }),
        Tournament.countDocuments({ isDeleted: { $ne: true } }),
    
        User.find({ isDeleted: { $ne: true } })
          .select("-password -refreshTokens -weightPresets -resetPasswordToken -resetPasswordExpire -googleId -facebookId")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
        Tournament.find({})
  .select("tournamentName organizer createdBy teamPayments createdAt updatedAt entryFees foodAndLodging isDeleted deletedAt")
  .populate("createdBy", "name email phone role createdAt isSuspended isDeleted")
  .sort({ createdAt: -1 })
  .limit(8)
  .lean(),
      ]);

  const totalEntries = await EntryRow.countDocuments({});

   const paymentStats = await Payment.aggregate([
  {
    $match: {
      status: "paid",
    },
  },
  {
    $group: {
      _id: null,
      totalRevenue: { $sum: "$amount" },
      totalPaidUsers: { $addToSet: "$userId" },
    },
  },
  {
    $project: {
      _id: 0,
      totalRevenue: 1,
      totalPaidUsers: { $size: "$totalPaidUsers" },
    },
  },
]);

const totalRevenue = paymentStats?.[0]?.totalRevenue || 0;
const totalPaidUsers = paymentStats?.[0]?.totalPaidUsers || 0;

const monthlyRevenue = await Payment.aggregate([
  {
    $match: {
      status: "paid",
      createdAt: {
        $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)),
      },
    },
  },
  {
    $group: {
      _id: {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      },
      amount: { $sum: "$amount" },
    },
  },
  {
    $sort: {
      "_id.year": 1,
      "_id.month": 1,
    },
  },
  {
    $project: {
      _id: 0,
      month: {
        $concat: [
          { $toString: "$_id.year" },
          "-",
          {
            $cond: [
              { $lt: ["$_id.month", 10] },
              { $concat: ["0", { $toString: "$_id.month" }] },
              { $toString: "$_id.month" },
            ],
          },
        ],
      },
      amount: 1,
    },
  },
]);

const recentRazorpayPayments = await Payment.find({ status: "paid" })
  .populate("userId", "name email phone role isSuspended isDeleted")
  .populate("tournamentId", "tournamentName organizer dateFrom dateTo")
  .sort({ createdAt: -1 })
  .limit(8)
  .lean();

const recentPayments = recentRazorpayPayments.map((payment) => ({
  _id: payment._id,
  id: payment._id,
  source: "razorpay",
  user: payment.userId
    ? {
        _id: payment.userId._id,
        id: payment.userId._id,
        name: payment.userId.name || "",
        email: payment.userId.email || null,
        phone: payment.userId.phone || null,
        role: payment.userId.role || "player",
        isSuspended: Boolean(payment.userId.isSuspended),
        isDeleted: Boolean(payment.userId.isDeleted),
      }
    : null,
  tournament: payment.tournamentId
    ? {
        _id: payment.tournamentId._id,
        id: payment.tournamentId._id,
        tournamentName: payment.tournamentId.tournamentName || "",
        organizer: payment.tournamentId.organizer || "",
        dateFrom: payment.tournamentId.dateFrom || null,
        dateTo: payment.tournamentId.dateTo || null,
      }
    : null,
  tournamentId: payment.tournamentId?._id || payment.tournamentId || null,
  planType: payment.planType,
  amount: Number(payment.amount || 0),
  currency: payment.currency || "INR",
  status: payment.status,
  accessType: payment.accessType,
  razorpayOrderId: payment.razorpayOrderId || "",
  razorpayPaymentId: payment.razorpayPaymentId || "",
  createdAt: payment.createdAt || null,
  updatedAt: payment.updatedAt || null,
}));

    return res.json({
      success: true,
      data: {
        totalUsers,
        totalTournaments,
        totalEntries,
        totalPaidUsers,
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

    const filter = {
      isDeleted: { $ne: true },
      ...(searchRegex
        ? {
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { role: searchRegex },
            ],
          }
        : {}),
    };

    const [users, total, tournaments] = await Promise.all([
      User.find(filter)
        .select("-password -refreshTokens -weightPresets -resetPasswordToken -resetPasswordExpire -googleId -facebookId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
     Tournament.find({})
  .select("createdBy teamPayments")
  .lean(),
    ]);

    const entryCountsByTournament = await EntryRow.aggregate([
  {
    $group: {
      _id: "$tournamentId",
      count: { $sum: 1 },
    },
  },
]);

const entryCountMap = new Map(
  entryCountsByTournament.map((item) => [String(item._id), item.count])
);

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
      current.totalEntries += entryCountMap.get(String(tournament._id)) || 0;
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
      User.findOne({ _id: userId, isDeleted: { $ne: true } })
        .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpire -googleId -facebookId")
        .lean(),
      Tournament.find({ createdBy: userId })
        .populate("createdBy", "name email phone role createdAt isSuspended isDeleted")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const tournamentIds = tournaments.map((t) => t._id);

const entryRows = await EntryRow.find({
  tournamentId: { $in: tournamentIds },
})
  .sort({ tournamentId: 1, srNo: 1, createdAt: 1 })
  .lean();

const entryRowsByTournament = new Map();

entryRows.forEach((row) => {
  const key = String(row.tournamentId);
  if (!entryRowsByTournament.has(key)) entryRowsByTournament.set(key, []);
  entryRowsByTournament.get(key).push(row);
});

    const payments = tournaments.flatMap((tournament) => getTeamPaymentRows(tournament));
    const totalAmountPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalEntries = entryRows.length;

    return res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        tournaments: tournaments.map(formatTournamentListItem),
      entries: tournaments.flatMap((tournament) =>
  (entryRowsByTournament.get(String(tournament._id)) || []).map((entry, index) => ({
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



export const suspendAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const check = await assertNotSelfOrSuperadmin({
      targetUserId: userId,
      currentUserId: req.user._id,
      action: "suspend",
    });

    if (!check.allowed) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const reason = String(req.body?.reason || "").trim();

    check.targetUser.isSuspended = true;
    check.targetUser.suspendedAt = new Date();
    check.targetUser.suspendedBy = req.user._id;
    check.targetUser.suspensionReason = reason;
    check.targetUser.refreshTokens = [];

    await check.targetUser.save({ validateBeforeSave: false });

    logger.info("User suspended by superadmin", {
      targetUserId: check.targetUser._id,
      superadminId: req.user._id,
      reason,
    });

    return res.json({
      success: true,
      message: "User suspended successfully",
      data: sanitizeUser(check.targetUser),
    });
  } catch (error) {
    logger.error("Suspend user failed", { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: "Failed to suspend user" });
  }
};

export const unsuspendAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({
        success: false,
        message: "You cannot modify another superadmin account",
      });
    }

    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspendedBy = null;
    user.suspensionReason = "";

    await user.save({ validateBeforeSave: false });

    logger.info("User unsuspended by superadmin", {
      targetUserId: user._id,
      superadminId: req.user._id,
    });

    return res.json({
      success: true,
      message: "User unsuspended successfully",
      data: sanitizeUser(user),
    });
  } catch (error) {
    logger.error("Unsuspend user failed", { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: "Failed to unsuspend user" });
  }
};

export const deleteAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const check = await assertNotSelfOrSuperadmin({
      targetUserId: userId,
      currentUserId: req.user._id,
      action: "delete",
    });

    if (!check.allowed) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    check.targetUser.isDeleted = true;
    check.targetUser.deletedAt = new Date();
    check.targetUser.deletedBy = req.user._id;
    check.targetUser.isSuspended = true;
    check.targetUser.suspendedAt = check.targetUser.suspendedAt || new Date();
    check.targetUser.suspendedBy = req.user._id;
    check.targetUser.suspensionReason =
      check.targetUser.suspensionReason || "Account deleted by superadmin";
    check.targetUser.refreshTokens = [];

    await check.targetUser.save({ validateBeforeSave: false });

    logger.info("User soft deleted by superadmin", {
      targetUserId: check.targetUser._id,
      superadminId: req.user._id,
    });

    return res.json({
      success: true,
      message: "User deleted successfully",
      deletedUserId: check.targetUser._id,
    });
  } catch (error) {
    logger.error("Delete user failed", { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: "Failed to delete user" });
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
        .populate("createdBy", "name email phone role createdAt isSuspended isDeleted")
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
      .populate("createdBy", "name email phone role createdAt isSuspended isDeleted")
      .lean();

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    const payments = getTeamPaymentRows(tournament);

    const entries = await EntryRow.find({ tournamentId })
  .sort({ srNo: 1, createdAt: 1 })
  .lean();

    return res.json({
      success: true,
      data: {
        tournament: formatTournamentListItem(tournament),
        rawTournament: {
          ...tournament,
          createdBy: sanitizeUser(tournament.createdBy),
        },
        owner: sanitizeUser(tournament.createdBy),
        entries,
        payments,
        summary: {
          entriesCount: entries.length,
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

export const deleteAdminTournament = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    if (!isValidObjectId(tournamentId)) {
      return res.status(400).json({ success: false, message: "Invalid tournament id" });
    }

    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).json({ success: false, message: "Tournament not found" });
    }

    tournament.isDeleted = true;
    tournament.deletedAt = new Date();
    tournament.deletedBy = req.user._id;
    tournament.visibility = false;

    await tournament.save({ validateBeforeSave: false });

    logger.info("Tournament soft deleted by superadmin", {
      tournamentId: tournament._id,
      superadminId: req.user._id,
    });

    return res.json({
      success: true,
      message: "Tournament deleted successfully",
      deletedTournamentId: tournament._id,
    });
  } catch (error) {
    logger.error("Delete tournament failed", { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, message: "Failed to delete tournament" });
  }
};

export const getAdminPayments = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const searchRegex = buildSearchRegex(req.query.search);

    const filter = {};

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    if (req.query.planType) {
      filter.planType = String(req.query.planType).trim();
    }

    const query = Payment.find(filter)
      .populate("userId", "name email phone role isSuspended isDeleted")
      .populate("tournamentId", "tournamentName organizer dateFrom dateTo")
      .sort({ createdAt: -1 });

    const payments = await query.lean();

    let rows = payments.map((payment) => ({
      _id: payment._id,
      id: payment._id,
      source: "razorpay",
      user: payment.userId
        ? {
            _id: payment.userId._id,
            id: payment.userId._id,
            name: payment.userId.name || "",
            email: payment.userId.email || null,
            phone: payment.userId.phone || null,
            role: payment.userId.role || "player",
            isSuspended: Boolean(payment.userId.isSuspended),
            isDeleted: Boolean(payment.userId.isDeleted),
          }
        : null,
      tournament: payment.tournamentId
        ? {
            _id: payment.tournamentId._id,
            id: payment.tournamentId._id,
            tournamentName: payment.tournamentId.tournamentName || "",
            organizer: payment.tournamentId.organizer || "",
            dateFrom: payment.tournamentId.dateFrom || null,
            dateTo: payment.tournamentId.dateTo || null,
          }
        : null,
      tournamentId: payment.tournamentId?._id || payment.tournamentId || null,
      planType: payment.planType,
      amount: Number(payment.amount || 0),
      currency: payment.currency || "INR",
      status: payment.status,
      accessType: payment.accessType,
      razorpayOrderId: payment.razorpayOrderId || "",
      razorpayPaymentId: payment.razorpayPaymentId || "",
      accessStartsAt: payment.accessStartsAt || null,
      accessExpiresAt: payment.accessExpiresAt || null,
      createdAt: payment.createdAt || null,
      updatedAt: payment.updatedAt || null,
    }));

    if (searchRegex) {
      rows = rows.filter((row) => {
        const text = [
          row.user?.name,
          row.user?.email,
          row.user?.phone,
          row.tournament?.tournamentName,
          row.tournament?.organizer,
          row.planType,
          row.status,
          row.accessType,
          row.razorpayOrderId,
          row.razorpayPaymentId,
          row.currency,
          String(row.amount),
        ]
          .filter(Boolean)
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
    logger.error("Admin Razorpay payments failed", {
      error: error.message,
      stack: error.stack,
      adminId: req.user?._id,
    });

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

    const match = {};

    if (searchRegex) {
      match.$or = [
        { name: searchRegex },
        { team: searchRegex },
        { gender: searchRegex },
        { event: searchRegex },
        { subEvent: searchRegex },
        { ageCategory: searchRegex },
        { weightCategory: searchRegex },
        { medal: searchRegex },
      ];
    }

    const [rows, total] = await Promise.all([
      EntryRow.find(match)
        .populate({
          path: "tournamentId",
          select: "tournamentName organizer createdBy createdAt",
          populate: {
            path: "createdBy",
            select: "name email phone role createdAt isSuspended isDeleted",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EntryRow.countDocuments(match),
    ]);

    const data = rows.map((row, index) => {
      const tournament = row.tournamentId || {};

      return {
        ...row,
        _id: row._id,
        _rowIndex: skip + index + 1,
        tournamentId: tournament._id || row.tournamentId,
        tournamentName: tournament.tournamentName || "",
        organizer: tournament.organizer || "",
        owner: sanitizeUser(tournament.createdBy),
        createdAt: row.createdAt,
      };
    });

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