const mongoose = require("mongoose");

const helpDeskRequestSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      index: true,
    },
    ticket_number: {
      type: String,
    },
    booking: {
      type: mongoose.Schema.ObjectId,
      ref: "bookings",
      default: null,
    },
    bookingId: {
      type: mongoose.Schema.ObjectId,
      ref: "bookings",
      default: null,
    },
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
      index: true,
    },
    bus: {
      type: mongoose.Schema.ObjectId,
      ref: "buses",
      default: null,
    },
    trip: {
      type: mongoose.Schema.ObjectId,
      ref: "trips",
      default: null,
    },
    route: {
      type: mongoose.Schema.ObjectId,
      ref: "routes",
      default: null,
    },
    email: {
      type: String,
      default: "",
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    phone_number: {
      type: String,
      default: "",
    },
    passengerName: {
      type: String,
      default: "",
    },
    subject: {
      type: String,
      required: true,
    },
    subjectLabel: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "SOLVED"],
      default: "OPEN",
      index: true,
    },
    source: {
      type: String,
      default: "WHATSAPP",
    },
    flowToken: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
    internalNote: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("help_desk_requests", helpDeskRequestSchema);
