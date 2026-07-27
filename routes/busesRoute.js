const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Bus = require("../models/busModel");
const Booking = require("../models/bookingsModel");
const Company = require("../models/companyModel");
const Route = require("../models/routeModel");
const RouteFare = require("../models/routeFareModel");
const RouteStop = require("../models/routeStopModel");
const Trip = require("../models/tripModel");
const authMiddleware = require("../middlewares/authMiddleware");
const { getAssignedConductorBusId, getAssignedOfficeBusIds, getIdValue, requireSuperAdmin, serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");

const normalizeString = (value) => String(value || "").trim();
const seatDebugLogPath = path.join(__dirname, "..", ".codex-logs", "seat-debug.jsonl");

const escapeRegex = (value) => normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const inactiveSeatBookingStatuses = [
  "payment_cancelled",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "cancelled_and_refunded",
  "cancelled_and_credited",
  "expired_and_refunded",
  "expired_and_credited",
  "CANCELLED",
  "CANCELLED_AND_REFUNDED",
  "CANCELLED_AND_CREDITED",
  "EXPIRED_AND_REFUNDED",
  "EXPIRED_AND_CREDITED",
  "cancelled_by_user",
];

const inactiveSeatPaymentStatuses = [
  "payment_cancelled",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "failed",
  "expired",
];

const writeSeatDebugLog = (event, payload) => {
  try {
    fs.mkdirSync(path.dirname(seatDebugLogPath), { recursive: true });
    fs.appendFileSync(
      seatDebugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        service: "onhighweb",
        routeFile: "busesRoute.js",
        event,
        mongoDb: mongoose.connection.name || "",
        ...(payload || {}),
      })}\n`
    );
  } catch (error) {
    console.log("[seat-debug] file log failed", error.message);
  }
};

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const busColorOptions = [
  { value: "red", label: "Red", hex: "#dc2626" },
  { value: "blue", label: "Blue", hex: "#2563eb" },
  { value: "green", label: "Green", hex: "#16a34a" },
  { value: "yellow", label: "Yellow", hex: "#facc15" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "purple", label: "Purple", hex: "#7c3aed" },
  { value: "pink", label: "Pink", hex: "#ec4899" },
  { value: "cyan", label: "Cyan", hex: "#06b6d4" },
  { value: "teal", label: "Teal", hex: "#0d9488" },
  { value: "lime", label: "Lime", hex: "#84cc16" },
  { value: "indigo", label: "Indigo", hex: "#4f46e5" },
  { value: "violet", label: "Violet", hex: "#8b5cf6" },
  { value: "maroon", label: "Maroon", hex: "#7f1d1d" },
  { value: "navy", label: "Navy", hex: "#1e3a8a" },
  { value: "olive", label: "Olive", hex: "#3f6212" },
  { value: "gold", label: "Gold", hex: "#d4a017" },
  { value: "silver", label: "Silver", hex: "#94a3b8" },
  { value: "bronze", label: "Bronze", hex: "#b45309" },
  { value: "turquoise", label: "Turquoise", hex: "#14b8a6" },
  { value: "magenta", label: "Magenta", hex: "#d946ef" },
  { value: "coral", label: "Coral", hex: "#fb7185" },
  { value: "brown", label: "Brown", hex: "#92400e" },
  { value: "black", label: "Black", hex: "#111827" },
  { value: "white", label: "White", hex: "#ffffff" },
  { value: "skyblue", label: "Sky Blue", hex: "#38bdf8" },
  { value: "mint", label: "Mint", hex: "#86efac" },
  { value: "lavender", label: "Lavender", hex: "#c4b5fd" },
  { value: "crimson", label: "Crimson", hex: "#be123c" },
  { value: "amber", label: "Amber", hex: "#f59e0b" },
  { value: "charcoal", label: "Charcoal", hex: "#374151" },
];
const busColorValues = busColorOptions.map((option) => option.value);
const serviceFeeModes = ["fixed", "percentage"];

const getScopedCompanyId = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser || authUser.role === "SUPER_ADMIN" || !authUser.companyId) return null;
  return authUser.companyId;
};

const userIsSuperAdmin = (user) => serializeAuthUser(user)?.role === "SUPER_ADMIN";

const withCompanyScope = (user, query = {}) => {
  const companyId = getScopedCompanyId(user);
  const conductorBusId = getAssignedConductorBusId(user);
  const officeBusIds = getAssignedOfficeBusIds(user);
  const scopedQuery = companyId ? { ...query, companyId } : query;
  if (conductorBusId) return { ...scopedQuery, _id: conductorBusId };
  if (officeBusIds.length) return { ...scopedQuery, _id: { $in: officeBusIds } };
  return scopedQuery;
};

const stripRequestOnlyFields = (payload = {}) => {
  const query = { ...payload };
  delete query.userId;
  return query;
};

const canAccessBus = (user, bus) => {
  const conductorBusId = getAssignedConductorBusId(user);
  if (conductorBusId && getIdValue(bus?._id) !== conductorBusId) return false;
  const officeBusIds = getAssignedOfficeBusIds(user);
  if (officeBusIds.length && !officeBusIds.includes(getIdValue(bus?._id))) return false;
  const companyId = getScopedCompanyId(user);
  if (!companyId) return true;
  return getIdValue(bus?.companyId) === getIdValue(companyId);
};

const isPastJourneyDate = (value) => {
  const journeyDate = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(journeyDate) && journeyDate < getTodayDate();
};

const parseDateTime = (date, time) => {
  const cleanDate = normalizeString(date);
  const cleanTime = normalizeString(time || "00:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null;
  const parsed = new Date(`${cleanDate}T${cleanTime || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTripWindow = (trip) => {
  const startDate = trip.scheduleStartDate || trip.journeyDate;
  const endDate = trip.runsContinuously ? "9999-12-31" : trip.scheduleEndDate || trip.arrivalDate || trip.journeyDate;
  const start = parseDateTime(startDate, trip.departureTime);
  const end = parseDateTime(endDate, trip.arrivalTime || trip.departureTime);
  if (!start || !end) return null;
  return {
    start,
    end: end <= start ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : end,
  };
};

const tripsOverlap = (firstTrip, secondTrip) => {
  if (
    normalizeString(firstTrip.departureDay) &&
    normalizeString(secondTrip.departureDay) &&
    normalizeString(firstTrip.departureDay) !== normalizeString(secondTrip.departureDay)
  ) {
    return false;
  }
  const first = getTripWindow(firstTrip);
  const second = getTripWindow(secondTrip);
  if (!first || !second) return false;
  return first.start < second.end && second.start < first.end;
};

const resolveCompanyIdFromBusData = async (busData) => {
  const existingCompanyId = getIdValue(busData.companyId);
  if (existingCompanyId) return busData.companyId;

  const candidates = [
    busData.companyName,
    busData.company,
    busData.operatorName,
    busData.operator,
    busData.name,
  ]
    .map(normalizeString)
    .filter(Boolean);

  for (const candidate of candidates) {
    const company = await Company.findOne({
      companyName: new RegExp(`^${escapeRegex(candidate)}$`, "i"),
      companyStatus: { $ne: "Inactive" },
    }).select("_id companyName");
    if (company) return company._id;
  }

  return null;
};

const validateTripAssignments = async (tripIds, currentUser, busId = null) => {
  const cleanTripIds = [...new Set((Array.isArray(tripIds) ? tripIds : []).filter(Boolean))];
  if (!cleanTripIds.length) return { trips: [] };

  const trips = await Trip.find({ _id: { $in: cleanTripIds } }).populate("route").populate("bus");
  if (trips.length !== cleanTripIds.length) {
    throw new Error("One or more selected trips were not found.");
  }

  const scopedCompanyId = getScopedCompanyId(currentUser);
  for (const trip of trips) {
    if (scopedCompanyId && getIdValue(trip.companyId || trip.route?.companyId) !== getIdValue(scopedCompanyId)) {
      throw new Error("One or more selected trips are not available for your company.");
    }
    const assignedBusId = getIdValue(trip.bus);
    if (assignedBusId && assignedBusId !== getIdValue(busId)) {
      throw new Error(`Trip ${trip.route?.routeName || trip.departureDay || trip.journeyDate} is already assigned to another bus.`);
    }
  }

  for (let firstIndex = 0; firstIndex < trips.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < trips.length; secondIndex += 1) {
      if (tripsOverlap(trips[firstIndex], trips[secondIndex])) {
        throw new Error("Selected trips have overlapping schedules for this bus.");
      }
    }
  }

  return { trips };
};

const normalizeBusData = async (payload, currentUser = null) => {
  const busData = { ...payload };
  delete busData.userId;
  delete busData.trips;
  busData.name = normalizeString(busData.name);
  busData.number = normalizeString(busData.number).toUpperCase();
  if (busData.capacity) busData.capacity = Number(busData.capacity);
  if (busData.fare) busData.fare = Number(busData.fare);
  if (busData.serviceFeeAmount !== undefined) busData.serviceFeeAmount = Number(busData.serviceFeeAmount || 0);
  if (busData.serviceFeeMode) busData.serviceFeeMode = normalizeString(busData.serviceFeeMode).toLowerCase();
  busData.icon_color = normalizeString(busData.icon_color || busData.iconColor || "blue").toLowerCase();
  delete busData.iconColor;
  if (!busColorValues.includes(busData.icon_color)) {
    throw new Error("Please choose a valid bus color.");
  }
  if (busData.serviceFeeMode && !serviceFeeModes.includes(busData.serviceFeeMode)) {
    throw new Error("Please choose a valid service fee type.");
  }
  if (Number(busData.serviceFeeAmount || 0) < 0) {
    throw new Error("Service fee cannot be negative.");
  }
  if (busData.serviceFeeMode === "percentage" && Number(busData.serviceFeeAmount || 0) > 100) {
    throw new Error("Percentage service fee cannot exceed 100.");
  }
  if (isPastJourneyDate(busData.journeyDate)) {
    throw new Error("Past dates are not allowed for booking.");
  }

  if (busData.route) {
    const route = await Route.findById(busData.route);
    if (!route) {
      throw new Error("Selected route was not found");
    }
    const scopedCompanyId = getScopedCompanyId(currentUser);
    if (scopedCompanyId && getIdValue(route.companyId) !== getIdValue(scopedCompanyId)) {
      throw new Error("Selected route is not available for your company");
    }

    const stops = await RouteStop.find({ route: route._id }).sort({ stopOrder: 1 });
    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];
    const fullRouteFare = firstStop && lastStop
      ? await RouteFare.findOne({
          route: route._id,
          fromStop: firstStop._id,
          toStop: lastStop._id,
        })
      : null;

    busData.from = route.fromCity;
    busData.to = route.toCity;
    busData.departure = firstStop?.departureTime || busData.departure;
    busData.arrival = lastStop?.arrivalTime || busData.arrival;
    busData.fare = fullRouteFare?.fare || busData.fare;
    busData.companyId = route.companyId || busData.companyId || null;
  }

  const scopedCompanyId = getScopedCompanyId(currentUser);
  if (scopedCompanyId) {
    busData.companyId = scopedCompanyId;
  }
  if (!busData.companyId) {
    busData.companyId = await resolveCompanyIdFromBusData(busData);
  }
  if (userIsSuperAdmin(currentUser) && !busData.companyId) {
    throw new Error("Super admin must select a company before saving this bus.");
  }

  return busData;
};

const syncTripAssignmentsForBus = async (bus) => {
  const assignedTripIds = Array.isArray(bus.trips) ? bus.trips.map(getIdValue).filter(Boolean) : [];
  await Trip.updateMany({ bus: bus._id, _id: { $nin: assignedTripIds } }, { $set: { bus: null } });
  if (assignedTripIds.length) {
    await Trip.updateMany({ _id: { $in: assignedTripIds } }, { $set: { bus: bus._id, companyId: bus.companyId || null } });
  }
};

// add-bus

router.post("/add-bus", authMiddleware, async (req, res) => {
  try {
    console.log("Add bus request body:", JSON.stringify(req.body, null, 2));
    const busData = await normalizeBusData(req.body, req.user);
    const existingBus = await Bus.findOne({ number: busData.number });
    if (existingBus) {
      return res.status(200).send({
        success: false,
        message: "Bus already exists",
      });
    }
    const newBus = new Bus(busData);
    await newBus.save();
    await createAuditNotification(req.user, {
      companyId: newBus.companyId,
      module: "buses",
      action: "created",
      entityType: "bus",
      entityId: newBus._id,
      entityLabel: `${newBus.name || ""} ${newBus.number || ""}`.trim(),
    });
    return res.status(200).send({
      success: true,
      message: "Bus added successfully",
    });
  } catch (error) {
    console.log("Add bus error:", error.message);
    res.status(500).send({ success: false, message: error.message });
  }
});

// update-bus

router.post("/update-bus", authMiddleware, async (req, res) => {
  try {
    const existingBus = await Bus.findById(req.body._id);
    if (!existingBus || !canAccessBus(req.user, existingBus)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    const busData = await normalizeBusData(req.body, req.user);
    delete busData._id;
    const bus = await Bus.findByIdAndUpdate(req.body._id, busData, { new: true });
    await createAuditNotification(req.user, {
      companyId: bus.companyId,
      module: "buses",
      action: "updated",
      entityType: "bus",
      entityId: bus._id,
      entityLabel: `${bus.name || ""} ${bus.number || ""}`.trim(),
    });
    return res.status(200).send({
      success: true,
      message: "Bus updated successfully",
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// delete-bus

router.post("/delete-bus", authMiddleware, async (req, res) => {
  try {
    const bus = await Bus.findById(req.body._id);
    if (!bus || !canAccessBus(req.user, bus)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    await Trip.deleteMany({ bus: req.body._id });
    await Bus.findByIdAndDelete(req.body._id);
    await createAuditNotification(req.user, {
      companyId: bus.companyId,
      module: "buses",
      action: "deleted",
      entityType: "bus",
      entityId: bus._id,
      entityLabel: `${bus.name || ""} ${bus.number || ""}`.trim(),
    });
    return res.status(200).send({
      success: true,
      message: "Bus deleted successfully",
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// get-all-buses

router.post("/get-all-buses", authMiddleware, async (req, res) => {
  try {
    const buses = await Bus.find(withCompanyScope(req.user, stripRequestOnlyFields(req.body))).populate("route").populate({
      path: "trips",
      populate: { path: "route" },
    });
    return res.status(200).send({
      success: true,
      message: "Buses fetched successfully",
      data: buses,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/get-service-fees", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const buses = await Bus.find({}, {
      name: 1,
      number: 1,
      route: 1,
      from: 1,
      to: 1,
      journeyDate: 1,
      fare: 1,
      serviceFeeEnabled: 1,
      serviceFeeMode: 1,
      serviceFeeAmount: 1,
      serviceFeeUpdatedAt: 1,
    }).populate("route");

    return res.status(200).send({
      success: true,
      message: "Service fees fetched successfully",
      data: buses,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/update-service-fees", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const targetType = normalizeString(req.body.targetType || "single").toLowerCase();
    const busIds = Array.isArray(req.body.busIds) ? req.body.busIds.filter(Boolean) : [];
    const serviceFeeEnabled = Boolean(req.body.serviceFeeEnabled);
    const serviceFeeMode = normalizeString(req.body.serviceFeeMode || "fixed").toLowerCase();
    const serviceFeeAmount = Number(req.body.serviceFeeAmount || 0);

    if (!["single", "group", "all"].includes(targetType)) {
      return res.status(200).send({ success: false, message: "Choose a valid service fee target." });
    }
    if (!serviceFeeModes.includes(serviceFeeMode)) {
      return res.status(200).send({ success: false, message: "Choose a valid service fee type." });
    }
    if (serviceFeeAmount < 0) {
      return res.status(200).send({ success: false, message: "Service fee cannot be negative." });
    }
    if (serviceFeeMode === "percentage" && serviceFeeAmount > 100) {
      return res.status(200).send({ success: false, message: "Percentage service fee cannot exceed 100." });
    }
    if (targetType !== "all" && !busIds.length) {
      return res.status(200).send({ success: false, message: "Select at least one bus." });
    }

    const query = targetType === "all" ? {} : { _id: { $in: busIds } };
    const update = {
      serviceFeeEnabled,
      serviceFeeMode,
      serviceFeeAmount,
      serviceFeeUpdatedAt: new Date(),
    };

    const result = await Bus.updateMany(query, { $set: update });
    const buses = await Bus.find(query, {
      name: 1,
      number: 1,
      route: 1,
      from: 1,
      to: 1,
      journeyDate: 1,
      fare: 1,
      serviceFeeEnabled: 1,
      serviceFeeMode: 1,
      serviceFeeAmount: 1,
      serviceFeeUpdatedAt: 1,
    }).populate("route");
    await createAuditNotification(req.user, {
      companyId: null,
      module: "service_fee",
      action: "updated",
      entityType: "service fee",
      entityLabel: targetType === "all" ? "all buses" : `${busIds.length} bus(es)`,
    });

    return res.status(200).send({
      success: true,
      message: `Service fee updated for ${result.modifiedCount || result.nModified || result.matchedCount || result.n || 0} bus(es).`,
      data: buses,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


router.get("/color-options", async (req, res) => {
  try {
    const buses = await Bus.find({}, {
      name: 1,
      number: 1,
      route: 1,
      journeyDate: 1,
      from: 1,
      to: 1,
      icon_color: 1,
    }).lean();

    return res.status(200).send({
      success: true,
      message: "Bus color options fetched successfully",
      colors: busColorOptions,
      busColors: buses.map((bus) => ({
        busId: String(bus._id || ""),
        busName: bus.name || "",
        busNumber: bus.number || "",
        routeId: String(bus.route || ""),
        journeyDate: bus.journeyDate || "",
        from: bus.from || "",
        to: bus.to || "",
        icon_color: bus.icon_color || "blue",
        iconColor: bus.icon_color || "blue",
        colorHex: (busColorOptions.find((option) => option.value === (bus.icon_color || "blue")) || busColorOptions[1]).hex,
      })),
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// get seat availability

router.post("/get-seat-availability", authMiddleware, async (req, res) => {
  try {
    const buses = await Bus.find(withCompanyScope(req.user, stripRequestOnlyFields(req.body))).populate("route").lean();
    const busIds = buses.map((bus) => bus._id);
    const trips = await Trip.find({ bus: { $in: busIds } }).lean();
    const activeBookings = await Booking.find({
      bus: { $in: busIds },
      status: { $nin: inactiveSeatBookingStatuses },
      bookingStatus: { $nin: inactiveSeatBookingStatuses },
      paymentStatus: { $nin: inactiveSeatPaymentStatuses },
    }).lean();
    const activeSeatsByBus = activeBookings.reduce((acc, booking) => {
      const busId = String(booking.bus || "");
      if (!acc[busId]) acc[busId] = [];
      const seats = (Array.isArray(booking.seats) ? booking.seats : [booking.seats])
        .flatMap((seat) => String(seat || "").split(","))
        .map((seat) => Number(String(seat).trim()))
        .filter((seat) => Number.isInteger(seat) && seat > 0);
      acc[busId].push(...seats);
      return acc;
    }, {});
    const latestTripByBus = trips.reduce((acc, trip) => {
      const busId = trip.bus.toString();
      const currentTrip = acc[busId];
      if (!currentTrip || new Date(trip.updatedAt) > new Date(currentTrip.updatedAt)) {
        acc[busId] = trip;
      }
      return acc;
    }, {});

    const availability = buses.map((bus) => {
      const capacity = Number(bus.capacity || 0);
      const trip = latestTripByBus[bus._id.toString()];
      const bookedSeatsSource = activeSeatsByBus[bus._id.toString()] || [];
      const bookedSeats = [
        ...new Set(
          bookedSeatsSource
            .map((seat) => Number(seat))
            .filter((seat) => Number.isInteger(seat) && seat > 0 && seat <= capacity)
        ),
      ].sort((a, b) => a - b);
      const availableSeats = Array.from({ length: capacity }, (_, index) => index + 1).filter(
        (seat) => !bookedSeats.includes(seat)
      );

      return {
        ...bus,
        tripId: trip?._id,
        tripStatus: trip?.status,
        bookedSeats,
        bookedSeatsCount: bookedSeats.length,
        availableSeats,
        seatsLeft: availableSeats.length,
        occupancyPercentage: capacity
          ? Math.round((bookedSeats.length / capacity) * 100)
          : 0,
      };
    });
    writeSeatDebugLog("onhighweb_admin_seat_availability", {
      requestBody: req.body || {},
      busCount: buses.length,
      buses: availability.map((item) => ({
        busId: String(item._id || ""),
        busName: item.name,
        busNumber: item.number,
        routeId: String(item.route?._id || item.route || ""),
        routeName: item.route?.routeName || "",
        journeyDate: item.journeyDate,
        fromCity: item.from,
        toCity: item.to,
        tripId: String(item.tripId || ""),
        tripStatus: item.tripStatus || "",
        capacity: Number(item.capacity || 0),
        adminBookedSeats: item.bookedSeats,
        adminBookedCount: item.bookedSeatsCount,
        adminAvailableSeats: item.availableSeats,
        adminAvailableCount: item.seatsLeft,
        busSeatsBookedRaw: item.seatsBooked || [],
        source: item.tripId ? "trip.seatsBooked if present else bus.seatsBooked" : "bus.seatsBooked",
      })),
    });

    return res.status(200).send({
      success: true,
      message: "Seat availability fetched successfully",
      data: availability,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// get-bus-by-id

router.post("/get-bus-by-id", authMiddleware, async (req, res) => {
  try {
    const bus = await Bus.findById(req.body._id).populate("route");
    if (!bus || !canAccessBus(req.user, bus)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    return res.status(200).send({
      success: true,
      message: "Bus fetched successfully",
      data: bus,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
