export const modulePermissions = [
  "dashboard",
  "buses",
  "service_fee",
  "routes",
  "trips",
  "users",
  "booking_management",
  "seats",
  "help_desk",
];

export const getUserRole = (user) => {
  if (!user) return "";
  const role = String(user.role || "").trim().toUpperCase();
  if (["SUPER_ADMIN", "SUPERADMIN", "ADMIN"].includes(role)) return "SUPER_ADMIN";
  if (["COMPANY_ADMIN", "COMPANYADMIN"].includes(role)) return "COMPANY_ADMIN";
  if (["STAFF", "USER"].includes(role)) return "STAFF";
  return user.isAdmin ? "SUPER_ADMIN" : "STAFF";
};

export const isSuperAdmin = (user) => getUserRole(user) === "SUPER_ADMIN";

export const getUserRoleLevel = (user) => {
  const role = getUserRole(user);
  const expectedLevel = role === "SUPER_ADMIN" ? 100 : role === "COMPANY_ADMIN" ? 70 : 30;
  const storedLevel = Number(user?.roleLevel || 0);
  return Math.max(storedLevel, expectedLevel);
};

export const getUserPermissions = (user) => {
  if (!user) return [];
  const role = getUserRole(user);
  if (role === "SUPER_ADMIN") return modulePermissions;
  if (role === "COMPANY_ADMIN") {
    const companyAdminPermissions = modulePermissions.filter((permission) => permission !== "service_fee");
    return Array.isArray(user.permissions) && user.permissions.length ? user.permissions : companyAdminPermissions;
  }
  if (Array.isArray(user.permissions)) return user.permissions;
  return [];
};

export const hasPermission = (user, permission) => {
  if (!permission) return true;
  if (isSuperAdmin(user)) return true;
  if (getUserRole(user) === "COMPANY_ADMIN" && permission !== "service_fee") return true;
  return getUserPermissions(user).includes(permission);
};
