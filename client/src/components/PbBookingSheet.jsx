import React, { useEffect, useMemo, useRef, useState } from "react";

const ICONS = {
  close: <path d="M18 6 6 18M6 6l12 12" />,
  seat: (
    <>
      <path d="M6 4h8a3 3 0 0 1 3 3v7H6z" />
      <path d="M4 14h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  refund: (
    <>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 9h2a2 2 0 0 1 0 4h-2M6 2v2M10 2v2M14 2v2" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
};

const SheetIcon = ({ name, size = 18 }) => (
  <svg
    className="pb-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </g>
  </svg>
);

const TABS = [
  { id: "seats", label: "Select seat", icon: "seat" },
  { id: "points", label: "Pickup & drop", icon: "pin" },
  { id: "passenger", label: "Passenger details", icon: "user" },
];

/** "07:30" + 15 -> "07:45" (wraps across midnight). */
const addMinutes = (time, minutes) => {
  const [hours, mins] = String(time).split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
};

const BOARDING_POINTS = [
  { id: "bp-terminal", name: "Roadport Terminal", detail: "Robert Mugabe Road", offset: 0 },
  { id: "bp-musika", name: "Mbare Musika", detail: "Ardbennie Road", offset: 15 },
  { id: "bp-westgate", name: "Westgate Shops", detail: "Bulawayo Road", offset: 32 },
];

const DROPPING_POINTS = [
  { id: "dp-renkini", name: "Renkini Terminal", detail: "6th Avenue Extension", offset: 0 },
  { id: "dp-cityhall", name: "City Hall", detail: "Fife Street", offset: -18 },
  { id: "dp-ascot", name: "Ascot Shops", detail: "Gwanda Road", offset: -32 },
];

// Scrollable info tabs shown under the bus photo (mock content for the UI preview).
const INFO_TABS = [
  { id: "cancellation", label: "Cancellation policy", icon: "refund" },
  { id: "boarding", label: "Boarding point", icon: "pin" },
  { id: "dropping", label: "Dropping point", icon: "pin" },
  { id: "rest", label: "Rest stop", icon: "coffee" },
  { id: "features", label: "Bus features", icon: "seat" },
  { id: "reviews", label: "Rating & reviews", icon: "star" },
  { id: "policies", label: "Other policies", icon: "info" },
];

const isBlank = (value) => !String(value || "").trim();

/**
 * Bottom sheet that slides up to complete a booking in three steps:
 * seats -> pickup/drop points -> passenger details.
 *
 * Seat state is owned by the page (so the card can reflect it); point and
 * passenger state is local and handed back through onSubmit.
 */
function PbBookingSheet({
  open,
  bus,
  from,
  to,
  readableDate,
  selectedSeats,
  onToggleSeat,
  onClose,
  onSubmit,
}) {
  // Keep the sheet mounted through its exit animation.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  const [activeTab, setActiveTab] = useState("seats");
  const [pickupPoint, setPickupPoint] = useState("");
  const [dropPoint, setDropPoint] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [passengers, setPassengers] = useState({});
  const [hint, setHint] = useState("");
  const [activeInfoTab, setActiveInfoTab] = useState("cancellation");

  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const tabRefs = useRef([]);
  const lastFocusedRef = useRef(null);
  const infoStripRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 260);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fresh sheet each time it opens for a bus.
  useEffect(() => {
    if (!open) return;
    setActiveTab("seats");
    setPickupPoint("");
    setDropPoint("");
    setContact({ name: "", phone: "", email: "" });
    setPassengers({});
    setHint("");
    setActiveInfoTab("cancellation");
  }, [open, bus?.id]);

  // Lock background scrolling while the sheet is up.
  useEffect(() => {
    if (!mounted) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  // Move focus in on open, and back to the trigger on close.
  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement;
      const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    lastFocusedRef.current?.focus?.();
    return undefined;
  }, [open]);

  // Scroll back to the top of the panel whenever the step changes.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activeTab]);

  const fare = bus?.price || 0;
  const total = fare * selectedSeats.length;

  const boardingPoints = useMemo(
    () =>
      BOARDING_POINTS.map((point) => ({
        ...point,
        time: addMinutes(bus?.departure || "00:00", point.offset),
      })),
    [bus?.departure]
  );

  const droppingPoints = useMemo(
    () =>
      DROPPING_POINTS.map((point) => ({
        ...point,
        time: addMinutes(bus?.arrival || "00:00", point.offset),
      })),
    [bus?.arrival]
  );

  const seatsDone = selectedSeats.length > 0;
  const pointsDone = Boolean(pickupPoint && dropPoint);
  const passengerDone =
    !isBlank(contact.name) &&
    String(contact.phone || "").replace(/\D/g, "").length >= 9 &&
    selectedSeats.every((seat) => !isBlank(passengers[seat]?.name));

  const completion = { seats: seatsDone, points: pointsDone, passenger: passengerDone };

  const updatePassenger = (seat, patch) =>
    setPassengers((current) => ({
      ...current,
      [seat]: { ...current[seat], ...patch },
    }));

  const goToTab = (tabId) => {
    setHint("");
    setActiveTab(tabId);
  };

  const handleTabKeyDown = (event, index) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + offset + TABS.length) % TABS.length;
    goToTab(TABS[nextIndex].id);
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  const handleSheetKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      sheetRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((node) => node.offsetParent !== null);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const advance = () => {
    if (activeTab === "seats") {
      if (!seatsDone) {
        setHint("Choose at least one seat to continue.");
        return;
      }
      goToTab("points");
      return;
    }
    if (activeTab === "points") {
      if (!pointsDone) {
        setHint("Select both a pickup point and a drop-off point.");
        return;
      }
      goToTab("passenger");
      return;
    }
    if (!passengerDone) {
      setHint("Add a contact name, a valid phone number and a name for each seat.");
      return;
    }
    onSubmit?.({
      busId: bus?.id,
      seats: selectedSeats,
      pickupPoint: boardingPoints.find((point) => point.id === pickupPoint),
      dropPoint: droppingPoints.find((point) => point.id === dropPoint),
      contact,
      passengers,
      total,
    });
  };

  // Nudge the info-tab strip left/right with the arrow buttons.
  const scrollInfoStrip = (direction) => {
    const strip = infoStripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(strip.clientWidth * 0.7, 160), behavior: "smooth" });
  };

  const selectInfoTab = (tabId, index) => {
    setActiveInfoTab(tabId);
    // Keep the chosen tab comfortably in view within the scroller.
    const strip = infoStripRef.current;
    const chip = strip?.children?.[index];
    chip?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const renderInfoContent = () => {
    switch (activeInfoTab) {
      case "cancellation":
        return (
          <ul className="pb-info-list">
            <li><strong>Up to 24h before:</strong> 90% refunded.</li>
            <li><strong>24h – 4h before:</strong> 50% refunded.</li>
            <li><strong>Under 4h / no-show:</strong> non-refundable.</li>
          </ul>
        );
      case "boarding":
        return (
          <ul className="pb-info-list">
            {boardingPoints.map((point) => (
              <li key={point.id}><strong>{point.time}</strong> · {point.name}<small>{point.detail}</small></li>
            ))}
          </ul>
        );
      case "dropping":
        return (
          <ul className="pb-info-list">
            {droppingPoints.map((point) => (
              <li key={point.id}><strong>{point.time}</strong> · {point.name}<small>{point.detail}</small></li>
            ))}
          </ul>
        );
      case "rest":
        return (
          <ul className="pb-info-list">
            <li><strong>Halfway Halt:</strong> 20 min · food court & washrooms.</li>
            <li>One comfort stop on this route, driver-announced on board.</li>
          </ul>
        );
      case "features":
        return (
          <div className="pb-info-chips">
            {(bus.amenities || []).map((amenity) => (
              <span key={amenity}><SheetIcon name="check" size={13} /> {amenity}</span>
            ))}
            <span><SheetIcon name="check" size={13} /> Reading lights</span>
            <span><SheetIcon name="check" size={13} /> Emergency exits</span>
          </div>
        );
      case "reviews":
        return (
          <div className="pb-info-reviews">
            <div className="pb-info-rating"><strong>4.5</strong><span>★★★★★</span><small>218 reviews</small></div>
            <ul className="pb-info-list">
              <li><strong>Tariro M.</strong> — Clean bus, left on time.</li>
              <li><strong>Kuda R.</strong> — Comfortable seats and friendly crew.</li>
            </ul>
          </div>
        );
      case "policies":
        return (
          <ul className="pb-info-list">
            <li>One cabin bag + one hold bag per passenger.</li>
            <li>Valid photo ID required at boarding.</li>
            <li>No smoking; pets only in approved carriers.</li>
          </ul>
        );
      default:
        return null;
    }
  };

  if (!mounted || !bus) return null;

  const actionLabel =
    activeTab === "passenger" ? "Confirm booking" : "Continue";

  return (
    <div
      className={`pb-sheet-root ${closing ? "is-closing" : ""}`}
      role="presentation"
    >
      <div className="pb-sheet-backdrop" onClick={onClose} />

      <section
        className="pb-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pb-sheet-title"
        onKeyDown={handleSheetKeyDown}
      >
        <header className="pb-sheet-head">
          <button
            type="button"
            className="pb-sheet-close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close booking"
          >
            <SheetIcon name="close" size={19} />
          </button>

          <div className="pb-sheet-title">
            <h2 id="pb-sheet-title">
              {from} <span aria-hidden="true">→</span> {to}
            </h2>
            <p>
              {readableDate} · {bus.departure} – {bus.arrival} · {bus.operator}
            </p>
          </div>
        </header>

        <div className="pb-sheet-tabs" role="tablist" aria-label="Booking steps">
          {TABS.map((tab, index) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`pb-tab-${tab.id}`}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                aria-selected={isActive}
                aria-controls={`pb-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`pb-sheet-tab ${isActive ? "is-active" : ""} ${
                  completion[tab.id] ? "is-done" : ""
                }`}
                onClick={() => goToTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className="pb-tab-mark">
                  {completion[tab.id] ? (
                    <SheetIcon name="check" size={13} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="pb-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pb-sheet-body" ref={bodyRef}>
          <div
            key={activeTab}
            className="pb-sheet-panel"
            role="tabpanel"
            id={`pb-panel-${activeTab}`}
            aria-labelledby={`pb-tab-${activeTab}`}
          >
            {activeTab === "seats" && (
              <>
                <div className="pb-bus-photo" role="img" aria-label={`${bus.operator} coach photo`}>
                  <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <defs>
                      <linearGradient id="pbPhotoSky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#cfeede" /><stop offset="1" stopColor="#eef8f3" />
                      </linearGradient>
                      <linearGradient id="pbPhotoBody" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#058359" /><stop offset="1" stopColor="#035e42" />
                      </linearGradient>
                    </defs>
                    <rect width="320" height="150" fill="url(#pbPhotoSky)" />
                    <path d="M0 104c60-26 120-14 176 6 46 16 96 12 144-8v48H0Z" fill="#a9dcc4" />
                    <rect x="40" y="52" width="240" height="62" rx="14" fill="url(#pbPhotoBody)" />
                    <rect x="52" y="62" width="196" height="26" rx="8" fill="#d9f5e9" />
                    <path d="M60 66h176v18H60Z" fill="#cfeede" opacity=".6" />
                    <rect x="40" y="96" width="240" height="12" fill="#AC4425" />
                    <circle cx="92" cy="116" r="14" fill="#071a4d" /><circle cx="92" cy="116" r="6" fill="#dde4ef" />
                    <circle cx="228" cy="116" r="14" fill="#071a4d" /><circle cx="228" cy="116" r="6" fill="#dde4ef" />
                    <text x="60" y="80" fill="#071a4d" fontSize="12" fontWeight="700">ONHIGH BUS</text>
                  </svg>
                  <span className="pb-bus-photo-tag">{bus.operator}</span>
                </div>

                <div className="pb-sheet-panel-head">
                  <div>
                    <span className="pb-section-label">Choose seats</span>
                    <h3>{bus.coach}</h3>
                  </div>
                  <div className="pb-seat-legend">
                    <span>
                      <i className="available" /> Available
                    </span>
                    <span>
                      <i className="selected" /> Selected
                    </span>
                    <span>
                      <i className="booked" /> Booked
                    </span>
                  </div>
                </div>

                <div className="pb-coach">
                  <div className="pb-driver" aria-label="Driver position">
                    Driver
                  </div>
                  <div className="pb-seat-rows">
                    {Array.from({ length: 8 }, (_, row) => (
                      <div className="pb-seat-row" key={row}>
                        {[1, 2, 3, 4].map((position) => {
                          const seat = row * 4 + position;
                          const isBooked = bus.bookedSeats.includes(seat);
                          const isSelected = selectedSeats.includes(seat);
                          return (
                            <React.Fragment key={seat}>
                              {position === 3 && (
                                <span className="pb-aisle" aria-hidden="true" />
                              )}
                              <button
                                type="button"
                                className={`pb-seat ${isBooked ? "is-booked" : ""} ${
                                  isSelected ? "is-selected" : ""
                                }`}
                                disabled={isBooked}
                                onClick={() => onToggleSeat(seat)}
                                aria-pressed={isSelected}
                                aria-label={`Seat ${seat}${
                                  isBooked
                                    ? ", booked"
                                    : isSelected
                                    ? ", selected"
                                    : ", available"
                                }`}
                              >
                                {seat}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="pb-sheet-note">
                  <SheetIcon name="clock" size={15} /> {bus.seatsLeft} seats left ·
                  US${fare} per seat
                </p>

                <div className="pb-info">
                  <div className="pb-info-bar">
                    <button
                      type="button"
                      className="pb-info-arrow"
                      onClick={() => scrollInfoStrip(-1)}
                      aria-label="Scroll tabs left"
                    >
                      <SheetIcon name="chevronLeft" size={16} />
                    </button>
                    <div
                      className="pb-info-strip"
                      ref={infoStripRef}
                      role="tablist"
                      aria-label="Bus information"
                    >
                      {INFO_TABS.map((tab, index) => {
                        const isActive = tab.id === activeInfoTab;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={`pb-info-tab-${tab.id}`}
                            aria-selected={isActive}
                            aria-controls="pb-info-panel"
                            className={`pb-info-chip ${isActive ? "is-active" : ""}`}
                            onClick={() => selectInfoTab(tab.id, index)}
                          >
                            <SheetIcon name={tab.icon} size={14} />
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="pb-info-arrow"
                      onClick={() => scrollInfoStrip(1)}
                      aria-label="Scroll tabs right"
                    >
                      <SheetIcon name="chevronRight" size={16} />
                    </button>
                  </div>
                  <div
                    className="pb-info-panel"
                    id="pb-info-panel"
                    role="tabpanel"
                    aria-labelledby={`pb-info-tab-${activeInfoTab}`}
                    key={activeInfoTab}
                  >
                    {renderInfoContent()}
                  </div>
                </div>
              </>
            )}

            {activeTab === "points" && (
              <>
                <div className="pb-sheet-panel-head">
                  <div>
                    <span className="pb-section-label">Pickup point</span>
                    <h3>Boarding in {from}</h3>
                  </div>
                </div>
                <div className="pb-point-list">
                  {boardingPoints.map((point) => (
                    <label
                      key={point.id}
                      className={`pb-point ${
                        pickupPoint === point.id ? "is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="pb-pickup"
                        value={point.id}
                        checked={pickupPoint === point.id}
                        onChange={() => {
                          setPickupPoint(point.id);
                          setHint("");
                        }}
                      />
                      <span className="pb-point-dot" aria-hidden="true" />
                      <span className="pb-point-text">
                        <strong>{point.name}</strong>
                        <small>{point.detail}</small>
                      </span>
                      <span className="pb-point-time">{point.time}</span>
                    </label>
                  ))}
                </div>

                <div className="pb-sheet-panel-head pb-sheet-panel-head--spaced">
                  <div>
                    <span className="pb-section-label">Drop-off point</span>
                    <h3>Arriving in {to}</h3>
                  </div>
                </div>
                <div className="pb-point-list">
                  {droppingPoints.map((point) => (
                    <label
                      key={point.id}
                      className={`pb-point ${
                        dropPoint === point.id ? "is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="pb-drop"
                        value={point.id}
                        checked={dropPoint === point.id}
                        onChange={() => {
                          setDropPoint(point.id);
                          setHint("");
                        }}
                      />
                      <span className="pb-point-dot" aria-hidden="true" />
                      <span className="pb-point-text">
                        <strong>{point.name}</strong>
                        <small>{point.detail}</small>
                      </span>
                      <span className="pb-point-time">{point.time}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {activeTab === "passenger" && (
              <>
                <div className="pb-sheet-panel-head">
                  <div>
                    <span className="pb-section-label">Contact details</span>
                    <h3>Who should we send the ticket to?</h3>
                  </div>
                </div>

                <div className="pb-form-grid">
                  <label className="pb-input">
                    <span>Full name</span>
                    <input
                      type="text"
                      value={contact.name}
                      placeholder="e.g. Tariro Moyo"
                      autoComplete="name"
                      onChange={(event) => {
                        setContact((c) => ({ ...c, name: event.target.value }));
                        setHint("");
                      }}
                    />
                  </label>
                  <label className="pb-input">
                    <span>Phone number</span>
                    <input
                      type="tel"
                      value={contact.phone}
                      placeholder="e.g. 0784 020 848"
                      autoComplete="tel"
                      inputMode="tel"
                      onChange={(event) => {
                        setContact((c) => ({ ...c, phone: event.target.value }));
                        setHint("");
                      }}
                    />
                  </label>
                  <label className="pb-input pb-input--wide">
                    <span>
                      Email <small>(optional)</small>
                    </span>
                    <input
                      type="email"
                      value={contact.email}
                      placeholder="you@example.com"
                      autoComplete="email"
                      onChange={(event) =>
                        setContact((c) => ({ ...c, email: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="pb-sheet-panel-head pb-sheet-panel-head--spaced">
                  <div>
                    <span className="pb-section-label">Passengers</span>
                    <h3>
                      {selectedSeats.length
                        ? `${selectedSeats.length} seat${
                            selectedSeats.length > 1 ? "s" : ""
                          } selected`
                        : "No seats selected yet"}
                    </h3>
                  </div>
                </div>

                {selectedSeats.length ? (
                  <div className="pb-passenger-list">
                    {selectedSeats.map((seat) => (
                      <div className="pb-passenger" key={seat}>
                        <span className="pb-passenger-seat">Seat {seat}</span>
                        <div className="pb-passenger-fields">
                          <label className="pb-input">
                            <span>Passenger name</span>
                            <input
                              type="text"
                              value={passengers[seat]?.name || ""}
                              placeholder="Name as on ID"
                              onChange={(event) => {
                                updatePassenger(seat, { name: event.target.value });
                                setHint("");
                              }}
                            />
                          </label>
                          <label className="pb-input pb-input--narrow">
                            <span>Age</span>
                            <input
                              type="number"
                              min="0"
                              max="120"
                              inputMode="numeric"
                              value={passengers[seat]?.age || ""}
                              placeholder="—"
                              onChange={(event) =>
                                updatePassenger(seat, { age: event.target.value })
                              }
                            />
                          </label>
                          <div className="pb-input pb-input--narrow">
                            <span>Gender</span>
                            <div className="pb-gender">
                              {["F", "M"].map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  className={
                                    passengers[seat]?.gender === option
                                      ? "is-active"
                                      : ""
                                  }
                                  aria-pressed={passengers[seat]?.gender === option}
                                  onClick={() =>
                                    updatePassenger(seat, { gender: option })
                                  }
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pb-sheet-empty">
                    Go back to <strong>Select seat</strong> and pick a seat first.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="pb-sheet-foot">
          {hint && (
            <p className="pb-sheet-hint" role="alert">
              {hint}
            </p>
          )}
          <div className="pb-sheet-foot-row">
            <div className="pb-sheet-total">
              <span>
                {selectedSeats.length
                  ? `${selectedSeats.length} seat${
                      selectedSeats.length > 1 ? "s" : ""
                    } · ${selectedSeats.join(", ")}`
                  : "No seats selected"}
              </span>
              <strong>US${total}</strong>
            </div>
            <button type="button" className="pb-continue" onClick={advance}>
              {actionLabel} <SheetIcon name="arrow" size={17} />
            </button>
          </div>
          <small className="pb-sheet-secure">
            <SheetIcon name="shield" size={14} /> No payment is taken in this UI
            preview.
          </small>
        </footer>
      </section>
    </div>
  );
}

export default PbBookingSheet;
