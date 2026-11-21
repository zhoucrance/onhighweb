// The public privacy policy (for Meta app review): no login, plain HTML that a
// crawler can read without JavaScript, linked from every page and from sign-up.

const SECTIONS = [
  "Information we collect",
  "How we use your information",
  "Our WhatsApp services",
  "Who we share your information with",
  "How long we keep your information",
  "How we protect your information",
  "Your rights",
  "How to delete your data",
  "Contact us",
];

describe("Privacy policy", () => {
  it("is plain HTML a crawler can read, at every address, with no login", () => {
    ["/privacy-policy", "/privacy-policy/", "/privacy"].forEach((path) => {
      cy.request({ url: path, headers: { Accept: "text/html" } }).then((r) => {
        expect(r.status).to.eq(200);
        expect(r.headers["content-type"]).to.contain("text/html");
        expect(r.body).to.contain("<h1>Privacy Policy</h1>");
        SECTIONS.forEach((s) => expect(r.body, s).to.contain(s));
        expect(r.body).to.contain("DELETE MY DATA");
        expect(r.body).to.contain("+263 78 157 6825");
        expect(r.body).not.to.contain('id="root"'); // not the app shell
      });
    });
  });

  [
    ["phone", 375, 812],
    ["computer", 1366, 800],
  ].forEach(([device, width, height]) => {
    it(`reads well on a ${device}, with working section links`, () => {
      cy.viewport(width, height);
      cy.clearLocalStorage();
      cy.visit("/privacy-policy");
      cy.get("h1").should("have.text", "Privacy Policy");
      cy.window().then((win) => expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth));
      cy.screenshot(`privacy/${device}-top`, { capture: "viewport" });
      cy.contains(".toc a", "How to delete your data").click();
      cy.location("hash").should("eq", "#delete-your-data");
      cy.get("#delete-your-data").should("be.visible");
      cy.screenshot(`privacy/${device}-delete`, { capture: "viewport" });
      cy.contains("a", "Back to the website").should("have.attr", "href", "/");
    });
  });

  it("is linked from the footer of the home page", () => {
    cy.viewport(375, 812);
    cy.visit("/bills", { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });
    cy.get(".ph-footer").scrollIntoView().should("be.visible");
    cy.contains(".ph-footer a", "Privacy Policy").should("have.attr", "href", "/privacy-policy").click();
    cy.location("pathname").should("eq", "/privacy-policy");
    cy.get("h1").should("have.text", "Privacy Policy");
  });

  it("is linked from the sign-up form", () => {
    cy.viewport(375, 812);
    cy.intercept("GET", "**/api/account/config", { body: { googleClientId: "" } });
    cy.visit("/interviews", { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });
    cy.get(".ph-account").click();
    cy.get(".ac-dialog").contains("[role=tab]", "Create account").click();
    cy.get(".ac-consent").should("contain", "By creating an account you accept our");
    cy.get(".ac-consent a").should("have.attr", "href", "/privacy-policy").and("have.attr", "target", "_blank");
  });
});
