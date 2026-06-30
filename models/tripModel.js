const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.ObjectId,
      ref: "buses",
      default: null,
    },
    route: {
      type: mongoose.Schema.ObjectId,
      ref: "routes",
      required: true,
    },
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
    },
    tripCode: {
      type: String,
      default: "",
    },
    journeyDate: {
      type: String,
      default: "",
    },
    arrivalDate: {
      type: String,
      default: "",
    },
    scheduleStartDate: {
      type: String,
      default: "",
    },
    scheduleEndDate: {
      type: String,
      default: "",
    },
    runsContinuously: {
      type: Boolean,
      default: true,
    },
    operatingDays: {
      type: [String],
      default: [],
    },
    departureDay: {
      type: String,
      default: "",
    },
    departureTime: {
      type: String,
      default: "",
    },
    arrivalDay: {
      type: String,
      default: "",
    },
    arrivalTime: {
      type: String,
      default: "",
    },
    stopSchedule: {
      type: [
        {
          stopId: {
            type: mongoose.Schema.ObjectId,
            ref: "route_stops",
            default: null,
          },
          cityName: {
            type: String,
            default: "",
          },
          stopOrder: {
            type: Number,
            default: 0,
          },
          arrivalTime: {
            type: String,
            default: "",
          },
          arrivalDayOffset: {
            type: Number,
            default: 0,
          },
          departureTime: {
            type: String,
            default: "",
          },
          departureDayOffset: {
            type: Number,
            default: 0,
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
      ],
      default: [],
    },
    returnEnabled: {
      type: Boolean,
      default: false,
    },
    returnDepartureDate: {
      type: String,
      default: "",
    },
    returnArrivalDate: {
      type: String,
      default: "",
    },
    returnDepartureDay: {
      type: String,
      default: "",
    },
    returnDepartureTime: {
      type: String,
      default: "",
    },
    returnArrivalDay: {
      type: String,
      default: "",
    },
    returnArrivalTime: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Yet To Start",
    },
    seatsBooked: {
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("trips", tripSchema);
