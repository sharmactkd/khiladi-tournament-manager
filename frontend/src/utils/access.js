export const isAdminUser = (user) =>
  ['admin', 'superadmin'].includes(user?.role);

export const canAccessPremium = (user, tournament) => {
  if (!user) return false;

  // ✅ ADMIN ALWAYS BYPASS
  if (isAdminUser(user)) return true;

  // 👇 tumhara existing paid logic
  if (tournament?.isPaidUser) return true;

  return false;
};