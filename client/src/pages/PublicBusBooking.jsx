import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../resourses/public-booking.css";

const cities = [
  "Harare",
  "Bulawayo",
  "Gweru",
  "Masvingo",
  "Mutare",
  "Victoria Falls",
];

const buses = [
  {
    id: "ohb-101",
    operator: "OnHigh Executive",
    coach: "Luxury coach · 2 + 2 seating",
    departure: "07:30",
    arrival: "13:15",
    duration: "5h 45m",
    price: 28,
    seatsLeft: 12,
    boarding: "Roadport Terminal",
    amenities: ["Wi-Fi", "USB charging", "Air conditioning"],
    bookedSeats: [2, 5, 9, 10, 17, 25, 30],
  },
  {
    id: "ohb-205",
    operator: "OnHigh Express",
    coach: "Comfort coach · 2 + 2 seating",
    departure: "10:00",
    arrival: "16:20",
    duration: "6h 20m",
    price: 24,
    seatsLeft: 18,
    boarding: "Mbare Musika",
    amenities: ["USB charging", "Air conditioning"],
    bookedSeats: [1, 4, 7, 12, 13, 20],
  },
  {
    id: "ohb-310",
    operator: "OnHigh Nightliner",
    coach: "Executive coach · Extra legroom",
    departure: "18:30",
    arrival: "00:10",
    duration: "5h 40m",
    price: 30,
    seatsLeft: 9,
    boarding: "Roadport Terminal",
    amenities: ["Wi-Fi", "Reclining seats", "USB charging"],
    bookedSeats: [3, 6, 8, 11, 14, 16, 19, 22, 28],
  },
];

const popularRoutes = [
  { from: "Harare", to: "Bulawayo", time: "From 5h 40m" },
  { from: "Harare", to: "Mutare", time: "From 3h 30m" },
  { from: "Bulawayo", to: "Victoria Falls", time: "From 4h 45m" },
];

const Icon = ({ name, size = 20 }) => {
  const paths = {
    bus: <><rect x="3" y="4" width="18" height="14" rx="3"/><path d="M7 18v2m10-2v2M6 8h12M7 13h.01M17 13h.01"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    swap: <><path d="m7 7-4 4 4 4M3 11h14M17 3l4 4-4 4M21 7H7"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    ticket: <><path d="M2 9a3 3 0 0 0 0 6v4h20v-4a3 3 0 0 0 0-6V5H2v4Z"/><path d="M13 5v2m0 4v2m0 4v2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };

  return (
    <svg className="pb-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</g>
    </svg>
  );
};

const BusIllustration = () => (
  <svg className="pb-hero-art" viewBox="0 0 560 300" role="img" aria-label="OnHigh coach travelling through green hills">
    <defs>
      <linearGradient id="pbSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d9f5e9" />
        <stop offset="1" stopColor="#f7fbf9" />
      </linearGradient>
      <linearGradient id="pbBus" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#058359" />
        <stop offset="1" stopColor="#035e42" />
      </linearGradient>
    </defs>
    <rect width="560" height="300" rx="32" fill="url(#pbSky)" />
    <circle cx="450" cy="55" r="28" fill="#f4b860" opacity=".82" />
    <path d="M0 174C80 116 159 136 221 165c72 34 119 20 170-8 55-31 104-23 169 18v125H0Z" fill="#bce3cf" />
    <path d="M0 210c85-40 152-25 215 10 65 37 136 36 210-2 50-25 90-19 135 5v77H0Z" fill="#73b894" />
    <path d="M117 300c76-93 173-104 307-42" fill="none" stroke="#f8f4e8" strokeWidth="42" />
    <path d="M117 300c76-93 173-104 307-42" fill="none" stroke="#071a4d" strokeWidth="3" strokeDasharray="15 12" opacity=".5" />
    <g className="pb-bus-moving">
      <ellipse cx="342" cy="238" rx="100" ry="12" fill="#071a4d" opacity=".16" />
      <path d="M250 159h157c17 0 33 12 37 28l10 43H238v-55c0-9 5-16 12-16Z" fill="url(#pbBus)" />
      <path d="M269 170h126c14 0 25 8 29 20l4 13H269Z" fill="#d9f5e9" />
      <path d="M281 174v27m37-27v27m39-27v27m39-24v24" stroke="#071a4d" strokeWidth="3" opacity=".35" />
      <path d="M238 213h216v17H238Z" fill="#AC4425" />
      <circle cx="283" cy="231" r="17" fill="#071a4d" /><circle cx="283" cy="231" r="7" fill="#dde4ef" />
      <circle cx="414" cy="231" r="17" fill="#071a4d" /><circle cx="414" cy="231" r="7" fill="#dde4ef" />
      <text x="285" y="219" fill="white" fontSize="12" fontWeight="700">ONHIGH BUS</text>
    </g>
  </svg>
);

const toLocalDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayDate = new Date();
const nextWeekDate = new Date(todayDate);
nextWeekDate.setDate(nextWeekDate.getDate() + 7);
const today = toLocalDateInputValue(todayDate);
const nextWeek = toLocalDateInputValue(nextWeekDate);

function PublicBusBooking() {
  const [from, setFrom] = useState("Harare");
  const [to, setTo] = useState("Bulawayo");
  const [journeyDate, setJourneyDate] = useState(nextWeek);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeBus, setActiveBus] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [message, setMessage] = useState("");
  const resultsRef = useRef(null);

  const readableDate = useMemo(() => {
    if (!journeyDate) return "Choose a travel date";
    const parsedDate = new Date(`${journeyDate}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return "Choose a travel date";
    return new Intl.DateTimeFormat("en-ZW", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(parsedDate);
  }, [journeyDate]);

  const swapCities = () => {
    setFrom(to);
    setTo(from);
  };

  const searchBuses = (event) => {
    event.preventDefault();
    setMessage("");
    if (!journeyDate) {
      setMessage("Choose a travel date before searching for a trip.");
      return;
    }
    if (from === to) {
      setMessage("Choose two different cities to search for a trip.");
      return;
    }

    setIsSearching(true);
    setActiveBus(null);
    setSelectedSeats([]);
    window.setTimeout(() => {
      setIsSearching(false);
      setHasSearched(true);
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }, 700);
  };

  const openSeats = (busId) => {
    setActiveBus((current) => (current === busId ? null : busId));
    setSelectedSeats([]);
    setMessage("");
  };

  const toggleSeat = (seat, bookedSeats) => {
    if (bookedSeats.includes(seat)) return;
    setSelectedSeats((current) =>
      current.includes(seat) ? current.filter((item) => item !== seat) : [...current, seat].sort((a, b) => a - b)
    );
  };

  const choosePopularRoute = (route) => {
    setFrom(route.from);
    setTo(route.to);
    document.querySelector(".pb-search-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="public-booking-page">
      <header className="pb-header">
        <div className="pb-shell pb-header-inner">
          <a className="pb-brand" href="#top" aria-label="OnHigh Bus home">
            <span className="pb-brand-mark"><Icon name="bus" size={24} /></span>
            <span><strong>OnHigh</strong><small>BUS</small></span>
          </a>
          <nav className="pb-nav" aria-label="Public booking navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#popular-routes">Popular routes</a>
            <Link className="pb-login-link" to="/login"><Icon name="user" size={18} /> Login</Link>
          </nav>
        </div>
      </header>

      <section className="pb-hero" id="top">
        <div className="pb-shell pb-hero-grid">
          <div className="pb-hero-copy">
            <span className="pb-eyebrow"><span /> Simple journeys start here</span>
            <h1>Where will the road take you next?</h1>
            <p>Search, compare and reserve your bus seat in a few easy steps.</p>
            <div className="pb-trust-row">
              <span><Icon name="shield" size={18} /> Secure booking</span>
              <span><Icon name="ticket" size={18} /> Instant ticket</span>
            </div>
          </div>
          <BusIllustration />
        </div>

        <form className="pb-search-card" onSubmit={searchBuses} aria-label="Search buses">
          <div className="pb-field">
            <label htmlFor="pb-from">From</label>
            <span className="pb-field-control"><Icon name="pin" /><select id="pb-from" value={from} onChange={(event) => setFrom(event.target.value)}>{cities.map((city) => <option key={city}>{city}</option>)}</select></span>
          </div>
          <button className="pb-swap" type="button" onClick={swapCities} aria-label="Swap departure and destination"><Icon name="swap" size={19} /></button>
          <div className="pb-field">
            <label htmlFor="pb-to">To</label>
            <span className="pb-field-control"><Icon name="pin" /><select id="pb-to" value={to} onChange={(event) => setTo(event.target.value)}>{cities.map((city) => <option key={city}>{city}</option>)}</select></span>
          </div>
          <div className="pb-field pb-date-field">
            <label htmlFor="pb-date">Travel date</label>
            <span className="pb-field-control"><Icon name="calendar" /><input id="pb-date" type="date" min={today} value={journeyDate} required onChange={(event) => setJourneyDate(event.target.value)} /></span>
          </div>
          <button className="pb-search-button" type="submit" disabled={isSearching}>
            {isSearching ? <><span className="pb-spinner" /> Finding buses</> : <>Search buses <Icon name="arrow" size={18} /></>}
          </button>
          {message && <p className="pb-form-message" role="alert">{message}</p>}
        </form>
      </section>

      {hasSearched && (
        <section className="pb-results-section" ref={resultsRef} aria-live="polite">
          <div className="pb-shell">
            <div className="pb-results-heading">
              <div><span className="pb-section-label">Available trips</span><h2>{from} <span>→</span> {to}</h2><p>{readableDate} · {buses.length} buses found</p></div>
              <button type="button" onClick={() => document.querySelector(".pb-search-card")?.scrollIntoView({ behavior: "smooth" })}>Modify search</button>
            </div>

            <div className="pb-results-list">
              {buses.map((bus, index) => {
                const isOpen = activeBus === bus.id;
                return (
                  <article className={`pb-bus-card ${isOpen ? "is-open" : ""}`} key={bus.id} style={{ "--delay": `${index * 90}ms` }}>
                    <div className="pb-bus-summary">
                      <div className="pb-operator"><span className="pb-operator-icon"><Icon name="bus" size={23} /></span><div><h3>{bus.operator}</h3><p>{bus.coach}</p></div></div>
                      <div className="pb-time"><strong>{bus.departure}</strong><span><Icon name="clock" size={14} /> {bus.duration}</span><strong>{bus.arrival}</strong></div>
                      <div className="pb-route-line"><span>{from}</span><i /><span>{to}</span></div>
                      <div className="pb-amenities">{bus.amenities.map((amenity) => <span key={amenity}><Icon name="check" size={14} /> {amenity}</span>)}</div>
                      <div className="pb-price"><span>From</span><strong>US${bus.price}</strong><small>{bus.seatsLeft} seats left</small></div>
                      <button className="pb-view-seats" type="button" onClick={() => openSeats(bus.id)} aria-expanded={isOpen}>{isOpen ? "Hide seats" : "View seats"}</button>
                    </div>

                    {isOpen && (
                      <div className="pb-seat-panel">
                        <div className="pb-seat-picker">
                          <div className="pb-seat-heading"><div><span className="pb-section-label">Choose seats</span><h3>Front of bus</h3></div><div className="pb-seat-legend"><span><i className="available" /> Available</span><span><i className="selected" /> Selected</span><span><i className="booked" /> Booked</span></div></div>
                          <div className="pb-coach">
                            <div className="pb-driver" aria-label="Driver position">Driver</div>
                            <div className="pb-seat-rows">
                              {Array.from({ length: 8 }, (_, row) => (
                                <div className="pb-seat-row" key={row}>
                                  {[1, 2, 3, 4].map((position) => {
                                    const seat = row * 4 + position;
                                    const isBooked = bus.bookedSeats.includes(seat);
                                    const isSelected = selectedSeats.includes(seat);
                                    return <React.Fragment key={seat}>{position === 3 && <span className="pb-aisle" aria-hidden="true" />}<button type="button" className={`pb-seat ${isBooked ? "is-booked" : ""} ${isSelected ? "is-selected" : ""}`} disabled={isBooked} onClick={() => toggleSeat(seat, bus.bookedSeats)} aria-label={`Seat ${seat}${isBooked ? ", booked" : isSelected ? ", selected" : ", available"}`} aria-pressed={isSelected}>{seat}</button></React.Fragment>;
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <aside className="pb-fare-card">
                          <span className="pb-section-label">Your journey</span>
                          <h3>{from} <span>→</span> {to}</h3>
                          <p>{readableDate} · {bus.departure}</p>
                          <dl><div><dt>Boarding</dt><dd>{bus.boarding}</dd></div><div><dt>Selected seats</dt><dd>{selectedSeats.length ? selectedSeats.join(", ") : "None"}</dd></div><div><dt>Ticket fare</dt><dd>US${bus.price} × {selectedSeats.length}</dd></div></dl>
                          <div className="pb-total"><span>Total</span><strong>US${bus.price * selectedSeats.length}</strong></div>
                          <button type="button" className="pb-continue" disabled={!selectedSeats.length} onClick={() => setMessage("Passenger details and payment will be connected in the next phase.")}>Continue</button>
                          <small><Icon name="shield" size={15} /> No payment is taken in this UI preview.</small>
                        </aside>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {message && <div className="pb-notice" role="status">{message}</div>}
          </div>
        </section>
      )}

      <section className="pb-how" id="how-it-works">
        <div className="pb-shell">
          <span className="pb-section-label">Easy from start to finish</span>
          <h2>Book your next trip in three steps</h2>
          <div className="pb-steps">
            <article><span>01</span><div className="pb-step-icon"><Icon name="pin" size={24} /></div><h3>Search your route</h3><p>Choose where you are leaving from, your destination and travel date.</p></article>
            <article><span>02</span><div className="pb-step-icon"><Icon name="bus" size={24} /></div><h3>Pick a bus & seat</h3><p>Compare departure times and choose the seat that suits you.</p></article>
            <article><span>03</span><div className="pb-step-icon"><Icon name="ticket" size={24} /></div><h3>Get your ticket</h3><p>Complete your details and receive your booking confirmation instantly.</p></article>
          </div>
        </div>
      </section>

      <section className="pb-popular" id="popular-routes">
        <div className="pb-shell">
          <div className="pb-section-heading"><div><span className="pb-section-label">Travel inspiration</span><h2>Popular routes</h2></div><p>Start with one of our most travelled routes.</p></div>
          <div className="pb-route-cards">
            {popularRoutes.map((route) => <button type="button" key={`${route.from}-${route.to}`} onClick={() => choosePopularRoute(route)}><span className="pb-route-icon"><Icon name="bus" size={22} /></span><span><strong>{route.from} <b>→</b> {route.to}</strong><small>{route.time}</small></span><Icon name="arrow" size={18} /></button>)}
          </div>
        </div>
      </section>

      <footer className="pb-footer">
        <div className="pb-shell pb-footer-inner"><div className="pb-brand pb-brand--footer"><span className="pb-brand-mark"><Icon name="bus" size={24} /></span><span><strong>OnHigh</strong><small>BUS</small></span></div><p>Making every journey feel simple.</p><span>© {new Date().getFullYear()} OnHigh Bus</span></div>
      </footer>
    </main>
  );
}

export default PublicBusBooking;
