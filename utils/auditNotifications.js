const Notification = require("../models/notificationModel");
const { getIdValue, serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const buildActorName = (user = {}) =>
  user.fullName || user.name || user.email || "A user";

const buildMessage = ({ actorName, action, entityType, entityLabel }) => {
  const target = [entityType, entityLabel].filter(Boolean).join(" ");
  return `${actorName} ${action}${target ? ` ${target}` : ""}.`;
};

const createAuditNotification = async (user, payload = {}) => {
  try {
    const authUser = serializeAuthUser(user);
    if (!authUser) return null;

    const actorName = buildActorName(authUser);
    const rawCompanyId = payload.companyId !== undefined ? payload.companyId : authUser.companyId || null;
    const companyId = getIdValue(rawCompanyId) || null;
    const action = payload.action || "updated";
    const entityType = payload.entityType || payload.module || "record";
    const entityLabel = payload.entityLabel || "";

    return await Notification.create({
      companyId,
      actor: authUser._id || null,
      actorName,
      module: payload.module || entityType,
      action,
      entityType,
      entityId: payload.entityId || null,
      entityLabel,
      message: payload.message || buildMessage({ actorName, action, entityType, entityLabel }),
    });
  } catch (error) {
    console.log("[audit-notification] create failed:", error.message);
    return null;
  }
};

const notificationScopeForUser = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser) return { _id: null };
  if (authUser.role === "SUPER_ADMIN") return {};
  if (!authUser.companyId) return { _id: null };
  return { companyId: authUser.companyId };
};

const isNotificationUnread = (notification, user) => {
  const userId = getIdValue(user?._id);
  return !(notification.readBy || []).some((readerId) => getIdValue(readerId) === userId);
};

module.exports = {
  createAuditNotification,
  notificationScopeForUser,
  isNotificationUnread,
};
