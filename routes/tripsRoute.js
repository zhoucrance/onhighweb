const router = require("express").Router();
const mongoose = require("mongoose");
const Trip = require("../models/tripModel");
const Bus = require("../models/busModel");
const Route = require("../models/routeModel");
const Company = require("../models/companyModel");
const authMiddleware = require("../middlewares/authMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");
const { getAssignedConductorBusId, getAssignedOfficeBusIds, getIdValue, serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const normalizeString = (value) => String(value || "").trim();
const paymentMethodOptions = ["EcoCash", "Card Payment", "Pay on Boarding"];

const normalizePaymentMethods = (methods) => [
  ...new Set(
    (Array.isArray(methods) ? methods : [methods])
      .map(normalizeString)
      .filter((method) => paymentMethodOptions.includes(method))
  ),
];

const getCompanyPaymentMethods = async (companyId) => {
  if (!companyId) return ["EcoCash", "Card Payment"];
  const company = await Company.findById(companyId, { enabledPaymentMethods: 1 }).lean();
  return company?.enabledPaymentMethods?.length ? company.enabledPaymentMethods : ["EcoCash", "Card Payment"];
};

const parseClockTimeToMinutes = (value) => {
  const [hours, minutes] = normalizeString(value)
    .split(":")
    .map((item) => Number(item));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const formatMinutesAsDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const calculateDuration = (departureTime, arrivalTime) => {
  const departureMinutes = parseClockTimeToMinutes(departureTime);
  const arrivalMinutes = parseClockTimeToMinutes(arrivalTime);
  if (departureMinutes === null || arrivalMinutes === null) return "";
  let durationMinutes = arrivalMinutes - departureMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return formatMinutesAsDuration(durationMinutes);
};

const normalizeStopSchedule = (items = []) =>
  Array.isArray(items)
    ? items
        .map((item, index) => ({
          stopId: mongoose.Types.ObjectId.isValid(item.stopId) ? item.stopId : null,
          cityName: normalizeString(item.cityName),
          stopOrder: Number(item.stopOrder || index + 1),
          arrivalTime: normalizeString(item.arrivalTime),
          arrivalDayOffset: Number(item.arrivalDayOffset || 0),
          departureTime: normalizeString(item.departureTime),
          departureDayOffset: Number(item.departureDayOffset || 0),
          distanceFromPrevious: normalizeString(item.distanceFromPrevious),
          durationFromPrevious:
            normalizeString(item.durationFromPrevious) ||
            calculateDuration(items[index - 1]?.departureTime, item.arrivalTime),
          stopMinutes: index === 0 ? "0" : normalizeString(item.stopMinutes || "0"),
          isActive: item.isActive !== false,
        }))
        .filter((item) => item.cityName)
        .map((item, index, schedule) => ({
          ...item,
          arrivalTime: index === 0 ? "" : item.arrivalTime,
          departureTime: index === schedule.length - 1 ? "" : item.departureTime,
          stopMinutes: index === 0 || index === schedule.length - 1 ? "0" : item.stopMinutes,
        }))
    : [];

const getScopedCompanyId = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser || authUser.role === "SUPER_ADMIN" || !authUser.companyId) return null;
  return authUser.companyId;
};

const withCompanyScope = (user, query = {}) => {
  const companyId = getScopedCompanyId(user);
  return companyId ? { ...query, companyId } : query;
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

const activeTripStatuses = ["Yet To Start", "In Progress", "Active"];

const validateBusAssignment = async (body, currentUser, existingTripId = null) => {
  const busId = normalizeString(body.bus);
  if (!busId) return null;
  if (!mongoose.Types.ObjectId.isValid(busId)) throw new Error("Choose a valid bus.");

  const bus = await Bus.findById(busId);
  if (!bus || !canAccessBus(currentUser, bus)) throw new Error("Selected bus is not available.");
  const route = await Route.findById(body.route);
  if (route && getIdValue(route.companyId) && getIdValue(bus.companyId) && getIdValue(route.companyId) !== getIdValue(bus.companyId)) {
    throw new Error("Selected bus does not belong to this route company.");
  }

  const assignedTrip = await Trip.findOne({
    bus: bus._id,
    status: { $in: activeTripStatuses },
    ...(existingTripId ? { _id: { $ne: existingTripId } } : {}),
  });
  if (assignedTrip) {
    throw new Error("This bus is already assigned to another active trip.");
  }
  return bus;
};

const canAccessTrip = (user, trip) => {
  const conductorBusId = getAssignedConductorBusId(user);
  if (conductorBusId && getIdValue(trip?.bus?._id || trip?.bus) !== conductorBusId) return false;
  const officeBusIds = getAssignedOfficeBusIds(user);
  if (officeBusIds.length && !officeBusIds.includes(getIdValue(trip?.bus?._id || trip?.bus))) return false;
  const companyId = getScopedCompanyId(user);
  if (!companyId) return true;
  return getIdValue(trip?.companyId || trip?.bus?.companyId || trip?.route?.companyId) === getIdValue(companyId);
};

const buildTripPayload = async (body, route) => {
  const stopSchedule = normalizeStopSchedule(body.stopSchedule);
  const firstStop = stopSchedule[0] || {};
  const lastStop = stopSchedule[stopSchedule.length - 1] || {};
  const scheduleStartDate = normalizeString(body.scheduleStartDate || body.journeyDate);
  const runsContinuously = body.runsContinuously !== false;
  const companyPaymentMethods = await getCompanyPaymentMethods(route.companyId);
  const requestedPaymentMethods = normalizePaymentMethods(body.acceptedPaymentMethods);
  const acceptedPaymentMethods = requestedPaymentMethods.length ? requestedPaymentMethods : companyPaymentMethods;
  const invalidMethods = acceptedPaymentMethods.filter((method) => !companyPaymentMethods.includes(method));

  if (!acceptedPaymentMethods.length) {
    throw new Error("Select at least one payment method for this trip.");
  }
  if (invalidMethods.length) {
    throw new Error(`Trip payment methods must be enabled by super admin first: ${invalidMethods.join(", ")}.`);
  }

  return {
    bus: body.bus || null,
    route: route._id,
    companyId: route.companyId || null,
    tripCode: normalizeString(body.tripCode).toUpperCase(),
    journeyDate: scheduleStartDate,
    arrivalDate: "",
    scheduleStartDate,
    scheduleEndDate: runsContinuously ? "" : normalizeString(body.scheduleEndDate),
    runsContinuously,
    operatingDays: Array.isArray(body.operatingDays) ? body.operatingDays.map(normalizeString).filter(Boolean) : [],
    departureDay: "",
    departureTime: normalizeString(firstStop.departureTime || body.departureTime),
    arrivalDay: "",
    arrivalTime: normalizeString(lastStop.arrivalTime || body.arrivalTime),
    stopSchedule,
    returnEnabled: false,
    returnDepartureDate: "",
    returnArrivalDate: "",
    returnDepartureDay: "",
    returnDepartureTime: "",
    returnArrivalDay: "",
    returnArrivalTime: "",
    status: normalizeString(body.status) || "Yet To Start",
    acceptedPaymentMethods,
  };
};

const validateSchedule = (body) => {
  const required = ["tripCode", "route", "bus", "scheduleStartDate", "status"];
  const missing = required.some((field) => !normalizeString(body[field]));
  if (missing) return "Trip code, route, bus, start date and status are required.";
  if (body.runsContinuously === false && !normalizeString(body.scheduleEndDate)) {
    return "Select an end date or keep the trip continuous.";
  }
  if (!Array.isArray(body.operatingDays) || !body.operatingDays.length) {
    return "Select at least one operating day.";
  }
  const stopSchedule = normalizeStopSchedule(body.stopSchedule);
  if (stopSchedule.length < 2) return "Select a route with at least two cities.";
  if (!normalizeString(stopSchedule[0].departureTime)) return "Set the departure time for the first city.";
  if (!normalizeString(stopSchedule[stopSchedule.length - 1].arrivalTime)) return "Set the arrival time for the final city.";
  return "";
};

router.post("/get-all-trips", authMiddleware, async (req, res) => {
  try {
    const query = withCompanyScope(req.user, {});
    const conductorBusId = getAssignedConductorBusId(req.user);
    const officeBusIds = getAssignedOfficeBusIds(req.user);
    if (conductorBusId) query.bus = conductorBusId;
    if (officeBusIds.length) query.bus = { $in: officeBusIds };

    const trips = await Trip.find(query).populate("bus").populate("route").sort({ scheduleStartDate: -1, createdAt: -1 });
    return res.status(200).send({
      success: true,
      message: "Trips fetched successfully",
      data: trips.filter((trip) => canAccessTrip(req.user, trip)),
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/save-trip", authMiddleware, async (req, res) => {
  try {
    const validationMessage = validateSchedule(req.body);
    if (validationMessage) return res.status(200).send({ success: false, message: validationMessage });

    const route = await Route.findById(req.body.route);
    if (!route) return res.status(200).send({ success: false, message: "Route not found" });
    const companyId = getScopedCompanyId(req.user);
    if (companyId && getIdValue(route.companyId) !== getIdValue(companyId)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    const assignedBus = await validateBusAssignment(req.body, req.user, req.body._id || null);

    const payload = await buildTripPayload(req.body, route);
    payload.companyId = route.companyId || assignedBus?.companyId || null;
    const duplicateTripCode = await Trip.findOne({
      tripCode: payload.tripCode,
      companyId: payload.companyId || null,
      ...(req.body._id ? { _id: { $ne: req.body._id } } : {}),
    });
    if (duplicateTripCode) {
      return res.status(200).send({ success: false, message: "Trip code already exists." });
    }
    let savedTrip = null;
    if (req.body._id) {
      const existingTrip = await Trip.findById(req.body._id).populate("bus").populate("route");
      if (!existingTrip || !canAccessTrip(req.user, existingTrip)) {
        return res.status(403).send({ success: false, message: "Access denied" });
      }
      if (getIdValue(existingTrip.bus) && getIdValue(existingTrip.bus) !== getIdValue(payload.bus)) {
        await Bus.updateOne({ _id: existingTrip.bus }, { $pull: { trips: existingTrip._id } });
      }
      savedTrip = await Trip.findByIdAndUpdate(req.body._id, payload, { new: true }).populate("bus").populate("route");
    } else {
      savedTrip = await new Trip(payload).save();
      savedTrip = await Trip.findById(savedTrip._id).populate("bus").populate("route");
    }

    if (savedTrip.bus) {
      await Bus.updateOne(
        { _id: savedTrip.bus },
        {
          $set: {
            trips: [savedTrip._id],
            route: route._id,
            companyId: payload.companyId || null,
            journeyDate: savedTrip.scheduleStartDate || savedTrip.journeyDate,
            departure: savedTrip.departureTime,
            arrival: savedTrip.arrivalTime,
            from: route.fromCity,
            to: route.toCity,
          },
        }
      );
    }

    await createAuditNotification(req.user, {
      companyId: savedTrip?.companyId || route.companyId,
      module: "trips",
      action: req.body._id ? "updated" : "created",
      entityType: "trip",
      entityId: savedTrip?._id,
      entityLabel: `${payload.tripCode || route.routeName || route.fromCity} - ${savedTrip?.bus?.number || "Trip"}`,
    });

    return res.status(200).send({
      success: true,
      message: req.body._id ? "Trip updated successfully" : "Trip saved successfully",
      data: savedTrip,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/delete-trip", authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findById(req.body._id).populate("bus").populate("route");
    if (!trip || !canAccessTrip(req.user, trip)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }
    await Bus.updateMany({ trips: trip._id }, { $pull: { trips: trip._id } });
    await Trip.findByIdAndDelete(req.body._id);
    await createAuditNotification(req.user, {
      companyId: trip.companyId || trip.bus?.companyId || trip.route?.companyId,
      module: "trips",
      action: "deleted",
      entityType: "trip",
      entityId: trip._id,
      entityLabel: `${trip.route?.routeName || "Trip"} - ${trip.journeyDate}`,
    });
    return res.status(200).send({ success: true, message: "Trip deleted successfully" });
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
