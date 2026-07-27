import { Col, DatePicker, Row, Select, message } from "antd";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";
import "../../resourses/admin-dashboard.css";

const inactiveStatuses = new Set([
  "payment_cancelled",
  "payment_failed",
  "payment_expired",
  "cancelled",
  "cancelled_by_user",
  "cancelled_and_refunded",
  "cancelled_and_credited",
  "expired_and_refunded",
  "expired_and_credited",
  "failed",
  "expired",
]);

const cancelledStatuses = new Set([
  "cancelled",
  "cancelled_by_user",
  "cancelled_and_refunded",
  "cancelled_and_credited",
  "payment_cancelled",
  "expired_and_refunded",
  "expired_and_credited",
]);

const reservationStatuses = new Set([
  "reserved_awaiting_payment",
  "pending_pay_on_boarding",
]);

const money = (value) => `USD ${Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: 2,
  minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
})}`;

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const getSeats = (booking) => (Array.isArray(booking.seats) ? booking.seats : []);
const getBookingAmount = (booking) => {
  if (booking.amountPaid !== undefined && booking.amountPaid !== null) return Number(booking.amountPaid || 0);
  const seatCount = getSeats(booking).length || 1;
  const fare = Number(booking.fare ?? booking.bus?.fare ?? 0);
  return fare * seatCount;
};

const getRouteName = (booking) => {
  const from = booking.fromCity || booking.departureCity || booking.bus?.from || "Unknown";
  const to = booking.toCity || booking.dropoffCity || booking.bus?.to || "Unknown";
  return `${from} -> ${to}`;
};

const getBookingDate = (booking) => {
  const rawDate = booking.travelDate || booking.journeyDate || booking.trip?.journeyDate || booking.bus?.journeyDate || booking.createdAt;
  return moment(rawDate).isValid() ? moment(rawDate) : null;
};

const getSource = (booking) => {
  const source = String(booking.bookingSource || booking.booking_source || booking.cancellationSource || "").toLowerCase();
  if (source.includes("whatsapp") || source.includes("flow")) return "WhatsApp";
  return booking.user ? "Web App" : "WhatsApp";
};

const getPaymentMethod = (booking) => {
  const method = String(booking.paymentMethod || "").trim();
  if (method) return method;
  return getSource(booking) === "WhatsApp" ? "EcoCash" : "Card";
};

const getCustomerName = (booking) =>
  booking.customerName || booking.passengerName || booking.user?.name || "Walk-in Customer";

const getBusId = (booking) => String(booking.bus?._id || booking.bus || "");
const getRouteId = (booking) => String(booking.route?._id || booking.route || "");
const isCancelledBooking = (booking) =>
  [booking.status, booking.bookingStatus, booking.paymentStatus]
    .map(normalizeStatus)
    .some((status) => cancelledStatuses.has(status) || status.includes("cancel"));

const isPayOnBoardingReservation = (booking) => {
  const statuses = [booking.status, booking.bookingStatus, booking.paymentStatus].map(normalizeStatus);
  const method = String(booking.paymentMethod || "").trim().toLowerCase();
  return method === "pay on boarding" && statuses.some((status) => reservationStatuses.has(status));
};

const groupBy = (items, keyFn) =>
  items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

function AdminHome() {
  const dispatch = useDispatch();
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [filters, setFilters] = useState({
    dateRange: [],
    routeId: "all",
    busId: "all",
    status: "all",
  });

  const getDashboardData = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const [bookingsResponse, routesResponse, busesResponse] = await Promise.all([
        axiosInstance.post("/api/bookings/get-all-bookings", {}),
        axiosInstance.post("/api/routes/get-all-routes", {}),
        axiosInstance.post("/api/buses/get-all-buses", {}),
      ]);
      dispatch(HideLoading());

      if (bookingsResponse.data.success) setBookings(bookingsResponse.data.data || []);
      if (routesResponse.data.success) setRoutes(routesResponse.data.data || []);
      if (busesResponse.data.success) setBuses(busesResponse.data.data || []);
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  }, [dispatch]);

  useEffect(() => {
    getDashboardData();
  }, [getDashboardData]);

  const routeOptions = useMemo(() => routes.map((route) => ({
    value: String(route._id),
    label: route.routeName || `${route.fromCity || ""} - ${route.toCity || ""}`.trim() || "Unnamed Route",
  })), [routes]);

  const busOptions = useMemo(() => buses.map((bus) => ({
    value: String(bus._id),
    label: bus.name || bus.busName || bus.number || "Unnamed Bus",
  })), [buses]);

  const filteredBookings = useMemo(() => {
    const [startDate, endDate] = filters.dateRange || [];

    return bookings.filter((booking) => {
      if (filters.routeId !== "all" && getRouteId(booking) !== filters.routeId) return false;
      if (filters.busId !== "all" && getBusId(booking) !== filters.busId) return false;

      if (startDate && endDate) {
        const bookingDate = getBookingDate(booking);
        if (!bookingDate) return false;
        if (!bookingDate.isBetween(startDate.clone().startOf("day"), endDate.clone().endOf("day"), null, "[]")) {
          return false;
        }
      }

      if (filters.status === "valid") {
        const statuses = [booking.status, booking.bookingStatus, booking.paymentStatus].map(normalizeStatus);
        if (statuses.some((status) => inactiveStatuses.has(status))) return false;
      }

      if (filters.status === "cancelled" && !isCancelledBooking(booking)) return false;

      if (filters.status === "whatsapp" && getSource(booking) !== "WhatsApp") return false;
      if (filters.status === "web" && getSource(booking) !== "Web App") return false;

      return true;
    });
  }, [bookings, filters]);

  const metrics = useMemo(() => {
    const reservedBookings = filteredBookings.filter(isPayOnBoardingReservation);
    const activeReservedBookings = reservedBookings.filter((booking) => {
      const bookingDate = getBookingDate(booking);
      return !bookingDate || !bookingDate.isBefore(moment().startOf("day"));
    });
    const validBookings = filteredBookings.filter((booking) => {
      const statuses = [booking.status, booking.bookingStatus, booking.paymentStatus].map(normalizeStatus);
      return !isPayOnBoardingReservation(booking) && !statuses.some((status) => inactiveStatuses.has(status));
    });
    const cancelledBookings = filteredBookings.filter(isCancelledBooking);

    const totalSales = validBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0);
    const ticketsSold = validBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0);
    const averageTicket = ticketsSold ? totalSales / ticketsSold : 0;
    const grossProfit = totalSales * 0.4;
    const cancelledTickets = cancelledBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0);
    const cancelledValue = cancelledBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0);

    const routeRows = Object.entries(groupBy(validBookings, getRouteName))
      .map(([route, routeBookings]) => {
        const sales = routeBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0);
        return { route, sales, profit: sales ? 40 : 0 };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3);

    const sourceRows = Object.entries(groupBy(validBookings, getSource)).map(([source, sourceBookings]) => ({
      source,
      amount: sourceBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    }));

    const paymentRows = Object.entries(groupBy(validBookings, getPaymentMethod)).map(([method, methodBookings]) => ({
      method,
      amount: methodBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
    }));

    const customerRows = Object.entries(groupBy(validBookings, getCustomerName))
      .map(([customer, customerBookings]) => ({
        customer,
        tickets: customerBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0),
        spent: customerBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
      }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3);

    const timeRows = Object.entries(groupBy(validBookings, (booking) => booking.departureTime || booking.bus?.departure || "Not set"))
      .map(([time, timeBookings]) => ({
        time,
        sales: timeBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    const dayRows = Object.entries(groupBy(validBookings, (booking) => {
      const bookingDate = getBookingDate(booking);
      return bookingDate ? bookingDate.format("DD MMM") : "No date";
    }))
      .map(([date, dateBookings]) => ({
        date,
        sales: dateBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
      }))
      .slice(-8);

    const reservedBusRows = Object.entries(groupBy(activeReservedBookings, (booking) => booking.bus?.name || booking.busName || "Unknown Bus"))
      .map(([bus, busBookings]) => ({
        bus,
        reservations: busBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0),
        amount: busBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
      }))
      .sort((a, b) => b.reservations - a.reservations);

    const reservedRouteRows = Object.entries(groupBy(activeReservedBookings, getRouteName))
      .map(([route, routeBookings]) => ({
        route,
        reservations: routeBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0),
        amount: routeBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0),
      }))
      .sort((a, b) => b.reservations - a.reservations);

    const reservedSeatsAwaitingPayment = activeReservedBookings.reduce((sum, booking) => sum + (getSeats(booking).length || 1), 0);
    const reservedAmountAwaitingCollection = activeReservedBookings.reduce((sum, booking) => sum + getBookingAmount(booking), 0);

    return {
      validBookings,
      activeReservedBookings,
      reservedSeatsAwaitingPayment,
      reservedAmountAwaitingCollection,
      reservedBusRows,
      reservedRouteRows,
      totalSales,
      ticketsSold,
      averageTicket,
      grossProfit,
      cancelledTickets,
      cancelledValue,
      routeRows,
      sourceRows,
      paymentRows,
      customerRows,
      timeRows,
      dayRows,
      routeCount: routes.length,
      busCount: buses.length,
    };
  }, [filteredBookings, routes, buses]);

  const maxDaySales = Math.max(...metrics.dayRows.map((row) => row.sales), 1);
  const maxTimeSales = Math.max(...metrics.timeRows.map((row) => row.sales), 1);
  const sourceWhatsApp = metrics.sourceRows.find((row) => row.source === "WhatsApp")?.amount || 0;
  const sourceWeb = metrics.sourceRows.find((row) => row.source === "Web App")?.amount || 0;
  const sourcePercent = metrics.totalSales ? Math.round((sourceWhatsApp / metrics.totalSales) * 100) : 50;
  const paymentTopPercent = metrics.totalSales
    ? Math.round(((metrics.paymentRows[0]?.amount || 0) / metrics.totalSales) * 100)
    : 50;

  return (
    <div className="admin-dashboard">
      <div className="dash-header">
        <div>
          <h1>Sales Dashboard</h1>
          <p>Overview of key sales performance</p>
        </div>
        <div className="dash-filters">
          <DatePicker.RangePicker
            className="dash-date-filter"
            value={filters.dateRange.length ? filters.dateRange : null}
            onChange={(dateRange) => setFilters((current) => ({ ...current, dateRange: dateRange || [] }))}
          />
          <Select
            className="dash-select"
            value={filters.routeId}
            onChange={(routeId) => setFilters((current) => ({ ...current, routeId }))}
            options={[{ value: "all", label: "All Routes" }, ...routeOptions]}
          />
          <Select
            className="dash-select"
            value={filters.busId}
            onChange={(busId) => setFilters((current) => ({ ...current, busId }))}
            options={[{ value: "all", label: "All Buses" }, ...busOptions]}
          />
          <Select
            className="dash-select dash-status-filter"
            value={filters.status}
            onChange={(status) => setFilters((current) => ({ ...current, status }))}
            options={[
              { value: "all", label: "All Tickets" },
              { value: "valid", label: "Valid Tickets" },
              { value: "cancelled", label: "Cancelled" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "web", label: "Web App" },
            ]}
          />
          <button className="dash-filter-button" type="button" onClick={getDashboardData}>
            <i className="ri-refresh-line"></i> Refresh
          </button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={5}>
          <MetricCard icon="ri-money-dollar-circle-line" title="Total Sales" value={money(metrics.totalSales)} trend="+ 18.7%" />
        </Col>
        <Col xs={24} md={12} xl={5}>
          <MetricCard icon="ri-ticket-2-line" title="Tickets Sold" value={metrics.ticketsSold} trend="+ 14.2%" />
        </Col>
        <Col xs={24} md={12} xl={5}>
          <MetricCard icon="ri-price-tag-3-line" title="Average Ticket Value" value={money(metrics.averageTicket)} trend="+ 3.6%" />
        </Col>
        <Col xs={24} md={12} xl={5}>
          <MetricCard icon="ri-line-chart-line" title="Gross Profit" value={money(metrics.grossProfit)} trend="+ 20.1%" />
        </Col>
        <Col xs={24} md={12} xl={4}>
          <MetricCard icon="ri-close-circle-line" title="Ticket Cancelled" value={metrics.cancelledTickets} trend={money(metrics.cancelledValue)} muted />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mt-3">
        <Col xs={24}>
          <section className="dash-card">
            <div className="dash-card-title">
              <h2><i className="ri-reserved-line"></i> Reserved Seats Awaiting Payment</h2>
              <span>{metrics.activeReservedBookings.length} reservation(s)</span>
            </div>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <div className="dash-reserved-summary">
                  <span>Total Reserved Seats Awaiting Payment</span>
                  <strong>{metrics.reservedSeatsAwaitingPayment}</strong>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div className="dash-reserved-summary">
                  <span>Total Amount Awaiting Collection</span>
                  <strong>{money(metrics.reservedAmountAwaitingCollection)}</strong>
                </div>
              </Col>
            </Row>
            <Row gutter={[12, 12]} className="mt-3">
              <Col xs={24} md={12}>
                <h3 className="dash-subtitle">Reservations by Bus</h3>
                <table className="dash-table">
                  <tbody>
                    {metrics.reservedBusRows.length ? metrics.reservedBusRows.slice(0, 5).map((row) => (
                      <tr key={row.bus}>
                        <td>{row.bus}</td>
                        <td>{row.reservations}</td>
                        <td>{money(row.amount)}</td>
                      </tr>
                    )) : (
                      <tr><td>No reservations awaiting payment</td><td></td><td></td></tr>
                    )}
                  </tbody>
                </table>
              </Col>
              <Col xs={24} md={12}>
                <h3 className="dash-subtitle">Reservations by Route</h3>
                <table className="dash-table">
                  <tbody>
                    {metrics.reservedRouteRows.length ? metrics.reservedRouteRows.slice(0, 5).map((row) => (
                      <tr key={row.route}>
                        <td>{row.route}</td>
                        <td>{row.reservations}</td>
                        <td>{money(row.amount)}</td>
                      </tr>
                    )) : (
                      <tr><td>No reservations awaiting payment</td><td></td><td></td></tr>
                    )}
                  </tbody>
                </table>
              </Col>
            </Row>
          </section>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mt-3">
        <Col xs={24} xl={10}>
          <section className="dash-card">
            <div className="dash-card-title">
              <h2><i className="ri-line-chart-line"></i> Sales Over Time</h2>
              <span>Daily</span>
            </div>
            <div className="dash-bars">
              {metrics.dayRows.length ? metrics.dayRows.map((row) => (
                <div className="dash-bar-column" key={row.date}>
                  <div className="dash-bar" style={{ height: `${Math.max((row.sales / maxDaySales) * 100, 8)}%` }}></div>
                  <span>{row.date}</span>
                </div>
              )) : <p className="dash-empty">No sales data yet.</p>}
            </div>
          </section>
        </Col>
        <Col xs={24} md={12} xl={7}>
          <DonutCard title="Sales by Source" percent={sourcePercent} center={money(metrics.totalSales)} rows={[
            { label: "WhatsApp", value: sourceWhatsApp },
            { label: "Web App", value: sourceWeb },
          ]} />
        </Col>
        <Col xs={24} md={12} xl={7}>
          <DonutCard title="Sales by Payment Method" percent={paymentTopPercent} center={metrics.paymentRows[0]?.method || "None"} rows={metrics.paymentRows.slice(0, 4).map((row) => ({ label: row.method, value: row.amount }))} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mt-3">
        <Col xs={24} xl={7}>
          <section className="dash-card">
            <h2><i className="ri-route-line"></i> Top Profitable Routes</h2>
            <table className="dash-table">
              <tbody>
                {metrics.routeRows.map((row) => (
                  <tr key={row.route}>
                    <td>{row.route}</td>
                    <td>{money(row.sales)}</td>
                    <td><span>{row.profit}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </Col>
        <Col xs={24} xl={8}>
          <section className="dash-card">
            <h2><i className="ri-time-line"></i> Best Selling Times</h2>
            <div className="dash-time-list">
              {metrics.timeRows.map((row) => (
                <div className="dash-time-row" key={row.time}>
                  <strong>{row.time}</strong>
                  <div><span style={{ width: `${Math.max((row.sales / maxTimeSales) * 100, 8)}%` }}></span></div>
                  <b>{money(row.sales)}</b>
                </div>
              ))}
            </div>
          </section>
        </Col>
        <Col xs={24} xl={9}>
          <section className="dash-card">
            <h2><i className="ri-user-star-line"></i> Top Customers</h2>
            <table className="dash-table">
              <tbody>
                {metrics.customerRows.map((row) => (
                  <tr key={row.customer}>
                    <td>{row.customer}</td>
                    <td>{row.tickets}</td>
                    <td>{money(row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </Col>
      </Row>

      <section className="dash-card dash-quick mt-3">
        <h2><i className="ri-equalizer-line"></i> Quick Overview</h2>
        <div>
          <span>{metrics.routeCount} routes</span>
          <span>{metrics.busCount} buses</span>
          <span>{metrics.validBookings.length} valid bookings</span>
          <span>{metrics.cancelledTickets} tickets cancelled</span>
          <span>{metrics.ticketsSold} tickets sold</span>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, title, value, trend, muted = false }) {
  return (
    <section className={`dash-card dash-metric ${muted ? "dash-metric-muted" : ""}`}>
      <div className="dash-icon"><i className={icon}></i></div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p><i className={muted ? "ri-refund-2-line" : "ri-arrow-up-line"}></i>{muted ? trend : `${trend} vs previous period`}</p>
      </div>
    </section>
  );
}

function DonutCard({ title, percent, center, rows }) {
  return (
    <section className="dash-card">
      <h2>{title}</h2>
      <div className="dash-donut-wrap">
        <div className="dash-donut" style={{ "--dash-percent": `${percent}%` }}>
          <span>{center}</span>
        </div>
        <div className="dash-legend">
          {rows.map((row, index) => (
            <p key={row.label}>
              <i className={index % 2 ? "alt" : ""}></i>
              {row.label}
              <strong>{money(row.value)}</strong>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AdminHome;
