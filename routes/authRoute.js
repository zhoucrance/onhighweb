const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/usersModel");
const authMiddleware = require("../middlewares/authMiddleware");
const { serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const normalizeString = (value) => String(value || "").trim();

const buildTokenPayload = (user) => {
  const authUser = serializeAuthUser(user);
  return {
    userId: user._id,
    role: authUser.role,
    roleLevel: authUser.roleLevel,
    companyId: authUser.companyId,
    permissions: authUser.permissions,
  };
};

router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: normalizeString(req.body.email).toLowerCase() });
    if (!user) {
      return res.send({ message: "User does not exist", success: false, data: null });
    }
    if (user.isBlocked || user.isActive === false) {
      return res.send({ message: "Your account is blocked , please contact admin", success: false, data: null });
    }
    const passwordMatch = await bcrypt.compare(req.body.password, user.password);
    if (!passwordMatch) {
      return res.send({ message: "Incorrect password", success: false, data: null });
    }
    const token = jwt.sign(buildTokenPayload(user), process.env.jwt_secret, { expiresIn: "1d" });
    res.send({ message: "User logged in successfully", success: true, data: token });
  } catch (error) {
    res.send({ message: error.message, success: false, data: null });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id).populate("companyId");
  res.send({
    message: "User fetched successfully",
    success: true,
    data: user || req.user,
  });
});

router.post("/logout", authMiddleware, (req, res) => {
  res.send({
    message: "User logged out successfully",
    success: true,
    data: null,
  });
});

module.exports = router;
