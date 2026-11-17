// End-to-end tests (Cypress). Needs the site on :3000 (npm run dev) and, for the
// Bills tests, the bills service in demo mode on :8100 (BILLS_DEMO=1).
// From VS Code's terminal, clear ELECTRON_RUN_AS_NODE first or Cypress will not start:
//   PowerShell:  $env:ELECTRON_RUN_AS_NODE=$null; npm run e2e
const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    video: false,
    screenshotsFolder: "cypress/screenshots",
    defaultCommandTimeout: 10000,
  },
});
