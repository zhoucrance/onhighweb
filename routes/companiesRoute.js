const router = require("express").Router();
const Company = require("../models/companyModel");
const authMiddleware = require("../middlewares/authMiddleware");
const { requireSuperAdmin, serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const normalizeString = (value) => String(value || "").trim();

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
      data: company,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const authUser = serializeAuthUser(req.user);
    const query = authUser.role === "SUPER_ADMIN" ? {} : { _id: authUser.companyId };
    const companies = await Company.find(query);
    res.send({
      message: "Companies fetched successfully",
      success: true,
      data: companies,
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
    const company = await Company.findById(req.params.id);
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
    res.send({ message: "Company updated successfully", success: true, data: company });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false, data: null });
  }
});

module.exports = router;
