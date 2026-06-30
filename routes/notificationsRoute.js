const router = require("express").Router();
const authMiddleware = require("../middlewares/authMiddleware");
const Notification = require("../models/notificationModel");
const Trip = require("../models/tripModel");
const { serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { notificationScopeForUser } = require("../utils/auditNotifications");

const canSeeNotifications = (user) => {
  const authUser = serializeAuthUser(user);
  return authUser?.role === "SUPER_ADMIN" || authUser?.role === "COMPANY_ADMIN";
};

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const createTripStatusReminders = async (user) => {
  const query = notificationScopeForUser(user);
  const today = getTodayDate();
  const dayStart = new Date(`${today}T00:00:00.000Z`);
  const dayEnd = new Date(`${today}T23:59:59.999Z`);
  const trips = await Trip.find({
    ...(query.companyId ? { companyId: query.companyId } : {}),
    scheduleStartDate: { $lte: today },
    status: { $in: ["Yet To Start", "In Progress"] },
    bus: { $ne: null },
  })
    .populate("bus")
    .populate("route")
    .limit(100);

  for (const trip of trips) {
    const tripLabel = [
      trip.tripCode || "Trip",
      trip.route?.routeName || "",
      trip.bus?.number ? `(${trip.bus.number})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const nextStatus = trip.status === "Yet To Start" ? "In Progress" : "Completed";
    const message =
      trip.status === "Yet To Start"
        ? `${tripLabel} is due to start. Please update the trip status to In Progress if the bus has departed.`
        : `${tripLabel} is still In Progress. Please update the trip status to Completed when the journey is done.`;

    const exists = await Notification.exists({
      companyId: trip.companyId || null,
      module: "trips",
      action: "status_reminder",
      entityId: trip._id,
      message,
      createdAt: { $gte: dayStart, $lte: dayEnd },
    });
    if (exists) continue;

    await Notification.create({
      companyId: trip.companyId || null,
      actor: null,
      actorName: "System",
      module: "trips",
      action: "status_reminder",
      entityType: "trip",
      entityId: trip._id,
      entityLabel: `${tripLabel} -> ${nextStatus}`,
      message,
    });
  }
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!canSeeNotifications(req.user)) {
      return res.send({ success: true, message: "Notifications fetched successfully", data: [], unreadCount: 0 });
    }

    await createTripStatusReminders(req.user);

    const limit = Math.min(Number(req.query.limit || 20), 50);
    const query = notificationScopeForUser(req.user);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const unreadCount = await Notification.countDocuments({
      ...query,
      readBy: { $ne: req.user._id },
    });

    res.send({
      success: true,
      message: "Notifications fetched successfully",
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: [], unreadCount: 0 });
  }
});

router.post("/mark-read", authMiddleware, async (req, res) => {
  try {
    if (!canSeeNotifications(req.user)) {
      return res.send({ success: true, message: "Notifications marked as read" });
    }

    const query = notificationScopeForUser(req.user);
    if (req.body._id) {
      query._id = req.body._id;
    }

    await Notification.updateMany(query, { $addToSet: { readBy: req.user._id } });
    res.send({ success: true, message: "Notifications marked as read" });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
