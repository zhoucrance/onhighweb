import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PbSearchableSelect from "../components/PbSearchableSelect";
import PbDatePicker from "../components/PbDatePicker";
import PbBookingSheet from "../components/PbBookingSheet";
import "../resourses/public-booking.css";

const corridorStops = [
  { name: "Harare", farePoint: 0, minutePoint: 0 },
  { name: "Marondera", farePoint: 3, minutePoint: 75 },
  { name: "Rusape", farePoint: 5, minutePoint: 170 },
  { name: "Mutare", farePoint: 10, minutePoint: 240 },
];

const cities = corridorStops.map((stop) => stop.name);

const buses = [
  {
    id: "ohb-101",
    operator: "Tenda Executive",
    coach: "Check Yo Time coach - 2 + 2 seating",
    departure: "06:00",
    fareAdjustment: 0,
    seatsLeft: 12,
    boarding: "Roadport Terminal",
    amenities: ["Wi-Fi", "USB charging", "Air conditioning"],
    bookedSeats: [2, 5, 9, 10, 17, 25, 30],
  },
  {
    id: "ohb-205",
    operator: "Tenda Express",
    coach: "Comfort coach - 2 + 2 seating",
    departure: "09:30",
    fareAdjustment: 0,
    seatsLeft: 18,
    boarding: "Mbare Musika",
    amenities: ["USB charging", "Air conditioning"],
    bookedSeats: [1, 4, 7, 12, 13, 20],
  },
  {
    id: "ohb-310",
    operator: "Tenda Nightliner",
    coach: "Executive coach - extra legroom",
    departure: "17:45",
    fareAdjustment: 1,
    seatsLeft: 9,
    boarding: "Roadport Terminal",
    amenities: ["Wi-Fi", "Reclining seats", "USB charging"],
    bookedSeats: [3, 6, 8, 11, 14, 16, 19, 22, 28],
  },
];

const popularRoutes = [
  { from: "Harare", to: "Mutare", time: "US$10 - about 4h" },
  { from: "Harare", to: "Rusape", time: "US$5 - about 2h 50m" },
  { from: "Mutare", to: "Marondera", time: "US$7 - about 2h 45m" },
];

const Icon = ({ name, size = 20 }) => {
  const paths = {
    bus: <><rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M3 10h18"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/></>,
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
  <svg className="pb-hero-art" viewBox="0 0 560 300" role="img" aria-label="Animated coach travelling from Harare to Mutare">
    <defs>
      <linearGradient id="pbSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dff6ff" />
        <stop offset="1" stopColor="#f8fbfd" />
      </linearGradient>
      <linearGradient id="pbBus" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e5eef5" />
      </linearGradient>
    </defs>
    <rect width="560" height="300" rx="32" fill="url(#pbSky)" />
    <circle cx="450" cy="55" r="28" fill="#f0b429" opacity=".82" />
    <path d="M0 174C80 116 159 136 221 165c72 34 119 20 170-8 55-31 104-23 169 18v125H0Z" fill="#b9e6f7" />
    <path d="M0 210c85-40 152-25 215 10 65 37 136 36 210-2 50-25 90-19 135 5v77H0Z" fill="#72c4e5" />
    <path d="M117 300c76-93 173-104 307-42" fill="none" stroke="#f8f4e8" strokeWidth="42" />
    <path d="M117 300c76-93 173-104 307-42" fill="none" stroke="#071b3d" strokeWidth="3" strokeDasharray="15 12" opacity=".5" />
    <g className="pb-bus-moving">
      <ellipse cx="342" cy="238" rx="100" ry="12" fill="#071b3d" opacity=".16" />
      <path d="M250 159h157c17 0 33 12 37 28l10 43H238v-55c0-9 5-16 12-16Z" fill="url(#pbBus)" stroke="#cddce8" strokeWidth="2" />
      <path d="M269 170h126c14 0 25 8 29 20l4 13H269Z" fill="#071b3d" />
      <path d="M281 174v27m37-27v27m39-27v27m39-24v24" stroke="#128fca" strokeWidth="3" opacity=".45" />
      <path d="M238 213h216v17H238Z" fill="#f0b429" />
      <circle cx="283" cy="231" r="17" fill="#071b3d" /><circle cx="283" cy="231" r="7" fill="#dde4ef" />
      <circle cx="414" cy="231" r="17" fill="#071b3d" /><circle cx="414" cy="231" r="7" fill="#dde4ef" />
      <text x="305" y="219" fill="#128fca" fontSize="12" fontWeight="700">TENDA</text>
    </g>
  </svg>
);

const toLocalDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStop = (city) => corridorStops.find((stop) => stop.name === city);

const addMinutes = (time, minutes) => {
  const [hours, mins] = String(time).split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const getRouteMinutes = (fromCity, toCity) =>
  Math.abs((getStop(toCity)?.minutePoint || 0) - (getStop(fromCity)?.minutePoint || 0));

const getRouteFare = (fromCity, toCity) =>
  Math.abs((getStop(toCity)?.farePoint || 0) - (getStop(fromCity)?.farePoint || 0));

const formatTripDuration = (fromCity, toCity) => {
  const minutes = getRouteMinutes(fromCity, toCity);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours ? `${hours}h` : ""}${hours && mins ? " " : ""}${mins ? `${mins}m` : ""}`;
};

const todayDate = new Date();
const nextWeekDate = new Date(todayDate);
nextWeekDate.setDate(nextWeekDate.getDate() + 7);
const today = toLocalDateInputValue(todayDate);
const nextWeek = toLocalDateInputValue(nextWeekDate);

function PublicBusBooking() {
  const [from, setFrom] = useState("Harare");
  const [to, setTo] = useState("Mutare");
  const [journeyDate, setJourneyDate] = useState(nextWeek);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeBus, setActiveBus] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [message, setMessage] = useState("");
  const [returnedPayment, setReturnedPayment] = useState({ status: "idle", ticket: null, message: "" });
  const resultsRef = useRef(null);

  const destinationOptions = useMemo(() => cities.filter((city) => city !== from), [from]);

  useEffect(() => {
    if (from !== to) return;
    setTo(cities.find((city) => city !== from) || "");
  }, [from, to]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentReference =
      params.get("tendaPaymentReference") || window.sessionStorage.getItem("tendaPaymentReference");
    if (!paymentReference || params.get("paymentReturn") !== "1") return;

    setReturnedPayment({ status: "checking", ticket: null, message: "Checking your payment..." });
    const checkReturnedPayment = async () => {
      try {
        const response = await fetch(`/api/tenda-demo/payment/status/${encodeURIComponent(paymentReference)}`);
        const text = await response.text();
        const result = text ? JSON.parse(text) : {};
        if (!response.ok || !result.success) throw new Error(result.message || "Payment could not be checked.");
        if (result.data?.paid && result.data.ticket) {
          window.sessionStorage.removeItem("tendaPaymentReference");
          setReturnedPayment({
            status: "paid",
            ticket: result.data.ticket,
            message: "Payment successful. Your ticket is ready.",
          });
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        setReturnedPayment({
          status: result.data?.failed ? "failed" : "pending",
          ticket: null,
          message: result.data?.failed
            ? "Payment was not completed."
            : "Payment is still pending. If you have paid, refresh this page in a moment.",
        });
      } catch (error) {
        setReturnedPayment({ status: "failed", ticket: null, message: error.message || "Payment could not be checked." });
      }
    };

    checkReturnedPayment();
  }, []);

  const preparedBuses = useMemo(() => {
    const routeMinutes = getRouteMinutes(from, to);
    const routeFare = getRouteFare(from, to);
    return buses.map((bus) => ({
      ...bus,
      arrival: addMinutes(bus.departure, routeMinutes),
      duration: formatTripDuration(from, to),
      price: Math.max(1, routeFare + bus.fareAdjustment),
    }));
  }, [from, to]);

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
      setMessage("Choose two different stops to search for a trip.");
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
    setActiveBus(busId);
    setSelectedSeats([]);
    setMessage("");
  };

  const closeSheet = () => setActiveBus(null);

  const activeBusDetails = useMemo(
    () => preparedBuses.find((bus) => bus.id === activeBus) || null,
    [activeBus, preparedBuses]
  );

  const toggleSeat = (seat) => {
    if (activeBusDetails?.bookedSeats.includes(seat)) return;
    setSelectedSeats((current) =>
      current.includes(seat) ? current.filter((item) => item !== seat) : [...current, seat].sort((a, b) => a - b)
    );
  };

  const confirmBooking = (details) => {
    setActiveBus(null);
    setMessage(
      `PesePay approved through ${details.paymentCompany || "Tenda Executive"} for US$${
        details.paymentAmount || "0.05"
      }. Ticket ${details.ticketNumber} generated for ${details.contact.name || "your trip"} - seat${
        details.seats.length > 1 ? "s" : ""
      } ${details.seats.join(", ")} - pickup at ${details.pickupPoint?.name}.`
    );
  };

  const handleSessionExpired = (sessionMessage) => {
    setActiveBus(null);
    setMessage(sessionMessage || "Payment session timed out. Please start the booking again.");
    document.querySelector(".pb-search-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const choosePopularRoute = (route) => {
    setFrom(route.from);
    setTo(route.to);
    document.querySelector(".pb-search-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goToHome = () => {
    window.sessionStorage.removeItem("tendaPaymentReference");
    window.history.replaceState({}, "", window.location.pathname);
    setReturnedPayment({ status: "idle", ticket: null, message: "" });
  };

  // Dedicated ticket page: when returning from payment, show only the ticket,
  // not the whole home page behind it.
  if (returnedPayment.status !== "idle") {
    const t = returnedPayment.ticket;
    const ticketId = t?.ticketNumber || t?.ticket_number;
    return (
      <main className="public-booking-page pb-ticket-page">
        <header className="pb-header">
          <div className="pb-shell pb-header-inner">
            <button type="button" className="pb-brand pb-brand--button" onClick={goToHome} aria-label="Back to home">
              <span className="pb-brand-mark"><Icon name="bus" size={24} /></span>
              <span><strong>Tenda</strong><small>BUS</small></span>
            </button>
            <nav className="pb-nav" aria-label="Ticket navigation">
              <button type="button" className="pb-login-link" onClick={goToHome}>
                <Icon name="arrow" size={18} /> Book another
              </button>
            </nav>
          </div>
        </header>

        <section className="pb-ticket-view" aria-live="polite">
          <div className="pb-shell">
            <div className={`pb-ticket-view-card is-${returnedPayment.status}`}>
              <span className="pb-section-label">
                {returnedPayment.status === "paid" ? "Your ticket" : "Payment return"}
              </span>
              <h1>{returnedPayment.message}</h1>

              {t ? (
                <article className="pb-ticket-doc">
                  <header>
                    <div><strong>{t.bus_name}</strong><small>{t.route}</small></div>
                    <span className="pb-ticket-ref">{ticketId}</span>
                  </header>
                  <dl>
                    <div><dt>Passenger</dt><dd>{t.passenger_name}</dd></div>
                    <div><dt>Phone</dt><dd>{t.phone}</dd></div>
                    <div><dt>Date</dt><dd>{t.date}</dd></div>
                    <div><dt>Time</dt><dd>{t.time}</dd></div>
                    <div><dt>Seat</dt><dd>{t.seat}</dd></div>
                    <div><dt>Boarding</dt><dd>{t.boarding_point}</dd></div>
                    <div><dt>Drop-off</dt><dd>{t.drop_off_point}</dd></div>
                    <div><dt>Amount</dt><dd>{t.amount}</dd></div>
                    <div><dt>Payment</dt><dd>{t.payment_method}</dd></div>
                  </dl>
                  <footer>
                    <a className="pb-ticket-btn" href={`/api/tenda-demo/ticket/${encodeURIComponent(ticketId)}.pdf`} target="_blank" rel="noreferrer">View ticket (PDF)</a>
                    <a className="pb-ticket-btn pb-ticket-btn--outline" href={`/api/tenda-demo/ticket/${encodeURIComponent(ticketId)}.pdf?download=1`} target="_blank" rel="noreferrer">Download</a>
                  </footer>
                </article>
              ) : (
                <div className="pb-ticket-pending">
                  {returnedPayment.status === "checking" && <span className="pb-spinner" />}
                  <button type="button" className="pb-ticket-btn" onClick={goToHome}>Back to home</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="pb-footer">
          <div className="pb-shell pb-footer-inner">
            <div className="pb-brand pb-brand--footer"><span className="pb-brand-mark"><Icon name="bus" size={24} /></span><span><strong>Tenda</strong><small>BUS</small></span></div>
            <p>Making every journey feel simple.</p>
            <span>(c) {new Date().getFullYear()} Tenda Bus</span>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="public-booking-page">
      <header className="pb-header">
        <div className="pb-shell pb-header-inner">
          <a className="pb-brand" href="#top" aria-label="Tenda Bus home">
            <span className="pb-brand-mark"><Icon name="bus" size={24} /></span>
            <span><strong>Tenda</strong><small>BUS</small></span>
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
            <span className="pb-eyebrow"><span /> Book a seat</span>
            <h1>Tenda</h1>
            <p>Harare - Mutare daily trips.</p>
            <div className="pb-trust-row">
              <span><Icon name="shield" size={18} /> Safe</span>
              <span><Icon name="ticket" size={18} /> Ticket</span>
            </div>
          </div>
          <BusIllustration />
        </div>

        <form className="pb-search-card" onSubmit={searchBuses} aria-label="Search buses">
          <div className="pb-field">
            <label htmlFor="pb-from">From</label>
            <span className="pb-field-control">
              <Icon name="pin" />
              <PbSearchableSelect
                id="pb-from"
                value={from}
                options={cities}
                onChange={setFrom}
                placeholder="Departure stop"
                searchPlaceholder="Search departure stop..."
              />
            </span>
          </div>
          <button className="pb-swap" type="button" onClick={swapCities} aria-label="Swap departure and destination"><Icon name="swap" size={19} /></button>
          <div className="pb-field">
            <label htmlFor="pb-to">To</label>
            <span className="pb-field-control">
              <Icon name="pin" />
              <PbSearchableSelect
                id="pb-to"
                value={to}
                options={destinationOptions}
                onChange={setTo}
                align="end"
                placeholder="Destination stop"
                searchPlaceholder="Search destination..."
              />
            </span>
          </div>
          <div className="pb-field pb-date-field">
            <label htmlFor="pb-date">Travel date</label>
            <span className="pb-field-control">
              <Icon name="calendar" />
              <PbDatePicker
                id="pb-date"
                value={journeyDate}
                min={today}
                onChange={setJourneyDate}
                placeholder="Choose a travel date"
              />
            </span>
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
              <div><span className="pb-section-label">Available trips</span><h2>{from} <span>to</span> {to}</h2><p>{readableDate} - {preparedBuses.length} Tenda buses found</p></div>
              <button type="button" onClick={() => document.querySelector(".pb-search-card")?.scrollIntoView({ behavior: "smooth" })}>Modify search</button>
            </div>

            <div className="pb-results-list">
              {preparedBuses.map((bus, index) => {
                const isOpen = activeBus === bus.id;
                return (
                  <article className={`pb-bus-card ${isOpen ? "is-open" : ""}`} key={bus.id} style={{ "--delay": `${index * 90}ms` }}>
                    <div className="pb-bus-summary">
                      <div className="pb-operator"><span className="pb-operator-icon"><Icon name="bus" size={23} /></span><div><h3>{bus.operator}</h3><p>{bus.coach}</p></div></div>
                      <div className="pb-time"><strong>{bus.departure}</strong><span><Icon name="clock" size={14} /> {bus.duration}</span><strong>{bus.arrival}</strong></div>
                      <div className="pb-route-line"><span>{from}</span><i /><span>{to}</span></div>
                      <div className="pb-amenities">{bus.amenities.map((amenity) => <span key={amenity}><Icon name="check" size={14} /> {amenity}</span>)}</div>
                      <div className="pb-price"><span>From</span><strong>US${bus.price}</strong><small>{bus.seatsLeft} seats left</small></div>
                      <button className="pb-view-seats" type="button" onClick={() => openSeats(bus.id)} aria-haspopup="dialog">View seats</button>
                    </div>
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
          <h2>Book in three steps</h2>
          <div className="pb-steps">
            <article><span>01</span><div className="pb-step-icon"><Icon name="pin" size={24} /></div><h3>Route</h3><p>Choose your stops and date.</p></article>
            <article><span>02</span><div className="pb-step-icon"><Icon name="bus" size={24} /></div><h3>Seat</h3><p>Pick a bus and seat.</p></article>
            <article><span>03</span><div className="pb-step-icon"><Icon name="ticket" size={24} /></div><h3>Pay & ticket</h3><p>Confirm with PesePay and receive the ticket.</p></article>
          </div>
        </div>
      </section>

      <section className="pb-popular" id="popular-routes">
        <div className="pb-shell">
          <div className="pb-section-heading"><div><span className="pb-section-label">Routes</span><h2>Popular</h2></div><p>Quick picks.</p></div>
          <div className="pb-route-cards">
            {popularRoutes.map((route) => <button type="button" key={`${route.from}-${route.to}`} onClick={() => choosePopularRoute(route)}><span className="pb-route-icon"><Icon name="bus" size={22} /></span><span><strong>{route.from} <b>to</b> {route.to}</strong><small>{route.time}</small></span><Icon name="arrow" size={18} /></button>)}
          </div>
        </div>
      </section>

      <PbBookingSheet
        open={Boolean(activeBus)}
        bus={activeBusDetails}
        from={from}
        to={to}
        readableDate={readableDate}
        selectedSeats={selectedSeats}
        onToggleSeat={toggleSeat}
        onClose={closeSheet}
        onSubmit={confirmBooking}
        onSessionExpired={handleSessionExpired}
      />

      <footer className="pb-footer">
        <div className="pb-shell pb-footer-inner"><div className="pb-brand pb-brand--footer"><span className="pb-brand-mark"><Icon name="bus" size={24} /></span><span><strong>Tenda</strong><small>BUS</small></span></div><p>Harare - Mutare.</p><span>{new Date().getFullYear()} Tenda Bus</span></div>
      </footer>
    </main>
  );
}

export default PublicBusBooking;
