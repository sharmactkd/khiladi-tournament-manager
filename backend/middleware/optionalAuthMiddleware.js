import jwt from "jsonwebtoken";
import User from "../models/user.js";

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // 👈 no token → allow
    }

    const token = authHeader.split(" ")[1];

    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("_id role");

    if (user) {
      req.user = user; // 👈 attach user
    }

    return next();
  } catch (error) {
    // 👈 IMPORTANT: fail silently
    return next();
  }
};

export default optionalAuthMiddleware;