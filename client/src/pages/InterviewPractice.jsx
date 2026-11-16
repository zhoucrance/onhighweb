import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getToken, interviewApi, setToken } from "../lib/interviewApi";
import "../resourses/interview-practice.css";

// Interview flash cards for the website: the same content, free preview and
// per-topic Pesepay payment as the WhatsApp Flow.
// Views: browse -> card -> unlock -> (optional WhatsApp number) -> pay -> card (unlocked).

const PENDING_KEY = "onhigh_interview_payment";
const WHATSAPP_KEY = "onhigh_interview_whatsapp";
const POLL_MS = 5000;
const POLL_LIMIT = 36; // about 3 minutes of automatic checking
const SUGGESTIONS = 7;

function readPending() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || "null");
  } catch {
    return null;
  }
}

function writePending(value) {
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function savedWhatsApp() {
  try {
    return window.localStorage.getItem(WHATSAPP_KEY) || "";
  } catch {
    return "";
  }
}

function saveWhatsApp(value) {
  try {
    if (value) window.localStorage.setItem(WHATSAPP_KEY, value);
    else window.localStorage.removeItem(WHATSAPP_KEY);
  } catch {
    /* ignore */
  }
}

function Paragraphs({ text }) {
  return (text || "")
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((para, i) => <p key={i}>{para}</p>);
}

function Price({ offer }) {
  if (!offer) return null;
  return (
    <span className="ip-price">
      {offer.was && <s>{offer.was}</s>} <strong>{offer.price}</strong>
    </span>
  );
}

function Notice({ error }) {
  if (!error) return null;
  return (
    <div className="ip-notice" role="alert">
      {error.message}
    </div>
  );
}

/** The part of `text` that matches `query`, highlighted (as in the bus search). */
function Highlight({ text, query }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function TopicButton({ t, i, onOpen }) {
  return (
    <button
      type="button"
      className="ip-topic"
      style={{ "--i": Math.min(i, 12) }}
      onClick={() => onOpen(t.id, 0)}
    >
      <strong>{t.name}</strong>
      <span>
        {t.paid ? <em className="ip-badge">✓ Unlocked</em> : null}
        {t.count} questions{t.sector ? ` · ${t.sector}` : ""}
      </span>
    </button>
  );
}

/* ---------------- search with suggestions ---------------- */

// Suggestions drop down over the page while typing (popular topics before the
// first letter). Tap one to open it; Enter or "See all" shows every result.
function Search({ popular, onOpen, onSeeAll }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      interviewApi
        .topics({ q })
        .then((d) => setResults(d.topics))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => setActive(-1), [q]);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const items = q ? results.slice(0, SUGGESTIONS) : popular.slice(0, 6);

  const seeAll = () => {
    if (!q) return;
    setOpen(false);
    onSeeAll(q);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && items[active]) {
        setOpen(false);
        onOpen(items[active].id, 0);
      } else seeAll();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="ip-search" ref={root}>
      <label className="ip-visually-hidden" htmlFor="ip-search-input">
        Find a job or topic
      </label>
      <input
        id="ip-search-input"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="ip-suggest"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search a job, e.g. nurse, bank teller, accountant"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {open && (
        <div className="ip-suggest" id="ip-suggest" role="listbox">
          <p className="ip-suggest-head">
            {q ? (searching && !results.length ? "Searching…" : "Topics") : "Popular searches"}
          </p>
          {items.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`ip-suggest-item${i === active ? " is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                setOpen(false);
                onOpen(t.id, 0);
              }}
            >
              <strong>
                <Highlight text={t.name} query={q} />
              </strong>
              <span>
                {t.paid ? "✓ Unlocked · " : ""}
                {t.count} questions{t.sector ? ` · ${t.sector}` : ""}
              </span>
            </button>
          ))}
          {q && !searching && !results.length && (
            <p className="ip-suggest-empty">No topics match “{q}”. Try another word.</p>
          )}
          {q && results.length > 0 && (
            <button type="button" className="ip-suggest-all" onClick={seeAll}>
              See all {results.length} results for “{q}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- browse ---------------- */

function Browse({ signedIn, onOpen }) {
  const [sectors, setSectors] = useState([]);
  const [popular, setPopular] = useState([]);
  const [sector, setSector] = useState("");
  const [searched, setSearched] = useState(""); // "See all results" for this text
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMine, setHasMine] = useState(false);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState({ x: "50%", y: "0px" });
  const stackRef = useRef(null);

  useEffect(() => {
    interviewApi
      .sectors()
      .then((d) => {
        setSectors(d.sectors);
        setPopular(d.popular || []);
      })
      .catch(setError);
    if (signedIn) {
      interviewApi
        .me()
        .then((m) => setHasMine(m.paid_topics.length > 0))
        .catch(() => setHasMine(false));
    }
  }, [signedIn]);

  useEffect(() => {
    setLoading(true);
    setTopics([]); // never show the last area's topics under a new title
    interviewApi
      .topics(searched ? { q: searched } : { sector })
      .then((d) => {
        setTopics(d.topics);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [sector, searched]);

  // An area chip (or "See all results") opens a panel that grows out of the
  // tapped chip and covers the chips; ✕ shrinks it back and the chips return.
  const panelOpen = Boolean(sector || searched);
  const heading = searched
    ? `Results for “${searched}”`
    : sector === "mine"
    ? "My unlocked topics"
    : sector
    ? sectors.find((s) => s.id === sector)?.name || "Topics"
    : "Popular to start with";

  const growFrom = (el) => {
    const box = stackRef.current?.getBoundingClientRect();
    if (!el || !box) return setOrigin({ x: "50%", y: "0px" });
    const r = el.getBoundingClientRect();
    setOrigin({ x: `${r.left + r.width / 2 - box.left}px`, y: `${r.top + r.height / 2 - box.top}px` });
  };

  const closePanel = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setSector("");
      setSearched("");
      setClosing(false);
      stackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  };

  const pickSector = (id, e) => {
    if (id === sector && !searched) return closePanel();
    growFrom(e?.currentTarget);
    setClosing(false);
    setSearched("");
    setSector(id);
    window.requestAnimationFrame(() =>
      stackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    );
  };

  const seeAll = (q) => {
    growFrom(null);
    setClosing(false);
    setSector("");
    setSearched(q);
    window.requestAnimationFrame(() =>
      stackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const list = (
    <>
      <Notice error={error} />
      {loading && !topics.length ? (
        <p className="ip-muted">Loading topics…</p>
      ) : !topics.length ? (
        <p className="ip-muted">No topics found. Try another word.</p>
      ) : (
        <div className="ip-topic-grid">
          {topics.map((t, i) => (
            <TopicButton key={t.id} t={t} i={i} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <section className="ip-hero">
        <div className="ip-shell">
          <span className="ip-eyebrow">Interview practice</span>
          <h1>Stop guessing what they’ll ask.</h1>
          <p>Practise real interview questions with professional sample answers, one flash card at a time.</p>
          <Search popular={popular} onOpen={onOpen} onSeeAll={seeAll} />
        </div>
      </section>

      <section className="ip-shell ip-browse">
        <div className={`ip-stack${panelOpen && !closing ? " is-open" : ""}`} ref={stackRef}>
          <div
            className="ip-chips"
            role="tablist"
            aria-label="Areas"
            inert={panelOpen ? "" : undefined}
            aria-hidden={panelOpen || undefined}
          >
            {hasMine && (
              <button type="button" onClick={(e) => pickSector("mine", e)}>
                ⭐ My topics
              </button>
            )}
            {sectors.map((s) => (
              <button
                key={s.id}
                type="button"
                className={sector === s.id ? "is-active" : ""}
                onClick={(e) => pickSector(s.id, e)}
              >
                {s.name}
              </button>
            ))}
          </div>

          {panelOpen && (
            <div
              key={searched || sector}
              className={`ip-area${closing ? " is-closing" : ""}`}
              style={{ "--ox": origin.x, "--oy": origin.y }}
              role="region"
              aria-labelledby="ip-area-title"
            >
              <div className="ip-area-head">
                <div>
                  <h2 id="ip-area-title" className="ip-section-title">
                    {heading}
                  </h2>
                  {!loading && topics.length ? (
                    <span className="ip-muted">{topics.length} topics</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ip-area-close"
                  onClick={closePanel}
                  aria-label="Close and go back to areas"
                >
                  ✕
                </button>
              </div>
              {list}
            </div>
          )}
        </div>

        {!panelOpen && (
          <>
            <h2 className="ip-section-title">{heading}</h2>
            {list}
          </>
        )}
      </section>
    </>
  );
}

/* ---------------- optional WhatsApp number (no code) ---------------- */

function WhatsAppNumber({ onDone }) {
  const [number, setNumber] = useState(savedWhatsApp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const go = async (value) => {
    setBusy(true);
    setError(null);
    try {
      const r = await interviewApi.device(value.trim());
      setToken(r.token);
      saveWhatsApp(r.whatsapp ? value.trim() : "");
      onDone(r.whatsapp ? value.trim() : "");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="ip-panel ip-form"
      onSubmit={(e) => {
        e.preventDefault();
        go(number);
      }}
    >
      <h3>Practise on WhatsApp too? (optional)</h3>
      <p className="ip-muted">
        By giving your WhatsApp number, you will be able to open this topic on our WhatsApp
        platform as well (0781576825), with the same questions and answers, even when you have
        no data for the website.
      </p>
      <Notice error={error} />
      <label>
        <span className="ip-label-row">
          WhatsApp number <span className="ip-optional">optional</span>
        </span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0772123456"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </label>
      <p className="ip-muted ip-small">No code needed. Leave it empty to use this topic on this browser only.</p>
      <button type="submit" className="ip-btn" disabled={busy}>
        {busy ? "Please wait…" : "Continue to payment"}
      </button>
      {number.trim() && (
        <button type="button" className="ip-link" disabled={busy} onClick={() => go("")}>
          Skip, use this browser only
        </button>
      )}
    </form>
  );
}

/* ---------------- payment ---------------- */

function Pay({ topic, defaultPhone, onPaid }) {
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const polls = useRef(0);

  const check = useCallback(
    async (id) => {
      try {
        const r = await interviewApi.paymentStatus(id);
        if (r.paid) {
          writePending(null);
          onPaid();
          return true;
        }
        if (r.failed) {
          writePending(null);
          setPayment(null);
          setError(new ApiError("The payment was cancelled or did not go through. Please try again.", 400));
          return true;
        }
        setStatus("We have not received your payment yet.");
      } catch (err) {
        setError(err);
      }
      return false;
    },
    [onPaid]
  );

  // EcoCash: keep checking while the buyer approves on the phone.
  useEffect(() => {
    if (!payment || payment.method !== "ecocash") return undefined;
    polls.current = 0;
    const timer = window.setInterval(async () => {
      polls.current += 1;
      const done = await check(payment.payment_id);
      if (done || polls.current >= POLL_LIMIT) window.clearInterval(timer);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [payment, check]);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/interviews?interviewPayment=1`;
      const r = await interviewApi.pay({ topic_id: topic.id, method, phone, return_url: returnUrl });
      if (r.paid) {
        onPaid();
        return;
      }
      writePending({ id: r.payment_id, topic: topic.id });
      if (r.method === "card" && r.pay_url) {
        window.location.assign(r.pay_url);
        return;
      }
      setPayment(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (payment) {
    return (
      <div className="ip-panel" aria-live="polite">
        <h3>Approve the payment on your phone</h3>
        <p>
          We sent a request to <strong>{phone}</strong>. Enter your EcoCash PIN on your phone to
          approve it. This page updates by itself once it is paid.
        </p>
        {status && <p className="ip-muted">{status}</p>}
        <Notice error={error} />
        <button type="button" className="ip-btn" onClick={() => check(payment.payment_id)}>
          I have approved
        </button>
        <button type="button" className="ip-link" onClick={() => setPayment(null)}>
          Start again
        </button>
      </div>
    );
  }

  return (
    <form className="ip-panel ip-form" onSubmit={start}>
      <h3>Choose how to pay</h3>
      <Notice error={error} />
      <fieldset className="ip-methods">
        <legend className="ip-visually-hidden">Payment method</legend>
        <label className={method === "ecocash" ? "is-active" : ""}>
          <input
            type="radio"
            name="method"
            value="ecocash"
            checked={method === "ecocash"}
            onChange={() => setMethod("ecocash")}
          />
          Pay with EcoCash
        </label>
        <label className={method === "card" ? "is-active" : ""}>
          <input
            type="radio"
            name="method"
            value="card"
            checked={method === "card"}
            onChange={() => setMethod("card")}
          />
          Pay with card
        </label>
      </fieldset>
      {method === "ecocash" && (
        <label>
          EcoCash number
          <input
            type="tel"
            inputMode="tel"
            placeholder="0772123456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
      )}
      <button type="submit" className="ip-btn" disabled={!method || busy}>
        {busy ? "Starting…" : method === "card" ? "Continue to card payment" : "Pay now"}
      </button>
      <p className="ip-muted ip-small">Payments are processed securely by Pesepay.</p>
    </form>
  );
}

/* ---------------- unlock ---------------- */

function Unlock({ topic, firstLocked, onSignedIn, onPaid }) {
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState("offer");
  const [whatsapp, setWhatsapp] = useState("");
  // The server sends stand-in text for these, shown blurred: a hint, never the questions.
  const remaining = topic.cards.slice(firstLocked);

  return (
    <div className="ip-unlock">
      <div className="ip-panel">
        <span className="ip-eyebrow">Unlock {topic.name}</span>
        <h2>Keep practising with every answer</h2>
        <p>
          You have reached the end of the free preview. One payment unlocks all{" "}
          {topic.cards.length} questions and suggested answers in this topic, for good.
        </p>
        <p className="ip-offer">
          <Price offer={topic.offer} /> <span className="ip-muted">one-off, this topic only</span>
        </p>
      </div>

      <div className="ip-panel ip-locked">
        <ol className="ip-remaining" aria-hidden="true">
          {remaining.slice(0, 5).map((c, i) => (
            <li key={i}>{c.question}</li>
          ))}
        </ol>
        <p className="ip-locked-badge">
          🔒 {remaining.length} more {remaining.length === 1 ? "question" : "questions"} with
          sample answers
        </p>
      </div>

      {step === "offer" && (
        <div className="ip-panel">
          <label className="ip-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I
            accept the terms and conditions
          </label>
          {agree && (
            <div className="ip-terms">
              <Paragraphs text={topic.terms} />
            </div>
          )}
          <button type="button" className="ip-btn" disabled={!agree} onClick={() => setStep("number")}>
            Continue
          </button>
        </div>
      )}
      {step === "number" && (
        <WhatsAppNumber
          onDone={(number) => {
            setWhatsapp(number);
            onSignedIn();
            setStep("pay");
          }}
        />
      )}
      {step === "pay" && <Pay topic={topic} defaultPhone={whatsapp} onPaid={onPaid} />}
    </div>
  );
}

/* ---------------- card ---------------- */

function Card({ topic, index, setIndex, onSignedIn, onPaid, onBack }) {
  const [show, setShow] = useState(false);
  const firstLocked = useMemo(() => {
    const i = topic.cards.findIndex((c) => c.locked);
    return i === -1 ? topic.cards.length : i;
  }, [topic]);
  const total = topic.cards.length;

  useEffect(() => setShow(false), [index, topic.id]);

  if (index >= firstLocked) {
    return (
      <div className="ip-shell ip-study">
        <button type="button" className="ip-link ip-back" onClick={() => setIndex(firstLocked - 1)}>
          ← Back to the cards
        </button>
        <Unlock topic={topic} firstLocked={firstLocked} onSignedIn={onSignedIn} onPaid={onPaid} />
      </div>
    );
  }

  const card = topic.cards[index];
  const last = index === total - 1;
  return (
    <div className="ip-shell ip-study">
      <button type="button" className="ip-link ip-back" onClick={onBack}>
        ← All topics
      </button>
      <span className="ip-eyebrow">{topic.name}</span>
      <div className="ip-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <p className="ip-count">
        Question {index + 1} of {total}
        {topic.paid && <em className="ip-badge">✓ Unlocked</em>}
      </p>

      <article className="ip-card">
        <h2>{card.question}</h2>
        <label className="ip-toggle">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span aria-hidden="true" />
          Show answer
        </label>
        {show && (
          <div className="ip-answer">
            <Paragraphs text={card.answer} />
          </div>
        )}
      </article>

      <div className="ip-nav">
        <button
          type="button"
          className="ip-btn ip-btn--ghost"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          ← Previous
        </button>
        <button
          type="button"
          className="ip-btn"
          onClick={() => (last ? onBack() : setIndex(index + 1))}
        >
          {last ? "Finish" : "Next →"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function InterviewPractice() {
  const [signedIn, setSignedIn] = useState(Boolean(getToken()));
  const [topic, setTopic] = useState(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [returning, setReturning] = useState("");

  const open = useCallback(async (id, at = 0) => {
    setLoading(true);
    setError(null);
    try {
      const t = await interviewApi.topic(id);
      setTopic(t);
      setIndex(Math.min(at, t.cards.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const firstLockedOf = (t) => {
    const i = t.cards.findIndex((c) => c.locked);
    return i === -1 ? 0 : i;
  };

  // Paid: reload the topic with every answer, carrying on where the preview ended.
  const onPaid = useCallback(async () => {
    if (!topic) return;
    const at = firstLockedOf(topic);
    await open(topic.id, at);
  }, [topic, open]);

  // Back from Pesepay's card checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pending = readPending();
    if (params.get("interviewPayment") !== "1" || !pending) return;
    window.history.replaceState({}, "", window.location.pathname);
    setReturning("Checking your payment…");
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const r = await interviewApi.paymentStatus(pending.id);
        if (r.paid) {
          writePending(null);
          setReturning("");
          const t = await interviewApi.topic(pending.topic);
          setTopic(t);
          setIndex(firstLockedFree(t));
          return;
        }
        if (r.failed || tries >= 6) {
          writePending(null);
          setReturning(
            r.failed
              ? "The payment was cancelled or did not go through. You were not charged for this topic."
              : "We have not received your payment yet. If you paid, open the topic again in a minute."
          );
          return;
        }
      } catch (err) {
        setReturning(err.message);
        return;
      }
      window.setTimeout(tick, 3000);
    };
    tick();
  }, []);

  return (
    <div className="ip-page">
      {returning && (
        <div className="ip-shell">
          <div className="ip-panel ip-return" aria-live="polite">
            {returning}
            {!returning.startsWith("Checking") && (
              <button type="button" className="ip-link" onClick={() => setReturning("")}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="ip-shell">
          <Notice error={error} />
        </div>
      )}
      {loading && <p className="ip-shell ip-muted">Loading…</p>}
      {topic ? (
        <Card
          topic={topic}
          index={index}
          setIndex={setIndex}
          onSignedIn={() => setSignedIn(true)}
          onPaid={onPaid}
          onBack={() => setTopic(null)}
        />
      ) : (
        <Browse signedIn={signedIn} onOpen={open} />
      )}
    </div>
  );
}

// After paying, open on the first card that used to be locked: the free preview
// is the same rule as the bot's (6 questions over 20, else 5, at least one left).
function firstLockedFree(t) {
  const total = t.cards.length;
  return Math.max(1, Math.min(total > 20 ? 6 : 5, total - 1));
}
