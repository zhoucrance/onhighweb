import React, { useEffect, useMemo, useRef, useState } from "react";

const ChevronIcon = ({ direction = "left" }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={direction === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CaretIcon = () => (
  <svg
    className="pb-combo-caret"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="m6 9 6 6 6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (number) => String(number).padStart(2, "0");

/** Date -> "YYYY-MM-DD" using local time (never shifts across timezones). */
const toValue = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "YYYY-MM-DD" -> Date at local midnight, or null when unparseable. */
const fromValue = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const isSameDay = (a, b) =>
  Boolean(a && b) &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addDays = (date, amount) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/** Month cells padded with nulls so every row holds exactly 7 entries. */
const buildWeeks = (year, month) => {
  const firstOfMonth = new Date(year, month, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // shift so Monday = 0
  const cells = Array.from({ length: leadingBlanks }, () => null);

  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
};

const titleFormatter = new Intl.DateTimeFormat("en-ZW", {
  month: "long",
  year: "numeric",
});
const triggerFormatter = new Intl.DateTimeFormat("en-ZW", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-ZW", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Calendar date field for the public booking page. Keeps the same
 * "YYYY-MM-DD" string contract as a native <input type="date"> so callers
 * need no changes.
 *
 * Keyboard: arrows move a day/week, PageUp/PageDown change month,
 * Home/End jump to the start/end of the week, Enter picks, Escape closes.
 */
function PbDatePicker({ id, value, min, onChange, placeholder = "Select date" }) {
  const selected = useMemo(() => fromValue(value), [value]);
  const minDate = useMemo(() => fromValue(min), [min]);
  const today = useMemo(startOfToday, []);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => selected || minDate || today
  );
  const [focusDate, setFocusDate] = useState(() => selected || minDate || today);
  const [direction, setDirection] = useState("none");

  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const gridRef = useRef(null);
  // Only pull DOM focus into the grid after keyboard navigation or opening,
  // otherwise clicking the month arrows would yank focus off the arrow.
  const shouldFocusDayRef = useRef(false);

  const weeks = useMemo(
    () => buildWeeks(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  );

  const isDisabledDay = (date) =>
    Boolean(minDate) && date.getTime() < minDate.getTime();

  // Close when clicking or tapping outside the field.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  // Land on the selected day (or earliest selectable one) each time we open.
  useEffect(() => {
    if (!open) return;
    const landing = selected || minDate || today;
    setViewMonth(new Date(landing.getFullYear(), landing.getMonth(), 1));
    setFocusDate(landing);
    setDirection("none");
    shouldFocusDayRef.current = true;
  }, [open, selected, minDate, today]);

  // Follow the focused day when arrow keys cross a month boundary.
  useEffect(() => {
    if (!open) return;
    const sameMonth =
      focusDate.getFullYear() === viewMonth.getFullYear() &&
      focusDate.getMonth() === viewMonth.getMonth();
    if (sameMonth) return;
    setDirection(focusDate.getTime() > viewMonth.getTime() ? "next" : "prev");
    setViewMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
  }, [focusDate, open, viewMonth]);

  useEffect(() => {
    if (!open || !shouldFocusDayRef.current) return;
    const node = gridRef.current?.querySelector('[data-focus="true"]');
    if (node) {
      node.focus({ preventScroll: true });
      shouldFocusDayRef.current = false;
    }
  }, [open, focusDate, viewMonth]);

  const close = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const commit = (date) => {
    if (isDisabledDay(date)) return;
    onChange(toValue(date));
    close();
  };

  const changeMonth = (offset) => {
    const next = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + offset,
      1
    );
    setDirection(offset > 0 ? "next" : "prev");
    setViewMonth(next);
    setFocusDate((current) =>
      new Date(
        next.getFullYear(),
        next.getMonth(),
        Math.min(
          current.getDate(),
          daysInMonth(next.getFullYear(), next.getMonth())
        )
      )
    );
  };

  const moveFocus = (amount) => {
    shouldFocusDayRef.current = true;
    setFocusDate((current) => addDays(current, amount));
  };

  const handleGridKeyDown = (event) => {
    const keyMoves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (keyMoves[event.key] !== undefined) {
      event.preventDefault();
      moveFocus(keyMoves[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(-((focusDate.getDay() + 6) % 7));
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(6 - ((focusDate.getDay() + 6) % 7));
    } else if (event.key === "PageUp") {
      event.preventDefault();
      shouldFocusDayRef.current = true;
      changeMonth(-1);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      shouldFocusDayRef.current = true;
      changeMonth(1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(focusDate);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const previousMonthDisabled = useMemo(() => {
    if (!minDate) return false;
    const lastDayOfPreviousMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      0
    );
    return lastDayOfPreviousMonth.getTime() < minDate.getTime();
  }, [minDate, viewMonth]);

  const shortcuts = useMemo(
    () =>
      [
        { label: "Today", date: today },
        { label: "Tomorrow", date: addDays(today, 1) },
        { label: "Next week", date: addDays(today, 7) },
      ].filter((shortcut) => !isDisabledDay(shortcut.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, minDate]
  );

  const monthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  return (
    <div className={`pb-datepicker ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="pb-combo-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={`pb-combo-value ${selected ? "" : "is-placeholder"}`}>
          {selected ? triggerFormatter.format(selected) : placeholder}
        </span>
        <CaretIcon />
      </button>

      {open && (
        <div
          className="pb-cal-pop"
          role="dialog"
          aria-modal="false"
          aria-label="Choose travel date"
        >
          <div className="pb-cal-head">
            <button
              type="button"
              className="pb-cal-nav"
              onClick={() => changeMonth(-1)}
              disabled={previousMonthDisabled}
              aria-label="Previous month"
            >
              <ChevronIcon direction="left" />
            </button>
            <span className="pb-cal-title" aria-live="polite">
              {titleFormatter.format(viewMonth)}
            </span>
            <button
              type="button"
              className="pb-cal-nav"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          {shortcuts.length > 0 && (
            <div className="pb-cal-chips">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  className={`pb-cal-chip ${
                    isSameDay(shortcut.date, selected) ? "is-active" : ""
                  }`}
                  onClick={() => commit(shortcut.date)}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          )}

          <div className="pb-cal-week pb-cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday.slice(0, 1)}</span>
            ))}
          </div>

          <div
            key={monthKey}
            ref={gridRef}
            role="grid"
            aria-label={titleFormatter.format(viewMonth)}
            className={`pb-cal-grid pb-cal-from-${direction}`}
            onKeyDown={handleGridKeyDown}
          >
            {weeks.map((week, weekIndex) => (
              <div className="pb-cal-week" role="row" key={weekIndex}>
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return (
                      <span
                        className="pb-cal-empty"
                        role="gridcell"
                        key={`empty-${dayIndex}`}
                      />
                    );
                  }

                  const disabled = isDisabledDay(day);
                  const isSelected = isSameDay(day, selected);
                  const isFocused = isSameDay(day, focusDate);

                  return (
                    <button
                      key={day.getTime()}
                      type="button"
                      role="gridcell"
                      data-focus={isFocused}
                      tabIndex={isFocused ? 0 : -1}
                      disabled={disabled}
                      aria-selected={isSelected}
                      aria-label={fullDateFormatter.format(day)}
                      style={{ "--i": weekIndex * 7 + dayIndex }}
                      className={`pb-cal-day ${isSelected ? "is-selected" : ""} ${
                        isSameDay(day, today) ? "is-today" : ""
                      }`}
                      onClick={() => commit(day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PbDatePicker;
