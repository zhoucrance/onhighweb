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

  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const tabRefs = useRef([]);
  const lastFocusedRef = useRef(null);

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
