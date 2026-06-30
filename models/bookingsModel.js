const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.ObjectId,
      ref: "buses",
      require: true,
    },
    trip: {
      type: mongoose.Schema.ObjectId,
      ref: "trips",
    },
    route: {
      type: mongoose.Schema.ObjectId,
      ref: "routes",
    },
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
    },
    fromStop: {
      type: mongoose.Schema.ObjectId,
      ref: "route_stops",
    },
    toStop: {
      type: mongoose.Schema.ObjectId,
      ref: "route_stops",
    },
    fromStopOrder: {
      type: Number,
    },
    toStopOrder: {
      type: Number,
    },
    fromCity: {
      type: String,
    },
    toCity: {
      type: String,
    },
    departureTime: {
      type: String,
    },
    arrivalTime: {
      type: String,
    },
    boardingPoint: {
      type: String,
    },
    dropOffPoint: {
      type: String,
    },
    fare: {
      type: Number,
    },
    currency: {
      type: String,
      default: "USD",
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      require: true,
    },
    seats: {
      type: Array,
      require: true,
    },
    transactionId: {
      type: String,
      require: true,
    },
    ticketNumber: {
      type: String,
    },
    ticket_number: {
      type: String,
    },
    booking_reference: {
      type: String,
    },
    bookingSource: {
      type: String,
      enum: ["WHATSAPP", "WEB_APP"],
    },
    booking_source: {
      type: String,
    },
    customerName: {
      type: String,
    },
    passengerName: {
      type: String,
    },
    passengerAge: {
      type: String,
    },
    passengerGender: {
      type: String,
    },
    customerPhone: {
      type: String,
    },
    passengerPhone: {
      type: String,
    },
    customerEmail: {
      type: String,
    },
    busName: {
      type: String,
    },
    busPlateNumber: {
      type: String,
    },
    bookingCount: {
      type: Number,
    },
    travelDate: {
      type: String,
    },
    journeyDate: {
      type: String,
    },
    travelTime: {
      type: String,
    },
    amountPaid: {
      type: Number,
    },
    paymentMethod: {
      type: String,
    },
    creditAppliedAmount: {
      type: Number,
      default: 0,
    },
    creditRemainingBalance: {
      type: Number,
      default: 0,
    },
    creditAppliedAt: {
      type: Date,
    },
    boardedStatus: {
      type: String,
    },
    boardedAtCity: {
      type: String,
    },
    boardedAtPlace: {
      type: String,
    },
    boardedTime: {
      type: Date,
    },
    processedByUserId: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
    },
    status: {
      type: String,
    },
    bookingStatus: {
      type: String,
    },
    paymentStatus: {
      type: String,
    },
    cancelReason: {
      type: String,
    },
    cancellationSource: {
      type: String,
    },
    cancelledByNumber: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
    printCount: {
      type: Number,
      default: 0,
    },
    firstPrintedAt: {
      type: Date,
    },
    lastPrintedAt: {
      type: Date,
    },
    lastPrintedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("bookings", bookingSchema);
