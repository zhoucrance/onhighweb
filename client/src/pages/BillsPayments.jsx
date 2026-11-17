import React, { useMemo, useState } from "react";
import "../resourses/interview-practice.css";
import "../resourses/bills.css";

// Bills & airtime: airtime, ZESA tokens and DStv, paid through Paynow.
// The screens and checks are ready; the Paynow BillPay connection (the
// careers-bot /bills service) is added once its vendor docs are in hand, so
// the last step says payments open soon instead of charging anyone.

const SERVICES = [
  { id: "airtime", icon: "📱", name: "Airtime", blurb: "Econet, NetOne and Telecel" },
  { id: "zesa", icon: "⚡", name: "ZESA tokens", blurb: "Prepaid electricity" },
  { id: "dstv", icon: "📺", name: "DStv", blurb: "Pay your subscription" },
];
const NETWORKS = [
  { id: "econet", name: "Econet" },
  { id: "netone", name: "NetOne" },
  { id: "telecel", name: "Telecel" },
];
const CURRENCIES = ["USD", "ZiG"];
const QUICK = { airtime: [1, 2, 5, 10], zesa: [5, 10, 20, 50], dstv: [] };
const PAYMENTS_LIVE = false; // switch on once Paynow BillPay is connected

// ---- the same input rules as the bill payments service (bill_payments/ rules) ----

export function normaliseMobile(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00263")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) digits = `263${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith("7")) digits = `263${digits}`;
  return /^2637\d{8}$/.test(digits) ? digits : null;
}

export function normaliseMeter(raw) {
  const meter = String(raw || "").replace(/[\s-]/g, "");
  return /^\d{11,13}$/.test(meter) ? meter : null;
}

export function normaliseSmartcard(raw) {
  const card = String(raw || "").replace(/[\s-]/g, "");
  return /^\d{8,12}$/.test(card) ? card : null;
}

export function amountError(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "Enter the amount.";
  if (!/^\d+(\.\d+)?$/.test(text)) return "Enter the amount as a number, e.g. 1 or 2.50.";
  if (Number(text) <= 0) return "The amount must be more than zero.";
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "Use at most two decimal places, e.g. 2.50.";
  return "";
}

const localNumber = (n) => (n.startsWith("263") ? `0${n.slice(3)}` : n);
const money = (amount, currency) =>
  currency === "USD" ? `$${Number(amount).toFixed(2)}` : `ZiG ${Number(amount).toFixed(2)}`;

// ---- pieces ----

function Chips({ options, value, onChange, label }) {
  return (
    <div className="ip-chips bp-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? "is-active" : ""}
          onClick={() => onChange(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="bp-field">
      <span className="bp-label">{label}</span>
      {children}
      {error ? (
        <span className="bp-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="bp-hint">{hint}</span>
      ) : null}
    </label>
  );
}

function AmountField({ service, amount, setAmount, currency, setCurrency, error }) {
  return (
    <>
      <Chips
        label="Currency"
        options={CURRENCIES.map((c) => ({ id: c, name: c }))}
        value={currency}
        onChange={setCurrency}
      />
      <Field label={`Amount (${currency})`} error={error}>
        <input
          inputMode="decimal"
          placeholder={currency === "USD" ? "e.g. 5" : "e.g. 100"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {currency === "USD" && QUICK[service].length > 0 && (
        <div className="bp-quick" aria-label="Quick amounts">
          {QUICK[service].map((n) => (
            <button key={n} type="button" onClick={() => setAmount(String(n))}>
              ${n}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---- the form for one service ----

function ServiceForm({ service, onReview }) {
  const [network, setNetwork] = useState("econet");
  const [phone, setPhone] = useState("");
  const [meter, setMeter] = useState("");
  const [card, setCard] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [tried, setTried] = useState(false);

  const errors = useMemo(() => {
    const e = {};
    if (service === "airtime" && !normaliseMobile(phone))
      e.phone = "Enter a valid Zimbabwe mobile number, e.g. 0771234567.";
    if (service === "zesa" && !normaliseMeter(meter))
      e.meter = "Enter the meter number (11 to 13 digits), as shown on the meter.";
    if (service === "dstv" && !normaliseSmartcard(card))
      e.card = "Enter the smartcard or account number on your DStv decoder or statement.";
    const a = amountError(amount);
    if (a) e.amount = a;
    return e;
  }, [service, phone, meter, card, amount]);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) return;
    const details =
      service === "airtime"
        ? [
            ["Network", NETWORKS.find((n) => n.id === network).name],
            ["Mobile number", localNumber(normaliseMobile(phone))],
          ]
        : service === "zesa"
        ? [["Meter number", normaliseMeter(meter)]]
        : [["Smartcard / account", normaliseSmartcard(card)]];
    onReview({ service, details, amount: Number(amount), currency });
  };

  const show = (key) => (tried ? errors[key] : "");

  return (
    <form className="bp-form" onSubmit={submit} noValidate>
      {service === "airtime" && (
        <>
          <span className="bp-label">Network</span>
          <Chips label="Network" options={NETWORKS} value={network} onChange={setNetwork} />
          <Field label="Mobile number to top up" error={show("phone")}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0771234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </>
      )}
      {service === "zesa" && (
        <Field
          label="Meter number"
          hint="11 to 13 digits, as shown on your prepaid meter."
          error={show("meter")}
        >
          <input
            inputMode="numeric"
            placeholder="e.g. 01234567890"
            value={meter}
            onChange={(e) => setMeter(e.target.value)}
          />
        </Field>
      )}
      {service === "dstv" && (
        <Field
          label="Smartcard or account number"
          hint="On your decoder, smartcard or DStv statement."
          error={show("card")}
        >
          <input
            inputMode="numeric"
            placeholder="e.g. 4123456789"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          />
        </Field>
      )}
      <AmountField
        service={service}
        amount={amount}
        setAmount={setAmount}
        currency={currency}
        setCurrency={setCurrency}
        error={show("amount")}
      />
      <button type="submit" className="ip-btn bp-submit">
        Review
      </button>
    </form>
  );
}

function Review({ order, onBack }) {
  const service = SERVICES.find((s) => s.id === order.service);
  return (
    <div className="bp-review" aria-live="polite">
      <h2>
        {service.icon} {service.name}
      </h2>
      <dl>
        {order.details.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="bp-total">
          <dt>You pay</dt>
          <dd>{money(order.amount, order.currency)}</dd>
        </div>
      </dl>
      {PAYMENTS_LIVE ? (
        <button type="button" className="ip-btn bp-submit">
          Pay with Paynow
        </button>
      ) : (
        <p className="bp-soon">
          🔒 Payments open soon. We are connecting Paynow so you can pay with EcoCash, OneMoney or
          card. Nothing has been charged.
        </p>
      )}
      <button type="button" className="ip-link" onClick={onBack}>
        ← Change details
      </button>
    </div>
  );
}

// ---- page ----

export default function BillsPayments() {
  const [service, setService] = useState("airtime");
  const [order, setOrder] = useState(null);

  return (
    <div className="ip-page bp-page">
      <section className="ip-hero">
        <div className="ip-shell">
          <span className="ip-eyebrow">Bills &amp; airtime</span>
          <h1>Pay bills and buy airtime in seconds.</h1>
          <p>Airtime for any network, ZESA tokens and DStv, paid securely through Paynow.</p>
        </div>
      </section>

      <section className="ip-shell bp-body">
        <div className="bp-services" role="tablist" aria-label="What would you like to pay?">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={service === s.id}
              className={`bp-service${service === s.id ? " is-active" : ""}`}
              onClick={() => {
                setService(s.id);
                setOrder(null);
              }}
            >
              <span className="bp-service-icon" aria-hidden="true">
                {s.icon}
              </span>
              <strong>{s.name}</strong>
              <span>{s.blurb}</span>
            </button>
          ))}
        </div>

        <div className="bp-card" key={`${service}-${order ? "review" : "form"}`}>
          {order ? (
            <Review order={order} onBack={() => setOrder(null)} />
          ) : (
            <ServiceForm service={service} onReview={setOrder} />
          )}
        </div>
      </section>
    </div>
  );
}
