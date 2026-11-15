import React, { Suspense, lazy, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Loader from "../components/Loader";
import WhatsAppIcon from "../components/WhatsAppIcon";
import "../resourses/interview-practice.css";

const InterviewPractice = lazy(() => import("./InterviewPractice"));
const PublicBusBooking = lazy(() => import("./PublicBusBooking"));

// The careers bot on WhatsApp; typing "interviews" there opens the practice Flow.
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "263781576825";
export const WHATSAPP_INTERVIEWS = `https://wa.me/${WHATSAPP_NUMBER}?text=interviews`;
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

// First visit only: WhatsApp (works on WhatsApp bundles) or the website.
function ChannelChoice({ onWeb }) {
  return (
    <section className="ph-choice" aria-labelledby="ph-choice-title">
      <div className="ph-choice-card">
        <span className="ip-eyebrow">Interview practice</span>
        <h1 id="ph-choice-title">Where would you like to practise?</h1>
        <p>Same questions and answers in both. Topics you unlock work in both too.</p>

        <a className="ph-choice-wa" href={WHATSAPP_INTERVIEWS} onClick={rememberChoice}>
          <WhatsAppIcon size={28} />
          <span>
            <strong>Continue on WhatsApp</strong>
            <small>Uses your WhatsApp bundle</small>
          </span>
        </a>

        <button
          type="button"
          className="ph-choice-web"
          onClick={() => {
            rememberChoice();
            onWeb();
          }}
        >
          <strong>Continue on the website</strong>
          <small>After this first visit it opens without data</small>
        </button>
      </div>
    </section>
  );
}

// Public landing page: Interview practice | Bus booking.
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
  const [chosen, setChosen] = useState(() => choiceMade() || params.get("interviewPayment") === "1");

  if (tab === "interviews" && !chosen) {
    return (
      <div className="ph-page">
        <ChannelChoice onWeb={() => setChosen(true)} />
      </div>
    );
  }

  return (
    <div className="ph-page">
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
          {tab === "interviews" && (
            <a className="ph-wa-link" href={WHATSAPP_INTERVIEWS} aria-label="Practise on WhatsApp">
              <WhatsAppIcon size={22} />
            </a>
          )}
        </div>
      </nav>
      <Suspense fallback={<Loader />}>
        {tab === "bus" ? <PublicBusBooking /> : <InterviewPractice />}
      </Suspense>
    </div>
  );
}
