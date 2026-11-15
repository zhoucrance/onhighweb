import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getToken, interviewApi, setToken } from "../lib/interviewApi";
import "../resourses/interview-practice.css";

// Interview flash cards for the website: the same content, free preview and
// per-topic Pesepay payment as the WhatsApp Flow (one purchase works in both).
// Views: browse -> card -> unlock -> sign in -> pay -> wait -> card (unlocked).

const PENDING_KEY = "onhigh_interview_payment";
const POLL_MS = 5000;
const POLL_LIMIT = 36; // about 3 minutes of automatic checking

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
      {error.extra?.whatsapp_link && (
        <>
          {" "}
          <a href={error.extra.whatsapp_link} target="_blank" rel="noreferrer">
            Open WhatsApp
          </a>
        </>
      )}
    </div>
  );
}

/* ---------------- browse ---------------- */

function Browse({ signedIn, onOpen }) {
  const [sectors, setSectors] = useState([]);
  const [sector, setSector] = useState("");
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMine, setHasMine] = useState(false);

  useEffect(() => {
    interviewApi.sectors().then((d) => setSectors(d.sectors)).catch(setError);
    if (signedIn) {
      interviewApi
        .me()
        .then((m) => setHasMine(m.paid_topics.length > 0))
        .catch(() => setHasMine(false));
    }
  }, [signedIn]);

  useEffect(() => {
    const q = query.trim();
    setLoading(true);
    const timer = window.setTimeout(
      () => {
        interviewApi
          .topics(q ? { q } : { sector })
          .then((d) => {
            setTopics(d.topics);
            setError(null);
          })
          .catch(setError)
          .finally(() => setLoading(false));
      },
      q ? 300 : 0
    );
    return () => window.clearTimeout(timer);
  }, [sector, query]);

  const heading = query.trim()
    ? `Results for “${query.trim()}”`
    : sector === "mine"
    ? "My unlocked topics"
    : sector
    ? sectors.find((s) => s.id === sector)?.name || "Topics"
    : "Popular to start with";

  return (
    <>
      <section className="ip-hero">
        <div className="ip-shell">
          <span className="ip-eyebrow">Interview practice</span>
          <h1>Stop guessing what they’ll ask.</h1>
          <p>Practise real interview questions with professional sample answers, one flash card at a time.</p>
          <label className="ip-search">
            <span className="ip-visually-hidden">Find a job or topic</span>
            <input
              type="search"
              placeholder="Search a job, e.g. nurse, bank teller, accountant"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="ip-shell ip-browse">
        <div className="ip-chips" role="tablist" aria-label="Areas">
          <button
            type="button"
            className={!sector && !query ? "is-active" : ""}
            onClick={() => {
              setSector("");
              setQuery("");
            }}
          >
            Popular
          </button>
          {hasMine && (
            <button
              type="button"
              className={sector === "mine" ? "is-active" : ""}
              onClick={() => {
                setSector("mine");
                setQuery("");
              }}
            >
              ⭐ My topics
            </button>
          )}
          {sectors.map((s) => (
            <button
              key={s.id}
              type="button"
              className={sector === s.id && !query ? "is-active" : ""}
              onClick={() => {
                setSector(s.id);
                setQuery("");
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        <h2 className="ip-section-title">{heading}</h2>
        <Notice error={error} />
        {loading && !topics.length ? (
          <p className="ip-muted">Loading topics…</p>
        ) : !topics.length ? (
          <p className="ip-muted">No topics found. Try another word.</p>
        ) : (
          <div className="ip-topic-grid">
            {topics.map((t) => (
              <button key={t.id} type="button" className="ip-topic" onClick={() => onOpen(t.id, 0)}>
                <strong>{t.name}</strong>
                <span>
                  {t.paid ? <em className="ip-badge">✓ Unlocked</em> : null}
                  {t.count} questions{t.sector ? ` · ${t.sector}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ---------------- sign in ---------------- */

function SignIn({ onDone }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await interviewApi.sendCode(phone);
      setSentTo(r.to);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await interviewApi.verifyCode(phone, code);
      setToken(r.token);
      onDone(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ip-panel">
      <h3>Confirm your WhatsApp number</h3>
      <p className="ip-muted">
        Your topic is unlocked for this number, on this website and in our WhatsApp chat.
      </p>
      <Notice error={error} />
      {!sentTo ? (
        <form onSubmit={send} className="ip-form">
          <label>
            WhatsApp number
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0772123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="ip-btn" disabled={busy}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="ip-form">
          <p className="ip-muted">We sent a 6-digit code to {sentTo} on WhatsApp.</p>
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="ip-btn" disabled={busy}>
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button type="button" className="ip-link" onClick={() => setSentTo("")}>
            Use another number
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------------- payment ---------------- */

function Pay({ topic, onPaid }) {
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState("");
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

function Unlock({ topic, firstLocked, signedIn, onSignedIn, onPaid }) {
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState("offer");
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

      <div className="ip-panel">
        <h3>Still to practise ({remaining.length})</h3>
        <ol className="ip-remaining" start={firstLocked + 1}>
          {remaining.map((c, i) => (
            <li key={i}>{c.question}</li>
          ))}
        </ol>
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
          <button
            type="button"
            className="ip-btn"
            disabled={!agree}
            onClick={() => setStep(signedIn ? "pay" : "signin")}
          >
            Continue to payment
          </button>
        </div>
      )}
      {step === "signin" && (
        <SignIn
          onDone={(r) => {
            onSignedIn(r);
            setStep("pay");
          }}
        />
      )}
      {step === "pay" && <Pay topic={topic} onPaid={onPaid} />}
    </div>
  );
}

/* ---------------- card ---------------- */

function Card({ topic, index, setIndex, signedIn, onSignedIn, onPaid, onBack }) {
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
        <Unlock
          topic={topic}
          firstLocked={firstLocked}
          signedIn={signedIn}
          onSignedIn={onSignedIn}
          onPaid={onPaid}
        />
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
          signedIn={signedIn}
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
// size is the same rule as the bot's (30% over 20 questions, else 50%).
function firstLockedFree(t) {
  const total = t.cards.length;
  const share = total > 20 ? 0.3 : 0.5;
  return Math.min(total - 1, Math.max(1, Math.ceil(total * share)));
}
