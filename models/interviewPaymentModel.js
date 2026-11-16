const mongoose = require("mongoose");

// Interview practice payments reported by the careers bot (WhatsApp and website
// sales), kept here so the admin notifications can show the running total.
const interviewPaymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    topic: { type: String, default: "" },
    source: { type: String, enum: ["whatsapp", "website"], required: true },
    method: { type: String, default: "" },
    phone: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("interview_payments", interviewPaymentSchema);
