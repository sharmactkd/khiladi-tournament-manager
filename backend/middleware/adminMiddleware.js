export const adminMiddleware = (req, res, next) => {
  const role = req.user?.role;

  if (!req.user || !role) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.isDeleted) {
    return res.status(403).json({
      success: false,
      message: "This account has been deleted",
    });
  }

  if (req.user.isSuspended) {
    return res.status(403).json({
      success: false,
      message: "This account has been suspended",
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

  if (req.user.isDeleted) {
    return res.status(403).json({
      success: false,
      message: "This account has been deleted",
    });
  }

  if (req.user.isSuspended) {
    return res.status(403).json({
      success: false,
      message: "This account has been suspended",
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

export const requireAdminPermission = (permission) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (role === "superadmin") {
      return next();
    }

    const permissions = Array.isArray(req.user?.adminPermissions)
      ? req.user.adminPermissions
      : [];

    if (!permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this admin resource",
      });
    }

    next();
  };
};

export default adminMiddleware;