// OnHighTech customer accounts, through the real pages: sign up (WhatsApp number
// or email), sign in, wrong passwords and lock-out, forgot / reset password,
// Google sign-in, sign out, and purchases linked to the account.
// Needs the careers bot on :8000 (WhatsApp sending off: WHATSAPP_TOKEN=""), the
// bills service on :8100 (demo) and the site on :3000. Test accounts are named "E2E ...".

const SIZES = { phone: [375, 812], computer: [1366, 800] };
const RUN = Date.now().toString().slice(-6);
const PASSWORD = "e2e-password-1";
let counter = 0;
// unique on every call and every run (test accounts stay in the local database)
const newPhone = () => `07${String(Date.now() * 10 + (counter++ % 10)).slice(-8)}`;
const newEmail = () => `e2e-${RUN}-${counter++}@e2e.test`;

const visit = (url, opts = {}) =>
  cy.visit(url, {
    ...opts,
    onBeforeLoad: (win) => {
      win.localStorage.setItem("onhigh_channel_chosen", "1"); // skip the first-visit question
      opts.onBeforeLoad?.(win);
    },
  });

const openSignIn = () => cy.get(".ph-account").click();
const dialog = () => cy.get(".ac-dialog");

function signUpWithPhone(phone, name = "E2E Phone User", expectSignedIn = true) {
  openSignIn();
  dialog().contains("[role=tab]", "Create account").click();
  dialog().find("input[name=name]").type(name);
  dialog().find("input[name=phone]").type(phone);
  dialog().find("#ac-new-password").type(PASSWORD);
  dialog().find(".ac-submit").click();
  if (expectSignedIn) {
    dialog().should("not.exist");
    cy.get(".ph-account.is-signed-in").should("exist");
  }
}

function signIn(login, password = PASSWORD) {
  openSignIn();
  dialog().find("input[name=login]").clear().type(login);
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
    beforeEach(() => cy.viewport(width, height));

    it("signs up with a WhatsApp number, shows the account, signs out", () => {
      const phone = newPhone();
      visit("/interviews");
      cy.get(".ph-account").should("be.visible");
      if (device === "phone") cy.get(".ph-account-label").should("not.be.visible");
      else cy.get(".ph-account-label").should("contain", "Sign in");
      openSignIn();
      dialog().should("be.visible").and("contain", "Welcome back");
      cy.screenshot(`auth-${device}/1-sign-in`, { capture: "viewport" });
      dialog().contains("[role=tab]", "Create account").click();
      cy.screenshot(`auth-${device}/2-create-account`, { capture: "viewport" });
      dialog().find(".ac-close").click();
      dialog().should("not.exist");

      signUpWithPhone(phone);
      dialog().should("not.exist");
      cy.get(".ph-account.is-signed-in").should("contain", "E").click();
      cy.get(".ph-account-menu").should("contain", "E2E Phone User");
      cy.contains(".ph-account-menu a", "My account").click();
      cy.location("pathname").should("eq", "/account");
      cy.get(".ac-profile").should("contain", "E2E Phone User").and("contain", phone);
      cy.screenshot(`auth-${device}/3-my-account`, { capture: "viewport" });
      cy.contains("button", "Sign out").click();
      cy.location("pathname").should("eq", "/");
      cy.get(".ph-account").should("not.have.class", "is-signed-in");
      // and back in, with the number typed another way
      signIn(`+263 ${phone.slice(1, 3)} ${phone.slice(3)}`);
      cy.get(".ph-account.is-signed-in").should("exist");
      signOut();
    });

    it("signs up with an email only and signs in with it", () => {
      const email = newEmail();
      visit("/bills");
      openSignIn();
      dialog().contains("[role=tab]", "Create account").click();
      dialog().find("input[name=name]").type("E2E Email User");
      dialog().contains("[role=radio]", "Email").click().should("have.attr", "aria-checked", "true");
      dialog().find("input[name=email]").type(email.toUpperCase());
      dialog().find("input[name=phone]").parent().should("contain", "optional");
      dialog().find("#ac-new-password").type(PASSWORD);
      // the password can be shown and hidden
      dialog().find("#ac-new-password").should("have.attr", "type", "password");
      dialog().contains(".ac-password button", "Show").click();
      dialog().find("#ac-new-password").should("have.attr", "type", "text");
      dialog().contains(".ac-password button", "Hide").click();
      dialog().find(".ac-submit").click();
      cy.get(".ph-account.is-signed-in").click();
      cy.get(".ph-account-menu").should("contain", email); // saved in lower case
      cy.contains(".ph-account-menu button", "Sign out").click();
      signIn(email);
      cy.get(".ph-account.is-signed-in").should("exist");
      signOut();
    });
  });
});

describe("Account checks (sign up, sign in, lock-out)", () => {
  beforeEach(() => cy.viewport(...SIZES.phone));

  it("refuses bad sign-up details with clear messages", () => {
    visit("/interviews");
    openSignIn();
    dialog().contains("[role=tab]", "Create account").click();
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "your name");
    dialog().find("input[name=name]").type("E2E Checks");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "WhatsApp number or your email");
    dialog().find("input[name=phone]").type("123");
    dialog().find("#ac-new-password").type(PASSWORD);
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "WhatsApp number, like");
    dialog().find("input[name=phone]").clear().type(newPhone());
    dialog().find("#ac-new-password").clear().type("short");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "at least 8");
    dialog().find("input[name=email]").type("not-an-email");
    dialog().find("#ac-new-password").clear().type(PASSWORD);
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "email address");
    cy.get("body").type("{esc}");
    dialog().should("not.exist"); // Escape closes it
  });

  it("allows one account per WhatsApp number", () => {
    const phone = newPhone();
    visit("/interviews");
    signUpWithPhone(phone);
    signOut();
    signUpWithPhone(phone, "E2E Second", false);
    dialog().find(".ip-notice").should("contain", "already exists");
  });

  it("gives the same answer for a wrong password and an unknown account, then locks after too many", () => {
    const phone = newPhone();
    visit("/interviews");
    signUpWithPhone(phone);
    signOut();
    signIn("0710000000"); // no such account
    dialog().find(".ip-notice").invoke("text").then((unknown) => {
      dialog().find("#ac-password").clear().type("wrong-password");
      dialog().find("input[name=login]").clear().type(phone);
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
    cy.screenshot("auth-phone/4-too-many-tries", { capture: "viewport" });
  });
});

describe("Forgot password", () => {
  beforeEach(() => cy.viewport(...SIZES.phone));

  it("asks for a code without revealing whether the account exists", () => {
    visit("/interviews");
    openSignIn();
    dialog().contains("button", "Forgot your password?").click();
    dialog().should("contain", "Reset your password");
    dialog().find("input[name=login]").type("0710000000"); // nobody has this number
    dialog().find(".ac-submit").click();
    dialog().find(".ac-info").should("contain", "If an account matches");
    dialog().should("contain", "Enter your code");
    cy.screenshot("auth-phone/5-enter-code", { capture: "viewport" });
    dialog().find("input[name=code]").type("123456");
    dialog().find("#ac-reset-password").type("new-password-1");
    dialog().find(".ac-submit").click();
    dialog().find(".ip-notice").should("contain", "not right or has expired");
    dialog().contains("button", "Back to sign in").click();
    dialog().should("contain", "Welcome back");
  });

  it("sets a new password with the right code and signs in", () => {
    // the code itself is only ever sent to the customer; the server's code checks
    // are covered by the bot's tests, here the page's handling of a good code
    cy.intercept("POST", "**/api/account/reset", {
      statusCode: 200,
      body: {
        token: "stub-token",
        moved: 0,
        account: { id: "acc-stub", name: "E2E Reset", phone: "", display: "", email: "reset@e2e.test", google: false },
      },
    }).as("reset");
    visit("/interviews");
    openSignIn();
    dialog().contains("button", "Forgot your password?").click();
    dialog().find("input[name=login]").type("reset@e2e.test");
    dialog().find(".ac-submit").click();
    dialog().find("input[name=code]").type("654321");
    dialog().find("#ac-reset-password").type("new-password-1");
    dialog().find(".ac-submit").click();
    cy.wait("@reset").its("request.body").should("deep.equal", {
      login: "reset@e2e.test",
      code: "654321",
      password: "new-password-1",
    });
    dialog().should("not.exist");
    cy.get(".ph-account.is-signed-in").should("contain", "E");
  });
});

describe("Sign in with Google", () => {
  beforeEach(() => cy.viewport(...SIZES.phone));

  it("does not show a Google button until Google is set up", () => {
    visit("/interviews");
    openSignIn();
    dialog().should("be.visible");
    cy.get("[data-testid=google-button]").should("not.exist");
  });

  it("signs in with Google once set up", () => {
    cy.intercept("GET", "**/api/account/config", { body: { googleClientId: "test-client.apps.googleusercontent.com" } });
    cy.intercept("POST", "**/api/account/google", {
      statusCode: 200,
      body: {
        token: "stub-token",
        moved: 0,
        account: { id: "acc-g", name: "E2E Google", phone: "", display: "", email: "g@e2e.test", google: true },
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
    cy.window().its("__googleConfig.client_id").should("eq", "test-client.apps.googleusercontent.com");
    dialog().should("not.exist");
    cy.get(".ph-account.is-signed-in").click();
    cy.get(".ph-account-menu").should("contain", "E2E Google");
  });
});

describe("Purchases linked to the account", () => {
  beforeEach(() => cy.viewport(...SIZES.phone));

  it("a guest is offered sign-in or guest; a signed-in customer goes straight to paying", () => {
    visit("/interviews");
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
    cy.contains(".ip-panel .ip-btn", "Continue").click();
    cy.get(".ip-account-step").should("contain", "Keep this topic on every device");
    cy.contains("button", "Sign in or create an account").should("be.visible");
    cy.screenshot("auth-phone/6-guest-or-sign-in", { capture: "viewport" });
    cy.contains("button", "Continue as guest").click();
    cy.contains("h3", "Choose how to pay").should("be.visible");
    cy.contains("Practise on WhatsApp too").should("not.exist"); // the old number step is gone

    // signed in: no account step, the account's number fills in EcoCash
    const phone = newPhone();
    visit("/interviews");
    signUpWithPhone(phone, "E2E Buyer");
    cy.get(".ip-topic").first().click();
    cy.get(".ip-card", { timeout: 15000 }).should("be.visible");
    next();
    cy.get(".ip-check input").check();
    cy.contains(".ip-panel", "Unlocks for E2E Buyer").should("contain", phone);
    cy.contains(".ip-panel .ip-btn", "Continue").click();
    cy.get(".ip-account-step").should("not.exist");
    cy.contains("label", "Pay with EcoCash").click();
    cy.get("input[type=tel]").should("have.value", phone);
  });

  it("a signed-in bill payment shows in My account", () => {
    const phone = newPhone();
    visit("/bills");
    signUpWithPhone(phone, "E2E Bills");
    visit("/bills/pay/ZETDC");
    cy.get(".bp-signin-hint").should("not.exist"); // already signed in
    cy.get(".bp-field input").first().type("37132229735");
    cy.contains(".bp-quick button", "10").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue").click();
    cy.get(".bp-checkout-bar .ip-btn").contains("Continue to pay").click();
    cy.get("input[type=tel]").type("0771234567");
    cy.get(".bp-checkout-bar .ip-btn").contains("Pay").click();
    cy.get(".bp-outcome h2").should("contain", "Payment successful");
    visit("/account");
    cy.contains(".ac-card", "My bill payments").should("contain", "ZESA Pre-paid Electricity").and("contain", "Paid");
    cy.contains(".ac-card", "My bill payments").find("code").should("not.be.empty");
    cy.screenshot("auth-phone/7-my-payments", { capture: "viewport" });
  });

  it("a guest sees a sign-in hint on bills", () => {
    visit("/bills/pay/ZETDC");
    cy.get(".bp-signin-hint").should("contain", "keep a record");
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
