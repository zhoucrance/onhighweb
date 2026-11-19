import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authHeader, localPhone, openAccount, signOut, useAccount } from "../lib/account";
import { interviewApi } from "../lib/interviewApi";
import "../resourses/interview-practice.css";
import "../resourses/bills.css";
import "../resourses/account.css";

// My account: details, interview topics and bill payments for the signed-in customer.
const BILLS = import.meta.env.VITE_BILLS_API || "/bills-api/bills";

const money = (amount, currency) =>
  amount == null ? "" : currency === "USD" ? `$${Number(amount).toFixed(2)}` : `ZiG ${Number(amount).toFixed(2)}`;

export default function MyAccount() {
  const account = useAccount();
  const navigate = useNavigate();
  const [topics, setTopics] = useState(null);
  const [payments, setPayments] = useState(null);

  useEffect(() => {
    if (!account) return;
    interviewApi
      .topics({ sector: "mine" })
      .then((d) => setTopics(d.topics))
      .catch(() => setTopics([]));
    fetch(`${BILLS}/my-payments`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : { payments: [] }))
      .then((d) => setPayments(d.payments || []))
      .catch(() => setPayments([]));
  }, [account]);

  if (!account) {
    return (
      <div className="ip-page ac-page">
        <section className="ip-shell ac-empty">
          <span className="ac-avatar ac-avatar--big" aria-hidden="true">
            👤
          </span>
          <h1>Your OnHighTech account</h1>
          <p>Sign in to see your interview topics and bill payments on any phone or computer.</p>
          <div className="ac-actions">
            <button type="button" className="ip-btn" onClick={() => openAccount("signin")}>
              Sign in
            </button>
            <button type="button" className="ip-btn ip-btn--ghost" onClick={() => openAccount("signup")}>
              Create account
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ip-page ac-page">
      <section className="ip-shell ac-body">
        <div className="ac-card ac-profile">
          <span className="ac-avatar ac-avatar--big" aria-hidden="true">
            {(account.name || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <h1>{account.name}</h1>
            {account.phone && <p>WhatsApp {localPhone(account.phone)}</p>}
            {account.email && <p>{account.email}</p>}
            {account.google && <p className="ac-badge">Signed in with Google</p>}
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <h2>🎤 My interview topics</h2>
            <Link to="/interviews">Browse</Link>
          </div>
          {topics === null ? (
            <p className="ip-muted">Loading…</p>
          ) : topics.length ? (
            <ul className="ac-list">
              {topics.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong>
                  <span>{t.count} questions · unlocked</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ip-muted">No topics yet. Unlock one and it will show here.</p>
          )}
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <h2>🧾 My bill payments</h2>
            <Link to="/bills">Pay a bill</Link>
          </div>
          {payments === null ? (
            <p className="ip-muted">Loading…</p>
          ) : payments.length ? (
            <ul className="ac-list">
              {payments.map((p) => (
                <li key={p.reference}>
                  <strong>{p.billerName}</strong>
                  <span>
                    {money(p.amount, p.currency)} · {p.member} ·{" "}
                    {p.state === "delivered" ? "Paid" : p.state === "pending" ? "Processing" : "Not completed"} ·{" "}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  {p.vouchers?.map((v, i) => (
                    <code key={i}>{v.code || v.pin}</code>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ip-muted">No payments yet.</p>
          )}
        </div>

        <button
          type="button"
          className="ip-btn ip-btn--ghost ac-signout"
          onClick={() => {
            signOut();
            navigate("/");
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
