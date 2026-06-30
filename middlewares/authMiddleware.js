const jwt = require("jsonwebtoken");
const User = require("../models/usersModel");
const { serializeAuthUser } = require("./authorizationMiddleware");

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).send({
        message: "Auth failed",
        success: false,
      });
    }
    const decoded = jwt.verify(token, process.env.jwt_secret);
    const user = await User.findById(decoded.userId || decoded.userId?._id || decoded.id);
    if (!user) {
      return res.status(401).send({
        message: "Auth failed",
        success: false,
      });
    }
    req.body.userId = String(user._id);
    req.user = serializeAuthUser(user);
    req.authUser = req.user;
    next();
  } catch (error) {
    return res.status(401).send({
      message: "Auth failed",
      success: false,
    });
  }
};
