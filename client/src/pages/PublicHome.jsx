import React, { Suspense, lazy } from "react";
import { Link, useLocation } from "react-router-dom";
import Loader from "../components/Loader";
import "../resourses/interview-practice.css";

const InterviewPractice = lazy(() => import("./InterviewPractice"));
const PublicBusBooking = lazy(() => import("./PublicBusBooking"));

// Public landing page: Interview practice | Bus booking.
//   /             -> Interviews (or Bus booking when coming back from a Tenda payment)
//   /interviews   -> Interviews
//   /bus-booking  -> Bus booking
// /tenda still opens the bus booking page on its own.
export default function PublicHome() {
  const { pathname, search } = useLocation();
  const tendaReturn = new URLSearchParams(search).get("paymentReturn") === "1";
  const tab = pathname.startsWith("/bus-booking") || (pathname === "/" && tendaReturn) ? "bus" : "interviews";

  return (
    <div className="ph-page">
      <nav className="ph-tabs" aria-label="Services">
        <div className="ph-tabs-inner">
          <span className="ph-brand">
            OnHighTech<small>Solutions</small>
          </span>
          <div className="ph-tablist" role="tablist">
            <Link to="/interviews" role="tab" aria-selected={tab === "interviews"}>
              Interview practice
            </Link>
            <Link to="/bus-booking" role="tab" aria-selected={tab === "bus"}>
              Bus booking
            </Link>
          </div>
        </div>
      </nav>
      <Suspense fallback={<Loader />}>
        {tab === "bus" ? <PublicBusBooking /> : <InterviewPractice />}
      </Suspense>
    </div>
  );
}
