// Bills & airtime, on a phone and on a computer: home (chips, panel, search),
// checkout (Details -> Confirm -> Pay -> Done), Back, Cancel, and layout checks.
// Runs against the bills service in demo mode (real biller names, no real money).

const SIZES = {
  phone: [375, 812],
  computer: [1366, 800],
};

// skip the first-visit "website or WhatsApp?" question
const visit = (url) =>
  cy.visit(url, { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });

const noSidewaysScroll = () =>
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, "no sideways scrolling").to.be.at.most(win.innerWidth);
  });

const rect = (el) => el[0].getBoundingClientRect();

Object.entries(SIZES).forEach(([device, [width, height]]) => {
  describe(`Bills on a ${device} (${width}x${height})`, () => {
    beforeEach(() => cy.viewport(width, height));

    it("lists every area as chips and opens a panel of billers", () => {
      visit("/bills");
      cy.get(".bp-page .ip-chips button").should("have.length.at.least", 10);
      cy.contains("h2", "Popular").should("be.visible");
      noSidewaysScroll();
      cy.screenshot(`${device}/1-home`, { capture: "viewport" });

      cy.contains(".bp-page .ip-chips button", "Schools").click();
      cy.get(".ip-area").should("be.visible");
      cy.get(".ip-area .bp-sub-title").then((titles) =>
        expect([...titles].map((t) => t.innerText.toLowerCase())).to.deep.equal([
          "universities",
          "colleges & polytechnics",
          "schools",
        ])
      );
      cy.get(".ip-area .bp-service").should("have.length", 28);
      cy.wait(600);
      cy.screenshot(`${device}/2-schools-panel`, { capture: "viewport" });
      cy.get(".bp-filter").type("midlands");
      cy.get(".ip-area .bp-service").should("have.length", 2);
      cy.get(".ip-area-close").click();
      cy.get(".ip-area").should("not.exist");
    });

    it("finds billers by search", () => {
      visit("/bills");
      cy.get(".ip-search input").type("harare");
      cy.contains(".bp-service", "City Of Harare").should("be.visible");
      cy.contains(".bp-service", "City of Harare Prepaid Water").should("be.visible");
    });

    it("pays a bill from details to done, like bus booking", () => {
      visit("/bills");
      cy.contains(".bp-service", "ZESA Pre-paid Electricity").click();
      cy.location("pathname").should("eq", "/bills/pay/ZETDC");
      cy.get(".ph-tabs").should("not.exist"); // full-screen checkout
      noSidewaysScroll();

      // the close button is top right: at the screen edge on phones, at the
      // content's right edge (over the order summary) on computers
      cy.get(".bp-head-btn").then((btn) =>
        cy.get(device === "phone" ? ".bp-checkout-head" : ".bp-aside").then((edge) => {
          const gap = rect(edge).right - rect(btn).right;
          expect(gap, "close at the right").to.be.within(-2, 40);
        })
      );

      // phone: bottom bar; computer: order summary beside the form
      const bar = device === "phone" ? ".bp-checkout-bar" : ".bp-aside";
      cy.get(bar).should("be.visible");
      cy.get(device === "phone" ? ".bp-aside" : ".bp-checkout-bar").should("not.be.visible");

      cy.get(".bp-steps li.is-current").should("contain", "Details");
      cy.get(`${bar} .ip-btn`).contains("Continue").click();
      cy.get(".bp-error").should("have.length", 2); // meter and amount are required
      cy.screenshot(`${device}/3-details-errors`, { capture: "viewport" });

      cy.get(".bp-field input").first().type("37132229735");
      cy.contains(".bp-quick button", "10").click();
      cy.get(bar).should("contain", "ZiG 10.00");
      cy.get(`${bar} .ip-btn`).contains("Continue").click();

      cy.get(".bp-steps li.is-current").should("contain", "Confirm");
      cy.get(".bp-table").should("contain", "Demo Customer").and("contain", "37132229735");
      // Back is a real, outlined button beside the main one
      cy.get(`${bar} .bp-back-btn`)
        .should("be.visible")
        .and(($b) => expect(getComputedStyle($b[0]).borderTopWidth).to.eq("2px"));
      cy.get(`${bar} .bp-back-btn`).then((back) =>
        cy.get(`${bar} .bp-bar-actions .ip-btn:not(.bp-back-btn)`).then((main) => {
          expect(Math.abs(rect(back).top - rect(main).top), "same row").to.be.lessThan(2);
          expect(rect(back).height, "easy to tap").to.be.at.least(44);
        })
      );
      cy.screenshot(`${device}/4-confirm`, { capture: "viewport" });
      cy.get(`${bar} .bp-back-btn`).click();
      cy.get(".bp-field input").first().should("have.value", "37132229735"); // kept
      cy.get(`${bar} .ip-btn`).contains("Continue").click();

      cy.get(`${bar} .ip-btn`).contains("Continue to pay").click();
      cy.get(".bp-steps li.is-current").should("contain", "Pay");
      // not signed in: sign in or continue as guest, before choosing how to pay
      cy.get(".bp-account-choice").should("contain", "Keep a record of this payment");
      cy.get(`${bar} .ip-btn`).contains("Pay ZiG 10.00").should("be.disabled");
      cy.contains(".bp-account-choice button", "Continue as guest").click();
      cy.contains(".bp-method", "EcoCash").should("have.attr", "aria-checked", "true");
      cy.get(`${bar} .ip-btn`).contains("Pay ZiG 10.00").click();
      cy.get(".ip-notice").should("contain", "mobile money number");
      cy.get("input[type=tel]").type("0771234567");
      cy.screenshot(`${device}/5-pay`, { capture: "viewport" });
      cy.get(`${bar} .ip-btn`).contains("Pay ZiG 10.00").click();

      cy.get(".bp-outcome h2").should("contain", "Payment successful");
      cy.get(".bp-voucher strong").should("not.be.empty");
      cy.get(".bp-sms-sent").should("contain", "0771234567"); // receipt SMS to the paying number
      cy.get(".bp-steps li.is-done").should("have.length", 3);
      cy.get(".bp-head-btn").should("not.exist"); // finished: leave with Done
      cy.wait(500);
      cy.screenshot(`${device}/6-done`, { capture: "viewport" });
      cy.get(`${bar} .ip-btn`).contains("Done").click();
      cy.location("pathname").should("eq", "/bills");
    });

    it("asks before cancelling a started payment, then goes back to bills", () => {
      visit("/bills/pay/DSTV");
      cy.contains(".bp-product", "Family").click().should("have.attr", "aria-checked", "true");
      cy.get(".bp-field input").first().type("1234567890");
      cy.get(".bp-head-btn").click();
      cy.get(".bp-ask").should("be.visible").and("contain", "Cancel this payment?");
      cy.screenshot(`${device}/7-cancel`, { capture: "viewport" });
      cy.contains("button", "Keep going").click();
      cy.location("pathname").should("eq", "/bills/pay/DSTV");
      cy.get(".bp-head-btn").click();
      cy.contains("button", "Yes, cancel").click();
      cy.location("pathname").should("eq", "/bills");
    });

    it("leaves straight away when nothing was typed", () => {
      visit("/bills/pay/UZ");
      cy.get(".bp-head-btn").click();
      cy.location("pathname").should("eq", "/bills");
    });
  });
});
