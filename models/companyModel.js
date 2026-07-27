const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
    },
    companyLogo: {
      type: String,
      default: "",
    },
    companyStatus: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    pesepayIntegrationKey: {
      type: String,
      default: "",
    },
    pesepayEncryptionKey: {
      type: String,
      default: "",
    },
    pesepayKeysUpdatedAt: {
      type: Date,
    },
    pesepayKeysUpdatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
    enabledPaymentMethods: {
      type: [String],
      enum: ["EcoCash", "Card Payment", "Pay on Boarding"],
      default: ["EcoCash", "Card Payment"],
    },
    paymentMethodsUpdatedAt: {
      type: Date,
    },
    paymentMethodsUpdatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("companies", companySchema);
