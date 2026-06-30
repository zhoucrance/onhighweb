const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.ObjectId,
      ref: "companies",
      default: null,
      index: true,
    },
    actor: {
      type: mongoose.Schema.ObjectId,
      ref: "users",
      default: null,
    },
    actorName: {
      type: String,
      default: "",
    },
    module: {
      type: String,
      default: "",
      index: true,
    },
    action: {
      type: String,
      default: "",
    },
    entityType: {
      type: String,
      default: "",
    },
    entityId: {
      type: mongoose.Schema.ObjectId,
      default: null,
    },
    entityLabel: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
    },
    readBy: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "users",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("notifications", notificationSchema);
