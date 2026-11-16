const router = require("express").Router();
const authMiddleware = require("../middlewares/authMiddleware");
const Notification = require("../models/notificationModel");
const Trip = require("../models/tripModel");
const { serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { notificationScopeForUser } = require("../utils/auditNotifications");
const crypto = require("crypto");
const InterviewPayment = require("../models/interviewPaymentModel");

const canSeeNotifications = (user) => {
  const authUser = serializeAuthUser(user);
  return authUser?.role === "SUPER_ADMIN" || authUser?.role === "COMPANY_ADMIN";
};

const parseClockTime = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const getTripDepartureDate = (trip) => {
  const dateText = String(trip.scheduleStartDate || trip.journeyDate || "").trim().slice(0, 10);
  const firstStop = Array.isArray(trip.stopSchedule) ? trip.stopSchedule[0] || {} : {};
  const timeText = firstStop.departureTime || trip.departureTime;
  const clock = parseClockTime(timeText);
  if (!dateText || !clock) return null;

  const departureDate = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(departureDate.getTime())) return null;
  departureDate.setHours(clock.hours, clock.minutes, 0, 0);
  return departureDate;
};

const getDueDepartureReminder = (departureDate, now = new Date()) => {
  if (!departureDate) return null;
  const minutesUntilDeparture = Math.floor((departureDate.getTime() - now.getTime()) / 60000);
  if (minutesUntilDeparture <= 0) return null;

  const windows = [
    { key: "24h", title: "24 hours", maxMinutes: 24 * 60, minMinutes: 3 * 60 },
    { key: "3h", title: "3 hours", maxMinutes: 3 * 60, minMinutes: 30 },
    { key: "30m", title: "30 minutes", maxMinutes: 30, minMinutes: 0 },
  ];
  return windows.find(
    (window) =>
      minutesUntilDeparture <= window.maxMinutes &&
      minutesUntilDeparture > window.minMinutes
  ) || null;
};

const createTripStatusReminders = async (user) => {
  const query = notificationScopeForUser(user);
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const tomorrow = new Date(next24Hours.getTime() - next24Hours.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const trips = await Trip.find({
    ...(query.companyId ? { companyId: query.companyId } : {}),
    $or: [
      { scheduleStartDate: { $gte: today, $lte: tomorrow } },
      { journeyDate: { $gte: today, $lte: tomorrow } },
    ],
    status: "Yet To Start",
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
    const departureDate = getTripDepartureDate(trip);
    const reminder = getDueDepartureReminder(departureDate, now);
    if (!reminder) continue;

    const departureTime = departureDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const reminderKey = `departure_${reminder.key}`;
    const message = `${tripLabel} departs in about ${reminder.title} at ${departureTime}. Please prepare and update the trip status when boarding starts.`;

    const exists = await Notification.exists({
      companyId: trip.companyId || null,
      module: "trips",
      action: "status_reminder",
      entityId: trip._id,
      entityLabel: `${tripLabel} -> ${reminderKey}`,
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
      entityLabel: `${tripLabel} -> ${reminderKey}`,
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

// ---- Interview practice payments (sent by the careers bot) ----
// POST /api/notifications/interview-payment, header X-Interview-Secret.
// Records each payment once (by reference) and notifies the super admins with
// the amount, time, phone (if any), WhatsApp or website, and the total so far.

const sameSecret = (given) => {
  const expected = String(process.env.INTERVIEW_NOTIFY_SECRET || "");
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(expected);
  return expected.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const money = (amount, currency = "USD") =>
  currency === "USD" ? `$${Number(amount).toFixed(2)}` : `${Number(amount).toFixed(2)} ${currency}`;

const readableTime = (date) =>
  date.toLocaleString("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const readablePhone = (phone) => {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.length === 12 && digits.startsWith("263")) {
    return `+263 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return digits ? `+${digits}` : "";
};

router.post("/interview-payment", async (req, res) => {
  try {
    if (!sameSecret(req.get("X-Interview-Secret"))) {
      return res.status(401).send({ success: false, message: "Not allowed" });
    }
    const body = req.body || {};
    const amount = Number(body.amount);
    const source = ["whatsapp", "website"].includes(body.source) ? body.source : "";
    if (!body.reference || !Number.isFinite(amount) || amount <= 0 || !source) {
      return res.status(400).send({ success: false, message: "reference, amount and source are required" });
    }

    const reference = String(body.reference);
    if (await InterviewPayment.exists({ reference })) {
      return res.send({ success: true, message: "Already recorded" }); // the bot sent it again
    }
    const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
    let payment;
    try {
      payment = await InterviewPayment.create({
        reference,
        amount,
        currency: body.currency || "USD",
        topic: String(body.topic || ""),
        source,
        method: String(body.method || ""),
        phone: String(body.phone || ""),
        paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      });
    } catch (error) {
      if (error.code === 11000) return res.send({ success: true, message: "Already recorded" });
      throw error;
    }

    const [totals] = await InterviewPayment.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const where = payment.source === "website" ? "website (onhighweb)" : "WhatsApp";
    const details = [
      readableTime(payment.paidAt),
      readablePhone(payment.phone) || "no phone number",
      payment.method === "ecocash" ? "EcoCash" : payment.method === "card" ? "card" : "",
    ].filter(Boolean);
    const message =
      `💰 Interview payment: ${money(payment.amount, payment.currency)} via ${where}` +
      `${payment.topic ? ` for ${payment.topic}` : ""} · ${details.join(" · ")}. ` +
      `Total so far: ${money(totals.total, payment.currency)} ` +
      `(${totals.count} ${totals.count === 1 ? "payment" : "payments"}).`;

    await Notification.create({
      companyId: null, // OnHighTech's own sales: shown to super admins
      actor: null,
      actorName: "Interview practice",
      module: "interview payments",
      action: "payment_made",
      entityType: "interview payment",
      entityId: payment._id,
      entityLabel: `${payment.source} -> ${payment.reference}`,
      message,
    });
    res.send({ success: true, message: "Recorded", total: totals.total, count: totals.count });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
