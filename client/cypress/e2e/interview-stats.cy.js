// /statistics-interviews: the page for super admins. The staff sign-in check is
// answered with a stand-in (no real account is made); the statistics and the Excel
// file are the careers bot's real answers (local bot, INTERVIEW_ADMIN_TOKEN).

const BOT = "http://localhost:8000/api/interview/admin";
const token = () => Cypress.env("INTERVIEW_ADMIN_TOKEN");

function signedInAs(role) {
  cy.intercept("POST", "**/api/users/get-user-by-id", {
    body: { success: true, data: { _id: "u1", name: "Staff", email: "s@e2e.test", role, isAdmin: role === "SUPER_ADMIN" } },
  });
}

function withRealStats() {
  cy.request({ url: `${BOT}/stats`, headers: { "X-Admin-Token": token() } }).then((r) => {
    cy.intercept("GET", "**/api/interview-stats", { body: { success: true, data: r.body } }).as("stats");
    cy.wrap(r.body).as("real");
  });
}

const visitPage = (width, height) => {
  cy.viewport(width, height);
  cy.visit("/statistics-interviews", { onBeforeLoad: (win) => win.localStorage.setItem("token", "stand-in") });
};

describe("Interview statistics page", () => {
  it("is refused without a staff login", () => {
    cy.request({ url: "/api/interview-stats", failOnStatusCode: false }).its("status").should("eq", 401);
    cy.request({ url: "/api/interview-stats/export", failOnStatusCode: false }).its("status").should("eq", 401);
    cy.request({ url: `${BOT}/stats`, failOnStatusCode: false }).its("status").should("eq", 401);
  });

  it("is not shown to staff who are not super admins", () => {
    signedInAs("STAFF");
    cy.intercept("GET", "**/api/interview-stats").as("never");
    visitPage(375, 812);
    cy.contains(/access denied|not authorized|permission/i).should("exist");
    cy.get(".is-page").should("not.exist");
  });

  [
    ["phone", 375, 812],
    ["computer", 1366, 800],
  ].forEach(([device, width, height]) => {
    it(`shows paid and not paid people on a ${device}`, () => {
      signedInAs("SUPER_ADMIN");
      withRealStats();
      visitPage(width, height);
      cy.wait("@stats");
      cy.get("@real").then((real) => {
        const s = real.summary;
        cy.contains(".is-card", "Came for interviews").should("contain", s.total);
        cy.contains(".is-card", "Paid").should("contain", s.paid);
        cy.contains(".is-card", "Not paid").should("contain", s.notPaid);
        cy.contains(".is-card", "Stuck on paying").should("contain", s.stuckOnPay);
        // starts on "Not paid": nobody who paid is listed
        cy.get(".is-chips [aria-selected=true]").should("contain", "Not paid");
        cy.get(".is-row:not(.is-row--head)").should("have.length", s.notPaid);
        cy.get(".is-row .is-tag--paid").should("not.exist");
        cy.window().then((win) => expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth));
        cy.screenshot(`interview-stats/${device}`, { capture: "viewport" });
        cy.contains(".is-chips button", "Stuck on paying").click();
        cy.get(".is-row:not(.is-row--head)").should("have.length", s.stuckOnPay);
        cy.contains(".is-chips button", "Paid").click();
        cy.get(".is-row:not(.is-row--head)").should("have.length", s.paid);
        cy.contains(".is-chips button", "Everyone").click();
        cy.get(".is-row:not(.is-row--head)").should("have.length", s.total);
        cy.get(".is-tools input").type("0710000001");
        cy.get(".is-row:not(.is-row--head)").should("have.length", 1).and("contain", "Test Rudo");
        cy.get(".is-row a").should("have.attr", "href", "https://wa.me/263710000001");
      });
    });
  });

  it("downloads the Excel file", () => {
    signedInAs("SUPER_ADMIN");
    withRealStats();
    cy.request({ url: `${BOT}/export.xlsx`, headers: { "X-Admin-Token": token() }, encoding: "binary" }).then((r) => {
      expect(r.headers["content-type"]).to.contain("spreadsheetml");
      cy.intercept("GET", "**/api/interview-stats/export", {
        headers: {
          "content-type": r.headers["content-type"],
          "content-disposition": r.headers["content-disposition"],
        },
        body: Cypress.Buffer.from(r.body, "binary"),
      }).as("excel");
    });
    visitPage(375, 812);
    cy.wait("@stats");
    cy.contains("button", "Download Excel").click();
    cy.wait("@excel");
    const today = new Date().toISOString().slice(0, 10);
    cy.readFile(`cypress/downloads/interview-users-${today}.xlsx`, "binary", { timeout: 15000 })
      .should((file) => expect(file.length).to.be.greaterThan(1000));
  });
});
