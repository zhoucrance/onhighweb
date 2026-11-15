import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Loader from "../components/Loader";
import WhatsAppIcon from "../components/WhatsAppIcon";
import "../resourses/interview-practice.css";

const InterviewPractice = lazy(() => import("./InterviewPractice"));
const PublicBusBooking = lazy(() => import("./PublicBusBooking"));

// OnHighTech Solutions on WhatsApp. Each solution can have its own number and
// opening message (add new solutions here). Typing "interviews" to the careers
// bot opens the interview practice Flow.
const MAIN_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || "263781576825";
const SOLUTIONS = {
  interviews: { whatsapp: MAIN_WHATSAPP, text: "interviews" },
  bus: { whatsapp: import.meta.env.VITE_BUS_WHATSAPP_NUMBER || MAIN_WHATSAPP, text: "Hi" },
};
const whatsappLink = (tab) => {
  const s = SOLUTIONS[tab] || SOLUTIONS.interviews;
  return `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(s.text)}`;
};
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

// OnHighTech Solutions home page: one tab per solution (Interview practice,
// Bus booking, more to come).
//   /             -> Interviews (or Bus booking when coming back from a Tenda payment)
//   /interviews   -> Interviews
//   /bus-booking  -> Bus booking
// /tenda still opens the bus booking page on its own.
export default function PublicHome() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const tendaReturn = params.get("paymentReturn") === "1";
  const tab = pathname.startsWith("/bus-booking") || (pathname === "/" && tendaReturn) ? "bus" : "interviews";
  // Coming back from a payment means they already chose the website.
  const [chosen, setChosen] = useState(
    () => choiceMade() || tendaReturn || params.get("interviewPayment") === "1"
  );
  const asking = !chosen;
  const whatsapp = whatsappLink(tab);

  return (
    <div className={`ph-page${asking ? " is-asking" : ""}`}>
      {asking && <ChannelChoice onWeb={() => setChosen(true)} whatsapp={whatsapp} />}
      <div className="ph-behind" inert={asking ? "" : undefined} aria-hidden={asking || undefined}>
      <nav className="ph-tabs" aria-label="Services">
        <div className="ph-tabs-inner">
          <span className="ph-brand">
            OnHighTech<small>Solutions</small>
          </span>
          <div className="ph-tablist" role="tablist">
            <Link to="/interviews" role="tab" aria-selected={tab === "interviews"}>
              <span className="ph-long">Interview practice</span>
              <span className="ph-short">Interviews</span>
            </Link>
            <Link to="/bus-booking" role="tab" aria-selected={tab === "bus"}>
              Bus booking
            </Link>
          </div>
          <a className="ph-wa-link" href={whatsapp} aria-label="Continue on WhatsApp">
            <WhatsAppIcon size={22} />
          </a>
        </div>
      </nav>
      <Suspense fallback={<Loader />}>
        {tab === "bus" ? <PublicBusBooking /> : <InterviewPractice />}
      </Suspense>
      </div>
    </div>
  );
}
