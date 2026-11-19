// OnHighTech customer accounts, through the real pages. On the website the
// account is the EMAIL (verified with an emailed code; reset codes go to it);
// the WhatsApp number is optional and only links the account to our WhatsApp chat.
// Real codes: the local careers bot runs with ACCOUNT_DEV_CODES=1 and the devCode
// task reads them (see cypress.config.js). Test accounts are named "E2E ...".

const SIZES = { phone: [375, 812], computer: [1366, 800] };
const PASSWORD = "e2e-password-1";
let counter = 0;
const newEmail = () => `e2e-${Date.now()}-${counter++}@e2e.test`;
const newPhone = () => `07${String(Date.now() * 10 + (counter++ % 10)).slice(-8)}`;

const visit = (url, opts = {}) =>
  cy.visit(url, {
    ...opts,
    onBeforeLoad: (win) => {
      win.localStorage.setItem("onhigh_channel_chosen", "1"); // skip the first-visit question
      opts.onBeforeLoad?.(win);
    },
  });

// Google is set up locally; most tests use email, so hide Google unless a test wants it
const noGoogle = () => cy.intercept("GET", "**/api/account/config", { body: { googleClientId: "" } });

const openSignIn = () => cy.get(".ph-account").click();
const dialog = () => cy.get(".ac-dialog");
const code = (email) =>
  cy.task("devCode", email.toLowerCase()).then((c) => {
    expect(c, `emailed code for ${email}`).to.match(/^\d{6}$/);
    return c;
  });

function fillSignUp(email, { name = "E2E User", phone = "" } = {}) {
  openSignIn();
  dialog().contains("[role=tab]", "Create account").click();
  dialog().find("input[name=name]").type(name);
  dialog().find("input[name=email]").type(email);
  dialog().find("#ac-new-password").type(PASSWORD);
  if (phone) dialog().find("input[name=phone]").type(phone);
  dialog().find(".ac-submit").click();
}

function enterCode(email) {
  dialog().should("contain", "Check your email").and("contain", email.toLowerCase());
  code(email).then((c) => dialog().find("input[name=code]").type(c));
  dialog().find(".ac-submit").click();
}

function createAccount(email, opts) {
  fillSignUp(email, opts);
  enterCode(email);
  dialog().should("not.exist");
  cy.get(".ph-account.is-signed-in").should("exist");
}

function signIn(email, password = PASSWORD) {
  openSignIn();
  dialog().find("input[name=login]").clear().type(email);
  dialog().find("#ac-password").clear().type(password);
  dialog().find(".ac-submit").click();
}

const signOut = () => {
  cy.get(".ph-account.is-signed-in").click();
  cy.contains(".ph-account-menu button", "Sign out").click();
  cy.get(".ph-account").should("not.have.class", "is-signed-in");
};

Object.entries(SIZES).forEach(([device, [width, height]]) => {
  describe(`Accounts on a ${device} (${width}x${height})`, () => {
    beforeEach(() => {
      cy.viewport(width, height);
      noGoogle();
    });

    it("creates an account with email, verifies it with the emailed code, signs out and in", () => {
      const email = newEmail();
      visit("/interviews");
      if (device === "phone") cy.get(".ph-account-label").should("not.be.visible");
      else cy.get(".ph-account-label").should("contain", "Sign in");
      openSignIn();
      dialog().should("contain", "Welcome back");
      dialog().find("input[name=login]").should("have.attr", "type", "email");
      cy.screenshot(`auth-${device}/1-sign-in`, { capture: "viewport" });
      dialog().contains("[role=tab]", "Create account").click();
      // email is the account; WhatsApp is an optional extra that only links
      dialog().find("input[name=email]").should("be.visible");
      dialog().find(".ac-link-whatsapp").should("contain", "optional").and("contain", "Only links your account");
      dialog().find("[role=radiogroup]").should("not.exist"); // no "sign up with" choice any more
      cy.screenshot(`auth-${device}/2-create-account`, { capture: "viewport" });
      dialog().find(".ac-close").click();

      fillSignUp(email.toUpperCase(), { name: "E2E Email User" });
      dialog().find(".ac-info").should("contain", "emailed you a 6-digit code");
      cy.screenshot(`auth-${device}/3-check-email`, { capture: "viewport" });
      enterCode(email);
      dialog().should("not.exist");
      cy.get(".ph-account.is-signed-in").click();
      cy.get(".ph-account-menu").should("contain", "E2E Email User").and("contain", email);
      cy.contains(".ph-account-menu a", "My account").click();
      cy.location("pathname").should("eq", "/account");
      cy.get(".ac-profile").should("contain", email);
      cy.screenshot(`auth-${device}/4-my-account`, { capture: "viewport" });
      cy.contains("button", "Sign out").click();
      cy.get(".ph-account").should("not.have.class", "is-signed-in");
      signIn(email.toUpperCase());
      cy.get(".ph-account.is-signed-in").should("exist");
      signOut();
    });
  });
});

describe("Sign-up checks and email verification", () => {
  beforeEach(() => {
    cy.viewport(...SIZES.phone);
    noGoogle();
  });

  it("refuses bad details with clear messages", () => {
    visit("/interviews");
    openSignIn();
    dialog().contains("[role=tab]", "Create account").click();
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "your name");
    dialog().find("input[name=name]").type("E2E Checks");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "email address");
    dialog().find("input[name=email]").type("not-an-email");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "email address");
    dialog().find("input[name=email]").clear().type(newEmail());
    dialog().find("#ac-new-password").type("short");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "at least 8");
    dialog().find("#ac-new-password").clear().type(PASSWORD);
    dialog().find("input[name=phone]").type("123");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "WhatsApp number does not look right");
    cy.get("body").type("{esc}");
    dialog().should("not.exist");
  });

  it("links an optional WhatsApp number, shown in My account", () => {
    const email = newEmail();
    const phone = newPhone();
    visit("/interviews");
    createAccount(email, { phone, name: "E2E Linked" });
    visit("/account");
    cy.get(".ac-profile").should("contain", email).and("contain", `WhatsApp ${phone}`);
  });

  it("checks the code: wrong code, a new code, then the right one", () => {
    const email = newEmail();
    visit("/interviews");
    fillSignUp(email);
    dialog().find("input[name=code]").type("000000");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "not right or has expired");
    dialog().contains("button", "Send a new code").click();
    dialog().find(".ac-info").should("contain", "new code");
    dialog().find("input[name=code]").clear();
    enterCode(email);
    cy.get(".ph-account.is-signed-in").should("exist");
  });

  it("signing in before verifying asks for the code", () => {
    const email = newEmail();
    visit("/interviews");
    fillSignUp(email);
    dialog().should("contain", "Check your email");
    dialog().find(".ac-close").click(); // left without verifying
    signIn(email);
    dialog().should("contain", "Check your email");
    dialog().find(".ac-info").should("contain", "verify your email");
    enterCode(email);
    cy.get(".ph-account.is-signed-in").should("exist");
  });

  it("allows one account per email", () => {
    const email = newEmail();
    visit("/interviews");
    createAccount(email);
    signOut();
    fillSignUp(email.toUpperCase(), { name: "E2E Second" });
    dialog().find(".ip-notice").should("contain", "already exists");
  });
});

describe("Signing in safely", () => {
  beforeEach(() => {
    cy.viewport(...SIZES.phone);
    noGoogle();
  });

  it("same answer for a wrong password and an unknown email, then a lock-out after too many", () => {
    const email = newEmail();
    visit("/interviews");
    createAccount(email);
    signOut();
    signIn("nobody-here@e2e.test");
    dialog().find(".ip-notice").invoke("text").then((unknown) => {
      dialog().find("input[name=login]").clear().type(email);
      dialog().find("#ac-password").clear().type("wrong-password");
      dialog().find(".ac-submit").click();
      dialog().find(".ip-notice").should("have.text", unknown); // no account probing
    });
    for (let i = 0; i < 7; i += 1) {
      dialog().find(".ac-submit").click();
      dialog().find(".ip-notice").should("contain", "not right");
    }
    dialog().find("#ac-password").clear().type(PASSWORD); // even the right password waits
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "Too many tries");
    cy.screenshot("auth-phone/5-too-many-tries", { capture: "viewport" });
  });
});

describe("Forgot password (email only)", () => {
  beforeEach(() => {
    cy.viewport(...SIZES.phone);
    noGoogle();
  });

  it("resets with the emailed code and signs in with the new password", () => {
    const email = newEmail();
    visit("/interviews");
    createAccount(email, { phone: newPhone() });
    signOut();
    cy.wait(1100); // a different second from the verification code in the log
    openSignIn();
    dialog().contains("button", "Forgot your password?").click();
    dialog().should("contain", "Reset your password").and("contain", "email you a 6-digit code");
    dialog().find("input[name=login]").type(email);
    dialog().find(".ac-submit").click();
    dialog().find(".ac-info").should("contain", "If an account uses that email");
    cy.screenshot("auth-phone/6-reset-code", { capture: "viewport" });
    code(email).then((c) => dialog().find("input[name=code]").type(c));
    dialog().find("#ac-reset-password").type("brand-new-pass");
    dialog().find(".ac-submit").click();
    dialog().should("not.exist");
    cy.get(".ph-account.is-signed-in").should("exist");
    signOut();
    signIn(email); // the old password no longer works
    dialog().find(".ip-notice").should("contain", "not right");
    dialog().find(".ac-close").click();
    signIn(email, "brand-new-pass");
    cy.get(".ph-account.is-signed-in").should("exist");
  });

  it("answers the same for an unknown email, and a wrong code is refused", () => {
    visit("/interviews");
    openSignIn();
    dialog().contains("button", "Forgot your password?").click();
    dialog().find("input[name=login]").type("nobody-here@e2e.test");
    dialog().find(".ac-submit").click();
    dialog().find(".ac-info").should("contain", "If an account uses that email");
    dialog().find("input[name=code]").type("123456");
    dialog().find("#ac-reset-password").type("new-password-1");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "not right or has expired");
    dialog().contains("button", "Back to sign in").click();
    dialog().should("contain", "Welcome back");
  });
});

describe("Sign in with Google", () => {
  beforeEach(() => cy.viewport(...SIZES.phone));

  it("shows Google's real button now that Google is set up", () => {
    visit("/interviews");
    openSignIn();
    cy.get("[data-testid=google-button] iframe", { timeout: 20000 })
      .should("have.attr", "src")
      .and("contain", "accounts.google.com");
  });

  it("hides the Google button when Google is not set up", () => {
    noGoogle();
    visit("/interviews");
    openSignIn();
    dialog().should("be.visible");
    cy.get("[data-testid=google-button]").should("not.exist");
  });

  it("signs in when Google returns a credential", () => {
    cy.intercept("GET", "**/api/account/config", { body: { googleClientId: "test-client.apps.googleusercontent.com" } });
    cy.intercept("POST", "**/api/account/google", {
      statusCode: 200,
      body: {
        token: "stub-token",
        moved: 0,
        account: { id: "acc-g", name: "E2E Google", phone: "", display: "", email: "g@e2e.test", google: true, verified: true },
      },
    }).as("google");
    // stand-in for Google's sign-in script: its button returns a credential
    const fakeGoogle = (win) => {
      win.google = {
        accounts: {
          id: {
            initialize: (cfg) => {
              win.__googleConfig = cfg;
            },
            renderButton: (el) => {
              const b = win.document.createElement("button");
              b.type = "button";
              b.textContent = "Continue with Google";
              b.onclick = () => win.__googleConfig.callback({ credential: "google-id-token" });
              el.appendChild(b);
            },
          },
        },
      };
    };
    visit("/interviews", { onBeforeLoad: fakeGoogle });
    openSignIn();
    cy.get("[data-testid=google-button]").contains("Continue with Google").click();
    cy.wait("@google").its("request.body").should("deep.equal", { credential: "google-id-token" });
    dialog().should("not.exist");
    cy.get(".ph-account.is-signed-in").click();
    cy.get(".ph-account-menu").should("contain", "E2E Google");
  });
});

describe("Purchases linked to the account", () => {
  beforeEach(() => {
    cy.viewport(...SIZES.phone);
    noGoogle();
  });

  const toUnlock = () => {
    cy.get(".ip-topic").first().click();
    cy.get(".ip-card", { timeout: 15000 }).should("be.visible");
    const next = () =>
      cy.get("body").then(($b) => {
        if ($b.find(".ip-card").length) {
          cy.get(".ip-nav .ip-btn:not(.ip-btn--ghost)").click();
          next();
        }
      });
    next();
    cy.get(".ip-check input").check();
  };

  it("a guest is offered sign-in or guest; a signed-in customer goes straight to paying", () => {
    visit("/interviews");
    toUnlock();
    cy.contains(".ip-panel .ip-btn", "Continue").click();
    cy.get(".ip-account-step").should("contain", "Keep this topic on every device");
    cy.screenshot("auth-phone/7-guest-or-sign-in", { capture: "viewport" });
    cy.contains("button", "Continue as guest").click();
    cy.contains("h3", "Choose how to pay").should("be.visible");
    cy.contains("Practise on WhatsApp too").should("not.exist"); // no number step at payment

    const email = newEmail();
    const phone = newPhone();
    visit("/interviews");
    createAccount(email, { phone, name: "E2E Buyer" });
    toUnlock();
    cy.contains(".ip-panel", "Unlocks for E2E Buyer").should("contain", phone);
    cy.contains(".ip-panel .ip-btn", "Continue").click();
    cy.get(".ip-account-step").should("not.exist");
    cy.contains("label", "Pay with EcoCash").click();
    cy.get("input[type=tel]").should("have.value", phone);
  });

  it("a signed-in bill payment shows in My account", () => {
    visit("/bills");
    createAccount(newEmail(), { name: "E2E Bills" });
    visit("/bills/pay/ZETDC");
    cy.get(".bp-steps");
    cy.get(".bp-field input").first().type("37132229735");
    cy.contains(".bp-quick button", "10").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue to pay").click();
    cy.get(".bp-account-choice").should("not.exist"); // already signed in
    cy.get("input[type=tel]").clear().type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
    visit("/account");
    cy.contains(".ac-card", "My bill payments").should("contain", "ZESA Pre-paid Electricity").and("contain", "Paid");
    cy.contains(".ac-card", "My bill payments").find("code").should("not.be.empty");
    cy.screenshot("auth-phone/8-my-payments", { capture: "viewport" });
  });

  it("bills: signing in at the Pay step keeps the payment in the account", () => {
    const email = newEmail();
    visit("/bills/pay/ZETDC");
    cy.get(".bp-field input").first().type("37132229735");
    cy.contains(".bp-quick button", "5").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue to pay").click();
    cy.get(".bp-step-title").should("contain", "Before you pay");
    cy.screenshot("auth-phone/9-bills-before-you-pay", { capture: "viewport" });
    cy.contains(".bp-account-choice button", "Sign in or create an account").click();
    // a new account, created and verified right here
    dialog().contains("[role=tab]", "Create account").click();
    dialog().find("input[name=name]").type("E2E Late Signer");
    dialog().find("input[name=email]").type(email);
    dialog().find("#ac-new-password").type(PASSWORD);
    dialog().find(".ac-submit").click();
    enterCode(email);
    dialog().should("not.exist");
    // still on the same payment, now signed in: straight to how to pay
    cy.location("pathname").should("eq", "/bills/pay/ZETDC");
    cy.get(".bp-account-choice").should("not.exist");
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
    visit("/account");
    cy.contains(".ac-card", "My bill payments").should("contain", "ZESA Pre-paid Electricity").and("contain", "ZiG 5.00");
  });

  it("bills: a guest can still pay without an account", () => {
    visit("/bills/pay/ZETDC");
    cy.get(".bp-field input").first().type("37132229735");
    cy.contains(".bp-quick button", "5").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue to pay").click();
    cy.contains(".bp-account-choice button", "Continue as guest").click();
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
  });
});

describe("Header fits at every width", () => {
  [320, 375, 640, 768, 900, 1024, 1366].forEach((width) => {
    it(`no sideways scrolling at ${width}px, signed out and signed in`, () => {
      cy.viewport(width, 800);
      visit("/interviews");
      cy.get(".ph-account").should("be.visible");
      cy.get(".ph-wa-link").should("be.visible");
      cy.window().then((win) => expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth));
      cy.window().then((win) =>
        win.localStorage.setItem("onhigh_account", JSON.stringify({ id: "acc-x", name: "Width Test", phone: "", email: "w@e2e.test" }))
      );
      visit("/bills");
      cy.get(".ph-account.is-signed-in").should("be.visible");
      cy.window().then((win) => expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth));
    });
  });
});
