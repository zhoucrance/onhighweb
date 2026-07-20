const router = require("express").Router();
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authMiddleware");
const HelpDeskRequest = require("../models/helpDeskRequestModel");
const { serializeAuthUser } = require("../middlewares/authorizationMiddleware");
const { createAuditNotification } = require("../utils/auditNotifications");

const normalizeString = (value) => String(value || "").trim();

const getScopedCompanyId = (user) => {
  const authUser = serializeAuthUser(user);
  if (!authUser || authUser.role === "SUPER_ADMIN" || !authUser.companyId) return null;
  return authUser.companyId;
};

const canSeeHelpDesk = (user) => {
  const authUser = serializeAuthUser(user);
  return authUser?.role === "SUPER_ADMIN" || authUser?.role === "COMPANY_ADMIN";
};

const buildScopedQuery = (user, extra = {}) => {
  const companyId = getScopedCompanyId(user);
  return {
    ...extra,
    ...(companyId ? { companyId } : {}),
  };
};

router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!canSeeHelpDesk(req.user)) {
      return res.status(403).send({ success: false, message: "Access denied", data: [] });
    }

    const status = normalizeString(req.query.status).toUpperCase();
    const search = normalizeString(req.query.search);
    const query = buildScopedQuery(req.user);
    if (status && status !== "ALL") query.status = status;
    if (search) {
      const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { ticketNumber: pattern },
        { ticket_number: pattern },
        { subjectLabel: pattern },
        { phoneNumber: pattern },
        { passengerName: pattern },
      ];
    }

    const requests = await HelpDeskRequest.find(query)
      .populate("companyId")
      .populate("booking")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.send({ success: true, message: "Help desk requests fetched successfully", data: requests });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message, data: [] });
  }
});

router.post("/:id/status", authMiddleware, async (req, res) => {
  try {
    if (!canSeeHelpDesk(req.user)) {
      return res.status(403).send({ success: false, message: "Access denied" });
    }

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid help request id" });
    }

    const status = normalizeString(req.body.status).toUpperCase();
    if (!["OPEN", "IN_PROGRESS", "SOLVED"].includes(status)) {
      return res.status(400).send({ success: false, message: "Invalid help request status" });
    }

    const query = buildScopedQuery(req.user, { _id: id });
    const request = await HelpDeskRequest.findOne(query);
    if (!request) {
      return res.status(404).send({ success: false, message: "Help request not found" });
    }

    request.status = status;
    request.internalNote = normalizeString(req.body.internalNote || request.internalNote);
    if (status === "SOLVED") {
      request.resolvedAt = request.resolvedAt || new Date();
      request.resolvedBy = req.user._id;
    } else {
      request.resolvedAt = null;
      request.resolvedBy = null;
    }
    await request.save();

    await createAuditNotification(req.user, {
      companyId: request.companyId,
      module: "help_desk",
      action: `marked ${status.toLowerCase().replaceAll("_", " ")}`,
      entityType: "help request",
      entityId: request._id,
      entityLabel: request.ticketNumber,
      message: `Help request ${request.ticketNumber} marked ${status.replaceAll("_", " ")}.`,
    });

    res.send({ success: true, message: "Help request updated successfully", data: request });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

module.exports = router;
