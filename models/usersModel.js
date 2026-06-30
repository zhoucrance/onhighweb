const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    passwordHash: {
      type: String,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isBlocked : {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "STAFF"],
    },
    roleLevel: {
      type: Number,
    },
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
    },
    staffTitle: {
      type: String,
      enum: ["", "CONDUCTOR", "OFFICE_BOOKING", "OTHER"],
      default: "",
    },
    assignedBus: {
      type: mongoose.Schema.ObjectId,
      ref: "buses",
      default: null,
    },
    assignedBuses: [{
      type: mongoose.Schema.ObjectId,
      ref: "buses",
    }],
    permissions: {
      type: [String],
      default: undefined,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("users", userSchema);
