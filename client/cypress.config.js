// End-to-end tests (Cypress). Needs the site on :3000 (npm run dev), the careers bot
// on :8000 and, for the Bills tests, the bills service in demo mode on :8100.
// For the account tests, run the careers bot locally with ACCOUNT_DEV_CODES=1 (and no
// SMTP_HOST): emailed codes are then written to its data/dev_codes.log, read here.
// From VS Code's terminal, clear ELECTRON_RUN_AS_NODE first or Cypress will not start:
//   PowerShell:  $env:ELECTRON_RUN_AS_NODE=$null; npm run e2e
const fs = require("fs");
const path = require("path");
const { defineConfig } = require("cypress");

const DEV_CODES =
  process.env.DEV_CODES_FILE ||
  path.resolve(__dirname, "../../../msu chatbot/resume/data/dev_codes.log");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    video: false,
    screenshotsFolder: "cypress/screenshots",
    defaultCommandTimeout: 10000,
    setupNodeEvents(on) {
      on("task", {
        // the latest 6-digit code emailed to this address (local testing only)
        devCode(email) {
          if (!fs.existsSync(DEV_CODES)) return null;
          const lines = fs.readFileSync(DEV_CODES, "utf8").trim().split("\n").reverse();
          const line = lines.find((l) => l.split("\t")[1] === email.toLowerCase());
          const match = line && line.split("\t")[3].match(/\b(\d{6})\b/);
          return match ? match[1] : null;
        },
      });
    },
  },
});
