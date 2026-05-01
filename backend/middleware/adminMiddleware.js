export const adminMiddleware = (req, res, next) => {
  const role = req.user?.role;

  if (!req.user || !role) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (!["admin", "superadmin"].includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Admin access only",
    });
  }

  next();
};

export const superAdminMiddleware = (req, res, next) => {
  const role = req.user?.role;

  if (!req.user || !role) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Super admin access only",
    });
  }

  next();
};

export default adminMiddleware;