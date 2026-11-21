// Interview practice statistics for super admins (/statistics-interviews page).
// The careers bot holds the data; this server asks it with a shared secret so
// customers' phone numbers are only ever shown to signed-in super admins.
//
//   GET /api/interview-stats          summary + everyone who came for interviews
//   GET /api/interview-stats/export   the Excel file (Not paid / Paid / Everyone)
//
// .env: CAREERS_BOT_INTERNAL_URL (default http://127.0.0.1:8002)
//       INTERVIEW_ADMIN_TOKEN     (same value as in the careers bot's .env)
const router = require("express").Router();
const http = require("http");
const https = require("https");
const authMiddleware = require("../middlewares/authMiddleware");
const { serializeAuthUser } = require("../middlewares/authorizationMiddleware");

const BOT = () => (process.env.CAREERS_BOT_INTERNAL_URL || "http://127.0.0.1:8002").replace(/\/$/, "");

const superAdminOnly = (req, res, next) => {
  if (serializeAuthUser(req.user)?.role !== "SUPER_ADMIN") {
    return res.status(403).send({ success: false, message: "Only super admins can see interview statistics." });
  }
  next();
};

function askBot(path, res, onJson) {
  const token = process.env.INTERVIEW_ADMIN_TOKEN || "";
  if (!token) {
    return res.status(503).send({ success: false, message: "INTERVIEW_ADMIN_TOKEN is not set on the server." });
  }
  const url = new URL(BOT() + path);
  const client = url.protocol === "https:" ? https : http;
  const req = client.get(url, { headers: { "X-Admin-Token": token }, timeout: 20000 }, (botRes) => {
    if (botRes.statusCode !== 200) {
      botRes.resume();
      return res.status(502).send({ success: false, message: `The careers bot answered ${botRes.statusCode}.` });
    }
    if (onJson) {
      let body = "";
      botRes.setEncoding("utf8");
      botRes.on("data", (chunk) => (body += chunk));
      botRes.on("end", () => {
        try {
          onJson(JSON.parse(body));
        } catch (error) {
          res.status(502).send({ success: false, message: "The careers bot sent something unexpected." });
        }
      });
    } else {
      // the Excel file: passed straight through
      res.setHeader("Content-Type", botRes.headers["content-type"] || "application/octet-stream");
      if (botRes.headers["content-disposition"]) res.setHeader("Content-Disposition", botRes.headers["content-disposition"]);
      res.setHeader("Cache-Control", "no-store");
      botRes.pipe(res);
    }
  });
  req.on("timeout", () => req.destroy(new Error("timeout")));
  req.on("error", (error) => {
    if (!res.headersSent) res.status(502).send({ success: false, message: `The careers bot could not be reached (${error.message}).` });
  });
}

router.get("/", authMiddleware, superAdminOnly, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  askBot("/api/interview/admin/stats", res, (data) => res.send({ success: true, data }));
});

router.get("/export", authMiddleware, superAdminOnly, (req, res) => {
  askBot("/api/interview/admin/export.xlsx", res, null);
});

module.exports = router;
