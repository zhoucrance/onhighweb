import React, { useEffect, useRef, useState } from "react";
import { accountConfig, forgotPassword, googleSignIn, resetPassword, signIn, signUp } from "../lib/account";

// Sign in / Create account / Forgot password, opened from anywhere with
// openAccount(mode, onDone). Phones: full screen. Computers: a card in the middle.
// "Continue with Google" shows once GOOGLE_CLIENT_ID is set on the careers bot.

const EMPTY = { name: "", phone: "", email: "", password: "", login: "", code: "" };

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <span className="ac-password">
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}

// Google's own button (Google Identity Services), loaded only when set up.
function GoogleButton({ clientId, onCredential }) {
  const box = useRef(null);
  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    const draw = () => {
      if (cancelled || !window.google?.accounts?.id || !box.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential) });
      window.google.accounts.id.renderButton(box.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: Math.min(box.current.offsetWidth || 320, 400),
      });
    };
    if (window.google?.accounts?.id) draw();
    else {
      let script = document.getElementById("gsi-client");
      if (!script) {
        script = document.createElement("script");
        script.id = "gsi-client";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", draw);
    }
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);
  if (!clientId) return null;
  return (
    <>
      <div className="ac-google" ref={box} data-testid="google-button" />
      <p className="ac-or">
        <span>or</span>
      </p>
    </>
  );
}

export default function AccountDialog() {
  const [open, setOpen] = useState(null); // {mode, onDone}
  const [mode, setMode] = useState("signin"); // signin | signup | forgot | reset
  const [signupWith, setSignupWith] = useState("phone"); // phone | email
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [googleId, setGoogleId] = useState("");
  const first = useRef(null);

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(e.detail || {});
      setMode(e.detail?.mode === "signup" ? "signup" : "signin");
      setError("");
      setInfo("");
      accountConfig().then((c) => setGoogleId(c.googleClientId || ""));
    };
    window.addEventListener("onhigh-account-open", onOpen);
    return () => window.removeEventListener("onhigh-account-open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    // focus the first box, but never pull the cursor out of a field being typed in
    const active = document.activeElement;
    if (!(active && active.tagName === "INPUT" && active.closest(".ac-dialog"))) first.current?.focus();
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, mode, signupWith]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const go = (next) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const finish = (r) => {
    const done = open.onDone;
    setOpen(null);
    setForm(EMPTY);
    done?.(r.account);
  };

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === "signup") {
      run(async () =>
        finish(
          await signUp({
            name: form.name,
            phone: signupWith === "phone" ? form.phone : form.phone,
            email: form.email,
            password: form.password,
          })
        )
      );
    } else if (mode === "signin") {
      run(async () => finish(await signIn(form.login, form.password)));
    } else if (mode === "forgot") {
      run(async () => {
        setInfo(await forgotPassword(form.login));
        setMode("reset");
      });
    } else {
      run(async () => finish(await resetPassword(form.login, form.code, form.password)));
    }
  };

  const titles = {
    signin: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Enter your code",
  };

  return (
    <div className="ac-backdrop" onClick={() => setOpen(null)}>
      <div className="ac-dialog" role="dialog" aria-modal="true" aria-labelledby="ac-title" onClick={(e) => e.stopPropagation()}>
        <div className="ac-head">
          <h2 id="ac-title">{titles[mode]}</h2>
          <button type="button" className="ac-close" onClick={() => setOpen(null)} aria-label="Close">
            ✕
          </button>
        </div>

        {(mode === "signin" || mode === "signup") && (
          <>
            <p className="ac-lead">
              {mode === "signup"
                ? "One OnHighTech account for interview practice and bills: your topics and payments on any phone or computer."
                : "Sign in to see your interview topics and bill payments."}
            </p>
            <div className="ac-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => go("signin")}>
                Sign in
              </button>
              <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => go("signup")}>
                Create account
              </button>
            </div>
            <GoogleButton clientId={googleId} onCredential={(c) => run(async () => finish(await googleSignIn(c)))} />
          </>
        )}

        <form className="ac-form" onSubmit={submit} noValidate>
          {error && (
            <div className="ip-notice" role="alert">
              {error}
            </div>
          )}
          {info && (
            <div className="ac-info" role="status">
              {info}
            </div>
          )}

          {mode === "signup" && (
            <>
              <label>
                Full name
                <input ref={first} name="name" autoComplete="name" value={form.name} onChange={set("name")} />
              </label>
              <div className="ac-choice" role="radiogroup" aria-label="Sign up with">
                <span>Sign up with</span>
                <div>
                  {[
                    ["phone", "WhatsApp number"],
                    ["email", "Email"],
                  ].map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={signupWith === id} onClick={() => setSignupWith(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {signupWith === "phone" ? (
                <>
                  <label>
                    WhatsApp number
                    <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0772123456" name="phone" value={form.phone} onChange={set("phone")} />
                    <small>What you buy here also opens in our WhatsApp chat on this number.</small>
                  </label>
                  <label>
                    Email <span className="ac-optional">optional</span>
                    <input type="email" name="email" autoComplete="email" value={form.email} onChange={set("email")} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Email
                    <input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} />
                  </label>
                  <label>
                    WhatsApp number <span className="ac-optional">optional</span>
                    <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0772123456" name="phone" value={form.phone} onChange={set("phone")} />
                    <small>Add it to also open what you buy in our WhatsApp chat.</small>
                  </label>
                </>
              )}
              <label htmlFor="ac-new-password">
                Password
                <PasswordInput id="ac-new-password" autoComplete="new-password" value={form.password} onChange={set("password")} />
                <small>At least 8 characters.</small>
              </label>
            </>
          )}

          {mode === "signin" && (
            <>
              <label>
                WhatsApp number or email
                <input ref={first} name="login" autoComplete="username" value={form.login} onChange={set("login")} />
              </label>
              <label htmlFor="ac-password">
                Password
                <PasswordInput id="ac-password" autoComplete="current-password" value={form.password} onChange={set("password")} />
              </label>
              <button type="button" className="ac-link" onClick={() => go("forgot")}>
                Forgot your password?
              </button>
            </>
          )}

          {mode === "forgot" && (
            <>
              <p className="ac-lead">Enter your WhatsApp number or email. We will send you a 6-digit code.</p>
              <label>
                WhatsApp number or email
                <input ref={first} name="login" autoComplete="username" value={form.login} onChange={set("login")} />
              </label>
            </>
          )}

          {mode === "reset" && (
            <>
              <label>
                6-digit code
                <input ref={first} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={set("code")} />
              </label>
              <label htmlFor="ac-reset-password">
                New password
                <PasswordInput id="ac-reset-password" autoComplete="new-password" value={form.password} onChange={set("password")} />
                <small>At least 8 characters.</small>
              </label>
              <button type="button" className="ac-link" onClick={() => go("forgot")}>
                Didn’t get a code? Send a new one
              </button>
            </>
          )}

          <button type="submit" className="ip-btn ac-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : { signup: "Create account", signin: "Sign in", forgot: "Send code", reset: "Set new password" }[mode]}
          </button>

          {(mode === "forgot" || mode === "reset") && (
            <button type="button" className="ac-link ac-center" onClick={() => go("signin")}>
              ← Back to sign in
            </button>
          )}
          {mode === "signin" && (
            <p className="ac-switch">
              New here?{" "}
              <button type="button" onClick={() => go("signup")}>
                Create an account
              </button>
            </p>
          )}
          {mode === "signup" && (
            <p className="ac-switch">
              Already have an account?{" "}
              <button type="button" onClick={() => go("signin")}>
                Sign in
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
