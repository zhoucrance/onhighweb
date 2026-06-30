const mongoose = require("mongoose");

const customerCreditSchema = new mongoose.Schema(
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
    customerName: {
      type: String,
    },
    customerPhone: {
      type: String,
    },
    amount: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      default: 0,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      default: "ACTIVE",
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

module.exports = mongoose.model("customer_credits", customerCreditSchema);
