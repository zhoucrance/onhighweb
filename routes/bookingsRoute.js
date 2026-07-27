const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authMiddleware");
const Booking = require("../models/bookingsModel");
const Bus = require("../models/busModel");
const Trip = require("../models/tripModel");
const RouteStop = require("../models/routeStopModel");
const Company = require("../models/companyModel");
const Cancellation = require("../models/cancellationModel");
const Refund = require("../models/refundModel");
const CustomerCredit = require("../models/customerCreditModel");
const stripe = require("stripe")(process.env.stripe_key);
const { v4: uuidv4 } = require("uuid");
const { getAssignedConductorBusId, getAssignedOfficeBusIds, getIdValue, serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");

const normalizeString = (value) => String(value || "").trim();
const normalizeCode = (value) => normalizeString(value).toUpperCase().replace(/[\s-]+/g, "_");
const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const seatDebugLogPath = path.join(__dirname, "..", ".codex-logs", "seat-debug.jsonl");

const getScopedCompanyId = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser || authUser.role === "SUPER_ADMIN" || !authUser.companyId) return null;
  return authUser.companyId;
};

const getBookingCompanyId = (booking) =>
  booking?.companyId || booking?.bus?.companyId || booking?.trip?.companyId || null;

const canAccessCompanyRecord = (user, record) => {
  const conductorBusId = getAssignedConductorBusId(user);
  if (conductorBusId && getIdValue(record?.bus?._id || record?.bus) !== conductorBusId) return false;
  const officeBusIds = getAssignedOfficeBusIds(user);
  if (officeBusIds.length && !officeBusIds.includes(getIdValue(record?.bus?._id || record?.bus))) return false;
  const companyId = getScopedCompanyId(user);
  if (!companyId) return true;
  return getIdValue(getBookingCompanyId(record)) === getIdValue(companyId);
};

const canAccessBusOrTrip = (user, record) => {
  const conductorBusId = getAssignedConductorBusId(user);
  if (conductorBusId && getIdValue(record?.bus?._id || record?._id) !== conductorBusId) return false;
  const officeBusIds = getAssignedOfficeBusIds(user);
  if (officeBusIds.length && !officeBusIds.includes(getIdValue(record?.bus?._id || record?._id))) return false;
  const companyId = getScopedCompanyId(user);
  if (!companyId) return true;
  return getIdValue(record?.companyId || record?.bus?.companyId) === getIdValue(companyId);
};

const writeSeatDebugLog = (event, payload) => {
  try {
    fs.mkdirSync(path.dirname(seatDebugLogPath), { recursive: true });
    fs.appendFileSync(
      seatDebugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        service: "onhighweb",
        routeFile: "bookingsRoute.js",
        event,
        mongoDb: mongoose.connection.name || "",
        ...(payload || {}),
      })}\n`
    );
  } catch (error) {
    console.log("[seat-debug] file log failed", error.message);
  }
};

const normalizeSeatNumbers = (seats) => [
  ...new Set(
    (Array.isArray(seats) ? seats : [seats])
      .flatMap((seat) => String(seat || "").split(","))
      .map((seat) => Number(String(seat).trim()))
      .filter((seat) => Number.isInteger(seat) && seat > 0)
  ),
];

const getSeatPullValues = (seats) => [
  ...new Set(seats.flatMap((seat) => [seat, String(seat)])),
];

const getSeatAvailability = (capacity, bookedSeats) => {
  const booked = normalizeSeatNumbers(bookedSeats).filter((seat) => seat <= capacity);
  const bookedSet = new Set(booked);
  const available = Array.from({ length: capacity }, (_, index) => index + 1).filter(
    (seat) => !bookedSet.has(seat)
  );
  return {
    totalSeatCount: capacity,
    bookedCount: booked.length,
    availableCount: available.length,
    bookedSeats: booked,
    availableSeats: available,
  };
};

const internalSeatReleaseToken =
  process.env.INTERNAL_SEAT_RELEASE_TOKEN || process.env.ONHIGH_INTERNAL_API_TOKEN || "";

const inactiveBookingStatuses = [
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

const payOnBoardingPaymentStatus = "PENDING_PAY_ON_BOARDING";
const reservedAwaitingPaymentStatus = "RESERVED_AWAITING_PAYMENT";
const defaultPaymentMethods = ["EcoCash", "Card Payment"];

const isPayOnBoardingMethod = (method) => normalizeCode(method) === "PAY_ON_BOARDING";
const isPayOnBoardingReservation = (booking) =>
  isPayOnBoardingMethod(booking?.paymentMethod) &&
  normalizeCode(booking?.paymentStatus) === payOnBoardingPaymentStatus &&
  normalizeCode(booking?.bookingStatus || booking?.status) === reservedAwaitingPaymentStatus;

const getCompanyPaymentMethods = async (companyId) => {
  if (!companyId) return defaultPaymentMethods;
  const company = await Company.findById(companyId, { enabledPaymentMethods: 1 }).lean();
  return company?.enabledPaymentMethods?.length ? company.enabledPaymentMethods : defaultPaymentMethods;
};

const validateBookingPaymentMethod = async ({ requestedMethod, trip = null, bus = null, companyId = null }) => {
  const paymentMethod = normalizeString(requestedMethod || (trip ? "Card Payment" : "Card Payment"));
  const companyPaymentMethods = await getCompanyPaymentMethods(companyId || trip?.companyId || trip?.bus?.companyId || bus?.companyId);
  const tripMethods = Array.isArray(trip?.acceptedPaymentMethods) && trip.acceptedPaymentMethods.length
    ? trip.acceptedPaymentMethods.filter((method) => companyPaymentMethods.includes(method))
    : companyPaymentMethods;
  const allowedMethods = trip ? tripMethods : companyPaymentMethods;
  if (!allowedMethods.includes(paymentMethod)) {
    throw new Error(`${paymentMethod || "Selected payment method"} is not accepted for this ${trip ? "trip" : "bus"}.`);
  }
  return paymentMethod;
};

const internalSeatReleaseMiddleware = (req, res, next) => {
  if (!internalSeatReleaseToken) {
    return next();
  }

  const requestToken = req.headers["x-internal-token"] || req.headers["x-onhigh-internal-token"];
  if (requestToken !== internalSeatReleaseToken) {
    return res.status(401).send({
      message: "Unauthorized seat release request",
      success: false,
    });
  }

  next();
};

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const isPastJourneyDate = (value) => {
  const journeyDate = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(journeyDate) && journeyDate < getTodayDate();
};

const getTicketChecksum = (value) => {
  const checksum = String(value || "")
    .split("")
    .reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
  return String(checksum % 97).padStart(2, "0");
};

const getWebTicketPrefix = (bookingData = {}, user = {}) => {
  const transactionId = normalizeCode(bookingData.transactionId);
  const authUser = serializeAuthUser(user);
  if (transactionId.startsWith("OFFICE") || authUser?.staffTitle === "OFFICE_BOOKING") return "OFF";
  return "DIR";
};

const generateWebTicketNumber = (bookingId, bookingData = {}, user = {}) => {
  const prefix = getWebTicketPrefix(bookingData, user);
  const datePart = getTodayDate().replace(/-/g, "");
  const rawId = String(bookingId || uuidv4()).replace(/-/g, "").toUpperCase();
  const suffix = rawId.slice(-6);
  const checksum = getTicketChecksum(`${prefix}${datePart}${suffix}`);
  return `${prefix}-${datePart}-${suffix}-${checksum}`;
};

// reusable internal release after payment cancellation/failure/expiry

router.post("/release-seat-hold", internalSeatReleaseMiddleware, async (req, res) => {
  try {
    const bookingReference = normalizeString(req.body.bookingReference || req.body.transactionId);
    const reason = normalizeString(req.body.reason) || "payment_cancelled";
    const cancelledByNumber = normalizeString(
      req.body.cancelledByNumber || req.body.userNumber || req.body.phoneNumber || req.body.number
    );
    const cancellationSource = normalizeString(req.body.cancellationSource || req.body.source) || "internal";
    const flowToken = normalizeString(req.body.flowToken);
    let booking = null;

    if (bookingReference) {
      booking = await Booking.findOne({ transactionId: bookingReference });
    }

    const seats = normalizeSeatNumbers(req.body.seats || booking?.seats || []);
    const busId = req.body.busId || req.body.bus || booking?.bus;
    const tripId = req.body.tripId || req.body.trip || booking?.trip;

    console.log("[seat-release] request", {
      bookingReference,
      reason,
      cancellationSource,
      cancelledByNumber,
      flowToken,
      bookingUser: String(booking?.user || ""),
      busId: String(busId || ""),
      tripId: String(tripId || ""),
      seats,
      bookingFound: Boolean(booking),
    });

    if (!seats.length || (!busId && !tripId && !bookingReference)) {
      return res.status(400).send({
        message: "Seat release requires seats and a booking, bus, or trip reference",
        success: false,
      });
    }

    const seatPullValues = getSeatPullValues(seats);
    let busUpdate = null;
    let tripUpdate = null;
    let bookingUpdate = null;
    const [busBefore, tripBefore] = await Promise.all([
      busId ? Bus.findById(busId, { seatsBooked: 1 }) : null,
      tripId ? Trip.findById(tripId, { seatsBooked: 1 }) : null,
    ]);

    if (busId) {
      busUpdate = await Bus.updateOne(
        { _id: busId },
        { $pull: { seatsBooked: { $in: seatPullValues } } }
      );
    }

    if (tripId) {
      tripUpdate = await Trip.updateOne(
        { _id: tripId },
        { $pull: { seatsBooked: { $in: seatPullValues } } }
      );
    }

    if (bookingReference) {
      bookingUpdate = await Booking.updateOne(
        { transactionId: bookingReference },
        {
          $set: {
            status: reason,
            bookingStatus: reason,
            paymentStatus: reason,
            cancelReason: reason,
            cancellationSource,
            cancelledByNumber,
            cancelledAt: new Date(),
          },
        }
      );
    }

    const [busAfter, tripAfter] = await Promise.all([
      busId ? Bus.findById(busId, { seatsBooked: 1 }) : null,
      tripId ? Trip.findById(tripId, { seatsBooked: 1 }) : null,
    ]);

    console.log("[seat-release] result", {
      bookingReference,
      reason,
      cancellationSource,
      cancelledByNumber,
      bookingUser: String(booking?.user || ""),
      seats,
      seatPullValues,
      busSeatsBefore: busBefore?.seatsBooked || [],
      tripSeatsBefore: tripBefore?.seatsBooked || [],
      busMatched: busUpdate?.matchedCount || 0,
      busModified: busUpdate?.modifiedCount || 0,
      tripMatched: tripUpdate?.matchedCount || 0,
      tripModified: tripUpdate?.modifiedCount || 0,
      bookingMatched: bookingUpdate?.matchedCount || 0,
      bookingModified: bookingUpdate?.modifiedCount || 0,
      busSeatsAfter: busAfter?.seatsBooked || [],
      tripSeatsAfter: tripAfter?.seatsBooked || [],
    });

    return res.status(200).send({
      message: "Seat hold released",
      success: true,
      data: {
        bookingReference,
        reason,
        cancellationSource,
        cancelledByNumber,
        bookingUser: String(booking?.user || ""),
        seats,
        busSeatsAfter: busAfter?.seatsBooked || [],
        tripSeatsAfter: tripAfter?.seatsBooked || [],
      },
    });
  } catch (error) {
    console.log("[seat-release] failed", error);
    return res.status(500).send({
      message: "Seat release failed",
      data: error,
      success: false,
    });
  }
});

// book a seat

router.post("/book-seat", authMiddleware, async (req, res) => {
  let reservedTripId = null;
  let reservedBusId = null;
  let reservedSeats = [];

  try {
    const selectedSeats = [
      ...new Set((req.body.seats || []).map((seat) => Number(seat))),
    ];
    if (!selectedSeats.length) {
      return res.status(200).send({
        message: "Select at least one seat",
        success: false,
      });
    }
    const selectedSeatConflictValues = getSeatPullValues(selectedSeats);

    const bookingData = {
      ...req.body,
      seats: selectedSeats,
      user: req.body.userId,
    };
    if (isPayOnBoardingMethod(bookingData.paymentMethod)) {
      const seatCount = selectedSeats.length || 1;
      const pendingAmount = Number(bookingData.amountPaid ?? Number(bookingData.fare || 0) * seatCount);
      bookingData.amountPaid = pendingAmount;
      bookingData.paymentMethod = "Pay on Boarding";
      bookingData.paymentStatus = payOnBoardingPaymentStatus;
      bookingData.status = reservedAwaitingPaymentStatus;
      bookingData.bookingStatus = reservedAwaitingPaymentStatus;
      bookingData.boardedStatus = "NOT_BOARDED";
    }

    if (req.body.trip) {
      const trip = await Trip.findById(req.body.trip).populate("bus");
      if (!trip || !trip.bus) {
        return res.status(200).send({
          message: "Trip not found",
          success: false,
        });
      }
      if (!canAccessBusOrTrip(req.user, trip)) {
        return res.status(403).send({ message: "Access denied", success: false });
      }
      try {
        bookingData.paymentMethod = await validateBookingPaymentMethod({
          requestedMethod: bookingData.paymentMethod,
          trip,
        });
      } catch (error) {
        return res.status(200).send({ message: error.message, success: false });
      }
      const selectedJourneyDate = normalizeString(req.body.travelDate || req.body.journeyDate || trip.journeyDate || trip.scheduleStartDate);
      if (isPastJourneyDate(selectedJourneyDate)) {
        return res.status(200).send({
          message: "Past dates are not allowed for booking.",
          success: false,
        });
      }
      const capacity = Number(trip.bus.capacity || 0);
      const invalidSeat = selectedSeats.some((seat) => seat < 1 || seat > capacity);
      if (invalidSeat) {
        return res.status(200).send({
          message: "One or more selected seats are invalid for this bus",
          success: false,
        });
      }

      let fromStopOrder = Number(req.body.fromStopOrder);
      let toStopOrder = Number(req.body.toStopOrder);
      let fromStopId = req.body.fromStop || req.body.fromStopId;
      let toStopId = req.body.toStop || req.body.toStopId;

      if ((!fromStopOrder || !toStopOrder) && fromStopId && toStopId) {
        const routeStops = await RouteStop.find({
          _id: { $in: [fromStopId, toStopId] },
          route: trip.route,
        });
        const fromStop = routeStops.find((stop) => String(stop._id) === String(fromStopId));
        const toStop = routeStops.find((stop) => String(stop._id) === String(toStopId));
        fromStopOrder = fromStop?.stopOrder;
        toStopOrder = toStop?.stopOrder;
      }

      if (!fromStopOrder || !toStopOrder || toStopOrder <= fromStopOrder) {
        return res.status(200).send({
          message: "A valid route segment is required for this booking",
          success: false,
        });
      }

      const overlappingBookings = await Booking.find(
        {
          trip: trip._id,
          fromStopOrder: { $lt: toStopOrder },
          toStopOrder: { $gt: fromStopOrder },
          status: { $nin: inactiveBookingStatuses },
          bookingStatus: { $nin: inactiveBookingStatuses },
          paymentStatus: { $nin: inactivePaymentStatuses },
        },
        { seats: 1, transactionId: 1, status: 1, bookingStatus: 1, paymentStatus: 1 }
      );
      const segmentBookedSeats = overlappingBookings.flatMap((booking) => normalizeSeatNumbers(booking.seats || []));
      const availability = getSeatAvailability(capacity, segmentBookedSeats);
      const unavailableSelectedSeats = selectedSeats.filter(
        (seat) => !availability.availableSeats.includes(seat)
      );
      console.log("[book-seat] availability check", {
        source: "trip",
        busId: String(trip.bus._id || ""),
        tripId: String(trip._id || ""),
        fromStopOrder,
        toStopOrder,
        requestedSeats: selectedSeats,
        unavailableSelectedSeats,
        totalSeatCount: availability.totalSeatCount,
        bookedCount: availability.bookedCount,
        availableCount: availability.availableCount,
        bookedSeats: availability.bookedSeats,
        availableSeats: availability.availableSeats,
      });
      writeSeatDebugLog("onhighweb_book_seat_availability_check", {
        source: "trip",
        busId: String(trip.bus._id || ""),
        busName: trip.bus.name,
        busNumber: trip.bus.number,
        tripId: String(trip._id || ""),
        routeId: String(trip.route || ""),
        journeyDate: selectedJourneyDate,
        fromStopOrder,
        toStopOrder,
        requestedSeats: selectedSeats,
        unavailableSelectedSeats,
        totalSeatCount: availability.totalSeatCount,
        bookedCount: availability.bookedCount,
        availableCount: availability.availableCount,
        bookedSeats: availability.bookedSeats,
        availableSeats: availability.availableSeats,
        busSeatsBookedRaw: trip.bus.seatsBooked || [],
        tripSeatsBookedRaw: trip.seatsBooked || [],
        overlappingBookings: overlappingBookings.map((booking) => ({
          transactionId: booking.transactionId,
          status: booking.status,
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
          seats: booking.seats || [],
        })),
      });
      if (unavailableSelectedSeats.length) {
        return res.status(200).send({
          message: "One or more selected seats are already booked for this route segment",
          success: false,
        });
      }

      const conflictingBooking = await Booking.findOne({
        trip: trip._id,
        seats: { $in: selectedSeatConflictValues },
        fromStopOrder: { $lt: toStopOrder },
        toStopOrder: { $gt: fromStopOrder },
        status: { $nin: inactiveBookingStatuses },
        bookingStatus: { $nin: inactiveBookingStatuses },
        paymentStatus: { $nin: inactivePaymentStatuses },
      });

      if (conflictingBooking) {
        return res.status(200).send({
          message: "One or more selected seats are already booked for this route segment",
          success: false,
        });
      }

      bookingData.bus = trip.bus._id;
      bookingData.route = trip.route;
      bookingData.companyId = trip.companyId || trip.bus.companyId || null;
      bookingData.fromStop = fromStopId;
      bookingData.toStop = toStopId;
      bookingData.fromStopOrder = fromStopOrder;
      bookingData.toStopOrder = toStopOrder;
      bookingData.journeyDate = selectedJourneyDate;
      bookingData.travelDate = selectedJourneyDate;

      await Trip.findByIdAndUpdate(trip._id, { $pull: { seatsBooked: { $in: selectedSeatConflictValues } } });
      await Bus.findByIdAndUpdate(trip.bus._id, { $pull: { seatsBooked: { $in: selectedSeatConflictValues } } });

      const reservedTrip = await Trip.findOneAndUpdate(
        { _id: trip._id },
        { $addToSet: { seatsBooked: { $each: selectedSeats } } },
        { new: true }
      );
      if (!reservedTrip) {
        return res.status(200).send({
          message: "One or more selected seats are already booked for this bus",
          success: false,
        });
      }
      reservedTripId = trip._id;

      const reservedBus = await Bus.findOneAndUpdate(
        { _id: trip.bus._id },
        { $addToSet: { seatsBooked: { $each: selectedSeats } } },
        { new: true }
      );
      if (!reservedBus) {
        await Trip.findByIdAndUpdate(trip._id, { $pull: { seatsBooked: { $in: selectedSeatConflictValues } } });
        reservedTripId = null;
        return res.status(200).send({
          message: "One or more selected seats are already booked for this bus",
          success: false,
        });
      }
      reservedBusId = trip.bus._id;
      reservedSeats = selectedSeats;
    } else {
      const bus = await Bus.findById(req.body.bus);
      if (!bus) {
        return res.status(200).send({
          message: "Bus not found",
          success: false,
        });
      }
      if (!canAccessBusOrTrip(req.user, bus)) {
        return res.status(403).send({ message: "Access denied", success: false });
      }
      try {
        bookingData.paymentMethod = await validateBookingPaymentMethod({
          requestedMethod: bookingData.paymentMethod,
          bus,
        });
      } catch (error) {
        return res.status(200).send({ message: error.message, success: false });
      }
      const selectedJourneyDate = normalizeString(req.body.travelDate || req.body.journeyDate || bus.journeyDate);
      if (isPastJourneyDate(selectedJourneyDate)) {
        return res.status(200).send({
          message: "Past dates are not allowed for booking.",
          success: false,
        });
      }
      const capacity = Number(bus.capacity || 0);
      const invalidSeat = selectedSeats.some((seat) => seat < 1 || seat > capacity);
      if (invalidSeat) {
        return res.status(200).send({
          message: "One or more selected seats are invalid for this bus",
          success: false,
        });
      }
      const activeBookings = await Booking.find(
        {
          bus: bus._id,
          status: { $nin: inactiveBookingStatuses },
          bookingStatus: { $nin: inactiveBookingStatuses },
          paymentStatus: { $nin: inactivePaymentStatuses },
        },
        { seats: 1, transactionId: 1, status: 1, bookingStatus: 1, paymentStatus: 1 }
      );
      const activeBookedSeats = activeBookings.flatMap((booking) => normalizeSeatNumbers(booking.seats || []));
      const availability = getSeatAvailability(capacity, activeBookedSeats);
      const unavailableSelectedSeats = selectedSeats.filter(
        (seat) => !availability.availableSeats.includes(seat)
      );
      console.log("[book-seat] availability check", {
        source: "bus",
        busId: String(bus._id || ""),
        requestedSeats: selectedSeats,
        unavailableSelectedSeats,
        totalSeatCount: availability.totalSeatCount,
        bookedCount: availability.bookedCount,
        availableCount: availability.availableCount,
        bookedSeats: availability.bookedSeats,
        availableSeats: availability.availableSeats,
      });
      writeSeatDebugLog("onhighweb_book_seat_availability_check", {
        source: "bus",
        busId: String(bus._id || ""),
        busName: bus.name,
        busNumber: bus.number,
        routeId: String(bus.route || ""),
        journeyDate: selectedJourneyDate,
        fromCity: bus.from,
        toCity: bus.to,
        requestedSeats: selectedSeats,
        unavailableSelectedSeats,
        totalSeatCount: availability.totalSeatCount,
        bookedCount: availability.bookedCount,
        availableCount: availability.availableCount,
        bookedSeats: availability.bookedSeats,
        availableSeats: availability.availableSeats,
        busSeatsBookedRaw: bus.seatsBooked || [],
        activeBookings: activeBookings.map((booking) => ({
          transactionId: booking.transactionId,
          status: booking.status,
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
          seats: booking.seats || [],
        })),
      });
      if (unavailableSelectedSeats.length) {
        return res.status(200).send({
          message: "One or more selected seats are already booked",
          success: false,
        });
      }

      const existingBooking = await Booking.findOne({
        bus: bus._id,
        seats: { $in: selectedSeatConflictValues },
        status: { $nin: inactiveBookingStatuses },
        bookingStatus: { $nin: inactiveBookingStatuses },
        paymentStatus: { $nin: inactivePaymentStatuses },
      });
      if (existingBooking) {
        return res.status(200).send({
          message: "One or more selected seats are already booked",
          success: false,
        });
      }

      await Bus.findByIdAndUpdate(bus._id, { $pull: { seatsBooked: { $in: selectedSeatConflictValues } } });
      const reservedBus = await Bus.findOneAndUpdate(
        { _id: bus._id },
        { $addToSet: { seatsBooked: { $each: selectedSeats } } },
        { new: true }
      );
      if (!reservedBus) {
        return res.status(200).send({
          message: "One or more selected seats are already booked",
          success: false,
        });
      }
      reservedBusId = bus._id;
      reservedSeats = selectedSeats;
      bookingData.companyId = bus.companyId || null;
      bookingData.journeyDate = selectedJourneyDate;
      bookingData.travelDate = selectedJourneyDate;
    }

    const newBooking = new Booking({
      ...bookingData,
    });
    if (!newBooking.ticketNumber && !newBooking.ticket_number) {
      newBooking.ticketNumber = generateWebTicketNumber(newBooking._id, bookingData, req.user);
      newBooking.ticket_number = newBooking.ticketNumber;
    }
    try {
      await newBooking.save();
    } catch (error) {
      const reservedSeatPullValues = getSeatPullValues(reservedSeats);
      if (reservedTripId) {
        await Trip.findByIdAndUpdate(reservedTripId, { $pull: { seatsBooked: { $in: reservedSeatPullValues } } });
      }
      if (reservedBusId) {
        await Bus.findByIdAndUpdate(reservedBusId, { $pull: { seatsBooked: { $in: reservedSeatPullValues } } });
      }
      throw error;
    }
    await createAuditNotification(req.user, {
      companyId: newBooking.companyId,
      module: "bookings",
      action: "created",
      entityType: "booking",
      entityId: newBooking._id,
      entityLabel: newBooking.ticketNumber || newBooking.ticket_number || "",
    });
    res.status(200).send({
      message: "Booking successful",
      data: newBooking,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Booking failed",
      data: error,
      success: false,
    });
  }
});

// make payment

router.post("/make-payment", authMiddleware, async (req, res) => {
  try {
    const { token, amount } = req.body;
    const customer = await stripe.customers.create({
      email: token.email,
      source: token.id,
    });
    const payment = await stripe.charges.create(
      {
        amount: amount,
        currency: "inr",
        customer: customer.id,
        receipt_email: token.email,
      },
      {
        idempotencyKey: uuidv4(),
      }
    );

    if (payment) {
      res.status(200).send({
        message: "Payment successful",
        data: {
          transactionId: payment.source.id,
        },
        success: true,
      });
    } else {
      res.status(500).send({
        message: "Payment failed",
        data: error,
        success: false,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Payment failed",
      data: error,
      success: false,
    });
  }
});

// get bookings by user id
router.post("/get-bookings-by-user-id", authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.body.userId })
      .sort({ createdAt: -1, _id: -1 })
      .populate("bus")
      .populate("trip")
      .populate("route")
      .populate("user");
    res.status(200).send({
      message: "Bookings fetched successfully",
      data: bookings,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Bookings fetch failed",
      data: error,
      success: false,
    });
  }
});

// get all bookings
router.post("/get-all-bookings", authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1, _id: -1 })
      .populate("bus")
      .populate("trip")
      .populate("route")
      .populate("user");
    res.status(200).send({
      message: "Bookings fetched successfully",
      data: bookings.filter((booking) => canAccessCompanyRecord(req.user, booking)),
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Bookings fetch failed",
      data: error,
      success: false,
    });
  }
});

router.post("/mark-ticket-printed", authMiddleware, async (req, res) => {
  try {
    const reference = normalizeString(req.body.ticketNumber);
    const bookingId = normalizeString(req.body.bookingId || req.body._id);
    const lookupOptions = [];
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
      lookupOptions.push({ _id: bookingId });
    }
    if (reference) {
      lookupOptions.push(
        { ticketNumber: reference },
        { ticket_number: reference },
        { transactionId: reference },
        { booking_reference: reference }
      );
    }

    if (!lookupOptions.length) {
      return res.status(200).send({ success: false, message: "Booking not found" });
    }

    const booking = await Booking.findOne({ $or: lookupOptions }).populate("bus").populate("trip");
    if (!booking) {
      return res.status(200).send({ success: false, message: "Booking not found" });
    }
    if (!canAccessCompanyRecord(req.user, booking)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }

    const previousPrintCount = Number(booking.printCount || 0);
    const wasAlreadyPrinted = previousPrintCount > 0;
    booking.printCount = previousPrintCount + 1;
    booking.firstPrintedAt = booking.firstPrintedAt || new Date();
    booking.lastPrintedAt = new Date();
    booking.lastPrintedBy = req.user._id;
    await booking.save();

    const ticketNumber = normalizeString(booking.ticketNumber || booking.ticket_number || booking.transactionId);
    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId || booking.trip?.companyId,
      module: "bookings",
      action: wasAlreadyPrinted ? "reprinted" : "printed",
      entityType: "ticket",
      entityId: booking._id,
      entityLabel: ticketNumber,
      message: `${req.user.name || req.user.fullName || "A user"} ${wasAlreadyPrinted ? "reprinted" : "printed"} ticket ${ticketNumber}.`,
    });

    res.status(200).send({
      success: true,
      message: wasAlreadyPrinted ? "This ticket was already printed before." : "Ticket print recorded.",
      data: {
        bookingId: booking._id,
        ticketNumber,
        printCount: booking.printCount,
        wasAlreadyPrinted,
        lastPrintedAt: booking.lastPrintedAt,
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

const findAccessibleBookingForAction = async (req) => {
  const reference = normalizeString(req.body.ticketNumber);
  const bookingId = normalizeString(req.body.bookingId || req.body._id);
  const lookupOptions = [];
  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) lookupOptions.push({ _id: bookingId });
  if (reference) {
    lookupOptions.push(
      { ticketNumber: reference },
      { ticket_number: reference },
      { transactionId: reference },
      { booking_reference: reference }
    );
  }
  if (!lookupOptions.length) return null;
  const booking = await Booking.findOne({ $or: lookupOptions }).populate("bus").populate("trip").populate("route");
  if (!booking || !canAccessCompanyRecord(req.user, booking)) return null;
  return booking;
};

const reserveSeatsForExistingBooking = async (booking) => {
  const originalSeats = normalizeSeatNumbers(booking.seats);
  if (!originalSeats.length) return { success: false, message: "No seats found on this ticket." };
  const statusFilter = {
    status: { $nin: inactiveBookingStatuses },
    bookingStatus: { $nin: inactiveBookingStatuses },
    paymentStatus: { $nin: inactivePaymentStatuses },
  };
  const baseActiveQuery = {
    _id: { $ne: booking._id },
    ...statusFilter,
  };

  let activeQuery = { ...baseActiveQuery, bus: getIdValue(booking.bus) };
  if (booking.trip && booking.fromStopOrder && booking.toStopOrder) {
    activeQuery = {
      ...baseActiveQuery,
      trip: getIdValue(booking.trip),
      fromStopOrder: { $lt: booking.toStopOrder },
      toStopOrder: { $gt: booking.fromStopOrder },
    };
  }

  const activeBookings = await Booking.find(activeQuery, { seats: 1 });
  const activeBookedSeats = [
    ...new Set(activeBookings.flatMap((activeBooking) => normalizeSeatNumbers(activeBooking.seats || []))),
  ];
  const capacity = Number(booking.bus?.capacity || 0);
  if (!capacity) return { success: false, message: "Bus capacity is not available for this ticket." };
  const availableSeats = Array.from({ length: capacity }, (_, index) => index + 1).filter(
    (seat) => !activeBookedSeats.includes(seat)
  );
  const preferredSeats = originalSeats.filter((seat) => availableSeats.includes(seat));
  const assignedSeats = [
    ...preferredSeats,
    ...availableSeats.filter((seat) => !preferredSeats.includes(seat)),
  ].slice(0, originalSeats.length);

  if (assignedSeats.length < originalSeats.length) {
    return { success: false, message: "Not enough free seats are available on this journey." };
  }

  const originalSeatPullValues = getSeatPullValues(originalSeats);
  const assignedSeatPullValues = getSeatPullValues(assignedSeats);
  const tripId = getIdValue(booking.trip);
  const busId = getIdValue(booking.bus);
  if (tripId) {
    await Trip.findByIdAndUpdate(tripId, { $pull: { seatsBooked: { $in: originalSeatPullValues } } });
    await Trip.findByIdAndUpdate(tripId, { $addToSet: { seatsBooked: { $each: assignedSeats } } });
  }
  if (busId) {
    await Bus.findByIdAndUpdate(busId, { $pull: { seatsBooked: { $in: originalSeatPullValues } } });
    await Bus.findByIdAndUpdate(busId, { $addToSet: { seatsBooked: { $each: assignedSeats } } });
  }

  return { success: true, assignedSeats, assignedSeatPullValues };
};

router.post("/board-ticket", authMiddleware, async (req, res) => {
  try {
    const booking = await findAccessibleBookingForAction(req);
    if (!booking) return res.status(200).send({ success: false, message: "Booking not found" });

    const status = normalizeCode(booking.bookingStatus || booking.status);
    if (status.includes("CANCEL")) {
      return res.status(200).send({ success: false, message: "Apply credits before boarding this cancelled ticket." });
    }
    if (status === "BOARDED" || normalizeCode(booking.boardedStatus) === "BOARDED") {
      return res.status(200).send({ success: true, message: "Ticket is already boarded", data: booking });
    }

    booking.status = "BOARDED";
    booking.bookingStatus = "BOARDED";
    booking.boardedStatus = "BOARDED";
    booking.boardedTime = new Date();
    booking.processedByUserId = req.user._id;
    await booking.save();

    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId || booking.trip?.companyId,
      module: "bookings",
      action: "boarded",
      entityType: "ticket",
      entityId: booking._id,
      entityLabel: normalizeString(booking.ticketNumber || booking.ticket_number || booking.transactionId),
    });

    const refreshed = await Booking.findById(booking._id).populate("bus").populate("trip").populate("route").populate("user");
    res.status(200).send({ success: true, message: "Ticket boarded successfully", data: refreshed });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.post("/apply-ticket-credits", authMiddleware, async (req, res) => {
  try {
    const booking = await findAccessibleBookingForAction(req);
    if (!booking) return res.status(200).send({ success: false, message: "Booking not found" });

    const status = normalizeCode(booking.bookingStatus || booking.status);
    if (!status.includes("CREDIT")) {
      return res.status(200).send({ success: false, message: "This ticket has no credited cancellation to apply." });
    }

    const ticketNumber = normalizeString(booking.ticketNumber || booking.ticket_number || booking.transactionId);
    const credits = await CustomerCredit.find({
      $or: [{ booking: booking._id }, { ticketNumber }],
      status: "ACTIVE",
      balance: { $gt: 0 },
    }).sort({ createdAt: 1 });
    const creditBalance = credits.reduce((sum, credit) => sum + Number(credit.balance || 0), 0);
    const requiredAmount = getBookingAmount(booking);
    if (creditBalance < requiredAmount) {
      return res.status(200).send({ success: false, message: "Credits are not enough for this ticket." });
    }

    const reserveResult = await reserveSeatsForExistingBooking(booking);
    if (!reserveResult.success) {
      return res.status(200).send({ success: false, message: reserveResult.message });
    }

    let remaining = requiredAmount;
    for (const credit of credits) {
      if (remaining <= 0) break;
      const used = Math.min(Number(credit.balance || 0), remaining);
      credit.balance = Number(credit.balance || 0) - used;
      credit.status = credit.balance > 0 ? "ACTIVE" : "APPLIED";
      remaining -= used;
      await credit.save();
    }
    const creditAppliedAmount = formatMoney(requiredAmount - remaining);
    const creditRemainingBalance = formatMoney(
      credits.reduce((sum, credit) => sum + Number(credit.balance || 0), 0)
    );

    booking.status = "CONFIRMED";
    booking.bookingStatus = "CONFIRMED";
    booking.boardedStatus = "NOT_BOARDED";
    booking.seats = reserveResult.assignedSeats;
    booking.paymentMethod = "Credits";
    booking.paymentStatus = "Paid";
    booking.creditAppliedAmount = creditAppliedAmount;
    booking.creditRemainingBalance = creditRemainingBalance;
    booking.creditAppliedAt = new Date();
    booking.cancelReason = "";
    booking.cancelledAt = null;
    booking.processedByUserId = req.user._id;
    await booking.save();

    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId || booking.trip?.companyId,
      module: "bookings",
      action: "applied credits to",
      entityType: "ticket",
      entityId: booking._id,
      entityLabel: ticketNumber,
    });

    const refreshed = await Booking.findById(booking._id).populate("bus").populate("trip").populate("route").populate("user");
    res.status(200).send({
      success: true,
      message: `Credits applied successfully. Seat(s) assigned: ${reserveResult.assignedSeats.join(", ")}. Balance left: USD ${creditRemainingBalance}.`,
      data: refreshed,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

const bookingManagementPopulate = (query) =>
  query.populate("bus").populate("trip").populate("route").populate("user").populate("processedByUserId");

const getManagementSource = (booking) => {
  const explicit = normalizeCode(
    booking.bookingSource || booking.booking_source || booking.source || booking.cancellationSource
  );
  if (explicit.includes("WHATSAPP") || explicit.includes("FLOW")) return "WHATSAPP";
  if (explicit.includes("WEB")) return "WEB_APP";
  return booking.user ? "WEB_APP" : "WHATSAPP";
};

const getManagementSourceLabel = (booking) => {
  const source = getManagementSource(booking);
  if (source === "WHATSAPP") return "WhatsApp";
  const reference = normalizeCode(`${booking.ticketNumber || booking.ticket_number || ""} ${booking.transactionId || ""}`);
  if (reference.includes("OFFICE") || reference.includes("OFF_") || reference.startsWith("OFF")) return "Office";
  return "Direct";
};

const isManagementPaymentInvalid = (booking) => {
  const invalidPaymentCodes = new Set(["PAYMENT_CANCELLED", "PAYMENT_FAILED", "PAYMENT_EXPIRED", "FAILED", "EXPIRED"]);
  return [booking.paymentStatus, booking.status, booking.bookingStatus]
    .map(normalizeCode)
    .some((status) => invalidPaymentCodes.has(status));
};

const isPaidUnboardedExpired = (booking) => {
  const statuses = [booking.paymentStatus, booking.status, booking.bookingStatus].map(normalizeCode);
  const isPaid = statuses.includes("PAID") || statuses.includes("CONFIRMED");
  const isBoarded = normalizeCode(booking.boardedStatus) === "BOARDED" || statuses.includes("BOARDED");
  const isInactive = isManagementPaymentInvalid(booking) || statuses.some((status) => status.includes("CANCEL") || status.includes("REFUND") || status.includes("CREDIT"));
  const travelDate = parseDateOnly(booking.travelDate || booking.journeyDate || booking.trip?.journeyDate || booking.bus?.journeyDate);
  return Boolean(isPaid && !isBoarded && !isInactive && travelDate && travelDate < getTodayDate());
};

const hasManagementTicketNumber = (booking) => Boolean(normalizeString(booking.ticketNumber || booking.ticket_number));

const isManagementPaymentConfirmed = (booking) => {
  const statuses = [booking.paymentStatus, booking.status, booking.bookingStatus, booking.boardedStatus].map(normalizeCode);
  return statuses.some((status) => ["PAID", "CONFIRMED", "BOARDED"].includes(status));
};

const isManagementBookingVisible = (booking) => {
  const source = getManagementSource(booking);
  if (isPayOnBoardingReservation(booking)) return true;
  if (source !== "WHATSAPP") return true;
  return hasManagementTicketNumber(booking) && isManagementPaymentConfirmed(booking) && !isManagementPaymentInvalid(booking);
};

const getManagementStatus = (booking, source) => {
  const rawStatus = normalizeCode(booking.bookingStatus || booking.status || booking.paymentStatus);
  const boardedStatus = normalizeCode(booking.boardedStatus);
  const ticketReference = normalizeCode(`${booking.ticketNumber || booking.ticket_number || ""} ${booking.transactionId || ""}`);
  if (isManagementPaymentInvalid(booking)) return "INVALID_PAYMENT";
  if (rawStatus.includes("CREDIT")) return "CANCELLED_AND_CREDITED";
  if (rawStatus.includes("REFUND") || rawStatus.includes("CANCEL")) return "CANCELLED_AND_REFUNDED";
  if (isPayOnBoardingReservation(booking)) return "RESERVED_AWAITING_PAYMENT";
  if (boardedStatus === "BOARDED" || rawStatus === "BOARDED") return "BOARDED";
  if (isPaidUnboardedExpired(booking)) return "EXPIRED";
  if (source === "WEB_APP" && ticketReference.includes("DIR")) return "BOARDED";
  return "CONFIRMED";
};

const formatMoney = (amount) => Number(Number(amount || 0).toFixed(2));

const getBookingAmount = (booking) => {
  if (booking.amountPaid !== undefined && booking.amountPaid !== null) return formatMoney(booking.amountPaid);
  const seatCount = Array.isArray(booking.seats) && booking.seats.length ? booking.seats.length : 1;
  if (booking.fare !== undefined && booking.fare !== null) return formatMoney(Number(booking.fare) * seatCount);
  if (booking.bus?.fare !== undefined && booking.bus?.fare !== null) return formatMoney(Number(booking.bus.fare) * seatCount);
  return 0;
};

const getTicketNumber = (booking) =>
  normalizeString(booking.ticketNumber || booking.ticket_number || (getManagementSource(booking) === "WEB_APP" ? booking.transactionId : ""));

const normalizeCredit = (credit) => ({
  _id: credit._id,
  amount: formatMoney(credit.amount),
  balance: formatMoney(credit.balance),
  status: normalizeString(credit.status || "ACTIVE"),
  validUntil: credit.validUntil,
  createdAt: credit.createdAt,
});

const getTicketCredits = async (booking, ticketNumber) => {
  const normalizedTicketNumber = normalizeString(ticketNumber || getTicketNumber(booking));
  const query = {
    $or: [
      { booking: booking._id },
      ...(normalizedTicketNumber ? [{ ticketNumber: normalizedTicketNumber }] : []),
    ],
  };
  const credits = await CustomerCredit.find(query).sort({ createdAt: -1 }).lean();
  const normalizedCredits = credits.map(normalizeCredit);
  const totalAmount = normalizedCredits.reduce((sum, credit) => sum + Number(credit.amount || 0), 0);
  const activeBalance = normalizedCredits
    .filter((credit) => credit.status === "ACTIVE")
    .reduce((sum, credit) => sum + Number(credit.balance || 0), 0);

  return {
    hasCredits: normalizedCredits.length > 0,
    totalAmount: formatMoney(totalAmount),
    activeBalance: formatMoney(activeBalance),
    items: normalizedCredits,
  };
};

const normalizePassengerRecord = (passenger, fallbackNumber = 1) => ({
  passengerNumber: Number(passenger?.passengerNumber || fallbackNumber),
  firstName: normalizeString(passenger?.firstName) || "-",
  surname: normalizeString(passenger?.surname) || "-",
  fullName:
    normalizeString(passenger?.fullName) ||
    [normalizeString(passenger?.firstName), normalizeString(passenger?.surname)].filter(Boolean).join(" ") ||
    "-",
  nationality: normalizeString(passenger?.nationality) || "-",
  gender: normalizeString(passenger?.gender) || "-",
  dateOfBirth: normalizeString(passenger?.dateOfBirth) || "-",
  passengerType: normalizeString(passenger?.passengerType || "adult") || "adult",
  isPrimary: Boolean(passenger?.isPrimary),
});

const getManagementPassengers = (booking) => {
  const storedPassengers = Array.isArray(booking.passengers) ? booking.passengers : [];
  if (storedPassengers.length) {
    return storedPassengers.map((passenger, index) => normalizePassengerRecord(passenger, index + 1));
  }

  const primary = normalizePassengerRecord(
    {
      passengerNumber: 1,
      firstName: booking.passengerFirstName,
      surname: booking.passengerSurname,
      fullName: booking.customerName || booking.passengerName,
      nationality: booking.passengerNationality,
      gender: booking.passengerGender,
      dateOfBirth: booking.passengerDateOfBirth,
      passengerType: booking.passengerType || "adult",
      isPrimary: true,
    },
    1
  );
  const additional = Array.isArray(booking.additionalPassengers)
    ? booking.additionalPassengers
    : Array.isArray(booking.additional_passengers)
    ? booking.additional_passengers
    : [];
  return [primary, ...additional.map((passenger, index) => normalizePassengerRecord(passenger, index + 2))];
};

const normalizeManagementBooking = (booking) => {
  const source = getManagementSource(booking);
  const bookingStatus = getManagementStatus(booking, source);
  const isTicketValid = bookingStatus !== "INVALID_PAYMENT";
  const seats = Array.isArray(booking.seats) ? booking.seats : [];
  const boardedAt = booking.boardedTime || booking.updatedAt || booking.createdAt;
  const amountPaid = getBookingAmount(booking);
  const passengers = getManagementPassengers(booking);
  const additionalPassengers = passengers.filter((passenger) => !passenger.isPrimary);

  return {
    _id: booking._id,
    ticketNumber: getTicketNumber(booking),
    source,
    sourceLabel: getManagementSourceLabel(booking),
    customer: {
      name: normalizeString(booking.customerName || booking.passengerName || booking.user?.name) || "Walk-in Customer",
      firstName: normalizeString(booking.passengerFirstName) || "-",
      surname: normalizeString(booking.passengerSurname) || "-",
      nationality: normalizeString(booking.passengerNationality) || "-",
      gender: normalizeString(booking.passengerGender) || "-",
      dateOfBirth: normalizeString(booking.passengerDateOfBirth) || "-",
      phone:
        normalizeString(booking.customerPhone || booking.passengerPhone || booking.cancelledByNumber || booking.user?.phone) ||
        "-",
      email: normalizeString(booking.customerEmail || booking.passengerEmail || booking.user?.email) || "-",
      bookingCount: booking.passengerCount || passengers.length || booking.bookingCount || 1,
    },
    passengers,
    additionalPassengers,
    emergencyContact: {
      name: normalizeString(booking.emergencyContactName || booking.emergency_contact_name) || "-",
      phone: normalizeString(booking.emergencyContactPhone || booking.emergency_contact_phone) || "-",
    },
    trip: {
      bus: normalizeString(booking.busName || booking.bus?.name) || "-",
      plateNumber: normalizeString(booking.busPlateNumber || booking.bus?.number) || "-",
      from: normalizeString(booking.fromCity || booking.departureCity || booking.bus?.from) || "-",
      to: normalizeString(booking.toCity || booking.dropoffCity || booking.bus?.to) || "-",
      boardingPoint: normalizeString(booking.boardingPoint || booking.boardingPlace) || "-",
      dropOffPoint: normalizeString(booking.dropOffPoint || booking.dropoffPlace) || "-",
      date: normalizeString(booking.travelDate || booking.journeyDate || booking.trip?.journeyDate || booking.bus?.journeyDate) || "-",
      time: normalizeString(booking.travelTime || booking.departureTime || booking.bus?.departure) || "-",
      arrivalTime: normalizeString(booking.arrivalTime || booking.bus?.arrival) || "-",
      seats,
      seatText: seats.length ? seats.join(", ") : "-",
    },
    payment: {
      amountPaid,
      paymentMethod: normalizeString(booking.paymentMethod) || (booking.transactionId ? "Online" : "Cash"),
      paymentStatus: normalizeString(booking.paymentStatus) || "Paid",
      paymentReference: normalizeString(booking.paymentReference || booking.payment_reference) || "-",
      paymentMerchantReference: normalizeString(booking.paymentMerchantReference || booking.payment_merchant_reference) || "-",
    },
    bookingStatus,
    isTicketValid,
    invalidReason: isTicketValid ? "" : "Payment failed, expired, or was cancelled. This ticket is not valid.",
    boardedStatus: bookingStatus === "BOARDED" ? "BOARDED" : normalizeString(booking.boardedStatus || "NOT_BOARDED"),
    boarded: {
      city: normalizeString(booking.boardedAtCity || booking.fromCity || booking.bus?.from) || "-",
      place: normalizeString(booking.boardedAtPlace || booking.boardingPoint) || "-",
      time: boardedAt,
    },
    canMarkBoarded: isTicketValid && source === "WHATSAPP" && bookingStatus === "CONFIRMED",
    canReceivePayment: isTicketValid && bookingStatus === "RESERVED_AWAITING_PAYMENT",
    canCancelReservation: isTicketValid && bookingStatus === "RESERVED_AWAITING_PAYMENT",
    canRefundExpired: isTicketValid && bookingStatus === "EXPIRED",
    canCancel:
      isTicketValid &&
      bookingStatus !== "BOARDED" &&
      bookingStatus !== "RESERVED_AWAITING_PAYMENT" &&
      ["WHATSAPP", "WEB_APP"].includes(source) &&
      bookingStatus === "CONFIRMED",
    refundMethods:
      bookingStatus === "BOARDED" || bookingStatus === "RESERVED_AWAITING_PAYMENT"
        ? []
        : bookingStatus === "EXPIRED"
        ? ["CASH", "CREDITS"]
        : source === "WEB_APP"
        ? ["CASH", "CREDITS"]
        : bookingStatus === "CONFIRMED"
        ? ["CASH", "CREDITS"]
        : [],
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
};

const findManagementBooking = async (ticketNumber, currentUser = null) => {
  const reference = normalizeString(ticketNumber);
  if (!reference) return null;
  const exactQuery = [
    { ticketNumber: reference },
    { ticket_number: reference },
    { transactionId: reference },
    { booking_reference: reference },
  ];
  if (mongoose.Types.ObjectId.isValid(reference)) {
    exactQuery.push({ _id: reference });
  }
  const exactBooking = await bookingManagementPopulate(Booking.findOne({ $or: exactQuery }));
  if (exactBooking && isManagementBookingVisible(exactBooking) && canAccessCompanyRecord(currentUser, exactBooking)) return exactBooking;

  if (reference.length >= 2 && reference.length <= 4) {
    const suffixRegex = new RegExp(`${escapeRegex(reference)}$`, "i");
    const suffixBookings = await bookingManagementPopulate(
      Booking.find({
        $or: [
          { ticketNumber: suffixRegex },
          { ticket_number: suffixRegex },
          { transactionId: suffixRegex },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(20)
    );
    return suffixBookings.find((booking) => isManagementBookingVisible(booking) && canAccessCompanyRecord(currentUser, booking)) || null;
  }

  return null;
};

const canExportManagementBookings = (user) => {
  const authUser = serializeAuthUser(user);
  return authUser?.role === "SUPER_ADMIN" || authUser?.role === "COMPANY_ADMIN";
};

const isExportCancelledBooking = (booking) =>
  normalizeCode(booking.bookingStatus).includes("CANCEL") ||
  normalizeCode(booking.status).includes("CANCEL");

const isRefundedManagementBooking = (booking) => {
  const statusText = [booking.bookingStatus, booking.status, booking.paymentStatus]
    .map(normalizeCode)
    .join(" ");
  return statusText.includes("REFUND") || statusText.includes("CREDIT");
};

const bookingMatchesManagementTab = (booking, tab) => {
  const normalized = normalizeManagementBooking(booking);
  const selectedTab = normalizeCode(tab || "VIEW");
  if (selectedTab === "VIEW" || selectedTab === "ALL") return true;
  if (selectedTab === "PAID") return normalized.bookingStatus === "CONFIRMED";
  if (selectedTab === "PAY_ON_BOARDING") return normalized.bookingStatus === "RESERVED_AWAITING_PAYMENT";
  if (selectedTab === "EXPIRED") return normalized.bookingStatus === "EXPIRED";
  if (selectedTab === "CANCELLED") return isExportCancelledBooking(booking);
  if (selectedTab === "REFUNDED") return isRefundedManagementBooking(booking);
  if (selectedTab === "COMPLETED") return normalized.bookingStatus === "BOARDED";
  return true;
};

const bookingMatchesManagementSource = (booking, source) => {
  const selectedSource = normalizeCode(source || "ALL");
  if (selectedSource === "ALL") return true;
  const normalized = normalizeManagementBooking(booking);
  if (selectedSource === "WHATSAPP") return normalized.source === "WHATSAPP";
  if (selectedSource === "OFFICE") return normalized.sourceLabel === "Office";
  if (selectedSource === "WEB" || selectedSource === "DIRECT") {
    return normalized.source === "WEB_APP" && normalized.sourceLabel !== "Office";
  }
  return true;
};

const parseDateOnly = (value) => {
  const dateText = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : "";
};

const bookingMatchesManagementDateRange = (booking, startDate, endDate) => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start && !end) return true;

  const candidateDates = [
    booking.travelDate,
    booking.journeyDate,
    booking.trip?.journeyDate,
    booking.bus?.journeyDate,
    booking.createdAt instanceof Date ? booking.createdAt.toISOString().slice(0, 10) : booking.createdAt,
  ]
    .map(parseDateOnly)
    .filter(Boolean);

  return candidateDates.some((dateText) => (!start || dateText >= start) && (!end || dateText <= end));
};

const bookingMatchesManagementExport = (booking, filter) => {
  const normalized = normalizeManagementBooking(booking);
  const selectedFilter = normalizeCode(filter || "WHATSAPP_CONFIRMED");
  if (selectedFilter === "ALL") return true;
  if (selectedFilter === "WHATSAPP_ALL") return normalized.source === "WHATSAPP";
  if (selectedFilter === "WEB_ALL") return normalized.source === "WEB_APP";
  if (selectedFilter === "WHATSAPP_CONFIRMED") {
    return normalized.source === "WHATSAPP" && normalized.bookingStatus === "CONFIRMED";
  }
  if (selectedFilter === "WHATSAPP_CANCELLED") {
    return normalized.source === "WHATSAPP" && isExportCancelledBooking(booking);
  }
  if (selectedFilter === "WHATSAPP_BOARDED") {
    return normalized.source === "WHATSAPP" && normalized.bookingStatus === "BOARDED";
  }
  if (selectedFilter === "WHATSAPP_INVALID") {
    return normalized.source === "WHATSAPP" && normalized.bookingStatus === "INVALID_PAYMENT";
  }
  if (selectedFilter === "WEB_CONFIRMED") {
    return normalized.source === "WEB_APP" && normalized.bookingStatus === "CONFIRMED";
  }
  if (selectedFilter === "WEB_CANCELLED") {
    return normalized.source === "WEB_APP" && isExportCancelledBooking(booking);
  }
  return normalized.source === "WHATSAPP" && normalized.bookingStatus === "CONFIRMED";
};

router.post("/management/export", authMiddleware, async (req, res) => {
  try {
    if (!canExportManagementBookings(req.user)) {
      return res.status(403).send({ success: false, message: "Access denied", data: [] });
    }

    const filter = normalizeString(req.body.filter || "WHATSAPP_CONFIRMED");
    const bookings = await bookingManagementPopulate(
      Booking.find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(1000)
    );
    const data = bookings
      .filter((booking) => canAccessCompanyRecord(req.user, booking))
      .filter((booking) => bookingMatchesManagementExport(booking, filter))
      .map(normalizeManagementBooking);

    res.status(200).send({
      message: "Booking export fetched successfully",
      success: true,
      data,
      generatedAt: new Date(),
      filter,
    });
  } catch (error) {
    res.status(500).send({
      message: "Booking export failed",
      success: false,
      data: [],
    });
  }
});

const releaseManagedBookingSeats = async (booking) => {
  const seats = normalizeSeatNumbers(booking.seats);
  if (!seats.length) return;
  const seatPullValues = getSeatPullValues(seats);
  const tripId = getIdValue(booking.trip);
  const busId = getIdValue(booking.bus);
  if (tripId) {
    await Trip.findByIdAndUpdate(tripId, { $pull: { seatsBooked: { $in: seatPullValues } } });
  }
  if (busId) {
    await Bus.findByIdAndUpdate(busId, { $pull: { seatsBooked: { $in: seatPullValues } } });
  }
  writeSeatDebugLog("onhighweb_management_cancel_release", {
    bookingId: String(booking._id || ""),
    ticketNumber: normalizeString(booking.ticketNumber || booking.ticket_number || booking.transactionId),
    tripId,
    busId,
    seats,
    seatPullValues,
    status: booking.status,
    bookingStatus: booking.bookingStatus,
  });
};

const getBookingReference = (booking) =>
  normalizeString(booking.transactionId || booking.bookingReference || booking.booking_reference || booking.ticketNumber || booking.ticket_number);

const syncPayOnBoardingFlowBooking = async (booking, update) => {
  const bookingReference = getBookingReference(booking);
  if (!bookingReference || !mongoose.connection?.db) return;

  try {
    await mongoose.connection.db.collection("flow_bookings").updateOne(
      {
        $or: [
          { booking_reference: bookingReference },
          { transactionId: bookingReference },
          { ticket_number: normalizeString(booking.ticketNumber || booking.ticket_number) },
          { ticketNumber: normalizeString(booking.ticketNumber || booking.ticket_number) },
        ].filter((query) => Object.values(query)[0]),
      },
      { $set: update }
    );
  } catch (error) {
    console.log("[pay-on-boarding] flow booking sync failed", {
      bookingReference,
      error: error.message,
    });
  }
};

router.post("/management/receive-payment", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({ message: "Booking not found", success: false });
    }
    const display = normalizeManagementBooking(booking);
    if (!display.canReceivePayment) {
      return res.status(200).send({ message: "Only Pay on Boarding reservations awaiting payment can receive payment.", success: false });
    }

    booking.status = "CONFIRMED";
    booking.bookingStatus = "CONFIRMED";
    booking.paymentStatus = "Paid";
    booking.paymentMethod = "Pay on Boarding";
    booking.paymentReceivedAt = new Date();
    booking.paymentReceivedBy = req.user._id;
    booking.processedByUserId = req.user._id;
    booking.boardedStatus = normalizeString(booking.boardedStatus || "NOT_BOARDED");
    await booking.save();
    await syncPayOnBoardingFlowBooking(booking, {
      status: "confirmed",
      booking_status: "CONFIRMED",
      payment_status: "paid",
      payment_paid: true,
      payment_method: "pay_on_boarding",
      seat_status: "confirmed",
      paid_at: booking.paymentReceivedAt.toISOString(),
      payment_received_at: booking.paymentReceivedAt.toISOString(),
      payment_received_by: String(req.user._id),
      updated_at: new Date().toISOString(),
    });
    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId,
      module: "booking_management",
      action: "pay on boarding payment received",
      entityType: "booking",
      entityId: booking._id,
      entityLabel: display.ticketNumber,
    });

    const refreshed = await bookingManagementPopulate(Booking.findById(booking._id));
    res.status(200).send({
      message: "Payment received and booking confirmed",
      data: normalizeManagementBooking(refreshed),
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to receive payment", data: error, success: false });
  }
});

router.post("/management/cancel-reservation", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({ message: "Booking not found", success: false });
    }
    const display = normalizeManagementBooking(booking);
    if (!display.canCancelReservation) {
      return res.status(200).send({ message: "Only Pay on Boarding reservations awaiting payment can be cancelled.", success: false });
    }

    booking.status = "CANCELLED";
    booking.bookingStatus = "CANCELLED";
    booking.paymentStatus = "CANCELLED";
    booking.cancelReason = normalizeString(req.body.cancellationReason || req.body.reason) || "Reservation cancelled";
    booking.cancelledAt = new Date();
    booking.reservationCancelledAt = booking.cancelledAt;
    booking.processedByUserId = req.user._id;
    await booking.save();
    await releaseManagedBookingSeats(booking);
    await syncPayOnBoardingFlowBooking(booking, {
      status: "cancelled",
      booking_status: "CANCELLED",
      payment_status: "cancelled",
      payment_paid: false,
      payment_method: "pay_on_boarding",
      seat_status: "released",
      cancel_reason: booking.cancelReason,
      cancelled_at: booking.cancelledAt.toISOString(),
      reservation_cancelled_at: booking.reservationCancelledAt.toISOString(),
      cancelled_by: String(req.user._id),
      updated_at: new Date().toISOString(),
    });
    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId,
      module: "booking_management",
      action: "pay on boarding reservation cancelled",
      entityType: "booking",
      entityId: booking._id,
      entityLabel: display.ticketNumber,
    });

    const refreshed = await bookingManagementPopulate(Booking.findById(booking._id));
    res.status(200).send({
      message: "Reservation cancelled and seat released",
      data: normalizeManagementBooking(refreshed),
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: "Reservation cancellation failed", data: error, success: false });
  }
});

router.post("/management/refund-expired", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({ message: "Booking not found", success: false });
    }
    const display = normalizeManagementBooking(booking);
    const refundMethod = normalizeCode(req.body.refundMethod);
    const allowedMethods = display.refundMethods;
    if (!display.canRefundExpired) {
      return res.status(200).send({ message: "Only expired paid tickets can be refunded here.", success: false });
    }
    if (!allowedMethods.includes(refundMethod)) {
      return res.status(200).send({ message: "Invalid refund option.", success: false });
    }

    const finalStatus = refundMethod === "CREDITS" ? "EXPIRED_AND_CREDITED" : "EXPIRED_AND_REFUNDED";
    const refundAmount = getBookingAmount(booking);
    booking.status = finalStatus;
    booking.bookingStatus = finalStatus;
    booking.refundedAt = new Date();
    booking.refundedBy = req.user._id;
    booking.cancelReason = normalizeString(req.body.refundReason || req.body.reason) || "Expired ticket refund";
    booking.cancelledAt = new Date();
    booking.processedByUserId = req.user._id;
    await booking.save();
    await releaseManagedBookingSeats(booking);

    const cancellation = await new Cancellation({
      booking: booking._id,
      ticketNumber: display.ticketNumber,
      bookingSource: display.source,
      reason: booking.cancelReason,
      note: normalizeString(req.body.refundNote || req.body.note),
      refundMethod,
      refundAmount,
      finalStatus,
      processedByUserId: req.user._id,
    }).save();

    let refund = null;
    let credit = null;
    if (refundMethod === "CREDITS") {
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 6);
      credit = await new CustomerCredit({
        booking: booking._id,
        cancellation: cancellation._id,
        ticketNumber: display.ticketNumber,
        customerName: display.customer.name,
        customerPhone: display.customer.phone,
        amount: refundAmount,
        balance: refundAmount,
        validUntil,
        processedByUserId: req.user._id,
      }).save();
    } else {
      refund = await new Refund({
        booking: booking._id,
        cancellation: cancellation._id,
        ticketNumber: display.ticketNumber,
        method: refundMethod,
        amount: refundAmount,
        processedByUserId: req.user._id,
      }).save();
    }

    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId,
      module: "booking_management",
      action: "expired ticket refunded",
      entityType: "booking",
      entityId: booking._id,
      entityLabel: display.ticketNumber,
    });

    const refreshed = await bookingManagementPopulate(Booking.findById(booking._id));
    res.status(200).send({
      message: refundMethod === "CREDITS" ? "Expired ticket credited successfully" : "Expired ticket refunded successfully",
      data: {
        booking: normalizeManagementBooking(refreshed),
        cancellation,
        refund,
        credit,
      },
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: "Expired ticket refund failed", data: error, success: false });
  }
});

router.post("/management/recent", authMiddleware, async (req, res) => {
  try {
    const bookings = await bookingManagementPopulate(Booking.find().sort({ createdAt: -1 }).limit(30));
    res.status(200).send({
      message: "Recent bookings fetched successfully",
      data: bookings
        .filter((booking) => isManagementBookingVisible(booking) && canAccessCompanyRecord(req.user, booking))
        .slice(0, 8)
        .map(normalizeManagementBooking),
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Recent bookings fetch failed",
      data: error,
      success: false,
    });
  }
});

router.post("/management/list", authMiddleware, async (req, res) => {
  try {
    const tab = normalizeString(req.body.tab || "VIEW");
    const source = normalizeString(req.body.source || "ALL");
    const startDate = normalizeString(req.body.startDate);
    const endDate = normalizeString(req.body.endDate);

    const bookings = await bookingManagementPopulate(
      Booking.find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(1000)
    );
    const data = bookings
      .filter((booking) => isManagementBookingVisible(booking) && canAccessCompanyRecord(req.user, booking))
      .filter((booking) => bookingMatchesManagementTab(booking, tab))
      .filter((booking) => bookingMatchesManagementSource(booking, source))
      .filter((booking) => bookingMatchesManagementDateRange(booking, startDate, endDate))
      .map(normalizeManagementBooking);

    res.status(200).send({
      message: "Booking list fetched successfully",
      data,
      success: true,
      filters: { tab, source, startDate, endDate },
    });
  } catch (error) {
    res.status(500).send({
      message: "Booking list fetch failed",
      data: [],
      success: false,
    });
  }
});

router.post("/management/search", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({
        message: "Booking not found",
        success: false,
      });
    }
    const display = normalizeManagementBooking(booking);
    display.credits = await getTicketCredits(booking, display.ticketNumber);
    res.status(200).send({
      message: "Booking fetched successfully",
      data: display,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Booking search failed",
      data: error,
      success: false,
    });
  }
});

router.post("/management/mark-boarded", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({ message: "Booking not found", success: false });
    }

    const display = normalizeManagementBooking(booking);
    if (!display.isTicketValid) {
      return res.status(200).send({
        message: "This ticket is not valid because payment failed.",
        success: false,
      });
    }
    if (display.source !== "WHATSAPP") {
      return res.status(200).send({
        message: "Only WhatsApp bookings can be manually marked as boarded",
        success: false,
      });
    }
    if (display.bookingStatus !== "CONFIRMED") {
      return res.status(200).send({
        message: "Only confirmed, unused WhatsApp tickets can be marked as boarded",
        success: false,
      });
    }

    booking.bookingSource = "WHATSAPP";
    booking.status = "BOARDED";
    booking.bookingStatus = "BOARDED";
    booking.boardedStatus = "BOARDED";
    booking.boardedAtCity = normalizeString(req.body.boardedAtCity || booking.fromCity || booking.bus?.from);
    booking.boardedAtPlace = normalizeString(req.body.boardedAtPlace || booking.boardingPoint);
    booking.boardedTime = new Date();
    booking.processedByUserId = req.body.userId;
    await booking.save();
    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId,
      module: "booking_management",
      action: "marked boarded",
      entityType: "booking",
      entityId: booking._id,
      entityLabel: display.ticketNumber,
    });

    const refreshed = await bookingManagementPopulate(Booking.findById(booking._id));
    res.status(200).send({
      message: "Booking marked as boarded",
      data: normalizeManagementBooking(refreshed),
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to mark booking as boarded",
      data: error,
      success: false,
    });
  }
});

router.post("/management/cancel", authMiddleware, async (req, res) => {
  try {
    const booking = await findManagementBooking(req.body.ticketNumber, req.user);
    if (!booking) {
      return res.status(200).send({ message: "Booking not found", success: false });
    }

    const display = normalizeManagementBooking(booking);
    const refundMethod = normalizeCode(req.body.refundMethod);
    const allowedMethods = display.refundMethods;

    if (!display.isTicketValid) {
      return res.status(200).send({
        message: "This ticket is not valid because payment failed.",
        success: false,
      });
    }

    if (!display.canCancel) {
      return res.status(200).send({
        message:
          display.bookingStatus === "BOARDED" || display.boardedStatus === "BOARDED"
            ? "This ticket has been used. Cancellation is not allowed."
            : "This booking cannot be cancelled.",
        success: false,
      });
    }

    if (!allowedMethods.includes(refundMethod)) {
      return res.status(200).send({
        message: display.bookingStatus === "BOARDED" ? "This ticket has been used. Cancellation is not allowed." : "Invalid refund option.",
        success: false,
      });
    }

    const finalStatus =
      refundMethod === "CREDITS"
        ? "CANCELLED_AND_CREDITED"
        : "CANCELLED_AND_REFUNDED";
    const refundAmount = getBookingAmount(booking);

    booking.status = finalStatus;
    booking.bookingStatus = finalStatus;
    booking.boardedStatus = display.boardedStatus;
    booking.cancelReason = normalizeString(req.body.cancellationReason || req.body.reason);
    booking.cancelledAt = new Date();
    booking.processedByUserId = req.body.userId;
    await booking.save();
    await releaseManagedBookingSeats(booking);
    await createAuditNotification(req.user, {
      companyId: booking.companyId || booking.bus?.companyId,
      module: "booking_management",
      action: "cancelled",
      entityType: "booking",
      entityId: booking._id,
      entityLabel: display.ticketNumber,
    });

    const cancellation = await new Cancellation({
      booking: booking._id,
      ticketNumber: display.ticketNumber,
      bookingSource: display.source,
      reason: normalizeString(req.body.cancellationReason || req.body.reason) || "Admin cancellation",
      note: normalizeString(req.body.cancellationNote || req.body.note),
      refundMethod,
      refundAmount,
      finalStatus,
      processedByUserId: req.body.userId,
    }).save();

    let refund = null;
    let credit = null;
    if (refundMethod === "CREDITS") {
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 6);
      credit = await new CustomerCredit({
        booking: booking._id,
        cancellation: cancellation._id,
        ticketNumber: display.ticketNumber,
        customerName: display.customer.name,
        customerPhone: display.customer.phone,
        amount: refundAmount,
        balance: refundAmount,
        validUntil,
        processedByUserId: req.body.userId,
      }).save();
    } else {
      refund = await new Refund({
        booking: booking._id,
        cancellation: cancellation._id,
        ticketNumber: display.ticketNumber,
        method: refundMethod,
        amount: refundAmount,
        processedByUserId: req.body.userId,
      }).save();
    }

    const refreshed = await bookingManagementPopulate(Booking.findById(booking._id));
    res.status(200).send({
      message: finalStatus === "CANCELLED_AND_CREDITED" ? "Credits applied successfully" : "Cancellation successful",
      data: {
        booking: normalizeManagementBooking(refreshed),
        cancellation,
        refund,
        credit,
      },
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: "Cancellation failed",
      data: error,
      success: false,
    });
  }
});


module.exports = router;
