const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authMiddleware");
const Route = require("../models/routeModel");
const RouteStop = require("../models/routeStopModel");
const RouteFare = require("../models/routeFareModel");
const Bus = require("../models/busModel");
const Trip = require("../models/tripModel");
const Booking = require("../models/bookingsModel");
const { getAssignedConductorBusId, getAssignedOfficeBusIds, getIdValue, serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactCityQuery = (value) => ({
  $regex: `^${escapeRegex(String(value || "").trim())}$`,
  $options: "i",
});

const journeyDateQuery = (value) => ({
  $regex: `^${escapeRegex(String(value || "").trim())}`,
});

const normalizeString = (value) => String(value || "").trim();
const seatDebugLogPath = path.join(__dirname, "..", ".codex-logs", "seat-debug.jsonl");

const getScopedCompanyId = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser || authUser.role === "SUPER_ADMIN" || !authUser.companyId) return null;
  return authUser.companyId;
};

const getSubmittedCompanyId = (user, value) => {
  const authUser = serializeAuthUser(user);
  const scopedCompanyId = getScopedCompanyId(user);
  if (scopedCompanyId) return scopedCompanyId;
  if (authUser?.role !== "SUPER_ADMIN") return null;
  return getIdValue(value) || null;
};

const withCompanyScope = (user, query = {}) => {
  const companyId = getScopedCompanyId(user);
  if (!companyId) return query;
  return { ...query, companyId };
};

const stripRequestOnlyFields = (payload = {}) => {
  const query = { ...payload };
  delete query.userId;
  return query;
};

const canAccessRoute = (user, route) => {
  const companyId = getScopedCompanyId(user);
  if (!companyId) return true;
  return getIdValue(route?.companyId) === getIdValue(companyId);
};

const getConductorAssignedBus = async (user) => {
  const assignedBusId = getAssignedConductorBusId(user);
  if (!assignedBusId) return null;
  return Bus.findById(assignedBusId);
};

const getAssignedStaffBusIds = (user) => {
  const conductorBusId = getAssignedConductorBusId(user);
  if (conductorBusId) return [conductorBusId];
  return getAssignedOfficeBusIds(user);
};

const writeSeatDebugLog = (event, payload) => {
  try {
    fs.mkdirSync(path.dirname(seatDebugLogPath), { recursive: true });
    fs.appendFileSync(
      seatDebugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        service: "onhighweb",
        routeFile: "routesRoute.js",
        event,
        mongoDb: mongoose.connection.name || "",
        ...(payload || {}),
      })}\n`
    );
  } catch (error) {
    console.log("[seat-debug] file log failed", error.message);
  }
};

const inactiveBookingStatuses = [
  "payment_cancelled",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "cancelled_and_refunded",
  "cancelled_and_credited",
  "CANCELLED",
  "CANCELLED_AND_REFUNDED",
  "CANCELLED_AND_CREDITED",
  "cancelled_by_user",
];
const inactivePaymentStatuses = [
  "pending",
  "awaiting_method",
  "awaiting_number",
  "number_entered",
  "request_sent",
  "checkout_created",
  "not_confirmed",
  "request_failed",
  "callback_received",
  "payment_cancelled",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "failed",
  "expired",
];

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const isPastJourneyDate = (value) => {
  const journeyDate = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(journeyDate) && journeyDate < getTodayDate();
};

const getDayCodeForDate = (value) => {
  const dateText = normalizeString(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return "";
  const parsedDate = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parsedDate.getUTCDay()];
};

const operatingDayQueryForDate = (journeyDate) => {
  const dayCode = getDayCodeForDate(journeyDate);
  if (!dayCode) return {};
  return {
    $or: [
      { operatingDays: { $exists: false } },
      { operatingDays: { $size: 0 } },
      { operatingDays: dayCode },
    ],
  };
};

const tripRunsOnJourneyDate = (trip, journeyDate) => {
  const operatingDays = Array.isArray(trip?.operatingDays) ? trip.operatingDays : [];
  if (!operatingDays.length) return true;
  const dayCode = getDayCodeForDate(journeyDate);
  return Boolean(dayCode && operatingDays.includes(dayCode));
};

const getSegmentBookedSeats = async (tripId, fromStop, toStop) => {
  const bookings = await Booking.find({
    trip: tripId,
    fromStopOrder: { $lt: toStop.stopOrder },
    toStopOrder: { $gt: fromStop.stopOrder },
    status: { $nin: inactiveBookingStatuses },
    bookingStatus: { $nin: inactiveBookingStatuses },
    paymentStatus: { $nin: inactivePaymentStatuses },
  });

  const segmentSeats = [
    ...new Set(
      bookings.flatMap((booking) =>
        Array.isArray(booking.seats) ? booking.seats.map((seat) => Number(seat)) : []
      )
    ),
  ];
  console.log(
    "[route-search] segment booked seats",
    JSON.stringify({
      tripId: String(tripId || ""),
      fromStop: fromStop && fromStop.cityName,
      toStop: toStop && toStop.cityName,
      bookingCount: bookings.length,
      seats: segmentSeats,
      references: bookings.map((booking) => ({
        transactionId: booking.transactionId,
        status: booking.status,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        seats: booking.seats,
      })),
    })
  );
  writeSeatDebugLog("onhighweb_route_segment_booked_seats", {
    tripId: String(tripId || ""),
    fromStop: fromStop && fromStop.cityName,
    toStop: toStop && toStop.cityName,
    fromStopOrder: fromStop && fromStop.stopOrder,
    toStopOrder: toStop && toStop.stopOrder,
    bookingCount: bookings.length,
    seats: segmentSeats,
    references: bookings.map((booking) => ({
      transactionId: booking.transactionId,
      status: booking.status,
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      seats: booking.seats,
    })),
  });
  return segmentSeats;
};

const getTripStopScheduleItem = (trip, stop) => {
  if (!Array.isArray(trip?.stopSchedule) || !stop) return null;
  return trip.stopSchedule.find((item) => {
    const itemStopId = item?.stopId ? String(item.stopId) : "";
    return (
      (itemStopId && itemStopId === String(stop._id)) ||
      Number(item?.stopOrder || 0) === Number(stop.stopOrder || 0) ||
      normalizeString(item?.cityName).toLowerCase() === normalizeString(stop.cityName).toLowerCase()
    );
  });
};

const formatTripResult = async (trip, route, fromStop, toStop, fare, travelDate = "") => {
  const bus = trip.bus || {};
  const fromSchedule = getTripStopScheduleItem(trip, fromStop);
  const toSchedule = getTripStopScheduleItem(trip, toStop);
  const resultJourneyDate = normalizeString(travelDate) || trip.journeyDate;
  const segmentBookedSeats = await getSegmentBookedSeats(trip._id, fromStop, toStop);
  const busBookedSeats = Array.isArray(bus.seatsBooked)
    ? bus.seatsBooked.map((seat) => Number(seat))
    : [];
  const tripBookedSeats = Array.isArray(trip.seatsBooked)
    ? trip.seatsBooked.map((seat) => Number(seat))
    : [];
  const seatsBooked = [...new Set(segmentBookedSeats)];
  const capacity = Number(bus.capacity || 0);
  console.log(
    "[route-search] seat sources",
    JSON.stringify({
      tripId: String(trip._id || ""),
      busId: String(bus._id || ""),
      busNumber: bus.number,
      segmentBookedSeats,
      busBookedSeats,
      tripBookedSeats,
      seatsBooked,
      seatsLeft: capacity ? Math.max(capacity - seatsBooked.length, 0) : 0,
    })
  );
  writeSeatDebugLog("onhighweb_route_seat_sources", {
    tripId: String(trip._id || ""),
    busId: String(bus._id || ""),
    busName: bus.name,
    busNumber: bus.number,
    routeId: String(route._id || ""),
    routeName: route.routeName,
    journeyDate: resultJourneyDate,
    fromCity: fromStop && fromStop.cityName,
    toCity: toStop && toStop.cityName,
    fromStopOrder: fromStop && fromStop.stopOrder,
    toStopOrder: toStop && toStop.stopOrder,
    capacity,
    busSeatsBookedRaw: bus.seatsBooked || [],
    tripSeatsBookedRaw: trip.seatsBooked || [],
    segmentBookedSeats,
    busBookedSeats,
    tripBookedSeats,
    seatsBooked,
    bookedCount: seatsBooked.length,
    availableSeats: Array.from({ length: capacity }, (_, index) => index + 1).filter(
      (seat) => !seatsBooked.includes(seat)
    ),
    availableCount: capacity ? Math.max(capacity - seatsBooked.length, 0) : 0,
  });
  return {
    _id: trip._id,
    searchResultType: "trip",
    tripId: trip._id,
    busId: bus._id,
    routeId: route._id,
    routeName: route.routeName,
    routeCode: route.routeCode,
    tripCode: trip.tripCode || "",
    fromStopId: fromStop._id,
    toStopId: toStop._id,
    fromStopOrder: fromStop.stopOrder,
    toStopOrder: toStop.stopOrder,
    name: bus.name,
    bus_name: bus.name,
    number: bus.number,
    bus_number: bus.number,
    type: bus.type,
    capacity: bus.capacity,
    from: fromStop.cityName,
    to: toStop.cityName,
    journeyDate: resultJourneyDate,
    date: resultJourneyDate,
    departure: fromSchedule?.departureTime || trip.departureTime || fromStop.departureTime,
    departure_time: fromSchedule?.departureTime || trip.departureTime || fromStop.departureTime,
    arrival: toSchedule?.arrivalTime || trip.arrivalTime || toStop.arrivalTime,
    arrival_time: toSchedule?.arrivalTime || trip.arrivalTime || toStop.arrivalTime,
    boardingPoint: fromStop.boardingPoint,
    boarding_point: fromStop.boardingPoint,
    boardingPoints: Array.isArray(fromStop.boardingPoints) ? fromStop.boardingPoints.filter(Boolean) : [],
    boarding_points: Array.isArray(fromStop.boardingPoints) ? fromStop.boardingPoints.filter(Boolean) : [],
    dropOffPoint: toStop.boardingPoint,
    drop_off_point: toStop.boardingPoint,
    dropOffPoints: Array.isArray(toStop.boardingPoints) ? toStop.boardingPoints.filter(Boolean) : [],
    drop_off_points: Array.isArray(toStop.boardingPoints) ? toStop.boardingPoints.filter(Boolean) : [],
    fare: fare ? fare.fare : 0,
    currency: route.fareCurrency || bus.currency || "USD",
    fareCurrency: route.fareCurrency || bus.currency || "USD",
    fareExchangeRate: route.fareExchangeRate || "",
    seatsBooked,
    seatsLeft: capacity ? Math.max(capacity - seatsBooked.length, 0) : 0,
    status: trip.status,
  };
};

const getRouteBundle = async (route) => {
  const stops = await RouteStop.find({ route: route._id }).sort({ stopOrder: 1 });
  const fares = await RouteFare.find({ route: route._id });
  const trips = await Trip.find({ route: route._id }).populate("bus");

  return {
    ...route.toObject(),
    stops,
    fares,
    trips,
  };
};

const resolveSegmentFare = async (routeId, fromStop, toStop) => {
  const exactFare = await RouteFare.findOne({
    route: routeId,
    fromStop: fromStop._id,
    toStop: toStop._id,
  });
  if (exactFare) return exactFare;

  const stops = await RouteStop.find({
    route: routeId,
    stopOrder: { $gte: fromStop.stopOrder, $lte: toStop.stopOrder },
  }).sort({ stopOrder: 1 });

  let totalFare = 0;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const legFare = await RouteFare.findOne({
      route: routeId,
      fromStop: stops[index]._id,
      toStop: stops[index + 1]._id,
    });
    if (!legFare) return null;
    totalFare += Number(legFare.fare || 0);
  }

  return totalFare > 0 ? { fare: totalFare } : null;
};

const resolveTripSegmentFare = async (route, bus, fromStop, toStop) => {
  const fare = await resolveSegmentFare(route._id, fromStop, toStop);
  if (fare) return fare;

  const busFare = Number(bus?.fare || 0);
  if (busFare > 0) {
    console.warn("[route-search] missing route fare, using bus fare fallback", {
      routeId: String(route?._id || ""),
      routeName: route?.routeName,
      busId: String(bus?._id || ""),
      busNumber: bus?.number,
      fromCity: fromStop?.cityName,
      toCity: toStop?.cityName,
      fare: busFare,
    });
    return { fare: busFare, source: "bus" };
  }

  console.warn("[route-search] missing route fare and bus fare", {
    routeId: String(route?._id || ""),
    routeName: route?.routeName,
    busId: String(bus?._id || ""),
    busNumber: bus?.number,
    fromCity: fromStop?.cityName,
    toCity: toStop?.cityName,
  });
  return null;
};

const activeBusStatusQuery = { $nin: ["Completed", "Inactive", "Maintenance"] };

const ensureTripForBusRouteDate = async (bus, routeId, journeyDate) => {
  const tripDate = normalizeString(bus.journeyDate) || journeyDate;
  return Trip.findOneAndUpdate(
    { bus: bus._id, route: routeId, journeyDate: tripDate },
    {
      bus: bus._id,
      route: routeId,
      companyId: bus.companyId || null,
      journeyDate: tripDate,
      status: bus.status === "Active" ? "Yet To Start" : bus.status,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("bus");
};

const getSearchableBusesForRouteDate = (routeId, journeyDate, companyId = null, assignedBusIds = []) =>
  Bus.find({
    route: routeId,
    journeyDate: journeyDateQuery(journeyDate),
    status: activeBusStatusQuery,
    ...(companyId ? { companyId } : {}),
    ...(assignedBusIds.length ? { _id: { $in: assignedBusIds } } : {}),
  });

const getSearchableTripsForRouteDate = (routeId, journeyDate, companyId = null, assignedBusIds = []) => {
  const dateText = normalizeString(journeyDate).slice(0, 10);
  const legacyDateMatch = journeyDateQuery(journeyDate);
  return (
  Trip.find({
    route: routeId,
    bus: { $ne: null },
    status: { $nin: ["Completed", "Inactive", "Cancelled"] },
    $and: [
      {
        $or: [
          {
            scheduleStartDate: { $lte: dateText },
            $or: [{ runsContinuously: true }, { scheduleEndDate: "" }, { scheduleEndDate: { $gte: dateText } }],
          },
          { journeyDate: legacyDateMatch },
        ],
      },
      operatingDayQueryForDate(journeyDate),
    ],
    ...(companyId ? { companyId } : {}),
    ...(assignedBusIds.length ? { bus: { $in: assignedBusIds } } : {}),
  }).populate("bus")
  );
};

router.post("/save-route", authMiddleware, async (req, res) => {
  try {
    const {
      _id,
      routeName,
      routeCode,
      fromCity,
      toCity,
      totalDistance,
      estimatedDuration,
      fareCurrency,
      fareExchangeRate,
      status,
      companyId,
      stops = [],
      fares = [],
    } = req.body;

    if (!routeName || !routeCode || !fromCity || !toCity) {
      return res.status(200).send({
        success: false,
        message: "Route name, route code, from city and to city are required",
      });
    }

    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(200).send({
        success: false,
        message: "Add at least two stops for this route",
      });
    }

    const orderedStops = stops
      .map((stop, index) => ({
        cityName: normalizeString(stop.cityName),
        boardingPoint: normalizeString(stop.boardingPoint),
        boardingPoints: Array.isArray(stop.boardingPoints)
          ? stop.boardingPoints.map(normalizeString).filter(Boolean)
          : normalizeString(stop.boardingPoint)
              .split(",")
              .map(normalizeString)
              .filter(Boolean),
        arrivalTime: "",
        departureTime: "",
        distanceFromPrevious: normalizeString(stop.distanceFromPrevious),
        durationFromPrevious: normalizeString(stop.durationFromPrevious),
        stopMinutes: index === 0 || index === stops.length - 1 ? "0" : normalizeString(stop.stopMinutes || "0"),
        stopOrder: Number(stop.stopOrder || index + 1),
        isActive: stop.isActive !== false,
        clientId: stop.clientId || String(index),
      }))
      .filter((stop) => stop.cityName);

    if (orderedStops.length < 2) {
      return res.status(200).send({
        success: false,
        message: "Each route must have at least two named stops",
      });
    }

    const firstStop = orderedStops[0];
    const lastStop = orderedStops[orderedStops.length - 1];
    firstStop.stopMinutes = "0";
    lastStop.stopMinutes = "0";

    for (let index = 0; index < orderedStops.length; index += 1) {
      const stop = orderedStops[index];
      if (!stop.boardingPoints.length) {
        return res.status(200).send({
          success: false,
          message: "At least one boarding point is required.",
        });
      }

      if (index === 0) continue;

      const travelMinutes = Number(String(stop.durationFromPrevious || "").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) {
        return res.status(200).send({
          success: false,
          message: "Enter travel minutes between each pair of stops.",
        });
      }

      const stopMinutes = Number(String(stop.stopMinutes || "0").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(stopMinutes) || stopMinutes < 0) {
        return res.status(200).send({
          success: false,
          message: "Stop minutes cannot be negative.",
        });
      }
    }

    const hasInvalidOrder = orderedStops.some(
      (stop, index) => stop.stopOrder !== index + 1
    );
    if (hasInvalidOrder) {
      return res.status(200).send({
        success: false,
        message: "Stop order is invalid",
      });
    }

    if (
      firstStop.cityName.toLowerCase() !== normalizeString(fromCity).toLowerCase() ||
      lastStop.cityName.toLowerCase() !== normalizeString(toCity).toLowerCase()
    ) {
      return res.status(200).send({
        success: false,
        message: "The first stop must match From City and the last stop must match To City",
      });
    }

    const submittedFarePairs = new Set();
    const fareByPair = new Map();
    fares.forEach((fareItem) => {
      const fromOrder = Number(fareItem.fromStopOrder);
      const toOrder = Number(fareItem.toStopOrder);
      const fareValue = Number(fareItem.fare);
      if (toOrder > fromOrder && fareValue > 0) {
        submittedFarePairs.add(`${fromOrder}-${toOrder}`);
        fareByPair.set(`${fromOrder}-${toOrder}`, fareValue);
      }
    });
    const requiredFareCount = (orderedStops.length * (orderedStops.length - 1)) / 2;
    if (submittedFarePairs.size < requiredFareCount) {
      return res.status(200).send({
        success: false,
        message: "Enter fares for every valid forward stop pair",
      });
    }

    for (let toIndex = 1; toIndex < orderedStops.length; toIndex += 1) {
      const toStop = orderedStops[toIndex];
      for (let earlierFromIndex = 0; earlierFromIndex < toIndex - 1; earlierFromIndex += 1) {
        const earlierFromStop = orderedStops[earlierFromIndex];
        const earlierFare = fareByPair.get(`${earlierFromIndex + 1}-${toIndex + 1}`);
        if (!earlierFare) continue;

        for (
          let laterFromIndex = earlierFromIndex + 1;
          laterFromIndex < toIndex;
          laterFromIndex += 1
        ) {
          const laterFromStop = orderedStops[laterFromIndex];
          const laterFare = fareByPair.get(`${laterFromIndex + 1}-${toIndex + 1}`);
          if (!laterFare) continue;

          if (laterFare > earlierFare) {
            return res.status(200).send({
              success: false,
              message: `${laterFromStop.cityName} to ${toStop.cityName} fare cannot exceed ${earlierFromStop.cityName} to ${toStop.cityName} fare.`,
            });
          }
        }
      }
    }

    const selectedCompanyId = getSubmittedCompanyId(req.user, companyId);
    if (_id) {
      const existingRouteForUpdate = await Route.findById(_id);
      if (!existingRouteForUpdate || !canAccessRoute(req.user, existingRouteForUpdate)) {
        return res.status(403).send({ success: false, message: "Access denied" });
      }
    }

    const duplicateQuery = {
      fromCity: exactCityQuery(fromCity),
      toCity: exactCityQuery(toCity),
      ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
    };
    if (_id) {
      duplicateQuery._id = { $ne: _id };
    }
    const existingRoute = await Route.findOne(duplicateQuery);
    if (existingRoute) {
      return res.status(200).send({
        success: false,
        message: "A route already exists for this from/to city pair",
      });
    }

    const existingCode = await Route.findOne({
      routeCode: exactCityQuery(routeCode),
      ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
      ...(_id ? { _id: { $ne: _id } } : {}),
    });
    if (existingCode) {
      return res.status(200).send({
        success: false,
        message: "Route code already exists",
      });
    }

    let route = null;
    const routeData = {
      routeName,
      routeCode,
      companyId: selectedCompanyId || null,
      fromCity,
      toCity,
      totalDistance: normalizeString(totalDistance),
      estimatedDuration: normalizeString(estimatedDuration),
      fareCurrency: ["USD", "ZAR"].includes(normalizeString(fareCurrency)) ? normalizeString(fareCurrency) : "USD",
      fareExchangeRate: normalizeString(fareExchangeRate),
      status: status || "Active",
    };

    const auditAction = _id ? "updated" : "created";
    if (_id) {
      route = await Route.findByIdAndUpdate(_id, routeData, { new: true });
    } else {
      route = await new Route(routeData).save();
    }

    await RouteStop.deleteMany({ route: route._id });
    await RouteFare.deleteMany({ route: route._id });

    const createdStops = await RouteStop.insertMany(
      orderedStops.map((stop) => ({
        route: route._id,
        cityName: stop.cityName,
        stopOrder: stop.stopOrder,
        arrivalTime: stop.arrivalTime,
        departureTime: stop.departureTime,
        boardingPoint: stop.boardingPoints[0] || stop.boardingPoint,
        boardingPoints: stop.boardingPoints,
        distanceFromPrevious: stop.distanceFromPrevious,
        durationFromPrevious: stop.durationFromPrevious,
        stopMinutes: stop.stopMinutes,
        isActive: stop.isActive,
      }))
    );

    const stopByClientId = {};
    const stopByOrder = {};
    orderedStops.forEach((stop, index) => {
      stopByClientId[stop.clientId] = createdStops[index];
      stopByOrder[stop.stopOrder] = createdStops[index];
    });

    const fareDocs = fares
      .map((fareItem) => {
        const fromStop =
          stopByClientId[fareItem.fromClientId] ||
          stopByOrder[Number(fareItem.fromStopOrder)];
        const toStop =
          stopByClientId[fareItem.toClientId] ||
          stopByOrder[Number(fareItem.toStopOrder)];
        const fareValue = Number(fareItem.fare);
        if (!fromStop || !toStop || !fareValue || fareValue <= 0) {
          return null;
        }
        return {
          route: route._id,
          fromStop: fromStop._id,
          toStop: toStop._id,
          fare: fareValue,
        };
      })
      .filter(Boolean);

    if (fareDocs.length) {
      await RouteFare.insertMany(fareDocs);
    }

    const bundle = await getRouteBundle(route);
    await createAuditNotification(req.user, {
      companyId: route.companyId,
      module: "routes",
      action: auditAction,
      entityType: "route",
      entityId: route._id,
      entityLabel: route.routeName || `${route.fromCity} to ${route.toCity}`,
    });
    return res.status(200).send({
      success: true,
      message: "Route saved successfully",
      data: bundle,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/get-all-routes", authMiddleware, async (req, res) => {
  try {
    const conductorBus = await getConductorAssignedBus(req.user);
    const officeBusIds = getAssignedOfficeBusIds(req.user);
    const routeQuery = withCompanyScope(req.user, stripRequestOnlyFields(req.body || {}));
    if (conductorBus?.route) {
      routeQuery._id = conductorBus.route;
    } else if (officeBusIds.length) {
      const assignedBuses = await Bus.find({ _id: { $in: officeBusIds } }, { route: 1 });
      routeQuery._id = { $in: [...new Set(assignedBuses.map((bus) => getIdValue(bus.route)).filter(Boolean))] };
    }
    const routes = await Route.find(routeQuery).sort({ createdAt: -1 });
    const data = await Promise.all(routes.map((route) => getRouteBundle(route)));
    return res.status(200).send({
      success: true,
      message: "Routes fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/delete-route", authMiddleware, async (req, res) => {
  try {
    const routeId = req.body._id;
    const route = await Route.findById(routeId);
    if (!route || !canAccessRoute(req.user, route)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    const routeTrips = await Trip.find({ route: routeId }, { _id: 1 });
    const routeTripIds = routeTrips.map((trip) => trip._id);
    if (routeTripIds.length) {
      await Bus.updateMany({ trips: { $in: routeTripIds } }, { $pull: { trips: { $in: routeTripIds } } });
    }
    await Trip.deleteMany({ route: routeId });
    await RouteFare.deleteMany({ route: routeId });
    await RouteStop.deleteMany({ route: routeId });
    await Route.findByIdAndDelete(routeId);
    await createAuditNotification(req.user, {
      companyId: route.companyId,
      module: "routes",
      action: "deleted",
      entityType: "route",
      entityId: route._id,
      entityLabel: route.routeName || `${route.fromCity} to ${route.toCity}`,
    });
    return res.status(200).send({
      success: true,
      message: "Route deleted successfully",
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/search-trips", authMiddleware, async (req, res) => {
  try {
    const fromCity = normalizeString(req.body.from);
    const toCity = normalizeString(req.body.to);
    const journeyDate = normalizeString(req.body.journeyDate);

    if (!fromCity || !toCity || !journeyDate) {
      return res.status(200).send({
        success: true,
        message: "Trip search requires from, to and journey date",
        data: [],
      });
    }

    if (isPastJourneyDate(journeyDate)) {
      return res.status(200).send({
        success: false,
        message: "Past dates are not allowed for booking.",
        data: [],
      });
    }

    const results = [];
    let matchingTripCount = 0;
    let fullyBookedCount = 0;
    const scopedCompanyId = getScopedCompanyId(req.user);
    const assignedBusIds = getAssignedStaffBusIds(req.user);

    const dateText = journeyDate.slice(0, 10);
    const trips = await Trip.find({
      bus: { $ne: null },
      status: { $nin: ["Completed", "Inactive", "Cancelled"] },
      scheduleStartDate: { $lte: dateText },
      $and: [
        { $or: [{ runsContinuously: true }, { scheduleEndDate: "" }, { scheduleEndDate: { $gte: dateText } }] },
        operatingDayQueryForDate(journeyDate),
      ],
      ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      ...(assignedBusIds.length ? { bus: { $in: assignedBusIds } } : {}),
    }).populate("bus").populate("route");

    for (const trip of trips) {
      const route = trip.route;
      if (!route || route.status === "Inactive" || !canAccessRoute(req.user, route)) continue;
      if (["Completed", "Inactive", "Maintenance"].includes(trip.bus?.status)) continue;

      const activeSchedule = (Array.isArray(trip.stopSchedule) ? trip.stopSchedule : [])
        .filter((stop) => stop.isActive !== false && normalizeString(stop.cityName))
        .sort((first, second) => Number(first.stopOrder || 0) - Number(second.stopOrder || 0));
      const fromSchedule = activeSchedule.find((stop) => normalizeString(stop.cityName).toLowerCase() === fromCity.toLowerCase());
      const toSchedule = activeSchedule.find(
        (stop) =>
          normalizeString(stop.cityName).toLowerCase() === toCity.toLowerCase() &&
          Number(stop.stopOrder || 0) > Number(fromSchedule?.stopOrder || 0)
      );
      if (!fromSchedule || !toSchedule) continue;

      const routeStops = await RouteStop.find({ route: route._id, isActive: { $ne: false } }).sort({ stopOrder: 1 });
      const fromStop =
        routeStops.find((stop) => String(stop._id) === String(fromSchedule.stopId)) ||
        routeStops.find((stop) => Number(stop.stopOrder) === Number(fromSchedule.stopOrder)) ||
        routeStops.find((stop) => normalizeString(stop.cityName).toLowerCase() === fromCity.toLowerCase());
      const toStop =
        routeStops.find((stop) => String(stop._id) === String(toSchedule.stopId)) ||
        routeStops.find((stop) => Number(stop.stopOrder) === Number(toSchedule.stopOrder)) ||
        routeStops.find((stop) => normalizeString(stop.cityName).toLowerCase() === toCity.toLowerCase());
      if (!fromStop || !toStop || toStop.stopOrder <= fromStop.stopOrder) continue;

      const fare = await resolveTripSegmentFare(route, trip.bus, fromStop, toStop);
      if (!fare) continue;

      matchingTripCount += 1;
      const result = await formatTripResult(trip, route, fromStop, toStop, fare, journeyDate);
      if (result.seatsLeft > 0) {
        results.push(result);
      } else {
        fullyBookedCount += 1;
      }
    }

    const responseMessage = results.length
      ? "Trips fetched successfully"
      : fullyBookedCount > 0
        ? "All buses for this route and date are fully booked"
        : "No created trip found for this route and journey date";

    return res.status(200).send({
      success: true,
      message: responseMessage,
      data: results,
      totalMatches: matchingTripCount,
      availableCount: results.length,
      fullyBookedCount,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/get-trip-by-id", authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findById(req.body._id).populate("bus");
    if (!trip) {
      return res.status(200).send({
        success: false,
        message: "Trip not found",
      });
    }

    const requestedJourneyDate = normalizeString(req.body.journeyDate || req.body.date || trip.journeyDate);
    if (isPastJourneyDate(requestedJourneyDate)) {
      return res.status(200).send({
        success: false,
        message: "Past dates are not allowed for booking.",
      });
    }

    if (!tripRunsOnJourneyDate(trip, requestedJourneyDate)) {
      return res.status(200).send({
        success: false,
        message: "This bus does not operate on the selected journey date.",
      });
    }

    const route = await Route.findById(trip.route);
    if (!route) {
      return res.status(200).send({
        success: false,
        message: "Route not found",
      });
    }
    const assignedBusIds = getAssignedStaffBusIds(req.user);
    if (
      !canAccessRoute(req.user, route) ||
      (getScopedCompanyId(req.user) && getIdValue(trip.bus?.companyId) !== getIdValue(getScopedCompanyId(req.user))) ||
      (assignedBusIds.length && !assignedBusIds.includes(getIdValue(trip.bus?._id)))
    ) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }

    const stops = await RouteStop.find({
      route: route._id,
      isActive: { $ne: false },
    }).sort({ stopOrder: 1 });
    if (!stops.length) {
      return res.status(200).send({
        success: false,
        message: "No active stops found for this route",
      });
    }

    if (
      (req.body.fromStopId && !stops.some((stop) => String(stop._id) === String(req.body.fromStopId))) ||
      (req.body.toStopId && !stops.some((stop) => String(stop._id) === String(req.body.toStopId)))
    ) {
      return res.status(200).send({
        success: false,
        message: "This route segment is no longer active",
      });
    }

    const fromStop =
      (req.body.fromStopId && stops.find((stop) => String(stop._id) === String(req.body.fromStopId))) ||
      stops.find((stop) => stop.cityName.toLowerCase() === normalizeString(req.body.from).toLowerCase()) ||
      stops[0];
    const toStop =
      (req.body.toStopId && stops.find((stop) => String(stop._id) === String(req.body.toStopId))) ||
      stops.find((stop) => stop.cityName.toLowerCase() === normalizeString(req.body.to).toLowerCase()) ||
      stops[stops.length - 1];

    const fare = await resolveTripSegmentFare(route, trip.bus, fromStop, toStop);

    return res.status(200).send({
      success: true,
      message: "Trip fetched successfully",
      data: await formatTripResult(trip, route, fromStop, toStop, fare, requestedJourneyDate),
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
