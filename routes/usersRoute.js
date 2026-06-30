const router = require("express").Router();
const User = require("../models/usersModel");
const Company = require("../models/companyModel");
const Bus = require("../models/busModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  canManageUser,
  filterAssignablePermissions,
  getIdValue,
  modulePermissions,
  normalizeRole,
  requirePermission,
  roleLevels,
  serializeAuthUser,
} = require("../middlewares/authorizationMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");

const normalizeString = (value) => String(value || "").trim();
const normalizeStaffTitle = (value) => {
  const title = normalizeString(value).toUpperCase();
  if (title === "CONDUCTOR") return "CONDUCTOR";
  if (title === "OFFICE_BOOKING") return "OFFICE_BOOKING";
  if (title === "OTHER") return "OTHER";
  return "";
};

const buildTokenPayload = (user) => {
  const authUser = serializeAuthUser(user);
  return {
    userId: user._id,
    role: authUser.role,
    roleLevel: authUser.roleLevel,
    companyId: authUser.companyId,
    permissions: authUser.permissions,
  };
};

const publicUser = (user, viewer = null) => {
  const data = serializeAuthUser(user);
  const current = serializeAuthUser(viewer);
  if (!data) return null;
  if (current?.role !== "SUPER_ADMIN" && data.roleLevel >= current?.roleLevel) {
    return {
      ...data,
      email: "Restricted",
    };
  }
  return data;
};

const resolveCompanyIdFromName = async (companyName, creator) => {
  const name = normalizeString(companyName);
  if (!name) return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const company = await Company.findOneAndUpdate(
    { companyName: new RegExp(`^${escapedName}$`, "i") },
    {
      $setOnInsert: {
        companyName: name,
        companyStatus: "Active",
        createdBy: creator?._id || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return company._id;
};

const resolveAssignedBusId = async (assignedBus, companyId, creatorUser) => {
  const busId = getIdValue(assignedBus);
  if (!busId) return { assignedBus: null, companyId };

  const bus = await Bus.findById(busId);
  if (!bus) {
    throw new Error("Selected bus was not found.");
  }

  const busCompanyId = getIdValue(bus.companyId);
  const targetCompanyId = getIdValue(companyId);
  if (creatorUser?.role !== "SUPER_ADMIN" && busCompanyId !== getIdValue(creatorUser?.companyId)) {
    throw new Error("Selected bus is not available for your company.");
  }
  if (targetCompanyId && busCompanyId && busCompanyId !== targetCompanyId) {
    throw new Error("Selected bus does not belong to the selected company.");
  }

  return {
    assignedBus: bus._id,
    companyId: companyId || bus.companyId || null,
  };
};

const resolveAssignedBusIds = async (assignedBuses, companyId, creatorUser) => {
  const busIds = [...new Set((Array.isArray(assignedBuses) ? assignedBuses : []).map(getIdValue).filter(Boolean))];
  if (!busIds.length) return { assignedBuses: [], companyId };

  const buses = await Bus.find({ _id: { $in: busIds } });
  if (buses.length !== busIds.length) {
    throw new Error("One or more selected buses were not found.");
  }

  let resolvedCompanyId = companyId;
  for (const bus of buses) {
    const busCompanyId = getIdValue(bus.companyId);
    const targetCompanyId = getIdValue(resolvedCompanyId);
    if (creatorUser?.role !== "SUPER_ADMIN" && busCompanyId !== getIdValue(creatorUser?.companyId)) {
      throw new Error("One or more selected buses are not available for your company.");
    }
    if (targetCompanyId && busCompanyId && busCompanyId !== targetCompanyId) {
      throw new Error("Selected buses must belong to the selected company.");
    }
    resolvedCompanyId = resolvedCompanyId || bus.companyId || null;
  }

  return {
    assignedBuses: buses.map((bus) => bus._id),
    companyId: resolvedCompanyId,
  };
};

const buildUserPayload = async (body, creator = null) => {
  const creatorUser = serializeAuthUser(creator);
  const requestedRole = normalizeString(body.role).toUpperCase() || (body.isAdmin ? "SUPER_ADMIN" : "STAFF");
  const role = ["SUPER_ADMIN", "COMPANY_ADMIN", "STAFF"].includes(requestedRole) ? requestedRole : "STAFF";
  const isSuperCreator = creatorUser?.role === "SUPER_ADMIN";

  if (creatorUser) {
    if (!isSuperCreator && role !== "STAFF") {
      throw new Error("Only Super Admin can create Company Admin or Super Admin users.");
    }
    if (!isSuperCreator && getIdValue(body.companyId || creatorUser.companyId) !== getIdValue(creatorUser.companyId)) {
      throw new Error("Users can only be created inside your company.");
    }
  }

  let companyId = isSuperCreator ? body.companyId || null : getIdValue(creatorUser?.companyId || body.companyId) || null;
  const companyName = normalizeString(body.companyName);
  if (isSuperCreator && companyName && !companyId) {
    companyId = await resolveCompanyIdFromName(companyName, creatorUser);
  }
  if (role === "COMPANY_ADMIN" && !companyId) {
    throw new Error("Company Admin must be linked to a company.");
  }

  const staffTitle = role === "STAFF" ? normalizeStaffTitle(body.staffTitle) : "";
  let assignedBus = null;
  let assignedBuses = [];
  if (staffTitle === "CONDUCTOR") {
    const resolvedBus = await resolveAssignedBusId(body.assignedBus, companyId, creatorUser);
    assignedBus = resolvedBus.assignedBus;
    companyId = resolvedBus.companyId;
    if (!assignedBus) {
      throw new Error("Please assign a bus to the conductor.");
    }
  } else if (staffTitle === "OFFICE_BOOKING") {
    const resolvedBuses = await resolveAssignedBusIds(body.assignedBuses, companyId, creatorUser);
    assignedBuses = resolvedBuses.assignedBuses;
    companyId = resolvedBuses.companyId;
    if (!assignedBuses.length) {
      throw new Error("Please assign at least one bus to the office booking staff.");
    }
  }

  const permissions = filterAssignablePermissions(creatorUser, body.permissions || []);
  const name = normalizeString(body.name || body.fullName);
  const password = body.password ? await bcrypt.hash(body.password, 10) : null;

  return {
    name,
    fullName: normalizeString(body.fullName || body.name),
    email: normalizeString(body.email).toLowerCase(),
    phone: normalizeString(body.phone),
    ...(password ? { password, passwordHash: password } : {}),
    isAdmin: role === "SUPER_ADMIN",
    isBlocked: body.isBlocked === true,
    isActive: body.isActive !== false && body.isBlocked !== true,
    role,
    roleLevel: roleLevels[role],
    companyId,
    staffTitle,
    assignedBus,
    assignedBuses,
    permissions,
    createdBy: creatorUser?._id || body.createdBy || null,
  };
};

const scopedUsersQuery = (currentUser) => {
  const authUser = serializeAuthUser(currentUser);
  if (authUser?.role === "SUPER_ADMIN") return {};
  return { companyId: authUser?.companyId || null };
};

const canViewUser = (viewer, targetUser) => {
  const current = serializeAuthUser(viewer);
  const target = serializeAuthUser(targetUser);
  if (!current || !target) return false;
  if (getIdValue(current._id) === getIdValue(target._id)) return false;
  if (target.roleLevel >= current.roleLevel) return false;
  if (current.role === "SUPER_ADMIN") return true;
  if (getIdValue(current.companyId) !== getIdValue(target.companyId)) return false;
  if (target.role !== "STAFF") return false;
  return !target.createdBy || getIdValue(target.createdBy) === getIdValue(current._id);
};

const filterVisibleUsers = (users, viewer) => users.filter((user) => canViewUser(viewer, user));

// register new user - kept for existing public registration flow
router.post("/register", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: normalizeString(req.body.email).toLowerCase() });
    if (existingUser) {
      return res.send({
        message: "User already exists",
        success: false,
        data: null,
      });
    }
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = new User({
      ...req.body,
      name: normalizeString(req.body.name || req.body.fullName),
      fullName: normalizeString(req.body.fullName || req.body.name),
      email: normalizeString(req.body.email).toLowerCase(),
      password: hashedPassword,
      passwordHash: hashedPassword,
      isAdmin: false,
      role: "STAFF",
      roleLevel: roleLevels.STAFF,
      permissions: [],
      isActive: true,
    });
    await newUser.save();
    res.send({
      message: "User created successfully",
      success: true,
      data: null,
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
      data: null,
    });
  }
});

// login user - kept for existing frontend
router.post("/login", async (req, res) => {
  try {
    const userExists = await User.findOne({ email: normalizeString(req.body.email).toLowerCase() });
    if (!userExists) {
      return res.send({
        message: "User does not exist",
        success: false,
        data: null,
      });
    }

    if (userExists.isBlocked || userExists.isActive === false) {
      return res.send({
        message: "Your account is blocked , please contact admin",
        success: false,
        data: null,
      });
    }

    const passwordMatch = await bcrypt.compare(req.body.password, userExists.password);

    if (!passwordMatch) {
      return res.send({
        message: "Incorrect password",
        success: false,
        data: null,
      });
    }

    const token = jwt.sign(buildTokenPayload(userExists), process.env.jwt_secret, {
      expiresIn: "1d",
    });

    res.send({
      message: "User logged in successfully",
      success: true,
      data: token,
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
      data: null,
    });
  }
});

router.get("/permissions", authMiddleware, (req, res) => {
  res.send({
    message: "Permissions fetched successfully",
    success: true,
    data: modulePermissions,
  });
});

// get user by id - kept for existing ProtectedRoute
router.post("/get-user-by-id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.body.userId).populate("companyId").populate("assignedBus").populate("assignedBuses");
    res.send({
      message: "User fetched successfully",
      success: true,
      data: publicUser(user),
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
      data: null,
    });
  }
});

// get all users - compatibility endpoint, now safely scoped for non-super users
router.post("/get-all-users", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const users = await User.find(scopedUsersQuery(req.user)).populate("companyId").populate("assignedBus").populate("assignedBuses");
    const visibleUsers = filterVisibleUsers(users, req.user);
    res.send({
      message: "Users fetched successfully",
      success: true,
      data: visibleUsers.map((user) => publicUser(user, req.user)),
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
      data: null,
    });
  }
});

// update user - compatibility endpoint
router.post("/update-user-permissions", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const target = await User.findById(req.body._id);
    if (!target) {
      return res.send({ message: "User not found", success: false, data: null });
    }
    if (!canManageUser(req.user, target)) {
      return res.status(403).send({ message: "Access denied", success: false, data: null });
    }

    const authUser = serializeAuthUser(req.user);
    if (req.body.isAdmin === true && authUser.role !== "SUPER_ADMIN") {
      return res.status(403).send({ message: "Only Super Admin can assign Super Admin access", success: false, data: null });
    }

    const requestedRole = normalizeString(req.body.role).toUpperCase();
    const nextRole = req.body.isAdmin ? "SUPER_ADMIN" : requestedRole || "STAFF";
    if (!roleLevels[nextRole]) {
      return res.status(400).send({ message: "Invalid role", success: false, data: null });
    }
    if (nextRole === "SUPER_ADMIN" && authUser.role !== "SUPER_ADMIN") {
      return res.status(403).send({ message: "Only Super Admin can assign Super Admin access", success: false, data: null });
    }

    const updates = {
      isAdmin: nextRole === "SUPER_ADMIN",
      isBlocked: req.body.isBlocked === true,
      isActive: req.body.isBlocked === true ? false : req.body.isActive !== false,
      role: nextRole,
      roleLevel: req.body.roleLevel || roleLevels[nextRole],
      permissions: filterAssignablePermissions(req.user, req.body.permissions || target.permissions || []),
    };
    await User.findByIdAndUpdate(req.body._id, updates);
    res.send({
      message: "User permissions updated successfully",
      success: true,
      data: null,
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
      data: null,
    });
  }
});

router.post("/", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: normalizeString(req.body.email).toLowerCase() });
    if (existingUser) {
      return res.send({ message: "User already exists", success: false, data: null });
    }
    const payload = await buildUserPayload(req.body, req.user);
    const user = await new User(payload).save();
    await createAuditNotification(req.user, {
      companyId: user.companyId,
      module: "users",
      action: "created",
      entityType: "user",
      entityId: user._id,
      entityLabel: user.name || user.email,
    });
    res.send({ message: "User created successfully", success: true, data: publicUser(user) });
  } catch (error) {
    res.send({ message: error.message, success: false, data: null });
  }
});

router.get("/", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const users = await User.find(scopedUsersQuery(req.user)).populate("companyId").populate("assignedBus").populate("assignedBuses");
    const visibleUsers = filterVisibleUsers(users, req.user);
    res.send({ message: "Users fetched successfully", success: true, data: visibleUsers.map((user) => publicUser(user, req.user)) });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.get("/:id", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("companyId").populate("assignedBus").populate("assignedBuses");
    if (!user) return res.status(404).send({ message: "User not found", success: false, data: null });
    if (!canViewUser(req.user, user)) {
      return res.status(403).send({ message: "Access denied", success: false, data: null });
    }
    res.send({ message: "User fetched successfully", success: true, data: publicUser(user, req.user) });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.patch("/:id", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send({ message: "User not found", success: false, data: null });
    if (!canManageUser(req.user, target)) {
      return res.status(403).send({ message: "Access denied", success: false, data: null });
    }
    const updates = { ...req.body };
    const authUser = serializeAuthUser(req.user);
    const requestedRole = updates.role ? normalizeString(updates.role).toUpperCase() : normalizeRole(target);
    if (requestedRole && !roleLevels[requestedRole]) {
      return res.status(400).send({ message: "Invalid role", success: false, data: null });
    }
    if ((requestedRole === "SUPER_ADMIN" || updates.isAdmin === true) && authUser.role !== "SUPER_ADMIN") {
      return res.status(403).send({ message: "Only Super Admin can assign Super Admin access", success: false, data: null });
    }
    if (authUser.role !== "SUPER_ADMIN" && requestedRole !== normalizeRole(target)) {
      return res.status(403).send({ message: "Only Super Admin can change user roles", success: false, data: null });
    }
    delete updates.password;
    delete updates.passwordHash;
    if (updates.permissions) updates.permissions = filterAssignablePermissions(req.user, updates.permissions);
    if (updates.role) {
      updates.role = requestedRole;
      updates.roleLevel = roleLevels[requestedRole];
    }
    if (serializeAuthUser(req.user).role === "SUPER_ADMIN" && req.body.companyName) {
      updates.companyId = await resolveCompanyIdFromName(req.body.companyName, req.user);
    }
    updates.staffTitle = requestedRole === "STAFF" ? normalizeStaffTitle(req.body.staffTitle) : "";
    updates.assignedBus = null;
    updates.assignedBuses = [];
    if (updates.staffTitle === "CONDUCTOR") {
      const resolvedBus = await resolveAssignedBusId(req.body.assignedBus, updates.companyId || target.companyId, authUser);
      updates.assignedBus = resolvedBus.assignedBus;
      updates.companyId = resolvedBus.companyId;
      if (!updates.assignedBus) {
        return res.status(400).send({ message: "Please assign a bus to the conductor.", success: false, data: null });
      }
    } else if (updates.staffTitle === "OFFICE_BOOKING") {
      const resolvedBuses = await resolveAssignedBusIds(req.body.assignedBuses, updates.companyId || target.companyId, authUser);
      updates.assignedBuses = resolvedBuses.assignedBuses;
      updates.companyId = resolvedBuses.companyId;
      if (!updates.assignedBuses.length) {
        return res.status(400).send({ message: "Please assign at least one bus to the office booking staff.", success: false, data: null });
      }
    }
    if (updates.isAdmin !== undefined) {
      updates.isAdmin = requestedRole === "SUPER_ADMIN";
    }
    delete updates.companyName;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    await createAuditNotification(req.user, {
      companyId: user.companyId,
      module: "users",
      action: "updated",
      entityType: "user",
      entityId: user._id,
      entityLabel: user.name || user.email,
    });
    res.send({ message: "User updated successfully", success: true, data: publicUser(user) });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.delete("/:id", authMiddleware, requirePermission("users"), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send({ message: "User not found", success: false, data: null });
    if (!canManageUser(req.user, target)) {
      return res.status(403).send({ message: "Access denied", success: false, data: null });
    }
    await User.findByIdAndUpdate(req.params.id, { isBlocked: true, isActive: false });
    await createAuditNotification(req.user, {
      companyId: target.companyId,
      module: "users",
      action: "deactivated",
      entityType: "user",
      entityId: target._id,
      entityLabel: target.name || target.email,
    });
    res.send({ message: "User deactivated successfully", success: true, data: null });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

module.exports = router;
