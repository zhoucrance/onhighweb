# Business Requirements Document (BRD)

## Public Self-Service Bus Booking Page (onhighweb)

| Field | Value |
|-------|-------|
| Project | onhighweb |
| Document Status | Draft — requirements gathering |
| Last Updated | 2026-09-09 |
| Reference Model | [redBus.in](https://www.redbus.in/) |
| Owner | _TBD_ |
| Related Systems | onhighweb (React client + Express/Mongo server), onhigh_whatsapp_endpoint (Pesepay/WhatsApp) |

---

## 1. Overview

A public-facing web page within **onhighweb** that lets **customers book bus tickets
on their own, without logging in**. Customers search a route and date, view available
buses, pick boarding/drop-off points and seats, enter their contact details, pay, and
receive a confirmation. The experience is modeled on **redBus.in** for look-and-feel
and flow, using onhighweb's own brand colors.

This is a new self-service channel that sits alongside the existing internal flows
(office/agent booking, admin, and the WhatsApp booking service).

## 2. Purpose & Background

Today all booking screens in onhighweb are behind login (`ProtectedRoute` → `/login`)
and every booking endpoint requires a JWT. Bookings are created by staff/agents, or
via the separate WhatsApp service. There is no way for an end customer to self-serve on
the web. This feature opens a public channel to capture direct online bookings, similar
to redBus, reducing dependence on agents and the WhatsApp flow.

## 3. Goals & Objectives

- Let a guest complete a booking end-to-end with **no account required**.
- Mirror the familiar **redBus** flow: search → results → seat & points → details → pay → confirm.
- Match redBus-level **visual attractiveness and UX polish**, using onhighweb brand colors.
- **Reuse** existing trip/seat/booking logic where possible (search results, seat grid, segment-aware seat locking).
- Deliver a **mobile-first**, fast, accessible experience.
- Capture enough customer identity (name, phone, email) to deliver tickets and support lookups without a login.

## 4. Scope

### In Scope (target)
- Public trip search by from-city, to-city, and travel date.
- Search results list with key trip info (operator/bus, times, fare, seats left, points).
- Boarding point / drop-off point selection.
- Seat selection (reusing the existing seat grid).
- Guest passenger & contact details capture.
- Payment (see open question on gateway at launch).
- Booking confirmation delivered to the customer (channel TBD).
- Guest booking lookup by reference (retrieve ticket without login).

### Out of Scope (initial)
- Customer account/profile management.
- Loyalty/wallet/rewards.
- Live bus tracking.
- Ratings/reviews.
- _Others TBD._

### Explicitly TBD (see Open Questions)
- Online payment vs pay-on-boarding at launch.
- Self-service cancellation/refund for guests.
- Multi-company marketplace vs single-company.

## 5. Stakeholders

| Role | Interest / Responsibility |
|------|---------------------------|
| Customer (guest) | Books their own trip online |
| Bus operator / company | Receives bookings, seats reserved correctly |
| Office/admin staff | Existing flows must keep working; may view web bookings |
| Payments (Pesepay) | Online charge, refunds |
| Product owner | _TBD_ |

## 6. User Roles & Personas

- **Guest customer** — no account; books for self and/or additional passengers;
  identified by name + phone + email on the booking record.
- **(System) guest/web user** — possible synthetic user to satisfy the current
  `Booking.user` requirement (design decision, see §12).

## 7. Functional Requirements

Priorities: **M** = Must (v1), **S** = Should, **C** = Could (later).

| ID | Requirement | Priority | Notes / Existing basis |
|----|-------------|----------|------------------------|
| FR-1 | Guest can search trips by from-city, to-city, and travel date | M | New **public** variant of `POST /api/routes/search-trips` |
| FR-2 | Search results show operator/bus, departure/arrival, duration, fare, seats left, boarding/drop points | M | Data available from `formatTripResult` |
| FR-3 | Guest can filter/sort results (time, price, bus type) | S | redBus parity |
| FR-4 | Guest can open a trip and see details + seat map | M | Public variant of `get-trip-by-id` |
| FR-5 | Guest can select boarding point and drop-off point | M | Trips carry `boardingPoints[]` / `dropOffPoints[]` |
| FR-6 | Guest can select one or more available seats | M | Reuse `SeatSelection` (`{capacity, seatsBooked}`) |
| FR-7 | System prevents double-booking of seats for overlapping segments | M | Reuse segment-overlap logic in `book-seat` |
| FR-8 | Guest enters contact (name, phone, email) and per-passenger details | M | Booking schema has `customerName/Phone/Email`, `passengers[]` |
| FR-9 | Guest can pay online (Pesepay EcoCash/Card) | M/S* | *Depends on OQ-1; Pesepay init not yet on web side |
| FR-10 | Guest can choose Pay-on-Boarding (reserve without paying) where allowed | S | Existing `RESERVED_AWAITING_PAYMENT` status |
| FR-11 | On success, booking is created with `bookingSource: "WEB_APP"` and a ticket number | M | Reuse ticket generation |
| FR-12 | Guest receives a confirmation (SMS/WhatsApp/email) | M | Channel per OQ-4 |
| FR-13 | Guest can look up a booking later by reference (+ phone/email) | S | New public lookup endpoint |
| FR-14 | Held seats are released if payment fails/expires | M | Reuse `release-seat-hold` |
| FR-15 | Past dates and inactive trips/routes are excluded/blocked | M | Existing validations |
| FR-16 | Guest self-service cancellation/refund | C | Per OQ-6 |

## 7a. Design & Branding Requirements

**Design intent:** Match the *attractiveness, polish, and UX patterns* of redBus
(clean search widget, scannable result cards, clear seat map, step-by-step checkout,
strong mobile layout) — but use **onhighweb's own brand colors**, not redBus red. The
look should feel modern, trustworthy, and travel-focused.

**Brand palette (from the existing onhighweb client — `client/src/index.css` &
`client/tailwind.config.js`):**

| Token | Value | Use |
|-------|-------|-----|
| Primary | `#058359` (green) | Primary actions (Search, Pay), highlights, active seat, key accents |
| Secondary | `#AC4425` (terracotta/rust) | Secondary accents, warnings/alerts, badges |
| Ink | `#071a4d` (deep navy) | Headings and primary text |
| Border | `#dde4ef` | Card/input borders, dividers |
| Muted | `#f7f9fc` | Page/section backgrounds |
| Soft shadow | `0 8px 28px rgba(7,26,77,0.08)` | Card elevation |
| Radius | `5px` (default) | Cards, buttons, inputs |
| Font | Montserrat | All text |

**Design requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| DR-1 | Reproduce redBus-style layout/UX quality (search bar, result cards, seat map, stepper checkout, sticky fare summary) | M |
| DR-2 | Use onhighweb brand colors above; **no redBus red**. Green `#058359` is the primary CTA color | M |
| DR-3 | Mobile-first, fully responsive (single-column on mobile, multi-column on desktop) | M |
| DR-4 | Consistent with existing onhighweb tokens (Montserrat, 5px radius, soft shadow, muted bg) so it feels like one product | M |
| DR-5 | Clear visual states for seats: available / selected (primary green) / booked (muted/disabled) | M |
| DR-6 | Accessible contrast for text on green/terracotta; labeled, keyboard-navigable controls | M |
| DR-7 | Reuse/extend existing UI components in `client/src/components/ui/*` where sensible | S |
| DR-8 | Trust cues (secure-payment badge, clear fare breakdown, confirmation screen) like redBus | S |

> Note: colors are **confirmation-pending** — these are the values currently in the
> codebase (`--primary`, `--secondary`, etc.). Confirm whether the public page should
> use this exact palette or a refreshed brand palette (logo colors, etc.). See OQ-9.

## 8. Non-Functional Requirements

- **Responsive / mobile-first** (most traffic expected on mobile, like redBus).
- **Performance:** fast search; avoid loading admin-only data on public pages.
- **Security:** public endpoints must not leak Pesepay secrets or staff/company data;
  rate-limit search/booking; validate all guest input server-side.
- **Reliability:** seat reservation must be atomic and race-safe (reuse existing `$addToSet`).
- **Accessibility:** keyboard navigable, sufficient contrast, labeled seat controls.
- **Privacy:** store only necessary guest PII; clear handling of contact data.
- **No auth regression:** existing authed flows and endpoints unchanged.

## 9. User Flow (redBus-style, high level)

1. Public landing / search page — enter From, To, Date → **Search**.
2. **Results** — list of available buses for that route/date (with filters/sort).
3. **Select** a bus → choose **boarding** & **drop-off** points, select **seat(s)**.
4. **Passenger & contact details** — name, phone, email, per-seat passenger info.
5. **Review & pay** — choose payment option, pay (or reserve for pay-on-boarding).
6. **Confirmation** — ticket shown on screen + sent via chosen channel.
7. (Later) **Manage/lookup booking** by reference.

## 9a. Technology Stack

**Preferred stack: React + Vite + Tailwind CSS** — and this matches what onhighweb's
client already uses, so the public page can share the existing stack, brand tokens, and
components rather than being rebuilt from scratch.

Existing `client/` stack (from `client/package.json`):

| Area | Tech |
|------|------|
| Build/dev | **Vite 5** (`vite`, `vite build`, `vite preview`); legacy CRA `react-scripts` still present as fallback |
| UI framework | **React 18** + `@vitejs/plugin-react` |
| Styling | **Tailwind CSS 3.4** + PostCSS + Autoprefixer; brand tokens via CSS vars |
| Component libs | antd 4, plus custom `components/ui/*` (shadcn-style: button, card, dialog, tabs, select, sheet, table, form) |
| Routing | react-router-dom 6 (`ProtectedRoute` / `PublicRoute`) |
| State/data | Redux Toolkit, zustand, @tanstack/react-query, axios (`helpers/axiosInstance.js`) |
| Forms/validation | react-hook-form + zod |
| Offline | dexie (IndexedDB) |

**Architectural decision needed (OQ-10):** build the public page *inside* the existing
Vite client (new public routes outside `ProtectedRoute`, reuse tokens/components/APIs) —
recommended — **or** a *separate* standalone Vite app (independent deploy, cleaner
public/staff separation, but duplicates tokens/components and needs its own API access).

Recommendation: build inside the existing client to maximize reuse (brand tokens,
`SeatSelection`, `ui/*` components, axios/query setup) and keep one product surface,
while ensuring public routes and public API endpoints stay clearly separated from
authed/staff areas.

## 10. Integrations

- **Trip/seat data:** existing onhighweb server (needs public endpoints).
- **Payment:** Pesepay (EcoCash / Card) — keys stored per company on `companyModel`;
  real checkout currently only implemented in `../onhigh_whatsapp_endpoint/main.py`.
  Web-side initiation/callback to be designed.
- **Confirmation:** SMS / WhatsApp (existing WhatsApp endpoint) / email — TBD.

## 11. Assumptions

- Trips/routes/buses/fares are already maintained by admins in onhighweb.
- The existing seat model (flat capacity + booked seat numbers) is sufficient for v1.
- Company Pesepay keys are already configured for companies that will accept online pay.

## 12. Constraints & Known Gaps

- All current booking endpoints require JWT — **new public endpoints are required**.
- `Booking.user` is effectively required and set from the JWT — guest bookings need
  `user` made optional or a synthetic guest user, storing `customerName/Phone/Email`.
- No web-side online payment exists yet — must be built or deferred to pay-on-boarding.
- Public route/company scoping must be added (existing checks assume an authed staff user).
- Seat model has no deck/aisle/layout metadata (flat grid only).
- `BookNow.js` uses ad-hoc classes (`primary-btn`, `primary-text`) not defined in CSS —
  the public page should define a clean, consistent style set instead of inheriting these.

## 13. Open Questions

| # | Question |
|---|----------|
| OQ-1 | Online payment (Pesepay) at launch, or pay-on-boarding/reserve first? |
| OQ-2 | Fully guest, or optional account creation after booking? |
| OQ-3 | How do guests retrieve a booking later (reference + phone? OTP?)? |
| OQ-4 | Confirmation channel(s): SMS / WhatsApp / email / all? |
| OQ-5 | Single company or multi-company marketplace (affects search + branding)? |
| OQ-6 | Guest self-service cancellation/refund in v1? |
| OQ-7 | Which redBus features are v1 vs later (filters, ratings, tracking, coupons, women-booking)? |
| OQ-8 | Surface selectable boarding/drop-off points like redBus? |
| OQ-9 | Use the existing palette (green/terracotta/navy) or a refreshed brand palette? |
| OQ-10 | Build the public page inside the existing Vite client (recommended) or as a separate standalone Vite app? |

## 14. Reference Material

- [redBus.in](https://www.redbus.in/) — primary UX/flow reference (see `NOTES.md` for the
  observed flow and feature list). Content was rephrased for compliance with licensing restrictions.
- Existing onhighweb code — see the "Related Existing Code" list in `NOTES.md`.

---

_Next step: answer the Open Questions so we can lock scope for v1 and move to a design._
