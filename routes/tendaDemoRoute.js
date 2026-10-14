const router = require("express").Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const Company = require("../models/companyModel");
const Booking = require("../models/bookingsModel");
const Notification = require("../models/notificationModel");
const {
  checkPayment,
  decryptPayload,
  initiateCardCheckout,
  isFailed,
  isPaid,
  makeConfig,
  makeEcocashPayment,
  redirectUrl,
  referenceNumber,
  statusText,
} = require("../utils/pesepayClient");

const PAYMENT_AMOUNT = 0.05;
const TENDA_COMPANY_NAME = "Tenda Executive";
const REAL_METHODS = ["Card Payment", "EcoCash"];
const memoryBookings = new Map();

const normalizeString = (value) => String(value || "").trim();
const normalizePhone = (value) => normalizeString(value).replace(/\s+/g, "");

const isDbConnected = () => Boolean((process.env.mongo_url || process.env.MONGO_URI) && mongoose.connection.readyState === 1);

const getNotificationCompanyId = (booking) => {
  const companyId = booking?.companyId;
  return mongoose.Types.ObjectId.isValid(companyId) ? companyId : null;
};

const summarizeTendaBooking = (booking = {}) => {
  const seats = Array.isArray(booking.seats) && booking.seats.length ? booking.seats.join(", ") : "no seat";
  const passenger = normalizeString(booking.customerName || booking.passengerName) || "A customer";
  const phone = normalizeString(booking.customerPhone || booking.passengerPhone);
  const route = [booking.fromCity, booking.toCity].filter(Boolean).join(" to ") || "the Tenda route";
  const date = normalizeString(booking.travelDate || booking.journeyDate);
  return `${passenger}${phone ? ` (${phone})` : ""} booked ${seats} on ${route}${date ? ` for ${date}` : ""}`;
};

const createTendaNotification = async (booking, payload = {}) => {
  if (!isDbConnected()) return null;

  try {
    const ticketNumber = normalizeString(booking?.ticketNumber || booking?.ticket_number || booking?.transactionId);
    const entityLabel = payload.entityLabel || ticketNumber || "Tenda booking";
    return await Notification.create({
      companyId: getNotificationCompanyId(booking),
      actor: null,
      actorName: "Tenda online booking",
      module: "tenda-booking",
      action: payload.action || "updated",
      entityType: "booking",
      entityId: mongoose.Types.ObjectId.isValid(booking?._id) ? booking._id : null,
      entityLabel,
      message: payload.message || `${summarizeTendaBooking(booking)}. ${payload.detail || ""}`.trim(),
    });
  } catch (error) {
    console.log("[tenda-notification] create failed:", error.message);
    return null;
  }
};

const getEnvPesepayKeys = () => {
  const mode = normalizeString(process.env.PESEPAY_MODE || "sandbox").toUpperCase();
  const prefix = mode === "LIVE" ? "LIVE" : "SANDBOX";
  const integrationKey = normalizeString(
    process.env[`PESEPAY_${prefix}_INTEGRATION_KEY`] || process.env.PESEPAY_INTEGRATION_KEY
  );
  const encryptionKey = normalizeString(
    process.env[`PESEPAY_${prefix}_ENCRYPTION_KEY`] || process.env.PESEPAY_ENCRYPTION_KEY
  );
  if (!integrationKey || !encryptionKey) return null;
  return {
    _id: `env-${prefix.toLowerCase()}`,
    companyName: normalizeString(process.env.TENDA_PESEPAY_COMPANY_NAME || process.env.TENDA_DEMO_PESEPAY_COMPANY_NAME) || TENDA_COMPANY_NAME,
    enabledPaymentMethods: REAL_METHODS,
    pesepayIntegrationKey: integrationKey,
    pesepayEncryptionKey: encryptionKey,
    source: "env",
  };
};

const makeTicketNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `TENDA-${datePart}-${suffix}`;
};

const companyHasPaymentMethod = (company, method) => {
  const methods = Array.isArray(company.enabledPaymentMethods) ? company.enabledPaymentMethods : [];
  return !methods.length || methods.includes(method);
};

const findDemoCompany = async (method) => {
  if (!isDbConnected()) return getEnvPesepayKeys();

  const projection = {
    companyName: 1,
    companyStatus: 1,
    enabledPaymentMethods: 1,
    pesepayIntegrationKey: 1,
    pesepayEncryptionKey: 1,
  };
  const configured = {
    companyStatus: "Active",
    pesepayIntegrationKey: { $nin: ["", null] },
    pesepayEncryptionKey: { $nin: ["", null] },
  };

  const preferredId = normalizeString(process.env.TENDA_PESEPAY_COMPANY_ID || process.env.TENDA_DEMO_PESEPAY_COMPANY_ID);
  if (preferredId) {
    const company = await Company.findById(preferredId, projection).lean();
    if (company && companyHasPaymentMethod(company, method)) return company;
  }

  const tendaCompany = await Company.findOne(
    { ...configured, companyName: new RegExp(TENDA_COMPANY_NAME, "i") },
    projection
  ).lean();
  if (tendaCompany && companyHasPaymentMethod(tendaCompany, method)) return tendaCompany;

  return Company.findOne(
    {
      ...configured,
      $or: [{ enabledPaymentMethods: method }, { enabledPaymentMethods: { $size: 0 } }],
    },
    projection
  )
    .sort({ companyName: 1 })
    .lean();
};

const buildTicket = (booking) => ({
  ticketNumber: booking.ticketNumber,
  ticket_number: booking.ticket_number,
  status_label: "PAYMENT CONFIRMED",
  bus_name: booking.busName || TENDA_COMPANY_NAME,
  passenger_name: booking.passengerName || booking.customerName || "Passenger",
  phone: booking.customerPhone || booking.passengerPhone || "-",
  route: `${booking.fromCity || "-"} to ${booking.toCity || "-"}`,
  from: booking.fromCity || "-",
  to: booking.toCity || "-",
  date: booking.travelDate || booking.journeyDate || "-",
  time: booking.departureTime || booking.travelTime || "-",
  arrival_time: booking.arrivalTime || "-",
  seat: Array.isArray(booking.seats) ? booking.seats.join(", ") : "-",
  amount: `US$${Number(booking.amountPaid || PAYMENT_AMOUNT).toFixed(2)}`,
  payment_method: booking.paymentMethod || "PesePay",
  payment_reference: booking.paymentReference || "-",
  boarding_point: booking.boardingPoint || "-",
  drop_off_point: booking.dropOffPoint || "-",
});

const getBookingByMerchantReference = async (merchantReference) =>
  isDbConnected()
    ? Booking.findOne({
    $or: [
      { transactionId: merchantReference },
      { booking_reference: merchantReference },
      { paymentMerchantReference: merchantReference },
    ],
    })
    : Array.from(memoryBookings.values()).find(
        (booking) =>
          booking.transactionId === merchantReference ||
          booking.booking_reference === merchantReference ||
          booking.paymentMerchantReference === merchantReference
      );

const getBookingByPaymentReference = async (paymentReference) =>
  isDbConnected()
    ? Booking.findOne({ paymentReference })
    : memoryBookings.get(paymentReference);

const markBookingPaid = async (booking, paymentResult = {}) => {
  const wasPaid = normalizeString(booking.paymentStatus).toLowerCase() === "paid";
  if (!booking.ticketNumber) {
    booking.ticketNumber = makeTicketNumber();
    booking.ticket_number = booking.ticketNumber;
  }
  booking.status = "CONFIRMED";
  booking.bookingStatus = "CONFIRMED";
  booking.paymentStatus = "Paid";
  booking.paymentReceivedAt = new Date();
  booking.paymentReference = referenceNumber(paymentResult) || booking.paymentReference;
  if (typeof booking.save === "function") {
    await booking.save();
  } else {
    memoryBookings.set(booking.paymentReference, booking);
  }
  if (!wasPaid) {
    await createTendaNotification(booking, {
      action: "booking_success",
      message: `Successful Tenda booking: ${summarizeTendaBooking(booking)}. Payment confirmed with reference ${booking.paymentReference || referenceNumber(paymentResult) || "-"}.`,
    });
  }
  return booking;
};

const markBookingPaymentFailed = async (booking, paymentResult = {}) => {
  const previousPaymentStatus = normalizeString(booking.paymentStatus);
  const nextPaymentStatus = statusText(paymentResult) || "FAILED";
  const wasFailed = normalizeString(booking.bookingStatus || booking.status).toLowerCase() === "payment_failed";

  booking.paymentStatus = nextPaymentStatus;
  booking.status = "payment_failed";
  booking.bookingStatus = "payment_failed";
  if (typeof booking.save === "function") await booking.save();
  else memoryBookings.set(booking.paymentReference, booking);

  if (!wasFailed || previousPaymentStatus !== nextPaymentStatus) {
    await createTendaNotification(booking, {
      action: "payment_failed",
      detail: `Payment failed with status ${nextPaymentStatus}.`,
    });
  }
  return booking;
};

const isPaymentReferencePendingError = (error) =>
  /transaction was not found|given reference number|reference not found/i.test(String(error?.message || ""));

const sendPendingPaymentStatus = (res, booking, company, referenceNumberValue, message) =>
  res.send({
    success: true,
    message: message || "Payment is still pending.",
    data: {
      paid: false,
      failed: false,
      status: "PENDING",
      referenceNumber: referenceNumberValue || booking?.paymentReference,
      merchantReference: booking?.transactionId,
      selectedCompany: company
        ? { companyId: company._id, companyName: company.companyName, source: company.source || "mongo" }
        : null,
      ticket: null,
      raw: null,
    },
  });

const pdfEscape = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const addPdfObject = (objects, body) => {
  objects.push(body);
  return objects.length;
};

const makeTicketPdf = (ticket) => {
  const objects = [];
  // color: "dark" (ink) for body text, "light" (white) for text on the header band.
  const lines = [
    { text: "BUS TICKET", x: 42, y: 600, size: 22, font: "F2", color: "light" },
    { text: ticket.ticketNumber || ticket.ticket_number || "-", x: 236, y: 604, size: 11, font: "F2", color: "light" },
    { text: ticket.bus_name || "-", x: 42, y: 574, size: 10, font: "F1", color: "light" },
    { text: "PASSENGER", x: 42, y: 520, size: 8, font: "F1", color: "muted" },
    { text: ticket.passenger_name || "-", x: 42, y: 502, size: 15, font: "F2", color: "dark" },
    { text: ticket.phone || "-", x: 42, y: 484, size: 10, font: "F1", color: "dark" },
    { text: "ROUTE", x: 42, y: 442, size: 8, font: "F1", color: "muted" },
    { text: ticket.route || "-", x: 42, y: 420, size: 17, font: "F2", color: "dark" },
    { text: `Date: ${ticket.date || "-"}`, x: 42, y: 368, size: 12, font: "F2", color: "dark" },
    { text: `Time: ${ticket.time || "-"}`, x: 238, y: 368, size: 12, font: "F2", color: "dark" },
    { text: `Seat: ${ticket.seat || "-"}`, x: 42, y: 310, size: 20, font: "F2", color: "dark" },
    { text: `Amount: ${ticket.amount || "-"}`, x: 42, y: 250, size: 13, font: "F2", color: "dark" },
    { text: `Payment: ${ticket.payment_method || "-"}`, x: 238, y: 250, size: 13, font: "F2", color: "dark" },
    { text: "PAYMENT CONFIRMED", x: 130, y: 72, size: 13, font: "F2", color: "dark" },
  ];

  const colorOps = {
    dark: "0.06 0.09 0.16 rg",
    muted: "0.42 0.47 0.55 rg",
    light: "1 1 1 rg",
  };

  const content = [
    "0.95 0.97 0.99 rg 0 0 430 650 re f",
    "1 1 1 rg 18 18 394 614 re f",
    "0.06 0.09 0.16 rg 18 536 394 96 re f",
    ...lines.map(
      (line) =>
        `${colorOps[line.color] || colorOps.dark} BT /${line.font} ${line.size} Tf ${line.x} ${line.y} Td (${pdfEscape(line.text)}) Tj ET`
    ),
    "0.89 0.91 0.94 RG 42 462 m 388 462 l S",
    "0.93 0.95 1 rg 42 282 346 58 re f",
    "0.06 0.09 0.16 rg 302 116 12 12 re f 326 116 12 12 re f 350 116 12 12 re f 314 140 12 12 re f 338 140 12 12 re f 302 164 12 12 re f 326 164 12 12 re f 350 164 12 12 re f",
  ].join("\n");

  const font1 = addPdfObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const font2 = addPdfObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const contentId = addPdfObject(objects, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  const pageId = addPdfObject(
    objects,
    `<< /Type /Page /Parent 5 0 R /MediaBox [0 0 430 650] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`
  );
  const pagesId = addPdfObject(objects, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const catalogId = addPdfObject(objects, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

router.get("/payment/config", async (req, res) => {
  try {
    const methods = [];
    const companies = {};
    for (const method of REAL_METHODS) {
      const company = await findDemoCompany(method);
      if (company) {
        methods.push(method);
        companies[method] = {
          companyId: company._id,
          companyName: company.companyName,
          source: company.source || "mongo",
        };
      }
    }
    res.send({
      success: true,
      data: {
        amount: PAYMENT_AMOUNT,
        currency: "USD",
        methods,
        companies,
        preferredCompany: companies["Card Payment"]?.companyName || companies.EcoCash?.companyName || "",
        usesHostedPaymentPage: methods.includes("Card Payment"),
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: null });
  }
});

router.post("/payment/initiate", async (req, res) => {
  try {
    const method = REAL_METHODS.includes(req.body.paymentMethod) ? req.body.paymentMethod : "Card Payment";
    const company = await findDemoCompany(method);
    if (!company) {
      return res.status(400).send({
        success: false,
        message: `No PesePay keys found. Set mongo_url or MONGO_URI with company keys, or set PESEPAY_${String(process.env.PESEPAY_MODE || "sandbox").toUpperCase() === "LIVE" ? "LIVE" : "SANDBOX"}_INTEGRATION_KEY and PESEPAY_${String(process.env.PESEPAY_MODE || "sandbox").toUpperCase() === "LIVE" ? "LIVE" : "SANDBOX"}_ENCRYPTION_KEY.`,
        data: null,
      });
    }

    const contact = req.body.contact || {};
    const seats = Array.isArray(req.body.seats) ? req.body.seats : [];
    const merchantReference = `TENDA-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const ticketNumber = makeTicketNumber();
    const paymentPhone = normalizePhone(req.body.paymentPhone || contact.phone);

    if (method === "EcoCash" && !paymentPhone) {
      return res.status(400).send({
        success: false,
        message: "EcoCash payment requires a customer phone number.",
        data: null,
      });
    }

    const config = makeConfig({
      integrationKey: company.pesepayIntegrationKey,
      encryptionKey: company.pesepayEncryptionKey,
      req,
    });
    const returnUrl = `${config.returnUrl}?merchantReference=${encodeURIComponent(merchantReference)}`;
    const paymentResult =
      method === "Card Payment"
        ? await initiateCardCheckout({ config, amount: PAYMENT_AMOUNT, merchantReference, returnUrl })
        : await makeEcocashPayment({
            config,
            amount: PAYMENT_AMOUNT,
            phone: paymentPhone,
            customerName: normalizeString(contact.name) || "Tenda Customer",
            customerEmail: normalizeString(contact.email) || "payments@onhighbus.com",
            merchantReference,
            returnUrl,
          });

    const paymentRef = referenceNumber(paymentResult);
    if (!paymentRef) {
      return res.status(502).send({
        success: false,
        message: "PesePay did not return a payment reference.",
        data: { rawStatus: statusText(paymentResult), raw: paymentResult },
      });
    }

    const firstSeat = seats[0];
    const passengers = req.body.passengers || {};
    const firstPassenger = passengers[firstSeat] || {};
    const bookingData = {
      companyId: company._id,
      bookingSource: "WEB_APP",
      booking_source: "WEB_APP",
      transactionId: merchantReference,
      booking_reference: merchantReference,
      ticketNumber,
      ticket_number: ticketNumber,
      customerName: normalizeString(contact.name),
      passengerName: normalizeString(firstPassenger.name || contact.name),
      customerPhone: normalizeString(contact.phone),
      passengerPhone: normalizeString(contact.phone),
      customerEmail: normalizeString(contact.email),
      passengerEmail: normalizeString(contact.email),
      busName: normalizeString(req.body.bus?.operator || req.body.busName || TENDA_COMPANY_NAME),
      fromCity: normalizeString(req.body.from),
      toCity: normalizeString(req.body.to),
      departureTime: normalizeString(req.body.bus?.departure),
      arrivalTime: normalizeString(req.body.bus?.arrival),
      boardingPoint: normalizeString(req.body.pickupPoint?.name || req.body.pickupPoint),
      dropOffPoint: normalizeString(req.body.dropPoint?.name || req.body.dropPoint),
      seats,
      fare: Number(req.body.total || 0),
      amountPaid: PAYMENT_AMOUNT,
      currency: "USD",
      travelDate: normalizeString(req.body.readableDate || req.body.travelDate),
      journeyDate: normalizeString(req.body.readableDate || req.body.travelDate),
      passengers: seats.map((seat, index) => ({
        passengerNumber: index + 1,
        fullName: normalizeString(passengers[seat]?.name || contact.name),
        gender: normalizeString(passengers[seat]?.gender),
        passengerType: "Adult",
        isPrimary: index === 0,
      })),
      passengerCount: seats.length,
      paymentMethod: `PesePay ${method}`,
      paymentReference: paymentRef,
      paymentMerchantReference: merchantReference,
      paymentStatus: "PENDING",
      status: "RESERVED_AWAITING_PAYMENT",
      bookingStatus: "RESERVED_AWAITING_PAYMENT",
      boardedStatus: "NOT_BOARDED",
    };
    const booking = isDbConnected()
      ? await new Booking(bookingData).save()
      : { ...bookingData, _id: uuidv4() };
    if (!isDbConnected()) memoryBookings.set(paymentRef, booking);
    await createTendaNotification(booking, {
      action: "booking_started",
      detail: `Payment was started through ${method} with reference ${paymentRef}.`,
    });

    res.send({
      success: true,
      message: method === "Card Payment" ? "PesePay checkout created." : "PesePay EcoCash request sent.",
      data: {
        bookingId: booking._id,
        merchantReference,
        referenceNumber: paymentRef,
        redirectUrl: redirectUrl(paymentResult),
        status: statusText(paymentResult),
        amount: PAYMENT_AMOUNT,
        currency: "USD",
        paymentMethod: method,
        selectedCompany: {
          companyId: company._id,
          companyName: company.companyName,
          source: company.source || "mongo",
        },
        ticket: buildTicket(booking),
        raw: paymentResult,
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: null });
  }
});

router.get("/payment/status/:referenceNumber", async (req, res) => {
  try {
    const booking = await getBookingByPaymentReference(req.params.referenceNumber);
    if (!booking) return res.status(404).send({ success: false, message: "Payment reference not found", data: null });
    const company = isDbConnected() ? await Company.findById(booking.companyId).lean() : getEnvPesepayKeys();
    if (!company?.pesepayIntegrationKey || !company?.pesepayEncryptionKey) {
      return res.status(400).send({ success: false, message: "PesePay company keys are unavailable.", data: null });
    }
    const config = makeConfig({
      integrationKey: company.pesepayIntegrationKey,
      encryptionKey: company.pesepayEncryptionKey,
      req,
    });
    let paymentResult;
    try {
      paymentResult = await checkPayment({ config, referenceNumber: req.params.referenceNumber });
    } catch (error) {
      if (isPaymentReferencePendingError(error)) {
        return sendPendingPaymentStatus(
          res,
          booking,
          company,
          req.params.referenceNumber,
          "Payment has not been confirmed yet. Please check again shortly."
        );
      }
      throw error;
    }
    if (isPaid(paymentResult)) await markBookingPaid(booking, paymentResult);
    if (isFailed(paymentResult)) await markBookingPaymentFailed(booking, paymentResult);
    res.send({
      success: true,
      message: "Payment status fetched.",
      data: {
        paid: isPaid(paymentResult),
        failed: isFailed(paymentResult),
        status: statusText(paymentResult),
        referenceNumber: req.params.referenceNumber,
        merchantReference: booking.transactionId,
        selectedCompany: { companyId: company._id, companyName: company.companyName, source: company.source || "mongo" },
        ticket: isPaid(paymentResult) ? buildTicket(booking) : null,
        raw: paymentResult,
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: null });
  }
});

router.get("/payment/status-by-merchant/:merchantReference", async (req, res) => {
  try {
    const booking = await getBookingByMerchantReference(req.params.merchantReference);
    if (!booking?.paymentReference) {
      return res.status(404).send({ success: false, message: "Payment reference not found", data: null });
    }
    req.params.referenceNumber = booking.paymentReference;
    const company = isDbConnected() ? await Company.findById(booking.companyId).lean() : getEnvPesepayKeys();
    if (!company?.pesepayIntegrationKey || !company?.pesepayEncryptionKey) {
      return res.status(400).send({ success: false, message: "PesePay company keys are unavailable.", data: null });
    }
    const config = makeConfig({
      integrationKey: company.pesepayIntegrationKey,
      encryptionKey: company.pesepayEncryptionKey,
      req,
    });
    let paymentResult;
    try {
      paymentResult = await checkPayment({ config, referenceNumber: booking.paymentReference });
    } catch (error) {
      if (isPaymentReferencePendingError(error)) {
        return sendPendingPaymentStatus(
          res,
          booking,
          company,
          booking.paymentReference,
          "Payment has not been confirmed yet. Please check again shortly."
        );
      }
      throw error;
    }
    if (isPaid(paymentResult)) await markBookingPaid(booking, paymentResult);
    if (isFailed(paymentResult)) await markBookingPaymentFailed(booking, paymentResult);
    res.send({
      success: true,
      message: "Payment status fetched.",
      data: {
        paid: isPaid(paymentResult),
        failed: isFailed(paymentResult),
        status: statusText(paymentResult),
        referenceNumber: booking.paymentReference,
        merchantReference: booking.transactionId,
        selectedCompany: { companyId: company._id, companyName: company.companyName, source: company.source || "mongo" },
        ticket: isPaid(paymentResult) ? buildTicket(booking) : null,
        raw: paymentResult,
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: null });
  }
});

router.post("/payment/result", async (req, res) => {
  try {
    let result = req.body || {};
    if (result.payload) {
      const envCompany = getEnvPesepayKeys();
      const companies = isDbConnected()
        ? await Company.find({
            pesepayIntegrationKey: { $nin: ["", null] },
            pesepayEncryptionKey: { $nin: ["", null] },
          }).lean()
        : envCompany
        ? [envCompany]
        : [];
      for (const company of companies) {
        try {
          result = decryptPayload(result.payload, company.pesepayEncryptionKey);
          result._pesepayCompanyId = company._id;
          break;
        } catch (error) {
          // Try the next configured company key.
        }
      }
    }

    const merchantReference = normalizeString(result.merchantReference || result.reference);
    const paymentReference = referenceNumber(result);
    const booking =
      (merchantReference && (await getBookingByMerchantReference(merchantReference))) ||
      (paymentReference && (await getBookingByPaymentReference(paymentReference)));
    if (booking && isPaid(result)) await markBookingPaid(booking, result);
    if (booking && isFailed(result)) await markBookingPaymentFailed(booking, result);
    res.send({ success: true, received: true });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

router.get("/payment/return", async (req, res) => {
  const merchantReference = normalizeString(req.query.merchantReference || req.query.reference);
  const booking = merchantReference ? await getBookingByMerchantReference(merchantReference) : null;
  if (booking) {
    await createTendaNotification(booking, {
      action: "payment_returned",
      detail: "The customer returned from the PesePay payment page.",
    });
  }
  const paymentReference = normalizeString(req.query.referenceNumber || booking?.paymentReference);
  const params = new URLSearchParams();
  if (paymentReference) params.set("tendaPaymentReference", paymentReference);
  if (merchantReference) params.set("merchantReference", merchantReference);
  params.set("paymentReturn", "1");
  res.redirect(`/?${params.toString()}`);
});

router.get("/ticket/:ticketNumber.pdf", async (req, res) => {
  try {
    const booking = isDbConnected()
      ? await Booking.findOne({
          $or: [{ ticketNumber: req.params.ticketNumber }, { ticket_number: req.params.ticketNumber }],
          paymentStatus: "Paid",
        })
      : Array.from(memoryBookings.values()).find(
          (item) =>
            (item.ticketNumber === req.params.ticketNumber || item.ticket_number === req.params.ticketNumber) &&
            item.paymentStatus === "Paid"
        );
    if (!booking) return res.status(404).send("Ticket not found or payment is not confirmed.");
    await createTendaNotification(booking, {
      action: String(req.query.download) === "1" ? "ticket_downloaded" : "ticket_viewed",
      detail: String(req.query.download) === "1" ? "The customer downloaded the ticket PDF." : "The customer opened the ticket PDF.",
    });
    const ticket = buildTicket(booking);
    const pdf = makeTicketPdf(ticket);
    const disposition = String(req.query.download) === "1" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${ticket.ticketNumber || "ticket"}.pdf"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

module.exports = router;
