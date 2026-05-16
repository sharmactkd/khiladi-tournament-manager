import bcrypt from "bcryptjs";
import User from "../models/user.js";

const isReauthDisabled = () =>
  process.env.ADMIN_REAUTH_REQUIRED === "false";

const adminReauthMiddleware = async (req, res, next) => {
  try {
    if (isReauthDisabled()) return next();

    const adminPassword = String(req.body?.adminPassword || "").trim();

    if (!adminPassword) {
      return res.status(401).json({
        success: false,
        message: "Admin password re-authentication is required",
        code: "ADMIN_REAUTH_REQUIRED",
      });
    }

    const admin = await User.findById(req.user?._id).select("+password");

    if (!admin || admin.isDeleted || admin.isSuspended) {
      return res.status(401).json({
        success: false,
        message: "Admin account is not valid",
      });
    }

    if (!["admin", "superadmin"].includes(admin.role)) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    if (!admin.password) {
      return res.status(403).json({
        success: false,
        message:
          "This admin account has no password set. Set a password before using dangerous billing actions.",
      });
    }

    const ok = await bcrypt.compare(adminPassword, admin.password);

    if (!ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin password",
        code: "ADMIN_REAUTH_FAILED",
      });
    }

    delete req.body.adminPassword;
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Admin re-authentication failed",
    });
  }
};

export default adminReauthMiddleware;