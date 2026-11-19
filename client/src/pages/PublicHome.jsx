import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Loader from "../components/Loader";
import WhatsAppIcon from "../components/WhatsAppIcon";
import AccountDialog from "../components/AccountDialog";
import { openAccount, signOut, useAccount } from "../lib/account";
import "../resourses/account.css";
import "../resourses/interview-practice.css";

const InterviewPractice = lazy(() => import("./InterviewPractice"));
const PublicBusBooking = lazy(() => import("./PublicBusBooking"));
const BillsPayments = lazy(() => import("./BillsPayments"));
const BillCheckout = lazy(() => import("./BillsPayments").then((m) => ({ default: m.BillCheckout })));
const MyAccount = lazy(() => import("./MyAccount"));

// Header: "Sign in" when signed out; the customer's initial and a small menu when signed in.
function AccountButton() {
  const account = useAccount();
  const [menu, setMenu] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => box.current && !box.current.contains(e.target) && setMenu(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);
  if (!account) {
    return (
      <button type="button" className="ph-account" onClick={() => openAccount("signin")}>
        <span aria-hidden="true">👤</span>
        <span className="ph-account-label">Sign in</span>
      </button>
    );
  }
  return (
    <div className="ph-account-wrap" ref={box}>
      <button
        type="button"
        className="ph-account is-signed-in"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={`Account: ${account.name}`}
        onClick={() => setMenu((m) => !m)}
      >
        {(account.name || "?").trim().charAt(0).toUpperCase()}
      </button>
      {menu && (
        <div className="ph-account-menu" role="menu">
          <p>
            <strong>{account.name}</strong>
            <span>{account.email || account.display}</span>
          </p>
          <Link to="/account" role="menuitem" onClick={() => setMenu(false)}>
            My account
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// OnHighTech Solutions on WhatsApp: one number for every solution (0781576825).
// Never the bus booking bot. Typing "interviews" opens the interview practice
// Flow; "Hi" opens the OnHighTech Solutions welcome.
const WHATSAPP_NUMBER = "263781576825";
const OPENING_TEXT = { interviews: "interviews" }; // other tabs: "Hi"
const whatsappLink = (tab) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(OPENING_TEXT[tab] || "Hi")}`;
const CHOICE_KEY = "onhigh_channel_chosen";

function choiceMade() {
  try {
    return window.localStorage.getItem(CHOICE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberChoice() {
  try {
    window.localStorage.setItem(CHOICE_KEY, "1");
  } catch {
    /* private mode: asked again next time */
  }
}

// First visit to the OnHighTech Solutions home page (any tab): a question in
// the middle of the screen, the page shrunk behind it. WhatsApp works on
// WhatsApp bundles; the website opens without data after this visit.
// Whichever is tapped is remembered.
function ChannelChoice({ onWeb, whatsapp }) {
  const webButton = useRef(null);
  useEffect(() => {
    webButton.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        rememberChoice();
        onWeb();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onWeb]);

  return (
    <div className="ph-choice-backdrop">
      <div className="ph-choice" role="dialog" aria-modal="true" aria-labelledby="ph-choice-title">
        <h2 id="ph-choice-title">How would you like to continue?</h2>
        <button
          ref={webButton}
          type="button"
          className="ph-choice-web"
          onClick={() => {
            rememberChoice();
            onWeb();
          }}
        >
          Continue using the website
        </button>
        <a className="ph-choice-wa" href={whatsapp} onClick={rememberChoice}>
          <WhatsAppIcon size={22} />
          No data? Use WhatsApp
        </a>
      </div>
    </div>
  );
}

// Bus booking tab is not live yet. When ready: delete BusComingSoon below and
// swap the commented line back in where the tabs are rendered (search "BUS LIVE").
function BusComingSoon() {
  return (
    <section className="ph-soon">
      <span className="ph-soon-icon" aria-hidden="true">🚌</span>
      <span className="ip-eyebrow">Bus booking</span>
      <h1>Coming soon</h1>
      <p>Book your bus seat online, right here. We are getting it ready for you.</p>
      <Link to="/interviews" className="ip-btn">Practise interview questions</Link>
    </section>
  );
}

// OnHighTech Solutions home page: one tab per solution (Interview practice,
// Bus booking, Bills & airtime, more to come).
//   /             -> Interviews (or Bus booking when coming back from a Tenda payment)
//   /interviews   -> Interviews
//   /bus-booking  -> Bus booking
//   /bills        -> Bills & airtime (every Paynow BillPay biller, grouped)
//   /bills/pay/X  -> checkout for biller X, full screen (Details -> Confirm -> Pay -> Done)
// /tenda still opens the bus booking page on its own.
export default function PublicHome() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const tendaReturn = params.get("paymentReturn") === "1";
  const accountPage = pathname.startsWith("/account");
  const tab = accountPage
    ? "account"
    : pathname.startsWith("/bills")
    ? "bills"
    : pathname.startsWith("/bus-booking") || (pathname === "/" && tendaReturn)
    ? "bus"
    : "interviews";
  // Coming back from a payment means they already chose the website.
  const [chosen, setChosen] = useState(
    () => choiceMade() || tendaReturn || params.get("interviewPayment") === "1"
  );
  const asking = !chosen;
  // Tapping the logo always lands on a fresh home page (closes an open topic too).
  const [homeVisit, setHomeVisit] = useState(0);
  const whatsapp = whatsappLink(tab);
  const checkout = pathname.startsWith("/bills/pay/")
    ? decodeURIComponent(pathname.slice("/bills/pay/".length).split("/")[0])
    : "";

  return (
    <div className={`ph-page${asking ? " is-asking" : ""}`}>
      {asking && <ChannelChoice onWeb={() => setChosen(true)} whatsapp={whatsapp} />}
      <div className="ph-behind" inert={asking ? "" : undefined} aria-hidden={asking || undefined}>
      {!checkout && (
      <nav className="ph-tabs" aria-label="Services">
        <div className="ph-tabs-inner">
          <Link to="/" className="ph-brand" onClick={() => setHomeVisit((n) => n + 1)} aria-label="OnHighTech Solutions home">
            OnHighTech<small>Solutions</small>
          </Link>
          <div className="ph-tablist" role="tablist">
            <Link to="/interviews" role="tab" aria-selected={tab === "interviews"}>
              <span className="ph-long">Interview practice</span>
              <span className="ph-short">Interviews</span>
            </Link>
            <Link to="/bus-booking" role="tab" aria-selected={tab === "bus"}>
              <span className="ph-long">Bus booking</span>
              <span className="ph-short">Bus</span>
            </Link>
            <Link to="/bills" role="tab" aria-selected={tab === "bills"}>
              <span className="ph-long">Bills &amp; airtime</span>
              <span className="ph-short">Bills</span>
            </Link>
          </div>
          <AccountButton />
          <a className="ph-wa-link" href={whatsapp} aria-label="Continue on WhatsApp">
            <WhatsAppIcon size={22} />
          </a>
        </div>
      </nav>
      )}
      <Suspense fallback={<Loader />}>
        {accountPage ? (
          <MyAccount />
        ) : checkout ? (
          <BillCheckout key={checkout} code={checkout} />
        ) : tab === "bills" ? (
          <BillsPayments />
        ) : tab === "bus" ? (
          // BUS LIVE: replace the next line with  <PublicBusBooking />
          // (a Tenda payment return still needs the real page to confirm the ticket)
          tendaReturn ? <PublicBusBooking /> : <BusComingSoon />
        ) : (
          <InterviewPractice key={`${pathname}-${homeVisit}`} />
        )}
      </Suspense>
      <AccountDialog />
      </div>
    </div>
  );
}
