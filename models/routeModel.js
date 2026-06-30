const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
    },
    routeCode: {
      type: String,
      required: true,
      unique: true,
    },
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
    },
    fromCity: {
      type: String,
      required: true,
    },
    toCity: {
      type: String,
      required: true,
    },
    totalDistance: {
      type: String,
      default: "",
    },
    estimatedDuration: {
      type: String,
      default: "",
    },
    fareCurrency: {
      type: String,
      default: "USD",
    },
    fareExchangeRate: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("routes", routeSchema);
