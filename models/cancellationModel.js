const mongoose = require("mongoose");

const cancellationSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.ObjectId,
      ref: "bookings",
      required: true,
    },
    ticketNumber: {
      type: String,
      required: true,
    },
    bookingSource: {
      type: String,
      enum: ["WHATSAPP", "WEB_APP"],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    note: {
      type: String,
    },
    refundMethod: {
      type: String,
      enum: ["CASH", "ECOCASH_REVERSAL", "CREDITS"],
      required: true,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    finalStatus: {
      type: String,
      enum: ["CANCELLED_AND_REFUNDED", "CANCELLED_AND_CREDITED"],
      required: true,
    },
    processedByUserId: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("cancellations", cancellationSchema);
