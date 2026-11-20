// Bills paid through Paynow (the customer's EcoCash / OneMoney), as the page sees it.
// Paynow's answers are imitated here (a real payment would take real money); the
// bills service's own Paynow logic is covered by its Python tests.

const visit = (url) =>
  cy.visit(url, { onBeforeLoad: (win) => win.localStorage.setItem("onhigh_channel_chosen", "1") });

const DELIVERED = {
  reference: "ref",
  state: "delivered",
  status: "Paid",
  amount: 10,
  currency: "ZWG",
  receipts: ["<p>Receipt</p>"],
  smses: ["Token 1111 2222 3333 4444 5555"],
  details: {},
  vouchers: [{ product: "Electricity tokens", code: "1111 2222 3333 4444 5555" }],
  billerReference: "B-1",
  billpayReference: "BP-1",
};

function toPayStep() {
  // real payments switched on (as when the Paynow keys are set)
  cy.intercept("GET", "**/bills-api/bills/catalogue", (req) =>
    req.continue((res) => {
      res.body.payWith = "paynow";
    })
  );
  visit("/bills/pay/ZETDC");
  cy.get(".bp-field input").first().type("37132229735");
  cy.contains(".bp-quick button", "10").click();
  cy.get(".bp-checkout-bar .ip-btn").contains("Continue").click();
  cy.get(".bp-checkout-bar .ip-btn").contains("Continue to pay").click();
  cy.contains(".bp-account-choice button", "Continue as guest").click();
  cy.get(".bp-demo").should("not.exist"); // real payments: no demo note
}

describe("Bills paid with Paynow", () => {
  beforeEach(() => cy.viewport(375, 812));

  it("asks the customer to approve on their phone, then shows the token", () => {
    let paid = false;
    cy.intercept("POST", "**/bills/checkout/*", {
      body: { reference: "ref", state: "awaiting_payment", method: "ecocash", redirectUrl: "", instructions: "Dial *151# if no prompt appears" },
    }).as("start");
    cy.intercept("GET", "**/bills/checkout/*", (req) =>
      req.reply(paid ? DELIVERED : { reference: "ref", state: "awaiting_payment" })
    ).as("check");
    toPayStep();
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay ZiG 10.00").click();
    cy.wait("@start").its("request.body").should((body) => {
      expect(body.method).to.eq("ecocash");
      expect(body.phone).to.eq("0771234567");
      expect(body.smsTo).to.eq("0771234567"); // the receipt SMS goes to the paying number
      expect(body.returnUrl).to.match(/\/bills\/pay\/ZETDC\?ref=/);
    });
    cy.get(".bp-approve").should("contain", "Approve the payment on your phone").and("contain", "0771234567");
    cy.get(".bp-approve").should("contain", "Dial *151#");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").should("be.disabled"); // no second request
    cy.screenshot("paynow/1-approve-on-phone", { capture: "viewport" });
    cy.contains(".bp-approve button", "I have approved").click();
    cy.get(".bp-approve").should("contain", "not received your payment yet");
    cy.then(() => {
      paid = true; // the customer approves
    });
    cy.contains(".bp-approve button", "I have approved").click();
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
    cy.get(".bp-voucher strong").should("contain", "1111 2222");
    cy.get(".bp-steps li.is-done").should("have.length", 3);
  });

  it("checks by itself while the customer approves", () => {
    let checks = 0;
    cy.intercept("POST", "**/bills/checkout/*", { body: { reference: "ref", state: "awaiting_payment", redirectUrl: "" } });
    cy.intercept("GET", "**/bills/checkout/*", (req) => {
      checks += 1;
      req.reply(checks >= 2 ? DELIVERED : { reference: "ref", state: "awaiting_payment" });
    });
    toPayStep();
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".bp-outcome h2", { timeout: 20000 }).should("contain", "Payment successful"); // no tap needed
  });

  it("a cancelled payment says nothing was charged and lets them try again", () => {
    cy.intercept("POST", "**/bills/checkout/*", { body: { reference: "ref", state: "awaiting_payment", redirectUrl: "" } });
    cy.intercept("GET", "**/bills/checkout/*", {
      body: { reference: "ref", state: "not_paid", message: "The payment was cancelled or did not go through. Nothing was charged." },
    });
    toPayStep();
    cy.contains(".bp-method", "OneMoney").click();
    cy.get("input[type=tel]").type("0711234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.contains(".bp-approve button", "I have approved").click();
    cy.get(".ip-notice").should("contain", "Nothing was charged");
    cy.get(".bp-approve").should("not.exist");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").should("not.be.disabled"); // can try again
  });

  it("explains a refused number", () => {
    cy.intercept("POST", "**/bills/checkout/*", {
      statusCode: 400,
      body: { detail: "We could not start the payment. Please check the number and try again." },
    });
    toPayStep();
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".ip-notice").should("contain", "check the number");
  });

  it("card: goes to Paynow's page and, back again, finishes the payment", () => {
    cy.intercept("POST", "**/bills/checkout/*", {
      body: { reference: "ref-card", state: "awaiting_payment", redirectUrl: "/bills/pay/ZETDC?ref=ref-card" },
    }).as("start");
    cy.intercept("GET", "**/bills/checkout/ref-card", { body: DELIVERED }).as("back");
    toPayStep();
    cy.contains(".bp-method", "Visa / Mastercard").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".ip-notice").should("contain", "receipt SMS"); // a number for the receipt is needed
    cy.get("input[name=smsTo]").type("0712345678");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.wait("@start").its("request.body").should((body) => {
      expect(body.method).to.eq("card");
      expect(body.smsTo).to.eq("0712345678");
    });
    // (here the stand-in "Paynow page" sends the customer straight back)
    cy.wait("@back");
    cy.location("search").should("eq", ""); // the ref is tidied from the address
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
  });
});
