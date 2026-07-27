const router = require("express").Router();
const Company = require("../models/companyModel");
const authMiddleware = require("../middlewares/authMiddleware");
const { requireSuperAdmin, serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const normalizeString = (value) => String(value || "").trim();
const paymentMethodOptions = ["EcoCash", "Card Payment", "Pay on Boarding"];

const normalizePaymentMethods = (methods) => [
  ...new Set(
    (Array.isArray(methods) ? methods : [methods])
      .map(normalizeString)
      .filter((method) => paymentMethodOptions.includes(method))
  ),
];

const withoutPesepaySecrets = (company) => {
  if (!company) return company;
  const data = typeof company.toObject === "function" ? company.toObject() : { ...company };
  delete data.pesepayIntegrationKey;
  delete data.pesepayEncryptionKey;
  return data;
};

const serializePesepaySettings = (company) => ({
  _id: company._id,
  companyName: company.companyName,
  companyLogo: company.companyLogo,
  companyStatus: company.companyStatus,
  hasPesepayIntegrationKey: Boolean(normalizeString(company.pesepayIntegrationKey)),
  hasPesepayEncryptionKey: Boolean(normalizeString(company.pesepayEncryptionKey)),
  pesepayKeysUpdatedAt: company.pesepayKeysUpdatedAt || null,
  enabledPaymentMethods:
    Array.isArray(company.enabledPaymentMethods) && company.enabledPaymentMethods.length
      ? company.enabledPaymentMethods
      : ["EcoCash", "Card Payment"],
  paymentMethodsUpdatedAt: company.paymentMethodsUpdatedAt || null,
});

router.post("/", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const company = await new Company({
      companyName: normalizeString(req.body.companyName),
      companyLogo: normalizeString(req.body.companyLogo),
      companyStatus: req.body.companyStatus || "Active",
      createdBy: req.user._id,
    }).save();

    res.send({
      message: "Company created successfully",
      success: true,
      data: withoutPesepaySecrets(company),
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const authUser = serializeAuthUser(req.user);
    const query = authUser.role === "SUPER_ADMIN" ? {} : { _id: authUser.companyId };
    const companies = await Company.find(query).select("-pesepayIntegrationKey -pesepayEncryptionKey");
    res.send({
      message: "Companies fetched successfully",
      success: true,
      data: companies,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.get("/pesepay-settings/list", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ companyName: 1 });
    res.send({
      message: "Pesepay settings fetched successfully",
      success: true,
      data: companies.map(serializePesepaySettings),
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.patch("/pesepay-settings/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const integrationKey = normalizeString(req.body.pesepayIntegrationKey);
    const encryptionKey = normalizeString(req.body.pesepayEncryptionKey);

    if (!integrationKey || !encryptionKey) {
      return res.status(400).send({
        message: "Pesepay integration key and encryption key are required.",
        success: false,
        data: null,
      });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        pesepayIntegrationKey: integrationKey,
        pesepayEncryptionKey: encryptionKey,
        pesepayKeysUpdatedAt: new Date(),
        pesepayKeysUpdatedBy: req.user._id,
      },
      { new: true }
    );
    if (!company) return res.status(404).send({ message: "Company not found", success: false, data: null });
    res.send({
      message: "Pesepay keys saved successfully",
      success: true,
      data: serializePesepaySettings(company),
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.patch("/payment-methods/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const enabledPaymentMethods = normalizePaymentMethods(req.body.enabledPaymentMethods);
    if (!enabledPaymentMethods.length) {
      return res.status(400).send({
        message: "At least one payment method must be enabled.",
        success: false,
        data: null,
      });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        enabledPaymentMethods,
        paymentMethodsUpdatedAt: new Date(),
        paymentMethodsUpdatedBy: req.user._id,
      },
      { new: true }
    );
    if (!company) return res.status(404).send({ message: "Company not found", success: false, data: null });
    res.send({
      message: "Payment methods saved successfully",
      success: true,
      data: serializePesepaySettings(company),
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const authUser = serializeAuthUser(req.user);
    if (authUser.role !== "SUPER_ADMIN" && String(authUser.companyId || "") !== String(req.params.id)) {
      return res.status(403).send({ message: "Access denied", success: false, data: null });
    }
    const company = await Company.findById(req.params.id).select("-pesepayIntegrationKey -pesepayEncryptionKey");
    if (!company) return res.status(404).send({ message: "Company not found", success: false, data: null });
    res.send({ message: "Company fetched successfully", success: true, data: company });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.patch("/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        companyName: normalizeString(req.body.companyName),
        companyLogo: normalizeString(req.body.companyLogo),
        companyStatus: req.body.companyStatus || "Active",
      },
      { new: true }
    );
    if (!company) return res.status(404).send({ message: "Company not found", success: false, data: null });
    res.send({ message: "Company updated successfully", success: true, data: withoutPesepaySecrets(company) });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

module.exports = router;
