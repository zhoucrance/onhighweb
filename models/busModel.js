const mongoose = require("mongoose");

const busSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  number: {
    type: String,
    required: true,
  },
  capacity: {
    type: Number,
    required: true,
  },
  route: {
    type: mongoose.Schema.ObjectId,
    ref: "routes",
  },
  trips: [
    {
      type: mongoose.Schema.ObjectId,
      ref: "trips",
    },
  ],
  companyId: {
    type: mongoose.Schema.ObjectId,
    ref: "companies",
    default: null,
  },
  from: {
    type: String,
  },
  to: {
    type: String,
  },
  journeyDate: {
    type: String,
  },
  departure: {
    type: String,
  },
  arrival: {
    type: String,
  },
  type: {
    type: String,
    required: true,
  },
  icon_color: {
    type: String,
    enum: [
      "red",
      "blue",
      "green",
      "yellow",
      "orange",
      "purple",
      "pink",
      "cyan",
      "teal",
      "lime",
      "indigo",
      "violet",
      "maroon",
      "navy",
      "olive",
      "gold",
      "silver",
      "bronze",
      "turquoise",
      "magenta",
      "coral",
      "brown",
      "black",
      "white",
      "skyblue",
      "mint",
      "lavender",
      "crimson",
      "amber",
      "charcoal",
    ],
    default: "blue",
  },
  fare: {
    type: Number,
  },
  serviceFeeEnabled: {
    type: Boolean,
    default: false,
  },
  serviceFeeMode: {
    type: String,
    enum: ["fixed", "percentage"],
    default: "fixed",
  },
  serviceFeeAmount: {
    type: Number,
    default: 0,
  },
  serviceFeeUpdatedAt: {
    type: Date,
  },
  seatsBooked: {
    type: Array,
    default: [],
  },
  status: {
    type: String,
    default: "Yet To Start",
  },
});

module.exports = mongoose.model("buses", busSchema);
