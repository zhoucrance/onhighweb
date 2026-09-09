# Notes — Public Self-Service Booking Page (onhighweb)

> Working notes for the requirements phase. No code yet. Scratchpad for ideas,
> questions, links, and decisions. Feature belongs to the **onhighweb** project.

## What we're doing

A **public, guest (no-login) self-service bus booking page** modeled after
**redBus.in**, where customers search, pick a trip, choose seats, enter contact
details, pay, and get a confirmation — all without an account. This is separate
from the internal office/agent and admin flows.

## Reference Model: redBus.in (observed 2026-09-09)

redBus core booking flow (from redbus.in):

1. Visit the site/app.
2. Choose transport mode (bus / train). *We only need bus.*
3. Enter journey details: from city, to city, travel date.
4. Search — see the list of available buses for that route/date.
5. Pick a bus, choose boarding & dropping points, select seat(s), enter contact details.
6. Choose a payment option and pay.
7. On success, get confirmation by email / mobile (SMS).

Notable redBus product features (candidates, not commitments):
- Free cancellation / Flexi ticket (change travel date before departure).
- Live bus tracking.
- Women-focused booking (seat visibility, deals).
- Ratings / top-rated operators ("Primo").
- 24/7 support, instant refunds, offers/coupons.
- Filters on the search results (departure time, bus type, price, operator, rating).

Content was rephrased for compliance with licensing restrictions. Source:
[redBus](https://www.redbus.in/).

## How the existing onhighweb booking works (grounding)

MERN app: React client in `client/`, Express + Mongoose server rooted at `server.js`.

- **Search:** `POST /api/routes/search-trips` `{ from, to, journeyDate }` returns an
  array of normalized results (see `formatTripResult` in `routes/routesRoute.js`).
  Legacy per-bus path also exists via `/api/buses/*`.
- **Trip detail:** `POST /api/routes/get-trip-by-id` `{ _id, fromStopId, toStopId, journeyDate }`.
- **Seat selection UI:** `client/src/components/SeatSelection.js` needs only
  `{ capacity: Number, seatsBooked: Number[] }`. Flat grid, 1-indexed seats, no
  layout/deck/aisle metadata.
- **Create booking:** `POST /api/bookings/book-seat` (in `routes/bookingsRoute.js`).
  Does segment-aware seat-overlap checks and atomically reserves seats on both
  `Trip.seatsBooked` and `Bus.seatsBooked`.
- **Auth:** Every booking-related endpoint is behind `authMiddleware` (JWT). The
  client attaches `token` from localStorage (`helpers/axiosInstance.js`), and
  `ProtectedRoute.js` bounces unauthenticated users to `/login`.
- **Payment:** No real online payment on the web side today. `BookNow.js` just
  records `paymentStatus:"Paid"` with a synthetic `transactionId`. The **real
  Pesepay** (EcoCash / card) checkout lives in the external Python service at
  `../onhigh_whatsapp_endpoint/main.py`, which calls back into onhighweb's
  internal `POST /api/bookings/release-seat-hold` (guarded by `x-internal-token`).
  Company Pesepay keys + `enabledPaymentMethods` are stored on `companyModel`.

### What's reusable
- `SeatSelection` component (just feed `{capacity, seatsBooked}`).
- Search-result shape from `formatTripResult`.
- Segment-aware seat overlap + seat-hold release logic.
- Booking schema already has **guest identity fields**: `customerName`,
  `customerPhone`, `customerEmail`, `passengers[]`, `bookingSource: "WEB_APP"`.
- Company-level Pesepay keys and `enabledPaymentMethods`.

### What's missing (the real work)
1. **Public (no-JWT) endpoints** — public variants of search, get-trip-by-id, and
   book-seat. All current ones 401 without a token.
2. **Guest identity** — `book-seat` forces `user = req.body.userId` from the JWT and
   the schema treats `user` as required. Need to make `user` optional (or attach a
   synthetic "guest/web" user) and persist `customerName/Phone/Email + passengers[]`.
3. **Real web payment** — implement Pesepay initiation + callback on the web side
   (mirror the Python flow) OR route guests to Pay-on-Boarding initially.
4. **Public company/route scoping** — access checks assume an authed staff user;
   need a public equivalent that just filters to Active companies/routes.
5. **Guest booking lookup** — a way for a guest to retrieve their ticket later
   (e.g. by reference + phone/email), since there's no login.
6. **Confirmation delivery** — SMS / WhatsApp / email to the customer.

## Design direction (key concern)

Goal: **same attractiveness / UX quality as redBus, but our brand colors.** Keep
redBus's layout language (search widget, result cards, seat map, checkout stepper,
sticky fare summary, strong mobile layout); drop redBus red and apply onhighweb's
palette.

Existing onhighweb brand tokens (source: `client/src/index.css`, `client/tailwind.config.js`):

- `--primary: #058359` (green) — primary CTAs, active seat, accents
- `--secondary: #AC4425` (terracotta/rust) — secondary accents, alerts
- `ink: #071a4d` (deep navy) — headings/text
- `border: #dde4ef`, `muted: #f7f9fc`
- soft shadow: `0 8px 28px rgba(7,26,77,0.08)`
- default radius: `5px`
- font: **Montserrat**

Open point: use this exact palette, or a refreshed brand palette? (added as OQ-9.)

Note: `BookNow.js` references `primary-text` / `primary-btn` classes that aren't
defined in `index.css`/tailwind config — the public page should define a clean,
consistent component style set rather than inherit these ad-hoc classes.

## Tech stack

Preference: **React + Vite + Tailwind CSS** — and that's already what the onhighweb
client uses, so we're aligned. From `client/package.json`:

- Vite 5 (`vite` / `vite build` / `vite preview`); legacy CRA `react-scripts` still
  present as a fallback (`build:cra`, `test`) — candidate for cleanup later.
- React 18 + `@vitejs/plugin-react`.
- Tailwind 3.4 + PostCSS + Autoprefixer; brand tokens via CSS vars in `index.css`.
- antd 4 + custom `components/ui/*` (shadcn-style).
- react-router-dom 6, Redux Toolkit + zustand, react-query, react-hook-form + zod, axios, dexie.

Implication: no new toolchain needed. The public page can be built **inside** the
existing client, reusing brand tokens, `SeatSelection`, the `ui/*` components, and the
axios/react-query setup — with public routes placed **outside** `ProtectedRoute`.

Decision to confirm (OQ-10): build inside existing client (recommended, max reuse) vs
a separate standalone Vite app (cleaner separation, but duplicates tokens/components).

## Status

- [x] Reference model studied (redBus)
- [x] Existing onhighweb flow mapped
- [ ] BRD drafted and confirmed  ← next, awaiting your input on open questions
- [ ] Design
- [ ] Implementation

## Open Questions (need answers before design)

1. **Payment for guests at launch:** Pesepay online (EcoCash/Card) from day one,
   or start with Pay-on-Boarding + reservation only?
2. **Account requirement:** fully guest (no account ever), or optional account
   creation after booking?
3. **Guest ticket retrieval:** how do guests look up a booking later — reference
   number + phone? OTP?
4. **Confirmation channel(s):** SMS, WhatsApp (reuse the existing endpoint?), email,
   or all?
5. **Company scope:** is the public site for a single company, or multi-company
   marketplace like redBus? Affects search + branding.
6. **Cancellation/refund self-service** for guests — in scope for v1?
7. **Which redBus features matter for v1** vs later (filters, ratings, tracking,
   coupons, women-booking)?
8. **Boarding/drop-off points:** trips already carry `boardingPoints[]` /
   `dropOffPoints[]` — surface these as selectable like redBus?

## Reference Links

- [redBus](https://www.redbus.in/) — primary UX/flow reference.
- (add more as they come in)

## Decisions Log

- 2026-09-09 — Feature scoped to onhighweb; folder lives at `onhighweb/public_self_booking/`.
- 2026-09-09 — redBus.in adopted as the primary UX reference model.

## Related Existing Code (onhighweb)

- `client/src/pages/BookNow.js` — current booking page & request payload.
- `client/src/pages/OfficeBookingHome.js` — staff search UI.
- `client/src/components/SeatSelection.js` — reusable seat grid.
- `client/src/helpers/seatDisplay.js`, `helpers/axiosInstance.js`.
- `client/src/components/ProtectedRoute.js` / `PublicRoute.js`.
- `routes/routesRoute.js` — `search-trips`, `get-trip-by-id`, `formatTripResult`.
- `routes/bookingsRoute.js` — `book-seat`, `release-seat-hold`.
- `models/bookingsModel.js`, `models/tripModel.js`, `models/companyModel.js`, `models/usersModel.js`.
- `../onhigh_whatsapp_endpoint/main.py` — existing Pesepay checkout reference.
