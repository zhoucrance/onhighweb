const mongoose = require("mongoose");

const routeStopSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.ObjectId,
      ref: "routes",
      required: true,
    },
    cityName: {
      type: String,
      required: true,
    },
    stopOrder: {
      type: Number,
      required: true,
    },
    arrivalTime: {
      type: String,
      default: "",
    },
    departureTime: {
      type: String,
      default: "",
    },
    boardingPoint: {
      type: String,
      default: "",
    },
    boardingPoints: {
      type: [String],
      default: [],
    },
    travelScope: {
      type: String,
      enum: ["Local", "International"],
      default: "Local",
    },
    // Optional ISO country code (e.g. "ZW", "ZA", "BW"). Used by WhatsApp to
    // group destinations into travel corridors. Blank = unknown (inferred).
    country: {
      type: String,
      default: "",
    },
    distanceFromPrevious: {
      type: String,
      default: "",
    },
    durationFromPrevious: {
      type: String,
      default: "",
    },
    stopMinutes: {
      type: String,
      default: "0",
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

module.exports = mongoose.model("route_stops", routeStopSchema);
