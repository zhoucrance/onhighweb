import React, { useEffect, useMemo, useRef, useState } from "react";

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

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <g
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </g>
  </svg>
);

const TickIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="m5 12 4 4L19 6"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Wraps the part of `text` matching `query` in a <mark> so matches are visible. */
const highlightMatch = (text, query) => {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
};

/**
 * Accessible searchable dropdown (combobox + listbox) styled for the public
 * booking page. Keyboard: ArrowUp/Down to move, Enter to pick, Escape to close.
 *
 * @param align "start" anchors the popover to the field's left edge, "end" to
 *              the right edge. Use "end" for fields near the right of the card
 *              so the popover never overflows the viewport.
 */
function PbSearchableSelect({
  id,
  value,
  options,
  onChange,
  align = "start",
  placeholder = "Select",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches found",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, trimmedQuery]);

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

  // Reset the search and focus it each time the popover opens.
  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const selectedIndex = options.indexOf(value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, options, value]);

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered.length]);

  const close = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const commit = (option) => {
    onChange(option);
    close();
  };

  const handleSearchChange = (event) => {
    setQuery(event.target.value);
    setActiveIndex(0);
  };

  const handleSearchKeyDown = (event) => {
    const lastIndex = Math.max(filtered.length - 1, 0);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length ? (current + 1) % filtered.length : 0
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length ? (current - 1 + filtered.length) % filtered.length : 0
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(lastIndex);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[activeIndex]) commit(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close({ restoreFocus: false });
    }
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const listboxId = `${id}-listbox`;

  return (
    <div
      className={`pb-combo pb-align-${align} ${open ? "is-open" : ""}`}
      ref={rootRef}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="pb-combo-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`pb-combo-value ${value ? "" : "is-placeholder"}`}>
          {value || placeholder}
        </span>
        <CaretIcon />
      </button>

      {open && (
        <div className="pb-combo-pop">
          <div className="pb-combo-search">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              className="pb-combo-search-input"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined
              }
              placeholder={searchPlaceholder}
              value={query}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          <ul className="pb-combo-list" id={listboxId} role="listbox" ref={listRef}>
            {filtered.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option === value;
              return (
                <li
                  key={option}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  style={{ "--i": index }}
                  className={`pb-combo-option ${isActive ? "is-active" : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(option)}
                >
                  <span>{highlightMatch(option, trimmedQuery)}</span>
                  {isSelected && <TickIcon />}
                </li>
              );
            })}

            {!filtered.length && (
              <li className="pb-combo-empty" role="presentation">
                {emptyText}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PbSearchableSelect;
