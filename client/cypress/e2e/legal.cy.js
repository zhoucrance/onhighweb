// Terms of Service and the data deletion instructions page (Meta App Dashboard:
// "Terms of Service URL" and "Data deletion instructions URL"): public, no login,
// plain HTML that a crawler can read without JavaScript.

const PAGES = [
  {
    file: "terms",
    urls: ["/terms-of-service", "/terms-of-service/", "/terms"],
    h1: "Terms of Service",
    must: ["Prices and payments", "Interview practice", "Bill payments and airtime", "Bus booking",
      "Refunds and problems", "Acceptable use", "Governing law", "Contact us", "$4.99", "+263 78 157 6825"],
  },
  {
    file: "deletion",
    urls: ["/data-deletion", "/data-deletion/", "/delete-data", "/delete-my-data"],
    h1: "How to delete your data",
    must: ["How to request deletion", "DELETE MY DATA", "DELETE MY ACCOUNT", "What we delete",
      "What we may keep", "How long it takes", "30 days", "+263 78 157 6825"],
  },
];

describe("Terms of Service and data deletion pages", () => {
  PAGES.forEach(({ file, urls, h1, must }) => {
    it(`${h1}: plain HTML at every address, no login`, () => {
      urls.forEach((url) =>
        cy.request({ url, headers: { Accept: "text/html" } }).then((r) => {
          expect(r.status).to.eq(200);
          expect(r.headers["content-type"]).to.contain("text/html");
          expect(r.headers["cache-control"] || "").not.to.contain("immutable");
          expect(r.body).to.contain(`<h1>${h1}</h1>`);
          must.forEach((text) => expect(r.body, text).to.contain(text));
          expect(r.body).not.to.contain('id="root"'); // not the app shell
        })
      );
    });

    [
      ["phone", 375, 812],
      ["computer", 1366, 800],
    ].forEach(([device, width, height]) => {
      it(`${h1}: reads well on a ${device}`, () => {
        cy.viewport(width, height);
        cy.visit(urls[0]);
        cy.get("h1").should("have.text", h1);
        cy.window().then((win) => expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth));
        cy.screenshot(`legal/${file}-${device}`, { capture: "viewport" });
        // every page links to the other two
        cy.get("footer a[href='/privacy-policy']").should("exist");
        cy.get("footer a[href='/terms-of-service']").should("exist");
        cy.get("footer a[href='/data-deletion']").should("exist");
      });
    });
  });

  it("the deletion page's buttons open WhatsApp with the right message", () => {
    cy.visit("/data-deletion");
    cy.contains("a.cta", "DELETE MY DATA")
      .should("have.attr", "href", "https://wa.me/263781576825?text=DELETE%20MY%20DATA");
    cy.contains("a.cta", "DELETE MY ACCOUNT").should("have.attr", "href").and("contain", "wa.me/263781576825");
  });

  it("the privacy policy points to the deletion page", () => {
    cy.visit("/privacy-policy#delete-your-data");
    cy.get("#delete-your-data").parent().find("a[href='/data-deletion']").should("exist");
  });

  it("the home page footer links to all three", () => {
    cy.viewport(375, 812);
    cy.visit("/interviews", { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });
    cy.get(".ph-footer").scrollIntoView();
    cy.contains(".ph-footer a", "Terms of Service").should("have.attr", "href", "/terms-of-service");
    cy.contains(".ph-footer a", "Delete your data").should("have.attr", "href", "/data-deletion").click();
    cy.location("pathname").should("eq", "/data-deletion");
    cy.get("h1").should("have.text", "How to delete your data");
  });

  it("sign-up asks to accept the Terms of Service and Privacy Policy", () => {
    cy.viewport(375, 812);
    cy.intercept("GET", "**/api/account/config", { body: { googleClientId: "" } });
    cy.visit("/interviews", { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });
    cy.get(".ph-account").click();
    cy.get(".ac-dialog").contains("[role=tab]", "Create account").click();
    cy.get(".ac-consent a[href='/terms-of-service']").should("contain", "Terms of Service");
    cy.get(".ac-consent a[href='/privacy-policy']").should("contain", "Privacy Policy");
  });
});
