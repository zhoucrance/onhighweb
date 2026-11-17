import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../resourses/interview-practice.css";
import "../resourses/bills.css";

// Bills & airtime: every biller on our Paynow BillPay account, grouped by type
// (chips, as in Interviews). Tapping a biller opens its own checkout page,
// /bills/pay/<code> (as in bus booking): Details -> Confirm -> Pay -> Done.
// Cancelling, or finishing, goes back to the Bills home page.
// Paying for real waits for the customer-payment step (Paynow); locally, demo
// mode (BILLS_DEMO=1 on the bills service) lets the whole flow be tried.

const BASE = import.meta.env.VITE_BILLS_API || "/bills-api/bills";
const ICONS = {
  airtime: "📱", electricity: "⚡", tv: "📺", internet: "🌐", council: "🏛️",
  insurance: "🛡️", education: "🎓", professional: "🪪", lotto: "🎟️", giving: "⛪",
  media: "📰", other: "🧾",
};
const QUICK = [1, 2, 5, 10, 20, 50];
const POPULAR = ["AIRTIME", "ZETDC", "DSTV", "COH", "UZ", "CIMAS"];
const FILTER_FROM = 8; // a filter box in panels with this many billers or more
const STEPS = ["Details", "Confirm", "Pay", "Done"];

async function call(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("We could not reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  }
  return data;
}

let catalogueOnce = null; // one download per visit, shared by the home and checkout pages
const loadCatalogue = () => {
  catalogueOnce = catalogueOnce || call("/catalogue").catch((e) => {
    catalogueOnce = null;
    throw e;
  });
  return catalogueOnce;
};

const currencyName = (c) => (c === "ZWG" ? "ZiG" : c || "");
const money = (amount, currency) =>
  amount === null || amount === undefined || amount === "" || Number.isNaN(Number(amount))
    ? "—"
    : currency === "USD"
    ? `$${Number(amount).toFixed(2)}`
    : `${currencyName(currency)} ${Number(amount).toFixed(2)}`;

function regexOk(pattern, value) {
  if (!pattern) return true;
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true; // a pattern the browser cannot read: the server checks it
  }
}

function findBiller(catalogue, code) {
  for (const g of catalogue?.groups || []) {
    const b = g.billers.find((x) => x.code === code);
    if (b) return { biller: b, group: g };
  }
  return null;
}

function Notice({ text, kind = "error" }) {
  if (!text) return null;
  return (
    <div className={kind === "error" ? "ip-notice" : "bp-soon"} role={kind === "error" ? "alert" : "status"}>
      {text}
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

function BillerIcon({ biller, group }) {
  return biller.iconUrl ? (
    <img className="bp-logo" src={biller.iconUrl} alt="" loading="lazy" />
  ) : (
    <span className="bp-service-icon" aria-hidden="true">
      {ICONS[group] || "🧾"}
    </span>
  );
}

/* ======================= Bills home ======================= */

function BillerCards({ billers, groupOf, onPick, subs }) {
  const sections = subs?.length
    ? [...subs.map((s) => [s, billers.filter((b) => b.sub === s)]), ["", billers.filter((b) => !subs.includes(b.sub))]]
    : [["", billers]];
  let i = 0;
  return sections
    .filter(([, list]) => list.length)
    .map(([sub, list]) => (
      <div key={sub || "all"} className="bp-sub">
        {sub && sections.filter(([, l]) => l.length).length > 1 && <h3 className="bp-sub-title">{sub}</h3>}
        <div className="bp-billers">
          {list.map((b) => (
            <button
              key={b.code}
              type="button"
              className="bp-service"
              style={{ "--i": Math.min(i++, 12) }}
              onClick={() => onPick(b)}
            >
              <BillerIcon biller={b} group={groupOf(b)} />
              <strong>{b.name}</strong>
              <span>{b.products.length === 1 ? b.products[0].name : `${b.products.length} options`}</span>
            </button>
          ))}
        </div>
      </div>
    ));
}

function GroupPanel({ group, origin, closing, onClose, onPick }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const billers = f ? group.billers.filter((b) => b.name.toLowerCase().includes(f)) : group.billers;
  return (
    <div
      className={`ip-area${closing ? " is-closing" : ""}`}
      style={{ "--ox": origin.x, "--oy": origin.y }}
      role="region"
      aria-labelledby="bp-area-title"
    >
      <div className="ip-area-head">
        <div>
          <h2 id="bp-area-title" className="ip-section-title">
            {ICONS[group.id]} {group.name}
          </h2>
          <span className="ip-muted">
            {group.billers.length} {group.billers.length === 1 ? "biller" : "billers"}
          </span>
        </div>
        <button type="button" className="ip-area-close" onClick={onClose} aria-label="Close and go back to all bills">
          ✕
        </button>
      </div>
      {group.billers.length >= FILTER_FROM && (
        <input
          className="bp-filter"
          type="search"
          placeholder={`Find in ${group.name.toLowerCase()}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={`Find in ${group.name}`}
        />
      )}
      {billers.length ? (
        <BillerCards billers={billers} subs={f ? [] : group.subs} groupOf={() => group.id} onPick={onPick} />
      ) : (
        <p className="ip-muted">Nothing found. Try another word.</p>
      )}
    </div>
  );
}

export function BillsHome() {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState("");
  const [groupId, setGroupId] = useState("");
  const [closingPanel, setClosingPanel] = useState(false);
  const [origin, setOrigin] = useState({ x: "50%", y: "0px" });
  const [query, setQuery] = useState("");
  const stackRef = useRef(null);

  useEffect(() => {
    loadCatalogue().then(setCatalogue).catch((e) => setError(e.message));
  }, []);

  const groups = catalogue?.groups || [];
  const groupOf = (b) => groups.find((g) => g.billers.some((x) => x.code === b.code))?.id || "other";
  const q = query.trim().toLowerCase();
  const found = q
    ? groups.flatMap((g) => g.billers.filter((b) => `${b.name} ${b.description} ${g.name}`.toLowerCase().includes(q)))
    : [];
  const group = groups.find((g) => g.id === groupId);
  const popular = POPULAR.map((code) => findBiller(catalogue, code)?.biller).filter(Boolean);
  const open = (b) => navigate(`/bills/pay/${encodeURIComponent(b.code)}`);

  // A chip grows its billers out of itself and covers the chips; ✕ shrinks it back.
  const pickGroup = (id, e) => {
    if (id === groupId) return closePanel();
    const box = stackRef.current?.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    if (box) setOrigin({ x: `${r.left + r.width / 2 - box.left}px`, y: `${r.top + r.height / 2 - box.top}px` });
    setClosingPanel(false);
    setGroupId(id);
    window.requestAnimationFrame(() => stackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const closePanel = () => {
    setClosingPanel(true);
    window.setTimeout(() => {
      setGroupId("");
      setClosingPanel(false);
    }, 200);
  };

  return (
    <div className="ip-page bp-page">
      <section className="ip-hero">
        <div className="ip-shell">
          <span className="ip-eyebrow">Bills &amp; airtime</span>
          <h1>Pay your bills in one place.</h1>
          <p>Airtime, ZESA, DStv, internet, council rates, insurance, school fees and more, through Paynow.</p>
          <label className="ip-search">
            <span className="ip-visually-hidden">Search billers</span>
            <input
              type="search"
              placeholder="Search, e.g. ZESA, UZ, City of Harare"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="ip-shell ip-browse bp-body">
        {catalogue?.demo && (
          <p className="bp-demo">Demo mode: real biller names, demo options and prices, no real payments.</p>
        )}
        <Notice text={error} />
        {!catalogue && !error && <p className="ip-muted">Loading bills…</p>}
        {catalogue && !catalogue.available && (
          <p className="bp-soon">🔒 Bill payments open soon. We are connecting Paynow BillPay.</p>
        )}

        {q ? (
          <>
            <h2 className="ip-section-title">Results for “{query.trim()}”</h2>
            {found.length ? (
              <BillerCards billers={found} groupOf={groupOf} onPick={open} />
            ) : (
              <p className="ip-muted">Nothing found. Try another word.</p>
            )}
          </>
        ) : (
          groups.length > 0 && (
            <>
              <div className={`ip-stack${groupId && !closingPanel ? " is-open" : ""}`} ref={stackRef}>
                <div
                  className="ip-chips"
                  role="tablist"
                  aria-label="Types of bills"
                  inert={groupId ? "" : undefined}
                  aria-hidden={groupId ? true : undefined}
                >
                  {groups.map((g) => (
                    <button key={g.id} type="button" onClick={(e) => pickGroup(g.id, e)}>
                      {ICONS[g.id]} {g.name} <span className="bp-count">{g.billers.length}</span>
                    </button>
                  ))}
                </div>
                {group && (
                  <GroupPanel
                    key={group.id}
                    group={group}
                    origin={origin}
                    closing={closingPanel}
                    onClose={closePanel}
                    onPick={open}
                  />
                )}
              </div>
              {!groupId && popular.length > 0 && (
                <>
                  <h2 className="ip-section-title">Popular</h2>
                  <BillerCards billers={popular} groupOf={groupOf} onPick={open} />
                </>
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}

/* ======================= Checkout: /bills/pay/<code> ======================= */

function Stepper({ step }) {
  return (
    <ol className="bp-steps" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i < step ? "is-done" : i === step ? "is-current" : ""}
          aria-current={i === step ? "step" : undefined}
        >
          <span className="bp-step-dot">{i < step ? "✓" : i + 1}</span>
          <span className="bp-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

// Step 1: the biller's own fields. Submitted by the bottom bar's button (form="bp-details").
function DetailsStep({ biller, values, setValues, tried, errors }) {
  const { productCode, member, amount, quantity, meta } = values;
  const product = biller.products.find((p) => p.code === productCode) || biller.products[0];
  const fixed = product.price != null;
  const chooses = !fixed && product.authAmountMandated === null;
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const show = (k) => (tried ? errors[k] : "");
  const quick = QUICK.filter(
    (n) => (product.minAmount == null || n >= product.minAmount) && (product.maxAmount == null || n <= product.maxAmount)
  ).slice(0, 4);

  return (
    <>
      {biller.description && <p className="bp-hint">{biller.description}</p>}
      {biller.products.length > 1 && (
        <div className="bp-field">
          <span className="bp-label">What would you like to pay for?</span>
          <div className="bp-products" role="radiogroup" aria-label="What would you like to pay for?">
            {biller.products.map((p) => (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={p.code === product.code}
                className={`bp-product${p.code === product.code ? " is-active" : ""}`}
                onClick={() => setValues((v) => ({ ...v, productCode: p.code }))}
              >
                <strong>{p.name}</strong>
                {p.price != null && <span>{money(p.price, p.requiresForex ? "USD" : "ZWG")}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {product.prePurchase && <p className="bp-hint bp-note">{product.prePurchase}</p>}

      <Field label={biller.memberLabel} hint={biller.memberDesc} error={show("member")}>
        <input value={member} onChange={set("member")} autoComplete="off" />
      </Field>

      {product.metadata.map((f) => (
        <Field
          key={f.name}
          label={`${f.name}${f.required ? "" : " (optional)"}`}
          hint={f.description}
          error={show(`meta:${f.name}`)}
        >
          <input
            value={meta[f.name] || ""}
            onChange={(e) => setValues((v) => ({ ...v, meta: { ...v.meta, [f.name]: e.target.value } }))}
          />
        </Field>
      ))}

      {chooses && (
        <>
          <Field
            label={product.amountLabel || "Amount"}
            hint={[
              product.amountDesc,
              product.minAmount != null || product.maxAmount != null
                ? `From ${product.minAmount ?? 0}${product.maxAmount != null ? ` to ${product.maxAmount}` : ""}.`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            error={show("amount")}
          >
            <input inputMode="decimal" placeholder="e.g. 5" value={amount} onChange={set("amount")} />
          </Field>
          {quick.length > 0 && (
            <div className="bp-quick" aria-label="Quick amounts">
              {quick.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={amount === String(n) ? "is-active" : ""}
                  onClick={() => setValues((v) => ({ ...v, amount: String(n) }))}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {fixed && product.allowQuantity && (
        <Field label={product.quantityLabel} error={show("quantity")}>
          <input inputMode="numeric" value={quantity} onChange={set("quantity")} />
        </Field>
      )}
      {!fixed && !chooses && <p className="bp-hint bp-note">We will show you the amount owing on the next step.</p>}
    </>
  );
}

function detailsErrors(biller, values) {
  const { productCode, member, amount, quantity, meta } = values;
  const product = biller.products.find((p) => p.code === productCode) || biller.products[0];
  const chooses = product.price == null && product.authAmountMandated === null;
  const e = {};
  const m = member.trim();
  if (!m) e.member = `Enter the ${biller.memberLabel.toLowerCase()}.`;
  else if (!regexOk(biller.memberRegex, m)) e.member = biller.memberDesc || `Check the ${biller.memberLabel.toLowerCase()}.`;
  if (chooses) {
    const a = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(a) || Number(a) <= 0) e.amount = "Enter the amount, e.g. 5 or 2.50.";
    else if (product.minAmount != null && Number(a) < product.minAmount) e.amount = `The smallest amount is ${product.minAmount}.`;
    else if (product.maxAmount != null && Number(a) > product.maxAmount) e.amount = `The largest amount is ${product.maxAmount}.`;
  }
  if (product.price != null && product.allowQuantity && !(Number.isInteger(Number(quantity)) && Number(quantity) >= 1))
    e.quantity = "Enter how many (1 or more).";
  product.metadata.forEach((f) => {
    if (f.required && !String(meta[f.name] || "").trim()) e[`meta:${f.name}`] = `Enter the ${f.name.toLowerCase()}.`;
  });
  return { e, product, chooses };
}

// Step 2: what BillPay's check (AUTH) returned. The name must be shown before paying.
function ConfirmStep({ quote, partPay, payAmount, setPayAmount }) {
  const rows = [
    ["Name", quote.memberName],
    ["Address", quote.memberAddress],
    ...Object.entries(quote.accountDetails || {}),
    ...Object.entries(quote.balances || {}),
    quote.accountBalance != null ? ["Amount owing", money(quote.accountBalance, quote.currency)] : null,
    ...quote.products.map((p) => [p.quantity > 1 ? `${p.name} × ${p.quantity}` : p.name, money(p.price, quote.currency)]),
  ].filter((r) => r && r[1]);
  return (
    <>
      <p className="bp-hint">Please check that these details are right.</p>
      <dl className="bp-table">
        {rows.map(([k, v], i) => (
          <div key={`${k}-${i}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {partPay && (
        <Field label="How much would you like to pay?" hint="You can pay all or part of the amount owing.">
          <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        </Field>
      )}
    </>
  );
}

// Step 3: how the customer pays (Paynow). Live payment is switched on with the Paynow keys.
function PayStep({ total, currency, method, setMethod, phone, setPhone, demo }) {
  const methods = [
    ["ecocash", "EcoCash"],
    ["onemoney", "OneMoney"],
    ["card", "Visa / Mastercard"],
  ];
  return (
    <>
      <div className="bp-amount-due">
        <span>Amount to pay</span>
        <strong>{money(total, currency)}</strong>
      </div>
      <div className="bp-field">
        <span className="bp-label">Pay with</span>
        <div className="bp-methods" role="radiogroup" aria-label="Pay with">
          {methods.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              className={`bp-product${method === id ? " is-active" : ""}`}
              onClick={() => setMethod(id)}
            >
              <strong>{name}</strong>
            </button>
          ))}
        </div>
      </div>
      {method !== "card" && (
        <Field label={`${method === "onemoney" ? "OneMoney" : "EcoCash"} number`} hint="You will approve the payment on this phone.">
          <input type="tel" inputMode="tel" placeholder="0771234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      )}
      {demo ? (
        <p className="bp-demo">Demo mode: no money is taken. Tap “Pay” to see the result.</p>
      ) : (
        <p className="bp-soon">🔒 Payments open soon. We are connecting Paynow. Nothing has been charged.</p>
      )}
      <p className="bp-hint">Payments are processed securely by Paynow.</p>
    </>
  );
}

// Step 4: tokens, receipts and SMS texts (each on its own, as BillPay requires).
function DoneStep({ result, setResult }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      setResult(await call(`/sales/${result.reference}`));
    } catch {
      /* keep the last answer */
    } finally {
      setBusy(false);
    }
  };
  const ok = result.state === "delivered";
  return (
    <>
      <div className={`bp-outcome is-${result.state}`}>
        <span aria-hidden="true">{ok ? "✓" : result.state === "pending" ? "⏳" : "!"}</span>
        <h2>{ok ? "Payment successful" : result.state === "pending" ? "Still processing" : "Payment not completed"}</h2>
        {!ok && <p>{result.message}</p>}
        {result.refundCustomer && <p>Your money will be refunded.</p>}
      </div>
      {result.vouchers.map((v, i) => (
        <div key={i} className="bp-voucher">
          <span className="bp-hint">{v.product}</span>
          <strong>{v.code || v.pin}</strong>
          {v.serial && <span className="bp-hint">Serial {v.serial}</span>}
          {(v.code || v.pin) && (
            <button type="button" className="ip-link" onClick={() => navigator.clipboard?.writeText(String(v.code || v.pin))}>
              Copy
            </button>
          )}
        </div>
      ))}
      {Object.keys(result.details || {}).length > 0 && (
        <dl className="bp-table">
          {Object.entries(result.details).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.receipts.map((html, i) => (
        <figure key={i} className="bp-receipt">
          <figcaption>Receipt {result.receipts.length > 1 ? i + 1 : ""}</figcaption>
          <iframe title={`Receipt ${i + 1}`} sandbox="allow-modals" srcDoc={html} />
        </figure>
      ))}
      {result.smses.map((sms, i) => (
        <p key={i} className="bp-sms">
          💬 {sms}
        </p>
      ))}
      {result.billerReference && <p className="bp-hint">Reference: {result.billerReference}</p>}
      {result.state === "pending" && (
        <button type="button" className="ip-btn ip-btn--ghost" disabled={busy} onClick={refresh}>
          {busy ? "Checking…" : "Check again"}
        </button>
      )}
    </>
  );
}

export function BillCheckout({ code }) {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ productCode: "", member: "", amount: "", quantity: "1", meta: {} });
  const [tried, setTried] = useState(false);
  const [quote, setQuote] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState("ecocash");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const top = useRef(null);

  useEffect(() => {
    loadCatalogue().then(setCatalogue).catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    top.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
    setError("");
  }, [step]);

  const hit = findBiller(catalogue, code);
  const biller = hit?.biller;
  const group = hit?.group;
  const home = () => navigate("/bills");
  const touched = values.member || values.amount || step > 0;
  const cancel = () => (step === 3 || !touched ? home() : setAsking(true));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && (asking ? setAsking(false) : cancel());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const checked = useMemo(
    () => (biller ? detailsErrors(biller, { ...values, productCode: values.productCode || biller.products[0]?.code }) : null),
    [biller, values]
  );
  const partPay = quote?.product?.authAmountMandated === false;
  const total = partPay && payAmount ? Number(payAmount) : quote?.total;

  const submitDetails = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(checked.e).length) return;
    setBusy(true);
    setError("");
    try {
      const q = await call("/quote", {
        method: "POST",
        body: {
          biller: biller.code,
          member: values.member.trim(),
          product: checked.product.code,
          amount: checked.chooses ? values.amount.trim() : null,
          quantity: Number(values.quantity) || 1,
          metadata: values.meta,
        },
      });
      setQuote({ ...q, product: checked.product });
      setPayAmount(q.total != null ? String(q.total) : "");
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (method !== "card" && !/^0?7\d{8}$/.test(phone.replace(/\D/g, "").replace(/^263/, "0"))) {
      setError("Enter the mobile money number you will pay with, e.g. 0771234567.");
      return;
    }
    if (!catalogue?.demo) return; // live customer payment (Paynow) is switched on with the keys
    setBusy(true);
    setError("");
    try {
      const qs = partPay && payAmount ? `?amount=${encodeURIComponent(payAmount)}` : "";
      setResult(await call(`/demo/pay/${quote.reference}${qs}`, { method: "POST" }));
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // the bottom bar: what is being paid, and the next step
  let summary = "";
  let action = null;
  if (biller) {
    if (step === 0) {
      const p = checked.product;
      const a = p.price != null ? p.price * (Number(values.quantity) || 1) : checked.chooses ? values.amount : "";
      summary = a ? money(a, p.price != null ? (p.requiresForex ? "USD" : "ZWG") : p.requiresForex ? "USD" : "ZWG") : "Enter your details";
      action = (
        <button type="submit" form="bp-details" className="ip-btn" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      );
    } else if (step === 1) {
      summary = money(total, quote.currency);
      action = (
        <button
          type="button"
          className="ip-btn"
          onClick={() => {
            if (partPay && !(Number(payAmount) > 0)) return setError("Enter how much you would like to pay.");
            setStep(2);
          }}
        >
          Continue to pay
        </button>
      );
    } else if (step === 2) {
      summary = money(total, quote.currency);
      action = (
        <button type="button" className="ip-btn" disabled={busy || !catalogue?.demo} onClick={pay}>
          {busy ? "Paying…" : `Pay ${money(total, quote.currency)}`}
        </button>
      );
    } else {
      summary = result?.state === "delivered" ? "Paid" : "";
      action = (
        <button type="button" className="ip-btn" onClick={home}>
          Done
        </button>
      );
    }
  }

  return (
    <div className="ip-page bp-page bp-checkout" ref={top}>
      <header className="bp-checkout-head">
        {biller && <BillerIcon biller={biller} group={group.id} />}
        <div className="bp-checkout-title">
          <h1>{biller?.name || "Pay a bill"}</h1>
          {biller && (
            <p>
              {[group.name, group.name.toLowerCase().includes((biller.sub || "").toLowerCase()) ? "" : biller.sub]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {step < 3 && (
          <button type="button" className="bp-head-btn" onClick={cancel} aria-label="Cancel and go back to bills">
            ✕
          </button>
        )}
      </header>
      {biller && <Stepper step={step} />}

      <main className="bp-checkout-body">
        {catalogue?.demo && step === 0 && <p className="bp-demo">Demo mode: demo options and prices, no real payments.</p>}
        <Notice text={loadError} />
        {!catalogue && !loadError && <p className="ip-muted">Loading…</p>}
        {catalogue && !biller && (
          <div className="bp-card">
            <p>We could not find this biller. It may be unavailable right now.</p>
            <button type="button" className="ip-btn" onClick={home}>
              Back to bills
            </button>
          </div>
        )}
        {biller && (
          <div className="bp-card bp-step-card" key={step}>
            <h2 className="bp-step-title">
              {["Your details", "Confirm your details", "Payment", ""][step]}
            </h2>
            <Notice text={error} />
            {step === 0 && (
              <form id="bp-details" className="bp-form" onSubmit={submitDetails} noValidate>
                <DetailsStep
                  biller={biller}
                  values={{ ...values, productCode: values.productCode || biller.products[0]?.code }}
                  setValues={setValues}
                  tried={tried}
                  errors={checked.e}
                />
              </form>
            )}
            {step === 1 && (
              <ConfirmStep quote={quote} partPay={partPay} payAmount={payAmount} setPayAmount={setPayAmount} />
            )}
            {step === 2 && (
              <PayStep
                total={total}
                currency={quote.currency}
                method={method}
                setMethod={setMethod}
                phone={phone}
                setPhone={setPhone}
                demo={Boolean(catalogue?.demo)}
              />
            )}
            {step === 3 && result && <DoneStep result={result} setResult={setResult} />}
          </div>
        )}
      </main>

      {biller && (
        <footer className="bp-checkout-bar">
          {step < 3 && (
            <div className="bp-bar-summary">
              <span>Total</span>
              <strong>{summary}</strong>
            </div>
          )}
          <div className="bp-bar-actions">
            {(step === 1 || step === 2) && (
              <button type="button" className="ip-btn ip-btn--ghost bp-back-btn" onClick={() => setStep(step - 1)}>
                ‹ Back
              </button>
            )}
            {action}
          </div>
        </footer>
      )}

      {asking && (
        <div className="bp-ask-backdrop" onClick={() => setAsking(false)}>
          <div className="bp-ask" role="alertdialog" aria-modal="true" aria-labelledby="bp-ask-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="bp-ask-title">Cancel this payment?</h2>
            <p>Nothing has been charged. You will go back to the bills page.</p>
            <button type="button" className="ip-btn" onClick={home}>
              Yes, cancel
            </button>
            <button type="button" className="ip-btn ip-btn--ghost" autoFocus onClick={() => setAsking(false)}>
              Keep going
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillsHome;
