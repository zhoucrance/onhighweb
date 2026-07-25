import React, { useEffect, useMemo, useRef, useState } from "react";
import { Col, message, Modal, Row, Select } from "antd";
import { useDispatch } from "react-redux";
import { axiosInstance } from "../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";

const makeStopId = () => `stop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const emptyOutboundSchedule = () => ({
  enabled: true,
  departureDay: "",
  departureTime: "",
  arrivalDay: "",
  arrivalTime: "",
});

const emptyReturnSchedule = () => ({
  enabled: false,
  departureCity: "",
  arrivalCity: "",
  departureDay: "",
  departureTime: "",
  arrivalDay: "",
  arrivalTime: "",
  notes: "",
});

const emptyStop = (index) => ({
  clientId: makeStopId(),
  cityName: "",
  boardingPoints: [],
  arrivalTime: "",
  departureTime: "",
  distanceFromPrevious: "",
  durationFromPrevious: "",
  stopMinutes: "0",
  stopOrder: index + 1,
  isActive: true,
});

const stopKey = (stop) => stop._id || stop.clientId;

const parseDistance = (value) => {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDurationToMinutes = (value) => {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return 0;

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hourMatch || minuteMatch) {
    return (
      Number(hourMatch?.[1] || 0) * 60 + Number(minuteMatch?.[1] || 0)
    );
  }

  if (text.includes(":")) {
    const [hours, minutes] = text.split(":").map((item) => Number(item));
    return (Number.isFinite(hours) ? hours * 60 : 0) + (Number.isFinite(minutes) ? minutes : 0);
  }

  const numeric = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatDistance = (distance) => {
  if (!distance) return "";
  const rounded = Math.round(distance * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded} km`;
};

const formatDuration = (minutes) => {
  if (!minutes) return "";
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  if (!hours) return `${remainder}m`;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
};

const uniqueMessages = (messages) => [...new Set(messages)];

const scheduleSummary = (schedule, fallbackDepartureCity, fallbackArrivalCity) => {
  if (!schedule?.departureDay || !schedule?.departureTime || !schedule?.arrivalDay || !schedule?.arrivalTime) {
    return "Set the journey day and time details.";
  }

  const fromCity = schedule.departureCity || fallbackDepartureCity || "Departure city";
  const toCity = schedule.arrivalCity || fallbackArrivalCity || "arrival city";
  const nextDayText = schedule.arrivalDay !== schedule.departureDay ? ` (${schedule.arrivalDay})` : "";
  return `${fromCity} departs every ${schedule.departureDay} at ${schedule.departureTime} and arrives at ${toCity}${nextDayText} at ${schedule.arrivalTime}.`;
};

function BoardingPointsEditor({ points, onChange }) {
  const [draftPoint, setDraftPoint] = useState("");
  const cleanPoints = points || [];

  const addPoint = () => {
    const nextPoint = draftPoint.trim();
    if (!nextPoint) return;
    onChange([...cleanPoints, nextPoint]);
    setDraftPoint("");
  };

  const removePoint = (index) => {
    onChange(cleanPoints.filter((point, pointIndex) => pointIndex !== index));
  };

  return (
    <div className="route-boarding-editor">
      <div className="route-boarding-input-row">
        <input
          value={draftPoint}
          placeholder="Add boarding point"
          onChange={(event) => setDraftPoint(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addPoint();
            }
          }}
        />
        <button type="button" onClick={addPoint}>
          Add
        </button>
      </div>
      <div className="route-boarding-points-list">
        {cleanPoints.length ? (
          cleanPoints.map((point, index) => (
            <span className="route-boarding-chip" key={`${point}-${index}`}>
              {point}
              <button type="button" onClick={() => removePoint(index)}>
                <i className="ri-close-line"></i>
              </button>
            </span>
          ))
        ) : (
          <span className="route-empty-points">No boarding points yet</span>
        )}
      </div>
    </div>
  );
}

function RouteBasicInfoForm({
  companyId,
  setCompanyId,
  companies,
  routeName,
  setRouteName,
  routeCode,
  setRouteCode,
  startCity,
  setStartCity,
  endCity,
  setEndCity,
  status,
  setStatus,
  errors,
}) {
  const companyOptions = companies.map((company) => ({
    value: company._id,
    label: company.companyName,
  }));

  return (
    <div className="route-card route-basic-card">
      <div className="route-title-row">
        <h1>Edit Route</h1>
        <span className={`route-status-badge ${status === "Active" ? "active" : "inactive"}`}>
          {status}
        </span>
      </div>
      <Row gutter={[18, 14]}>
        {companyOptions.length > 1 && (
          <Col lg={6} md={12} xs={24}>
            <label>Company <span>*</span></label>
            <Select
              value={companyId || undefined}
              onChange={(value) => setCompanyId(value || "")}
              options={companyOptions}
              optionFilterProp="label"
              placeholder="Select company"
              showSearch
            />
            {errors.companyId && <p className="route-error">{errors.companyId}</p>}
          </Col>
        )}
        <Col lg={6} md={12} xs={24}>
          <label>Route Name <span>*</span></label>
          <input value={routeName} onChange={(event) => setRouteName(event.target.value)} />
          {errors.routeName && <p className="route-error">{errors.routeName}</p>}
        </Col>
        <Col lg={6} md={12} xs={24}>
          <label>Route Code <span>*</span></label>
          <input value={routeCode} onChange={(event) => setRouteCode(event.target.value)} />
          {errors.routeCode && <p className="route-error">{errors.routeCode}</p>}
        </Col>
        <Col lg={6} md={12} xs={24}>
          <label>Start City <span>*</span></label>
          <input value={startCity} onChange={(event) => setStartCity(event.target.value)} />
          {errors.startCity && <p className="route-error">{errors.startCity}</p>}
        </Col>
        <Col lg={6} md={12} xs={24}>
          <label>End City <span>*</span></label>
          <input value={endCity} onChange={(event) => setEndCity(event.target.value)} />
          {errors.endCity && <p className="route-error">{errors.endCity}</p>}
        </Col>
        <Col lg={4} md={12} xs={24}>
          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </Col>
      </Row>
    </div>
  );
}

function StopRow({ stop, index, totalStops, errors, onChange, onRemove }) {
  const isFirst = index === 0;
  const isLast = index === totalStops - 1;

  return (
    <tr>
      <td>
        <div className="route-order-cell">
          <span>{index + 1}</span>
        </div>
      </td>
      <td>
        <input
          value={stop.cityName}
          placeholder={isFirst ? "Start City" : isLast ? "End City" : "City / Stop"}
          onChange={(event) => onChange(index, "cityName", event.target.value)}
        />
        <div className="route-stop-tags">
          {isFirst && <span className="route-chip start">Start</span>}
          {isLast && <span className="route-chip end">End</span>}
          {stop.isActive === false && <span className="route-chip inactive">Inactive</span>}
        </div>
        {errors[`stop-${index}-cityName`] && (
          <p className="route-error">{errors[`stop-${index}-cityName`]}</p>
        )}
      </td>
      <td>
        <select
          value={stop.isActive === false ? "Inactive" : "Active"}
          onChange={(event) => onChange(index, "isActive", event.target.value === "Active")}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </td>
      <td>
        {isFirst ? (
          <input type="number" value="0" disabled aria-label="Start stop minutes" />
        ) : (
          <div className="route-segment-minutes">
            <input
              type="number"
              min="1"
              value={stop.durationFromPrevious}
              placeholder="Minutes"
              onChange={(event) => onChange(index, "durationFromPrevious", event.target.value)}
            />
            {errors[`stop-${index}-durationFromPrevious`] && (
              <p className="route-error">{errors[`stop-${index}-durationFromPrevious`]}</p>
            )}
          </div>
        )}
      </td>
      <td>
        <input
          type="number"
          min="0"
          value={isFirst || isLast ? "0" : stop.stopMinutes || "0"}
          placeholder="Stop minutes"
          disabled={isFirst || isLast}
          onChange={(event) => onChange(index, "stopMinutes", event.target.value)}
        />
        {errors[`stop-${index}-stopMinutes`] && (
          <p className="route-error">{errors[`stop-${index}-stopMinutes`]}</p>
        )}
      </td>
      <td>
        <BoardingPointsEditor
          points={stop.boardingPoints}
          onChange={(points) => onChange(index, "boardingPoints", points)}
        />
        {errors[`stop-${index}-boardingPoints`] && (
          <p className="route-error">{errors[`stop-${index}-boardingPoints`]}</p>
        )}
      </td>
      <td>
        <button
          type="button"
          className="route-stop-delete-button"
          onClick={() => onRemove(index)}
        >
          {isFirst || isLast ? "Clear" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

function RouteStopsTable({ stops, errors, setStopValue, addStop, removeStop }) {
  return (
    <div className="route-card">
      <div className="route-section-header">
        <div>
          <h2><span>1</span> Stops & Segments</h2>
          <p>Add intermediate stops between the start and end cities. Enter minutes from the departure stop on the left to the arrival stop on the right.</p>
        </div>
        <button type="button" className="primary-btn route-add-button" onClick={addStop}>
          + Add Stop Between
        </button>
      </div>
      {errors.stops && <p className="route-error route-section-error">{errors.stops}</p>}
      <div className="route-table-scroll">
        <table className="route-admin-table route-stops-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>City / Stop</th>
              <th>Status</th>
              <th>Minutes Between Stops</th>
              <th>Stop Minutes</th>
              <th>Boarding Points</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop, index) => (
              <StopRow
                key={stop.clientId}
                stop={stop}
                index={index}
                totalStops={stops.length}
                errors={errors}
                onChange={setStopValue}
                onRemove={removeStop}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const fareCurrencyLabel = (currency) => (currency === "ZAR" ? "R" : "US$");

const normalizeExchangeRateAmount = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const randMatch = text.match(/R\s*(\d+(?:\.\d+)?)/i);
  if (randMatch) return randMatch[1];
  const numericMatch = text.match(/(\d+(?:\.\d+)?)/);
  return numericMatch ? numericMatch[1] : "";
};

const formatConvertedFare = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const convertFareMap = (fareMap, multiplier) =>
  Object.entries(fareMap).reduce((nextMap, [key, value]) => {
    const amount = Number(value);
    nextMap[key] = Number.isFinite(amount) && value !== "" ? formatConvertedFare(amount * multiplier) : value;
    return nextMap;
  }, {});

function FareMatrix({
  stops,
  fareMap,
  setFareMap,
  fareCurrency,
  setFareCurrency,
  fareExchangeRate,
  setFareExchangeRate,
  errors,
}) {
  const fareKey = (fromStop, toStop) => `${stopKey(fromStop)}-${stopKey(toStop)}`;
  const currencyPrefix = fareCurrencyLabel(fareCurrency);
  const exchangeRateNumber = Number(fareExchangeRate);
  const appliedRateRef = useRef(fareCurrency === "ZAR" && exchangeRateNumber > 0 ? exchangeRateNumber : 0);

  const changeFareCurrency = (nextCurrency) => {
    if (nextCurrency === fareCurrency) return;

    if (fareCurrency === "USD" && nextCurrency === "ZAR" && exchangeRateNumber > 0) {
      setFareMap((currentMap) => convertFareMap(currentMap, exchangeRateNumber));
      appliedRateRef.current = exchangeRateNumber;
    }

    if (fareCurrency === "ZAR") {
      const activeRate = appliedRateRef.current || exchangeRateNumber;
      if (nextCurrency === "USD" && activeRate > 0) {
        setFareMap((currentMap) => convertFareMap(currentMap, 1 / activeRate));
      }
      appliedRateRef.current = 0;
    }

    setFareCurrency(nextCurrency);
    if (nextCurrency === "USD") {
      setFareExchangeRate("");
    }
  };

  const changeExchangeRate = (nextRate) => {
    const newRate = Number(nextRate);
    const oldRate = appliedRateRef.current;

    if (fareCurrency === "ZAR" && newRate > 0) {
      const multiplier = oldRate > 0 ? newRate / oldRate : newRate;
      setFareMap((currentMap) => convertFareMap(currentMap, multiplier));
      appliedRateRef.current = newRate;
    }

    setFareExchangeRate(nextRate);
  };

  return (
    <div className="route-card">
      <div className="route-section-header">
        <div>
          <h2><span>2</span> Fares (Segments)</h2>
          <p>Set fares for every valid forward journey. The selected currency applies to every fare entry.</p>
        </div>
      </div>
      <div className="route-fare-settings">
        <div>
          <label>Fare currency</label>
          <div className="route-fare-currency-toggle">
            <button
              type="button"
              className={fareCurrency === "USD" ? "active" : ""}
              onClick={() => changeFareCurrency("USD")}
            >
              US
            </button>
            <button
              type="button"
              className={fareCurrency === "ZAR" ? "active" : ""}
              onClick={() => changeFareCurrency("ZAR")}
            >
              Rands
            </button>
          </div>
        </div>
        {fareCurrency === "ZAR" && (
          <div>
            <label>Exchange rate</label>
            <div className="route-exchange-rate-control">
              <span>$1</span>
              <i>=</i>
              <div className="route-money-input">
                <span>R</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fareExchangeRate}
                  placeholder="20"
                  onChange={(event) => changeExchangeRate(event.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {errors.fares && <p className="route-error route-section-error">{errors.fares}</p>}
      <div className="route-table-scroll">
        <table className="route-admin-table route-fare-table">
          <thead>
            <tr>
              <th>From \ To</th>
              {stops.map((stop, index) => (
                <th key={stop.clientId}>{stop.cityName || `Stop ${index + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stops.map((fromStop, fromIndex) => (
              <tr key={fromStop.clientId}>
                <th>{fromStop.cityName || `Stop ${fromIndex + 1}`}</th>
                {stops.map((toStop, toIndex) => {
                  if (toIndex <= fromIndex) {
                    return <td className="route-disabled-cell" key={toStop.clientId}>-</td>;
                  }

                  const key = fareKey(fromStop, toStop);
                  return (
                    <td key={toStop.clientId}>
                      <div className="route-money-input route-fare-money-input">
                        <span>{currencyPrefix}</span>
                        <input
                          type="number"
                          min="0"
                          value={fareMap[key] || ""}
                          placeholder="0.00"
                          onChange={(event) =>
                            setFareMap((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      {errors[`fare-${fromIndex}-${toIndex}`] && (
                        <p className="route-error">{errors[`fare-${fromIndex}-${toIndex}`]}</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RouteSummaryCard({ stops, routeName }) {
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  return (
    <div className="route-summary-card">
      <div>
        <span>Route</span>
        <strong>{routeName || "New route"}</strong>
      </div>
      <div>
        <span>Stops</span>
        <strong>{stops.length}</strong>
      </div>
      <div>
        <span>Travel</span>
        <strong>{firstStop?.cityName || "Start"} to {lastStop?.cityName || "End"}</strong>
      </div>
    </div>
  );
}

function DaySelect({ value, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select day</option>
      {WEEK_DAYS.map((day) => (
        <option value={day} key={day}>{day}</option>
      ))}
    </select>
  );
}

function ScheduleFields({ schedule, onChange, errors, prefix }) {
  const setField = (field, value) => onChange({ ...schedule, [field]: value });

  return (
    <Row gutter={[14, 12]}>
      <Col lg={6} md={12} xs={24}>
        <label>Departure Day <span>*</span></label>
        <DaySelect value={schedule.departureDay} onChange={(value) => setField("departureDay", value)} />
        {errors[`${prefix}DepartureDay`] && <p className="route-error">{errors[`${prefix}DepartureDay`]}</p>}
      </Col>
      <Col lg={6} md={12} xs={24}>
        <label>Departure Time <span>*</span></label>
        <input type="time" value={schedule.departureTime} onChange={(event) => setField("departureTime", event.target.value)} />
        {errors[`${prefix}DepartureTime`] && <p className="route-error">{errors[`${prefix}DepartureTime`]}</p>}
      </Col>
      <Col lg={6} md={12} xs={24}>
        <label>Arrival Day <span>*</span></label>
        <DaySelect value={schedule.arrivalDay} onChange={(value) => setField("arrivalDay", value)} />
        {errors[`${prefix}ArrivalDay`] && <p className="route-error">{errors[`${prefix}ArrivalDay`]}</p>}
      </Col>
      <Col lg={6} md={12} xs={24}>
        <label>Arrival Time <span>*</span></label>
        <input type="time" value={schedule.arrivalTime} onChange={(event) => setField("arrivalTime", event.target.value)} />
        {errors[`${prefix}ArrivalTime`] && <p className="route-error">{errors[`${prefix}ArrivalTime`]}</p>}
      </Col>
    </Row>
  );
}

function JourneyScheduleCard({
  outboundSchedule,
  setOutboundSchedule,
  returnSchedule,
  setReturnSchedule,
  startCity,
  endCity,
  scheduleStartDate,
  setScheduleStartDate,
  scheduleEndDate,
  setScheduleEndDate,
  scheduleNoEndDate,
  setScheduleNoEndDate,
  errors,
}) {
  const returnDepartureCity = endCity || "Outbound arrival city";
  const returnArrivalCity = startCity || "Outbound departure city";
  const updateReturnSchedule = (nextSchedule) =>
    setReturnSchedule({
      ...nextSchedule,
      departureCity: returnDepartureCity,
      arrivalCity: returnArrivalCity,
    });

  return (
    <div className="route-card route-schedule-card">
      <div className="route-section-header">
        <div>
          <h2><span>2</span> Journey Schedule</h2>
          <p>Set the day, city direction and time for this route schedule.</p>
        </div>
      </div>

      <div className="route-journey-box outbound">
        <div className="route-journey-box-header">
          <strong>Outbound Journey</strong>
          <label className="route-switch-label">
            <input
              type="checkbox"
              checked={outboundSchedule.enabled}
              onChange={(event) => setOutboundSchedule({ ...outboundSchedule, enabled: event.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div className="route-direction-line">
          <span>{startCity || "Departure city"}</span>
          <i className="ri-arrow-right-line"></i>
          <span>{endCity || "Arrival city"}</span>
        </div>
        <ScheduleFields
          schedule={outboundSchedule}
          onChange={setOutboundSchedule}
          errors={errors}
          prefix="outbound"
        />
        <div className="route-schedule-note info">
          <i className="ri-information-line"></i>
          {scheduleSummary(outboundSchedule, startCity, endCity)}
        </div>
      </div>

      <div className="route-journey-box return">
        <div className="route-journey-box-header">
          <strong>Return Journey <span>(Optional)</span></strong>
          <label className="route-switch-label">
            <input
              type="checkbox"
              checked={returnSchedule.enabled}
              onChange={(event) =>
                updateReturnSchedule({ ...returnSchedule, enabled: event.target.checked })
              }
            />
            Enabled
          </label>
        </div>
        {returnSchedule.enabled && (
          <>
            <div className="route-direction-line return">
              <span>{returnDepartureCity}</span>
              <i className="ri-arrow-right-line"></i>
              <span>{returnArrivalCity}</span>
            </div>
            <ScheduleFields
              schedule={{
                ...returnSchedule,
                departureCity: returnDepartureCity,
                arrivalCity: returnArrivalCity,
              }}
              onChange={updateReturnSchedule}
              errors={errors}
              prefix="return"
            />
            <div className="route-schedule-note success">
              <i className="ri-information-line"></i>
              {scheduleSummary(
                { ...returnSchedule, departureCity: returnDepartureCity, arrivalCity: returnArrivalCity },
                returnDepartureCity,
                returnArrivalCity
              )}
            </div>
            <div className="route-schedule-note neutral">
              Return stops, stop times and fares are configured manually for the return direction.
            </div>
          </>
        )}
      </div>

      <div className="route-schedule-period">
        <div className="route-section-header compact">
          <div>
            <h3>Schedule Start</h3>
            <p>Trips can be generated from this period without changing the route stops.</p>
          </div>
        </div>
        <Row gutter={[14, 12]}>
          <Col md={8} xs={24}>
            <label>Start From <span>*</span></label>
            <input type="date" value={scheduleStartDate} onChange={(event) => setScheduleStartDate(event.target.value)} />
            {errors.scheduleStartDate && <p className="route-error">{errors.scheduleStartDate}</p>}
          </Col>
          <Col md={8} xs={24}>
            <label>End On (Optional)</label>
            <input
              type="date"
              value={scheduleEndDate}
              disabled={scheduleNoEndDate}
              onChange={(event) => setScheduleEndDate(event.target.value)}
            />
          </Col>
          <Col md={8} xs={24} className="route-no-end-col">
            <label className="route-checkbox-line">
              <input
                type="checkbox"
                checked={scheduleNoEndDate}
                onChange={(event) => {
                  setScheduleNoEndDate(event.target.checked);
                  if (event.target.checked) setScheduleEndDate("");
                }}
              />
              No end date
            </label>
          </Col>
        </Row>
        <div className="route-schedule-note warning">
          <i className="ri-alert-line"></i>
          Trips will be based on this schedule. You can change or pause the schedule anytime.
        </div>
      </div>
    </div>
  );
}

function RouteForm({
  showRouteForm,
  setShowRouteForm,
  selectedRoute,
  setSelectedRoute,
  getData,
}) {
  const dispatch = useDispatch();
  const [routeName, setRouteName] = useState("");
  const [routeCode, setRouteCode] = useState("");
  const [startCity, setStartCity] = useState("");
  const [endCity, setEndCity] = useState("");
  const [totalDistance, setTotalDistance] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [fareCurrency, setFareCurrency] = useState("USD");
  const [fareExchangeRate, setFareExchangeRate] = useState("");
  const [status, setStatus] = useState("Active");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [stops, setStops] = useState([emptyStop(0), emptyStop(1)]);
  const [fareMap, setFareMap] = useState({});
  const [errors, setErrors] = useState({});
  const isEdit = Boolean(selectedRoute?._id);

  const fareKey = (fromStop, toStop) => `${stopKey(fromStop)}-${stopKey(toStop)}`;

  useEffect(() => {
    if (!showRouteForm) return;
    const loadCompanies = async () => {
      try {
        const response = await axiosInstance.get("/api/companies");
        if (response.data.success) {
          const nextCompanies = response.data.data || [];
          setCompanies(nextCompanies);
          if (nextCompanies.length === 1) {
            setCompanyId(nextCompanies[0]._id);
          }
        }
      } catch (error) {
        message.error(error.response?.data?.message || "Failed to load companies.");
      }
    };
    loadCompanies();
  }, [showRouteForm]);

  useEffect(() => {
    if (!selectedRoute) return;

    const routeStops = (selectedRoute.stops || []).map((stop, index) => ({
      clientId: String(stop._id || `stop-${index}`),
      cityName: stop.cityName || "",
      boardingPoints:
        stop.boardingPoints?.length
          ? stop.boardingPoints
          : stop.boardingPoint
            ? [stop.boardingPoint]
            : [],
      arrivalTime: stop.arrivalTime || "",
      departureTime: stop.departureTime || "",
      distanceFromPrevious: stop.distanceFromPrevious || "",
      durationFromPrevious: stop.durationFromPrevious || "",
      stopMinutes: stop.stopMinutes || "0",
      stopOrder: stop.stopOrder || index + 1,
      isActive: stop.isActive !== false,
      _id: stop._id,
    }));

    const nextFareMap = {};
    (selectedRoute.fares || []).forEach((fare) => {
      nextFareMap[`${fare.fromStop}-${fare.toStop}`] = fare.fare;
    });

    setRouteName(selectedRoute.routeName || "");
    setRouteCode(selectedRoute.routeCode || "");
    setStartCity(selectedRoute.fromCity || routeStops[0]?.cityName || "");
    setEndCity(selectedRoute.toCity || routeStops[routeStops.length - 1]?.cityName || "");
    setTotalDistance(selectedRoute.totalDistance || "");
    setEstimatedDuration(selectedRoute.estimatedDuration || "");
    setFareCurrency(selectedRoute.fareCurrency || "USD");
    setFareExchangeRate(normalizeExchangeRateAmount(selectedRoute.fareExchangeRate));
    setStatus(selectedRoute.status || "Active");
    setCompanyId(selectedRoute.companyId?._id || selectedRoute.companyId || "");
    setStops(routeStops.length ? routeStops : [emptyStop(0), emptyStop(1)]);
    setFareMap(nextFareMap);
    setErrors({});
  }, [selectedRoute]);

  const orderedStops = useMemo(
    () =>
      stops.map((stop, index) => {
        const isFirst = index === 0;
        const isLast = index === stops.length - 1;
        return {
          ...stop,
          cityName: isFirst ? startCity : isLast ? endCity : stop.cityName,
          stopOrder: index + 1,
        };
      }),
    [endCity, startCity, stops]
  );

  const segmentTotalsSignature = useMemo(
    () =>
      orderedStops
        .map((stop) => `${stop.distanceFromPrevious}|${stop.durationFromPrevious}|${stop.stopMinutes}`)
        .join("::"),
    [orderedStops]
  );

  useEffect(() => {
    const segmentStops = orderedStops.slice(1);
    const hasDistanceValues = segmentStops.some((stop) =>
      String(stop.distanceFromPrevious || "").trim()
    );
    const hasDurationValues = segmentStops.some((stop) =>
      String(stop.durationFromPrevious || "").trim()
    );

    if (hasDistanceValues) {
      const distanceTotal = segmentStops.reduce(
        (total, stop) => total + parseDistance(stop.distanceFromPrevious),
        0
      );
      setTotalDistance(formatDistance(distanceTotal));
    }

    if (hasDurationValues) {
      const durationTotal = segmentStops.reduce(
        (total, stop) =>
          total +
          parseDurationToMinutes(stop.durationFromPrevious) +
          parseDurationToMinutes(stop.stopMinutes),
        0
      );
      setEstimatedDuration(formatDuration(durationTotal));
    }
  }, [segmentTotalsSignature, orderedStops]);

  const setStopValue = (index, field, value) => {
    if (field === "cityName" && index === 0) {
      setStartCity(value);
      return;
    }

    if (field === "cityName" && index === stops.length - 1) {
      setEndCity(value);
      return;
    }

    setStops((currentStops) =>
      currentStops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, [field]: value } : stop
      )
    );
  };

  const addStop = () => {
    setStops((currentStops) => {
      const nextStops = [...currentStops];
      nextStops.splice(Math.max(nextStops.length - 1, 1), 0, emptyStop(currentStops.length));
      return nextStops.map((stop, stopIndex) => ({ ...stop, stopOrder: stopIndex + 1 }));
    });
  };

  const removeStop = (index) => {
    if (index === 0 || index === stops.length - 1) {
      const isStart = index === 0;
      Modal.confirm({
        title: isStart ? "Clear start city?" : "Clear end city?",
        content: isStart
          ? "This clears the start city and its boarding points."
          : "This clears the end city and its boarding points.",
        okText: "Clear",
        okType: "danger",
        onOk: () => {
          if (isStart) {
            setStartCity("");
          } else {
            setEndCity("");
          }

          setStops((currentStops) =>
            currentStops.map((stop, stopIndex) =>
              stopIndex === index
                ? { ...stop, boardingPoints: [], distanceFromPrevious: "", durationFromPrevious: "", stopMinutes: "0" }
                : stop
            )
          );
        },
      });
      return;
    }

    if (stops.length <= 2) {
      message.error("There are no intermediate stops to remove");
      return;
    }

    Modal.confirm({
      title: "Remove stop?",
      content: "This will also remove any fares connected to this stop.",
      okText: "Remove",
      okType: "danger",
      onOk: () => {
        const removedStop = stops[index];
        const removedKey = stopKey(removedStop);
        setStops((currentStops) =>
          currentStops
            .filter((stop, stopIndex) => stopIndex !== index)
            .map((stop, stopIndex) => ({ ...stop, stopOrder: stopIndex + 1 }))
        );
        setFareMap((currentMap) => {
          const nextMap = { ...currentMap };
          Object.keys(nextMap).forEach((key) => {
            if (key.includes(removedKey)) {
              delete nextMap[key];
            }
          });
          return nextMap;
        });
      },
    });
  };

  const validateRoute = () => {
    const nextErrors = {};
    const warnings = [];
    const cleanStops = orderedStops.map((stop, index) => ({
      ...stop,
      cityName: stop.cityName.trim(),
      arrivalTime: "",
      departureTime: "",
      boardingPoints: (stop.boardingPoints || []).map((point) => point.trim()).filter(Boolean),
      stopMinutes: index === 0 || index === orderedStops.length - 1 ? "0" : String(stop.stopMinutes || "0").trim(),
      isActive: stop.isActive !== false,
    }));

    if (!routeName.trim()) nextErrors.routeName = "Route name is required";
    if (!routeCode.trim()) nextErrors.routeCode = "Route code is required";
    if (companies.length > 1 && !companyId) nextErrors.companyId = "Company is required";
    if (!startCity.trim()) nextErrors.startCity = "Start city is required";
    if (!endCity.trim()) nextErrors.endCity = "End city is required";
    if (cleanStops.length < 2) nextErrors.stops = "Add at least two stops";

    cleanStops.forEach((stop, index) => {
      if (!stop.cityName) {
        nextErrors[`stop-${index}-cityName`] = "City is required";
      }

      if (!stop.boardingPoints.length) {
        nextErrors[`stop-${index}-boardingPoints`] = "At least one boarding point is required.";
      }

      if (index > 0 && parseDurationToMinutes(stop.durationFromPrevious) <= 0) {
        nextErrors[`stop-${index}-durationFromPrevious`] =
          "Enter travel minutes from the previous stop.";
      }

      if (index > 0 && Number(String(stop.stopMinutes || "0").replace(/[^\d.]/g, "")) < 0) {
        nextErrors[`stop-${index}-stopMinutes`] = "Stop minutes cannot be negative.";
      }
    });

    const missingFare = cleanStops.some((fromStop, fromIndex) =>
      cleanStops.some((toStop, toIndex) => {
        if (toIndex <= fromIndex) return false;
        return !Number(fareMap[fareKey(fromStop, toStop)]);
      })
    );
    if (missingFare) {
      nextErrors.fares = "Enter fares for every valid forward stop pair";
    }

    cleanStops.forEach((toStop, toIndex) => {
      if (toIndex < 2) return;

      for (let earlierFromIndex = 0; earlierFromIndex < toIndex - 1; earlierFromIndex += 1) {
        const earlierFromStop = cleanStops[earlierFromIndex];
        const earlierFare = Number(fareMap[fareKey(earlierFromStop, toStop)]);
        if (!Number.isFinite(earlierFare) || earlierFare <= 0) continue;

        for (let laterFromIndex = earlierFromIndex + 1; laterFromIndex < toIndex; laterFromIndex += 1) {
          const laterFromStop = cleanStops[laterFromIndex];
          const laterFare = Number(fareMap[fareKey(laterFromStop, toStop)]);
          if (!Number.isFinite(laterFare) || laterFare <= 0) continue;

          if (laterFare > earlierFare) {
            nextErrors[`fare-${laterFromIndex}-${toIndex}`] =
              `${laterFromStop.cityName} to ${toStop.cityName} fare cannot exceed ${earlierFromStop.cityName} to ${toStop.cityName} fare.`;
          }
        }
      }
    });

    setErrors(nextErrors);
    return {
      valid: Object.keys(nextErrors).length === 0,
      cleanStops,
      warnings: uniqueMessages(warnings),
    };
  };

  const submitRoute = async (cleanStops) => {
    const fares = [];
    cleanStops.forEach((fromStop, fromIndex) => {
      cleanStops.forEach((toStop, toIndex) => {
        if (toIndex <= fromIndex) return;
        const fare = fareMap[fareKey(fromStop, toStop)];
        fares.push({
          fromClientId: fromStop.clientId,
          toClientId: toStop.clientId,
          fromStopOrder: fromIndex + 1,
          toStopOrder: toIndex + 1,
          fare,
        });
      });
    });

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/routes/save-route", {
        _id: selectedRoute?._id,
        routeName: routeName.trim(),
        routeCode: routeCode.trim(),
        companyId,
        totalDistance: totalDistance.trim(),
        estimatedDuration: estimatedDuration.trim(),
        fromCity: startCity.trim(),
        toCity: endCity.trim(),
        fareCurrency,
        fareExchangeRate: fareExchangeRate.trim(),
        status,
        stops: cleanStops,
        fares,
      });
      dispatch(HideLoading());

      if (response.data.success) {
        message.success(response.data.message);
        getData();
        setSelectedRoute(null);
        setShowRouteForm(false);
        setCompanyId("");
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const saveRoute = async () => {
    const { valid, cleanStops, warnings } = validateRoute();
    if (!valid) {
      message.error("Please fix the highlighted route fields");
      return;
    }

    if (warnings.length) {
      Modal.confirm({
        title: "Schedule warnings",
        content: (
          <div className="route-warning-list">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ),
        okText: "Save Route",
        cancelText: "Review",
        onOk: () => submitRoute(cleanStops),
      });
      return;
    }

    submitRoute(cleanStops);
  };

  return (
    <Modal
      width="min(1220px, 96vw)"
      title={false}
      visible={showRouteForm}
      className="route-form-modal"
      onCancel={() => {
        setSelectedRoute(null);
        setShowRouteForm(false);
        setCompanyId("");
      }}
      footer={false}
    >
      <RouteBasicInfoForm
        routeName={routeName}
        companyId={companyId}
        setCompanyId={setCompanyId}
        companies={companies}
        setRouteName={setRouteName}
        routeCode={routeCode}
        setRouteCode={setRouteCode}
        startCity={startCity}
        setStartCity={setStartCity}
        endCity={endCity}
        setEndCity={setEndCity}
        totalDistance={totalDistance}
        setTotalDistance={setTotalDistance}
        estimatedDuration={estimatedDuration}
        status={status}
        setStatus={setStatus}
        errors={errors}
      />

      <RouteSummaryCard
        stops={orderedStops}
        routeName={routeName}
        totalDistance={totalDistance}
        estimatedDuration={estimatedDuration}
      />

      <RouteStopsTable
        stops={orderedStops}
        errors={errors}
        setStopValue={setStopValue}
        addStop={addStop}
        removeStop={removeStop}
      />

      <FareMatrix
        stops={orderedStops}
        fareMap={fareMap}
        setFareMap={setFareMap}
        fareCurrency={fareCurrency}
        setFareCurrency={setFareCurrency}
        fareExchangeRate={fareExchangeRate}
        setFareExchangeRate={setFareExchangeRate}
        errors={errors}
      />

      <div className="route-form-actions">
        <button
          className="outlined"
          onClick={() => {
            setSelectedRoute(null);
            setShowRouteForm(false);
          }}
        >
          Cancel
        </button>
        <button className="primary-btn" onClick={saveRoute}>
          {isEdit ? "Save Route" : "Create Route"}
        </button>
      </div>
    </Modal>
  );
}

export default RouteForm;
