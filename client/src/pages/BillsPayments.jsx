import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../resourses/interview-practice.css";
import "../resourses/bills.css";

// Bills & airtime: every biller on our Paynow BillPay account, grouped by type
// (Airtime & data, Electricity, TV, Internet, Councils, Insurance, Schools ...).
// Each biller's own BillPay settings drive its form. Flow:
//   group -> biller -> details -> confirm (AUTH: name, amount owing) -> pay -> tokens / receipts
// Paying for real waits for the customer-payment step (Paynow); locally, demo
// mode (BILLS_DEMO=1 on the bills service) lets the whole flow be tried.

const BASE = import.meta.env.VITE_BILLS_API || "/bills-api/bills";
const ICONS = {
  airtime: "📱", electricity: "⚡", tv: "📺", internet: "🌐", council: "🏛️",
  insurance: "🛡️", education: "🎓", lotto: "🎟️", giving: "⛪", other: "🧾",
};
const QUICK = [1, 2, 5, 10, 20, 50];

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

const currencyName = (c) => (c === "ZWG" ? "ZiG" : c || "");
const money = (amount, currency) =>
  amount === null || amount === undefined || amount === ""
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

/* ---------------- step 1: the biller's form ---------------- */

function BillerForm({ biller, onQuoted }) {
  const [productCode, setProductCode] = useState(biller.products[0]?.code || "");
  const [member, setMember] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [meta, setMeta] = useState({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const product = biller.products.find((p) => p.code === productCode) || biller.products[0];
  const fixed = product.price !== null && product.price !== undefined;
  const chooses = !fixed && product.authAmountMandated === null;
  const quick = QUICK.filter(
    (n) => (product.minAmount == null || n >= product.minAmount) && (product.maxAmount == null || n <= product.maxAmount)
  ).slice(0, 4);

  const errors = useMemo(() => {
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
    if (product.allowQuantity && !(Number.isInteger(Number(quantity)) && Number(quantity) >= 1))
      e.quantity = "Enter how many (1 or more).";
    product.metadata.forEach((f) => {
      if (f.required && !String(meta[f.name] || "").trim()) e[`meta:${f.name}`] = `Enter the ${f.name.toLowerCase()}.`;
    });
    return e;
  }, [member, amount, quantity, meta, biller, product, chooses]);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    setError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const q = await call("/quote", {
        method: "POST",
        body: {
          biller: biller.code,
          member: member.trim(),
          product: product.code,
          amount: chooses ? amount.trim() : null,
          quantity: Number(quantity) || 1,
          metadata: meta,
        },
      });
      onQuoted(q, product);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const show = (k) => (tried ? errors[k] : "");

  return (
    <form className="bp-form" onSubmit={submit} noValidate>
      {biller.description && <p className="bp-hint">{biller.description}</p>}
      <Notice text={error} />

      {biller.products.length > 1 && (
        <div className="bp-field">
          <span className="bp-label">Choose</span>
          <div className="bp-products" role="radiogroup" aria-label="Choose">
            {biller.products.map((p) => (
              <button
                key={p.code}
                type="button"
                role="radio"
                aria-checked={p.code === product.code}
                className={`bp-product${p.code === product.code ? " is-active" : ""}`}
                onClick={() => setProductCode(p.code)}
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
        <input value={member} onChange={(e) => setMember(e.target.value)} autoComplete="off" />
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
            onChange={(e) => setMeta((m) => ({ ...m, [f.name]: e.target.value }))}
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
            <input inputMode="decimal" placeholder="e.g. 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {quick.length > 0 && (
            <div className="bp-quick" aria-label="Quick amounts">
              {quick.map((n) => (
                <button key={n} type="button" onClick={() => setAmount(String(n))}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {fixed && product.allowQuantity && (
        <Field label={product.quantityLabel} error={show("quantity")}>
          <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      )}
      {!fixed && !chooses && (
        <p className="bp-hint bp-note">We will show you the amount owing on the next step.</p>
      )}

      <button type="submit" className="ip-btn bp-submit" disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

/* ---------------- step 2: confirm (after AUTH) ---------------- */

function Confirm({ quote, product, demo, onPaid, onBack }) {
  const partPay = product.authAmountMandated === false;
  const [amount, setAmount] = useState(partPay && quote.total != null ? String(quote.total) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = partPay && amount ? Number(amount) : quote.total;

  const payDemo = async () => {
    setBusy(true);
    setError("");
    try {
      const q = partPay && amount ? `?amount=${encodeURIComponent(amount)}` : "";
      onPaid(await call(`/demo/pay/${quote.reference}${q}`, { method: "POST" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ["Name", quote.memberName],
    ["Address", quote.memberAddress],
    ...Object.entries(quote.accountDetails || {}),
    ...Object.entries(quote.balances || {}),
    quote.accountBalance != null ? ["Amount owing", money(quote.accountBalance, quote.currency)] : null,
    ...quote.products.map((p) => [
      p.quantity > 1 ? `${p.name} × ${p.quantity}` : p.name,
      money(p.price, quote.currency),
    ]),
  ].filter((r) => r && r[1]);

  return (
    <div className="bp-review" aria-live="polite">
      <h2>Please confirm</h2>
      <p className="bp-hint">Check that these details are right before you pay.</p>
      <dl>
        {rows.map(([k, v], i) => (
          <div key={`${k}-${i}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="bp-total">
          <dt>You pay</dt>
          <dd>{money(total, quote.currency)}</dd>
        </div>
      </dl>
      {partPay && (
        <Field label="How much would you like to pay?" hint="You can pay part of the amount owing.">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
      <Notice text={error} />
      {demo ? (
        <button type="button" className="ip-btn bp-submit" disabled={busy} onClick={payDemo}>
          {busy ? "Paying…" : "Pay (demo, no real money)"}
        </button>
      ) : (
        <p className="bp-soon">
          🔒 Payments open soon. We are connecting Paynow so you can pay with EcoCash, OneMoney or card.
          Nothing has been charged.
        </p>
      )}
      <button type="button" className="ip-link" onClick={onBack}>
        ← Change details
      </button>
    </div>
  );
}

/* ---------------- step 3: result ---------------- */

function Result({ result: first, onDone }) {
  const [result, setResult] = useState(first);
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
    <div className="bp-review" aria-live="polite">
      <h2>{ok ? "✅ Payment successful" : result.state === "pending" ? "⏳ Still processing" : "Payment not completed"}</h2>
      {!ok && <Notice text={result.message} kind={result.state === "pending" ? "info" : "error"} />}
      {result.refundCustomer && <p className="bp-hint">Your money will be refunded.</p>}

      {result.vouchers.map((v, i) => (
        <div key={i} className="bp-voucher">
          <span className="bp-hint">{v.product}</span>
          <strong>{v.code || v.pin}</strong>
          {v.serial && <span className="bp-hint">Serial {v.serial}</span>}
          {(v.code || v.pin) && (
            <button
              type="button"
              className="ip-link"
              onClick={() => navigator.clipboard?.writeText(String(v.code || v.pin))}
            >
              Copy
            </button>
          )}
        </div>
      ))}

      {Object.keys(result.details || {}).length > 0 && (
        <dl>
          {Object.entries(result.details).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* BillPay: each receipt and each SMS on its own, never combined */}
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
      <button type="button" className="ip-btn bp-submit" onClick={onDone}>
        Pay another bill
      </button>
    </div>
  );
}

/* ---------------- the sheet (slides up, as in bus booking) ---------------- */

function Sheet({ title, subtitle, icon, onClose, children }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 240);
  }, [onClose]);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind stays still
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div className={`bp-sheet-root${closing ? " is-closing" : ""}`}>
      <div className="bp-sheet-backdrop" onClick={close} />
      <div className="bp-sheet" role="dialog" aria-modal="true" aria-labelledby="bp-sheet-title">
        <div className="bp-sheet-head">
          <button type="button" className="bp-sheet-close" onClick={close} aria-label="Close">
            ✕
          </button>
          {icon}
          <div className="bp-sheet-title">
            <h2 id="bp-sheet-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="bp-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

const POPULAR_GROUPS = ["airtime", "electricity", "tv"];

export default function BillsPayments() {
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState("");
  const [groupId, setGroupId] = useState("");
  const [closingPanel, setClosingPanel] = useState(false);
  const [origin, setOrigin] = useState({ x: "50%", y: "0px" });
  const [query, setQuery] = useState("");
  const [biller, setBiller] = useState(null);
  const [quote, setQuote] = useState(null);
  const [result, setResult] = useState(null);
  const stackRef = useRef(null);

  useEffect(() => {
    call("/catalogue").then(setCatalogue).catch((e) => setError(e.message));
  }, []);

  const groups = catalogue?.groups || [];
  const groupOf = (b) => groups.find((g) => g.billers.some((x) => x.code === b.code))?.id || "other";
  const groupName = (b) => groups.find((g) => g.id === groupOf(b))?.name || "";
  const q = query.trim().toLowerCase();
  const found = q
    ? groups.flatMap((g) => g.billers.filter((b) => `${b.name} ${b.description}`.toLowerCase().includes(q)))
    : [];
  const group = groups.find((g) => g.id === groupId);
  const popular = POPULAR_GROUPS.flatMap((id) => groups.find((g) => g.id === id)?.billers.slice(0, 2) || []);

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

  const openBiller = (b) => {
    setBiller(b);
    setQuote(null);
    setResult(null);
  };
  const closeSheet = () => {
    setBiller(null);
    setQuote(null);
    setResult(null);
  };

  const step = result ? "Done" : quote ? "Confirm and pay" : "Your details";

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
              placeholder="Search, e.g. ZESA, DStv, council"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="ip-shell ip-browse bp-body">
        {catalogue?.demo && <p className="bp-demo">Demo mode: test billers only, no real payments.</p>}
        <Notice text={error} />
        {!catalogue && !error && <p className="ip-muted">Loading bills…</p>}
        {catalogue && !catalogue.available && (
          <p className="bp-soon">🔒 Bill payments open soon. We are connecting Paynow BillPay.</p>
        )}

        {q ? (
          <BillerList title={`Results for “${query.trim()}”`} billers={found} groupOf={groupOf} onPick={openBiller} />
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
                    <button
                      key={g.id}
                      type="button"
                      className={g.id === groupId ? "is-active" : ""}
                      onClick={(e) => pickGroup(g.id, e)}
                    >
                      {ICONS[g.id]} {g.name}
                    </button>
                  ))}
                </div>
                {group && (
                  <div
                    key={group.id}
                    className={`ip-area${closingPanel ? " is-closing" : ""}`}
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
                      <button
                        type="button"
                        className="ip-area-close"
                        onClick={closePanel}
                        aria-label="Close and go back to all bills"
                      >
                        ✕
                      </button>
                    </div>
                    <BillerList billers={group.billers} groupOf={() => group.id} onPick={openBiller} />
                  </div>
                )}
              </div>
              {!groupId && popular.length > 0 && (
                <BillerList title="Popular" billers={popular} groupOf={groupOf} onPick={openBiller} />
              )}
            </>
          )
        )}
      </section>

      {biller && (
        <Sheet
          title={biller.name}
          subtitle={`${groupName(biller)} · ${step}`}
          icon={<BillerIcon biller={biller} group={groupOf(biller)} />}
          onClose={closeSheet}
        >
          <div className="bp-sheet-step" key={result ? "r" : quote ? "q" : "f"}>
            {result ? (
              <Result result={result} onDone={closeSheet} />
            ) : quote ? (
              <Confirm
                quote={quote}
                product={quote.product}
                demo={Boolean(catalogue?.demo)}
                onPaid={setResult}
                onBack={() => setQuote(null)}
              />
            ) : (
              <BillerForm biller={biller} onQuoted={(qq, p) => setQuote({ ...qq, product: p })} />
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function BillerList({ title, billers, groupOf, onPick }) {
  return (
    <>
      {title && <h2 className="ip-section-title">{title}</h2>}
      {!billers.length ? (
        <p className="ip-muted">Nothing found. Try another word.</p>
      ) : (
        <div className="bp-billers">
          {billers.map((b, i) => (
            <button
              key={b.code}
              type="button"
              className="bp-service"
              style={{ "--i": Math.min(i, 12) }}
              onClick={() => onPick(b)}
            >
              <BillerIcon biller={b} group={groupOf(b)} />
              <strong>{b.name}</strong>
              <span>{b.products.length === 1 ? b.products[0].name : `${b.products.length} options`}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
