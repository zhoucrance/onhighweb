const mongoose = require("mongoose");

const routeFareSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.ObjectId,
      ref: "routes",
      required: true,
    },
    fromStop: {
      type: mongoose.Schema.ObjectId,
      ref: "route_stops",
      required: true,
    },
    toStop: {
      type: mongoose.Schema.ObjectId,
      ref: "route_stops",
      required: true,
    },
    fare: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("route_fares", routeFareSchema);
