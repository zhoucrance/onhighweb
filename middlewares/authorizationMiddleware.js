const roleLevels = {
  SUPER_ADMIN: 100,
  COMPANY_ADMIN: 70,
  STAFF: 30,
};

const modulePermissions = [
  "dashboard",
  "buses",
  "service_fee",
  "routes",
  "trips",
  "users",
  "booking_management",
  "seats",
];

const normalizeRole = (user = {}) => {
  const role = String(user.role || "").trim().toUpperCase();
  if (["SUPER_ADMIN", "SUPERADMIN", "ADMIN"].includes(role)) return "SUPER_ADMIN";
  if (["COMPANY_ADMIN", "COMPANYADMIN"].includes(role)) return "COMPANY_ADMIN";
  if (["STAFF", "USER"].includes(role)) return "STAFF";
  return user.isAdmin ? "SUPER_ADMIN" : "STAFF";
};

const getRoleLevel = (user = {}) => {
  const role = normalizeRole(user);
  const expectedLevel = roleLevels[role] || roleLevels.STAFF;
  const storedLevel = Number(user.roleLevel || 0);
  return Math.max(storedLevel, expectedLevel);
};

const getPermissions = (user = {}) => {
  const role = normalizeRole(user);
  if (role === "SUPER_ADMIN") return modulePermissions;
  if (role === "COMPANY_ADMIN") {
    const companyAdminPermissions = modulePermissions.filter((permission) => permission !== "service_fee");
    return Array.isArray(user.permissions) && user.permissions.length ? user.permissions : companyAdminPermissions;
  }
  if (Array.isArray(user.permissions)) return user.permissions;
  return [];
};

const getIdValue = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const serializeAuthUser = (user) => {
  if (!user) return null;
  const plain = typeof user.toObject === "function" ? user.toObject() : { ...user };
  const role = normalizeRole(plain);
  const roleLevel = getRoleLevel(plain);
  const permissions = getPermissions(plain);
  return {
    ...plain,
    fullName: plain.fullName || plain.name,
    passwordHash: undefined,
    password: undefined,
    role,
    roleLevel,
    permissions,
    isActive: plain.isActive !== false && plain.isBlocked !== true,
    isSuperAdmin: role === "SUPER_ADMIN",
    companyId: plain.companyId || null,
    staffTitle: plain.staffTitle || "",
    assignedBus: plain.assignedBus || null,
    assignedBuses: plain.assignedBuses || [],
  };
};

const getAssignedConductorBusId = (user = {}) => {
  const authUser = serializeAuthUser(user);
  if (authUser?.role === "STAFF" && authUser.staffTitle === "CONDUCTOR") {
    return getIdValue(authUser.assignedBus);
  }
  return "";
};

const getAssignedOfficeBusIds = (user = {}) => {
  const authUser = serializeAuthUser(user);
  if (authUser?.role !== "STAFF" || authUser.staffTitle !== "OFFICE_BOOKING") return [];
  const assignedBuses = Array.isArray(authUser.assignedBuses) ? authUser.assignedBuses : [];
  return assignedBuses.map(getIdValue).filter(Boolean);
};

const hasPermission = (user, permission) => {
  const authUser = serializeAuthUser(user);
  if (!authUser) return false;
  if (authUser.role === "SUPER_ADMIN") return true;
  if (!permission) return true;
  if (authUser.role === "COMPANY_ADMIN" && permission !== "service_fee") return true;
  return (authUser.permissions || []).includes(permission);
};

const requirePermission = (permission) => (req, res, next) => {
  if (hasPermission(req.user, permission)) return next();
  return res.status(403).send({
    message: "Access denied",
    success: false,
  });
};

const requireSuperAdmin = (req, res, next) => {
  const authUser = serializeAuthUser(req.user);
  if (authUser?.role === "SUPER_ADMIN") return next();
  return res.status(403).send({
    message: "Super admin access required",
    success: false,
  });
};

const companyScopeMiddleware = (req, res, next) => {
  const authUser = serializeAuthUser(req.user);
  req.companyFilter = {};
  if (authUser && authUser.role !== "SUPER_ADMIN" && authUser.companyId) {
    req.companyFilter = { companyId: authUser.companyId };
  }
  next();
};

const canManageUser = (manager, targetUser) => {
  const current = serializeAuthUser(manager);
  const target = serializeAuthUser(targetUser);
  if (!current || !target) return false;
  if (getIdValue(current._id) === getIdValue(target._id)) return false;
  if (current.role === "SUPER_ADMIN") return true;
  if (!hasPermission(current, "users")) return false;
  if (getIdValue(current.companyId) !== getIdValue(target.companyId)) return false;
  if (current.roleLevel <= target.roleLevel) return false;
  if (target.role !== "STAFF") return false;
  return !target.createdBy || getIdValue(target.createdBy) === getIdValue(current._id);
};

const filterAssignablePermissions = (creator, requestedPermissions = []) => {
  const authUser = serializeAuthUser(creator);
  const requested = Array.isArray(requestedPermissions) ? requestedPermissions : [];
  if (authUser?.role === "SUPER_ADMIN") return requested;
  const allowed = new Set(getPermissions(authUser).filter((permission) => permission !== "service_fee"));
  return requested.filter((permission) => allowed.has(permission));
};

module.exports = {
  roleLevels,
  modulePermissions,
  normalizeRole,
  getRoleLevel,
  getIdValue,
  getPermissions,
  getAssignedConductorBusId,
  getAssignedOfficeBusIds,
  serializeAuthUser,
  hasPermission,
  requirePermission,
  requireSuperAdmin,
  companyScopeMiddleware,
  canManageUser,
  filterAssignablePermissions,
};
