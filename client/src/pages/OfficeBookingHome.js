import { Card, Checkbox, Col, Form, Input, InputNumber, message, Radio, Row, Select, Steps } from "antd";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import SeatSelection from "../components/SeatSelection";
import { axiosInstance } from "../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";

const canShowBus = (bus) => !bus.status || ["Yet To Start", "Active"].includes(bus.status);
const routeIsActive = (route) => route.status !== "Inactive";
const stopIsActive = (stop) => stop.isActive !== false;
const cityKey = (city) => String(city || "").trim().toLowerCase();

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const addCityOption = (optionsByKey, city) => {
  const title = String(city || "").trim();
  if (!title) return;
  optionsByKey[cityKey(title)] = title;
};

const cityFilterOption = (input, option) =>
  String(option?.value || "").toLowerCase().includes(String(input || "").toLowerCase());

const pointFilterOption = (input, option) =>
  String(option?.children || "").toLowerCase().includes(String(input || "").toLowerCase());

const currencyLabel = (currency) => (String(currency || "").toUpperCase() === "ZAR" ? "R" : "US$");

const normalizePointOptions = (...sources) => {
  const points = sources
    .flatMap((source) => (Array.isArray(source) ? source : String(source || "").split(",")))
    .map((point) => String(point || "").trim())
    .filter(Boolean);
  return [...new Set(points)];
};

const normalizeDateValue = (value) => String(value || "").slice(0, 10);

const matchesOfficeSearch = (bus, filters, seatCount) =>
  cityKey(bus?.from || bus?.fromCity) === cityKey(filters.from) &&
  cityKey(bus?.to || bus?.toCity) === cityKey(filters.to) &&
  normalizeDateValue(bus?.journeyDate || bus?.date || filters.journeyDate) === normalizeDateValue(filters.journeyDate) &&
  Number(bus?.seatsLeft || 0) >= seatCount;

const getRouteId = (route) => String(route?._id || route || "");

const getBusRouteId = (bus) => getRouteId(bus?.route?._id || bus?.route || bus?.routeId);

const busMatchesPreviewFilters = (bus, filters, seatCount) => {
  if (!canShowBus(bus) || Number(bus?.seatsLeft || 0) < seatCount) return false;
  if (normalizeDateValue(bus?.journeyDate || bus?.date) !== normalizeDateValue(filters.journeyDate)) return false;

  const stops = Array.isArray(bus.routeStops) ? bus.routeStops : [];
  const fromFilter = cityKey(filters.from);
  const toFilter = cityKey(filters.to);

  if (!fromFilter && !toFilter) return true;

  const fromIndex = stops.findIndex((stop) => cityKey(stop.cityName) === fromFilter);
  if (fromFilter && fromIndex === -1 && cityKey(bus.from || bus.fromCity) !== fromFilter) return false;

  if (!toFilter) return true;

  if (fromIndex >= 0) {
    return stops.slice(fromIndex + 1).some((stop) => cityKey(stop.cityName) === toFilter);
  }

  return cityKey(bus.to || bus.toCity) === toFilter;
};

function OfficeBookingHome() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [bookingForm] = Form.useForm();
  const todayDate = getTodayDate();
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    journeyDate: todayDate,
    seatCount: 1,
  });
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [availableBuses, setAvailableBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [customBoarding, setCustomBoarding] = useState(false);
  const [customDropOff, setCustomDropOff] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const busScrollerRef = useRef(null);
  const previewBusScrollerRef = useRef(null);

  const seatCount = Number(filters.seatCount || 1);

  const updateFilters = (nextFilters) => {
    setFilters(nextFilters);
    setBuses([]);
    setSelectedBus(null);
    setSelectedSeats([]);
    setHasSearched(false);
    setSearchMessage("");
    setCurrentStep(0);
  };

  const fromCityOptions = useMemo(() => {
    const optionsByKey = {};
    routes.filter(routeIsActive).forEach((route) => {
      const stops = (route.stops || []).filter(stopIsActive);
      stops.slice(0, -1).forEach((stop) => addCityOption(optionsByKey, stop.cityName));
    });
    return Object.values(optionsByKey).sort((a, b) => a.localeCompare(b));
  }, [routes]);

  const toCityOptions = useMemo(() => {
    const optionsByKey = {};
    const selectedFromKey = cityKey(filters.from);
    if (!selectedFromKey) return [];
    routes.filter(routeIsActive).forEach((route) => {
      const stops = (route.stops || []).filter(stopIsActive);
      stops.forEach((stop, index) => {
        if (cityKey(stop.cityName) !== selectedFromKey) return;
        stops.slice(index + 1).forEach((toStop) => addCityOption(optionsByKey, toStop.cityName));
      });
    });
    return Object.values(optionsByKey).sort((a, b) => a.localeCompare(b));
  }, [filters.from, routes]);

  const pointOptions = useMemo(() => {
    if (!selectedBus) return { boarding: [], dropOff: [] };
    return {
      boarding: normalizePointOptions(selectedBus.boardingPoints, selectedBus.boardingPoint),
      dropOff: normalizePointOptions(selectedBus.dropOffPoints, selectedBus.dropOffPoint),
    };
  }, [selectedBus]);

  const routeById = useMemo(() => {
    return routes.reduce((acc, route) => {
      acc[getRouteId(route)] = route;
      return acc;
    }, {});
  }, [routes]);

  const previewBusCards = useMemo(() => {
    return availableBuses
      .map((bus) => {
        const route = routeById[getBusRouteId(bus)] || bus.route || {};
        const stops = Array.isArray(route.stops) ? route.stops.filter(stopIsActive) : [];
        const firstStop = stops[0] || {};
        const lastStop = stops[stops.length - 1] || {};
        return {
          ...bus,
          routeStops: stops,
          from: bus.from || route.fromCity || firstStop.cityName,
          to: bus.to || route.toCity || lastStop.cityName,
          fare: bus.fare || route.fare || 0,
          currency: bus.currency || bus.fareCurrency || route.fareCurrency || "USD",
          departure: bus.departure || firstStop.departureTime || "-",
          arrival: bus.arrival || lastStop.arrivalTime || "-",
        };
      })
      .filter((bus) => busMatchesPreviewFilters(bus, filters, seatCount));
  }, [availableBuses, filters, routeById, seatCount]);

  const getRouteCities = async () => {
    try {
      const response = await axiosInstance.post("/api/routes/get-all-routes", {});
      if (response.data.success) {
        setRoutes(response.data.data);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  };

  const getAvailableBuses = async () => {
    try {
      const response = await axiosInstance.post("/api/buses/get-seat-availability", {});
      if (response.data.success) {
        setAvailableBuses(response.data.data || []);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  };

  const getBuses = async () => {
    if (!filters.from || !filters.to || !filters.journeyDate || !seatCount) {
      message.error("Select from, to, journey date and number of seats.");
      return;
    }
    if (filters.journeyDate < todayDate) {
      message.error("Past dates are not allowed for booking.");
      return;
    }

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/routes/search-trips", filters);
      dispatch(HideLoading());
      if (response.data.success) {
        const availableBuses = (response.data.data || [])
          .filter(canShowBus)
          .filter((bus) => matchesOfficeSearch(bus, filters, seatCount));
        setBuses(availableBuses);
        setHasSearched(true);
        setSearchMessage(
          availableBuses.length
            ? ""
            : "No available bus matches the selected route, date and seat count."
        );
        setCurrentStep(1);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const chooseBus = (bus) => {
    setSelectedBus(bus);
    setSelectedSeats([]);
    setCustomBoarding(false);
    setCustomDropOff(false);
    bookingForm.resetFields();
    const boardingOptions = normalizePointOptions(bus.boardingPoints, bus.boardingPoint);
    const dropOffOptions = normalizePointOptions(bus.dropOffPoints, bus.dropOffPoint);
    bookingForm.setFieldsValue({
      boardingPoint: boardingOptions[0],
      dropOffPoint: dropOffOptions[0],
      passengerGender: "male",
    });
    setCurrentStep(2);
  };

  const setLimitedSeats = (nextSeats) => {
    if (nextSeats.length > seatCount) {
      message.warning(`Select only ${seatCount} seat${seatCount > 1 ? "s" : ""}.`);
      return;
    }
    setSelectedSeats(nextSeats);
  };

  const continueFromPoints = async () => {
    try {
      await bookingForm.validateFields([
        ...(customBoarding ? ["customBoardingPoint"] : ["boardingPoint"]),
        ...(customDropOff ? ["customDropOffPoint"] : ["dropOffPoint"]),
      ]);
      setCurrentStep(3);
    } catch (error) {
      message.error("Complete boarding and drop-off details.");
    }
  };

  const continueFromPassenger = async () => {
    try {
      await bookingForm.validateFields(["passengerName", "passengerAge", "passengerGender"]);
      setCurrentStep(4);
    } catch (error) {
      message.error("Complete passenger details.");
    }
  };

  const submitBooking = async (values) => {
    if (!selectedBus) {
      message.error("Select a bus first.");
      return;
    }
    if (selectedSeats.length !== seatCount) {
      message.error(`Select ${seatCount} seat${seatCount > 1 ? "s" : ""}.`);
      return;
    }

    const boardingPoint = customBoarding ? values.customBoardingPoint : values.boardingPoint;
    const dropOffPoint = customDropOff ? values.customDropOffPoint : values.dropOffPoint;

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/book-seat", {
        bus: selectedBus.busId || selectedBus._id,
        trip: selectedBus.tripId,
        route: selectedBus.routeId,
        fromStop: selectedBus.fromStopId,
        toStop: selectedBus.toStopId,
        fromStopOrder: selectedBus.fromStopOrder,
        toStopOrder: selectedBus.toStopOrder,
        fromCity: selectedBus.from,
        toCity: selectedBus.to,
        journeyDate: selectedBus.journeyDate || selectedBus.date,
        travelDate: selectedBus.journeyDate || selectedBus.date,
        departureTime: selectedBus.departure,
        arrivalTime: selectedBus.arrival,
        boardingPoint,
        dropOffPoint,
        fare: selectedBus.fare,
        currency: selectedBus.currency || selectedBus.fareCurrency || "USD",
        seats: selectedSeats,
        customerName: values.passengerName,
        passengerName: values.passengerName,
        passengerAge: String(values.passengerAge || ""),
        passengerGender: values.passengerGender,
        bookingSource: "WEB_APP",
        paymentMethod: "Cash",
        paymentStatus: "Paid",
        status: "CONFIRMED",
        bookingStatus: "CONFIRMED",
        boardedStatus: "NOT_BOARDED",
        transactionId: "OFFICE-" + Date.now(),
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        setSelectedBus(null);
        setSelectedSeats([]);
        bookingForm.resetFields();
        navigate("/bookings");
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  useEffect(() => {
    getRouteCities();
    getAvailableBuses();
  }, []);

  useEffect(() => {
    if (filters.to && !toCityOptions.some((city) => cityKey(city) === cityKey(filters.to))) {
      updateFilters({ ...filters, to: "" });
    }
  }, [filters, toCityOptions]);

  const stepItems = [
    { title: "Filter" },
    { title: "Buses" },
    { title: "Points" },
    { title: "Passenger" },
    { title: "Seats" },
  ];

  const getBusKey = (bus) => String(bus?.tripId || bus?._id || bus?.busId || "");

  const scrollBusCards = (direction) => {
    const scrollAmount = Math.max(260, Math.floor((busScrollerRef.current?.clientWidth || 320) * 0.85));
    busScrollerRef.current?.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  };

  const scrollPreviewBusCards = (direction) => {
    const scrollAmount = Math.max(260, Math.floor((previewBusScrollerRef.current?.clientWidth || 320) * 0.85));
    previewBusScrollerRef.current?.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  };

  const bookPreviewBus = async (previewBus) => {
    const previewFilters = {
      from: filters.from || previewBus.from,
      to: filters.to || previewBus.to,
      journeyDate: filters.journeyDate || normalizeDateValue(previewBus.journeyDate || previewBus.date),
      seatCount,
    };

    if (!previewFilters.from || !previewFilters.to || !previewFilters.journeyDate) {
      message.error("Select from, to and journey date before booking.");
      return;
    }

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/routes/search-trips", previewFilters);
      dispatch(HideLoading());
      if (response.data.success) {
        const availableBuses = (response.data.data || [])
          .filter(canShowBus)
          .filter((bus) => matchesOfficeSearch(bus, previewFilters, seatCount));
        const selectedPreviewKey = String(previewBus.busId || previewBus._id || previewBus.number || "");
        const matchedBus =
          availableBuses.find((bus) => String(bus.busId || bus._id || bus.number || "") === selectedPreviewKey) ||
          availableBuses[0];

        setFilters(previewFilters);
        setBuses(availableBuses);
        setHasSearched(true);
        setSearchMessage(
          availableBuses.length
            ? ""
            : "No available bus matches the selected route, date and seat count."
        );

        if (matchedBus) {
          chooseBus(matchedBus);
        } else {
          setCurrentStep(1);
        }
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const renderPreviewBusCards = () => (
    <div className="office-preview-buses">
      <div className="office-booking-header">
        <div>
          <h2>Available Buses</h2>
        </div>
      </div>
      {previewBusCards.length ? (
        <div className="office-bus-carousel">
          {previewBusCards.length > 1 && (
            <button
              type="button"
              className="office-bus-arrow office-bus-arrow-left"
              onClick={() => scrollPreviewBusCards(-1)}
              aria-label="Scroll available buses left"
            >
              &lt;
            </button>
          )}
          <div className="office-bus-scroll" ref={previewBusScrollerRef}>
            {previewBusCards.map((bus) => (
              <Card key={getBusKey(bus)} className="office-bus-card office-bus-card-preview">
                <h3>{bus.name}</h3>
                <p>{bus.number}</p>
                <div className="office-bus-card-row">
                  <span>{bus.from} - {bus.to}</span>
                  <strong>{currencyLabel(bus.currency || bus.fareCurrency)} {bus.fare}</strong>
                </div>
                <div className="office-bus-card-row">
                  <span>{bus.departure} - {bus.arrival}</span>
                  <strong>{bus.seatsLeft} left</strong>
                </div>
                <div className="office-bus-card-action">
                  <button type="button" className="primary-btn" onClick={() => bookPreviewBus(bus)}>
                    Book Now
                  </button>
                </div>
              </Card>
            ))}
          </div>
          {previewBusCards.length > 1 && (
            <button
              type="button"
              className="office-bus-arrow office-bus-arrow-right"
              onClick={() => scrollPreviewBusCards(1)}
              aria-label="Scroll available buses right"
            >
              &gt;
            </button>
          )}
        </div>
      ) : (
        <p className="office-preview-empty">No available buses match the current filter.</p>
      )}
    </div>
  );

  const renderFilterStep = () => (
    <Card className="office-booking-card">
      <div className="office-booking-header">
        <div>
          <h2>Office Booking</h2>
          <p>Filter assigned buses first, then continue through each booking step.</p>
        </div>
      </div>
      <Form form={form} layout="vertical">
        <Row gutter={[12, 12]} align="bottom">
          <Col lg={5} md={12} xs={24}>
            <Form.Item label="From">
              <Select
                showSearch
                allowClear
                placeholder="Departure city"
                optionFilterProp="value"
                filterOption={cityFilterOption}
                value={filters.from || undefined}
                onChange={(value) => updateFilters({ ...filters, from: value || "", to: "" })}
              >
                {fromCityOptions.map((city) => (
                  <Select.Option value={city} key={city}>{city}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col lg={5} md={12} xs={24}>
            <Form.Item label="To">
              <Select
                showSearch
                allowClear
                placeholder={filters.from ? "Destination city" : "Choose From first"}
                optionFilterProp="value"
                filterOption={cityFilterOption}
                value={filters.to || undefined}
                disabled={!filters.from}
                onChange={(value) => updateFilters({ ...filters, to: value || "" })}
              >
                {toCityOptions.map((city) => (
                  <Select.Option value={city} key={city}>{city}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col lg={5} md={12} xs={24}>
            <Form.Item label="Journey Date">
              <Input
                type="date"
                min={todayDate}
                value={filters.journeyDate}
                onChange={(event) => updateFilters({ ...filters, journeyDate: event.target.value })}
              />
            </Form.Item>
          </Col>
          <Col lg={4} md={12} xs={24}>
            <Form.Item label="Seats">
              <InputNumber
                min={1}
                max={20}
                value={filters.seatCount}
                onChange={(value) => updateFilters({ ...filters, seatCount: Number(value || 1) })}
              />
            </Form.Item>
          </Col>
          <Col lg={5} md={24} xs={24}>
            <button type="button" className="secondary-btn office-filter-button" onClick={getBuses}>
              Filter
            </button>
          </Col>
        </Row>
      </Form>
      {renderPreviewBusCards()}
    </Card>
  );

  const renderBusStep = () => (
    <Card className="office-booking-card">
      <div className="office-booking-header">
        <div>
          <h2>Available Buses</h2>
          <p>Select one bus to continue.</p>
        </div>
      </div>
      {hasSearched && searchMessage && <p className="text-md my-3">{searchMessage}</p>}
      <div className="office-bus-carousel">
        {buses.length > 1 && (
          <button
            type="button"
            className="office-bus-arrow office-bus-arrow-left"
            onClick={() => scrollBusCards(-1)}
            aria-label="Scroll buses left"
          >
            &lt;
          </button>
        )}
        <div className="office-bus-scroll" ref={busScrollerRef}>
          {buses.map((bus) => (
            <Card
              key={getBusKey(bus)}
              className={`office-bus-card ${getBusKey(selectedBus) === getBusKey(bus) ? "selected" : ""}`}
            >
              <h3>{bus.name}</h3>
              <p>{bus.number}</p>
              <div className="office-bus-card-row">
                <span>{bus.from} - {bus.to}</span>
                <strong>{currencyLabel(bus.currency || bus.fareCurrency)} {bus.fare}</strong>
              </div>
              <div className="office-bus-card-row">
                <span>{bus.departure} - {bus.arrival}</span>
                <strong>{bus.seatsLeft} left</strong>
              </div>
              <div className="office-bus-card-action">
                <button type="button" className="primary-btn" onClick={() => chooseBus(bus)}>
                  Book Now
                </button>
              </div>
            </Card>
          ))}
        </div>
        {buses.length > 1 && (
          <button
            type="button"
            className="office-bus-arrow office-bus-arrow-right"
            onClick={() => scrollBusCards(1)}
            aria-label="Scroll buses right"
          >
            &gt;
          </button>
        )}
      </div>
      <div className="office-step-actions office-step-actions-left">
        <button type="button" className="secondary-btn" onClick={() => setCurrentStep(0)}>
          Back to Filter
        </button>
      </div>
    </Card>
  );

  const renderPointsStep = () => (
    <Card className="office-booking-card">
      <div className="office-booking-header">
        <div>
          <h2>Boarding and Drop-off</h2>
          <p>{selectedBus?.name} - {selectedBus?.number}</p>
        </div>
      </div>
      <Form form={bookingForm} layout="vertical">
        <Row gutter={[12, 12]}>
          <Col md={12} xs={24}>
            <Form.Item label="Boarding Point" name="boardingPoint" rules={customBoarding ? [] : [{ required: true, message: "Boarding point is required" }]}>
              <Select showSearch disabled={customBoarding} placeholder="Search boarding point" filterOption={pointFilterOption}>
                {pointOptions.boarding.map((point) => (
                  <Select.Option value={point} key={point}>{point}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Checkbox checked={customBoarding} onChange={(event) => setCustomBoarding(event.target.checked)}>
              I did not find the boarding point
            </Checkbox>
            {customBoarding && (
              <Form.Item className="mt-2" name="customBoardingPoint" rules={[{ required: true, message: "Type boarding point" }]}>
                <Input placeholder="Type boarding point" />
              </Form.Item>
            )}
          </Col>
          <Col md={12} xs={24}>
            <Form.Item label="Drop-off Point" name="dropOffPoint" rules={customDropOff ? [] : [{ required: true, message: "Drop-off point is required" }]}>
              <Select showSearch disabled={customDropOff} placeholder="Search drop-off point" filterOption={pointFilterOption}>
                {pointOptions.dropOff.map((point) => (
                  <Select.Option value={point} key={point}>{point}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Checkbox checked={customDropOff} onChange={(event) => setCustomDropOff(event.target.checked)}>
              I did not find the drop-off point
            </Checkbox>
            {customDropOff && (
              <Form.Item className="mt-2" name="customDropOffPoint" rules={[{ required: true, message: "Type drop-off point" }]}>
                <Input placeholder="Type drop-off point" />
              </Form.Item>
            )}
          </Col>
        </Row>
      </Form>
      <div className="office-step-actions">
        <button type="button" className="primary-btn" onClick={continueFromPoints}>Next</button>
        <button type="button" className="secondary-btn" onClick={() => setCurrentStep(1)}>Back</button>
      </div>
    </Card>
  );

  const renderPassengerStep = () => (
    <Card className="office-booking-card">
      <div className="office-booking-header">
        <div>
          <h2>Primary Passenger Details</h2>
          <p>Capture the passenger travelling on this booking.</p>
        </div>
      </div>
      <Form form={bookingForm} layout="vertical">
        <Row gutter={[12, 12]}>
          <Col md={12} xs={24}>
            <Form.Item label="Full Name" name="passengerName" rules={[{ required: true, message: "Passenger name is required" }]}>
              <Input placeholder="Passenger full name" />
            </Form.Item>
          </Col>
          <Col md={6} xs={24}>
            <Form.Item
              label="Age"
              name="passengerAge"
              rules={[
                { required: true, message: "Age is required" },
                {
                  validator: (_, value) =>
                    Number.isInteger(Number(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error("Age must be a whole number")),
                },
              ]}
            >
              <InputNumber min={1} max={120} precision={0} step={1} />
            </Form.Item>
          </Col>
          <Col md={6} xs={24}>
            <Form.Item label="Gender" name="passengerGender" rules={[{ required: true, message: "Gender is required" }]}>
              <Radio.Group>
                <Radio value="male">Male</Radio>
                <Radio value="female">Female</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <div className="office-step-actions">
        <button type="button" className="primary-btn" onClick={continueFromPassenger}>Next</button>
        <button type="button" className="secondary-btn" onClick={() => setCurrentStep(2)}>Back</button>
      </div>
    </Card>
  );

  const renderSeatsStep = () => (
    <Card className="office-booking-card">
      <div className="office-seat-layout">
        <div className="office-seat-summary">
          <h2>Seats</h2>
          <p>Select {seatCount} seat{seatCount > 1 ? "s" : ""}</p>
          <div className="office-seat-summary-list">
            <div>
              <span>Route</span>
              <strong>{selectedBus?.from} - {selectedBus?.to}</strong>
            </div>
            <div>
              <span>Bus</span>
              <strong>{selectedBus?.name} ({selectedBus?.number})</strong>
            </div>
            <div>
              <span>Fare</span>
              <strong>{currencyLabel(selectedBus?.currency || selectedBus?.fareCurrency)} {Number(selectedBus?.fare || 0)}</strong>
            </div>
            <div>
              <span>Selected Seats</span>
              <strong>{selectedSeats.join(", ") || "-"}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{currencyLabel(selectedBus?.currency || selectedBus?.fareCurrency)} {Number(selectedBus?.fare || 0) * selectedSeats.length}</strong>
            </div>
          </div>
          <div className="office-seat-actions">
            <button type="button" className="primary-btn" onClick={() => bookingForm.validateFields().then(submitBooking)}>
              Book Now
            </button>
            <button type="button" className="secondary-btn" onClick={() => setCurrentStep(3)}>Back</button>
          </div>
        </div>
        <div className="office-seat-map">
          {selectedBus && (
            <SeatSelection selectedSeats={selectedSeats} setSelectedSeats={setLimitedSeats} bus={selectedBus} />
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="office-booking-page">
      <Card className="office-steps-card">
        <Steps current={currentStep} items={stepItems} responsive />
      </Card>
      {currentStep === 0 && renderFilterStep()}
      {currentStep === 1 && renderBusStep()}
      {currentStep === 2 && selectedBus && renderPointsStep()}
      {currentStep === 3 && selectedBus && renderPassengerStep()}
      {currentStep === 4 && selectedBus && renderSeatsStep()}
    </div>
  );
}

export default OfficeBookingHome;
