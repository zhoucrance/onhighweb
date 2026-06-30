const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.ObjectId,
      ref: "bookings",
      required: true,
    },
    cancellation: {
      type: mongoose.Schema.ObjectId,
      ref: "cancellations",
      required: true,
    },
    ticketNumber: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: ["CASH", "ECOCASH_REVERSAL"],
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "PENDING",
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

module.exports = mongoose.model("refunds", refundSchema);
