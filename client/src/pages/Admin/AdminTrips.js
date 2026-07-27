import React, { useEffect, useMemo, useState } from "react";
import { Form, Modal, Select, Space, Tag, message } from "antd";
import { useSelector } from "react-redux";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { isSuperAdmin } from "../../helpers/permissions";

const TRIP_STATUSES = ["Yet To Start", "In Progress", "Completed"];
const OPERATING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const emptyTrip = {
  tripCode: "",
  route: "",
  bus: "",
  departureTime: "",
  scheduleStartDate: "",
  scheduleEndDate: "",
  runsContinuously: true,
  operatingDays: [],
  status: "Yet To Start",
  stopSchedule: [],
  acceptedPaymentMethods: ["EcoCash", "Card Payment"],
};

const parseClockTimeToMinutes = (value) => {
  const [hours, minutes] = String(value || "")
    .split(":")
    .map((item) => Number(item));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const parseDurationToMinutes = (value) => {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hourMatch || minuteMatch) {
    return Number(hourMatch?.[1] || 0) * 60 + Number(minuteMatch?.[1] || 0);
  }
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
};

const formatClockFromBase = (baseMinutes, addedMinutes) => {
  if (baseMinutes === null) return { time: "", dayOffset: 0, display: "-" };
  const totalMinutes = baseMinutes + addedMinutes;
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const minutesInDay = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return {
    time,
    dayOffset,
    display: `${time}${dayOffset ? ` (Next Day${dayOffset > 1 ? ` +${dayOffset - 1}` : ""})` : ""}`,
  };
};

const sortStops = (stops = []) =>
  [...stops].sort((first, second) => Number(first.stopOrder || 0) - Number(second.stopOrder || 0));

const buildStopScheduleFromRoute = (route, existingSchedule = [], departureTime = "") => {
  const orderedStops = sortStops(route?.stops || []);
  const baseDepartureMinutes = parseClockTimeToMinutes(departureTime);
  const scheduleByStopId = new Map(
    (existingSchedule || [])
      .filter((item) => item?.stopId)
      .map((item) => [String(item.stopId), item])
  );
  const scheduleByOrder = new Map(
    (existingSchedule || [])
      .filter((item) => item?.stopOrder)
      .map((item) => [Number(item.stopOrder), item])
  );

  let elapsedMinutes = 0;
  return orderedStops.map((stop, index) => {
    const savedItem =
      scheduleByStopId.get(String(stop._id)) ||
      scheduleByOrder.get(Number(stop.stopOrder || index + 1)) ||
      {};
    const segmentMinutes = index === 0 ? 0 : parseDurationToMinutes(stop.durationFromPrevious || savedItem.durationFromPrevious);
    if (index > 0) elapsedMinutes += segmentMinutes;
    const stopMinutes = index === 0 ? 0 : parseDurationToMinutes(stop.stopMinutes || savedItem.stopMinutes || "0");
    const arrivalClock = index === 0 ? { time: "", dayOffset: 0, display: "-" } : formatClockFromBase(baseDepartureMinutes, elapsedMinutes);
    const departureClock =
      index === orderedStops.length - 1
        ? { time: "", dayOffset: arrivalClock.dayOffset, display: "-" }
        : index === 0
          ? formatClockFromBase(baseDepartureMinutes, 0)
          : formatClockFromBase(baseDepartureMinutes, elapsedMinutes + stopMinutes);
    if (index > 0 && index < orderedStops.length - 1) {
      elapsedMinutes += stopMinutes;
    }

    return {
      stopId: stop._id,
      cityName: stop.cityName || "",
      travelScope: stop.travelScope || "Local",
      stopOrder: Number(stop.stopOrder || index + 1),
      arrivalTime: arrivalClock.time,
      arrivalDisplay: arrivalClock.display,
      arrivalDayOffset: arrivalClock.dayOffset,
      departureTime: departureClock.time,
      departureDisplay: departureClock.display,
      departureDayOffset: departureClock.dayOffset,
      distanceFromPrevious: savedItem.distanceFromPrevious || stop.distanceFromPrevious || "",
      isActive: savedItem.isActive !== false,
      durationFromPrevious: index === 0 ? "" : String(segmentMinutes || ""),
      stopMinutes: String(stopMinutes || "0"),
    };
  });
};

const getRecordCompanyId = (record) => String(record?.companyId?._id || record?.companyId || "");

function AdminTrips() {
  const { user } = useSelector((state) => state.users);
  const superAdmin = isSuperAdmin(user);
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [showTripForm, setShowTripForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [companyFilter, setCompanyFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [selectedOperatingDays, setSelectedOperatingDays] = useState([]);
  const [form] = Form.useForm();
  const selectedRouteId = Form.useWatch("route", form);
  const selectedDepartureTime = Form.useWatch("departureTime", form);
  const runsContinuously = Form.useWatch("runsContinuously", form);
  const selectedStatus = Form.useWatch("status", form);

  const getTrips = async () => {
    try {
      const response = await axiosInstance.post("/api/trips/get-all-trips", {});
      if (response.data.success) {
        setTrips(response.data.data || []);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error(error.response?.data?.message || "Trips API not available. Restart the backend server.");
    }
  };

  const getRoutes = async () => {
    try {
      const routesResponse = await axiosInstance.post("/api/routes/get-all-routes", {});
      if (routesResponse.data.success) setRoutes(routesResponse.data.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to load route options.");
    }
  };

  const getBuses = async () => {
    try {
      const busesResponse = await axiosInstance.post("/api/buses/get-all-buses", {});
      if (busesResponse.data.success) setBuses(busesResponse.data.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to load bus options.");
    }
  };

  const getCompanies = async () => {
    try {
      const companiesResponse = await axiosInstance.get("/api/companies");
      if (companiesResponse.data.success) {
        const nextCompanies = companiesResponse.data.data || [];
        setCompanies(nextCompanies);
        if (!superAdmin && nextCompanies.length === 1) {
          setCompanyFilter(nextCompanies[0]._id);
        }
      }
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to load company payment methods.");
    }
  };

  useEffect(() => {
    getTrips();
    getRoutes();
    getBuses();
    getCompanies();
  }, []);

  const routeOptions = useMemo(
    () =>
      routes
        .filter((route) => {
          const routeCompanyId = getRecordCompanyId(route);
          return !companyFilter || routeCompanyId === String(companyFilter);
        })
        .map((route) => ({
          value: route._id,
          label: route.routeName || `${route.fromCity} to ${route.toCity}`,
        })),
    [companyFilter, routes]
  );

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route._id) === String(selectedRouteId)),
    [routes, selectedRouteId]
  );
  const selectedRouteCompanyId = getRecordCompanyId(selectedRoute);
  const selectedCompany = useMemo(
    () => companies.find((company) => String(company._id) === String(selectedRouteCompanyId)),
    [companies, selectedRouteCompanyId]
  );
  const selectedCompanyPaymentMethods = useMemo(
    () => selectedCompany?.enabledPaymentMethods?.length ? selectedCompany.enabledPaymentMethods : ["EcoCash", "Card Payment"],
    [selectedCompany]
  );

  const busOptions = useMemo(
    () =>
      buses
        .filter((bus) => {
          const busCompanyId = getRecordCompanyId(bus);
          const matchesSelectedCompany = !companyFilter || busCompanyId === String(companyFilter);
          const matchesRouteCompany = !selectedRouteCompanyId || !busCompanyId || busCompanyId === selectedRouteCompanyId;
          return matchesSelectedCompany && matchesRouteCompany;
        })
        .map((bus) => ({
          value: bus._id,
          label: `${bus.name || "Bus"} ${bus.number ? `(${bus.number})` : ""}`,
        })),
    [buses, companyFilter, selectedRouteCompanyId]
  );

  useEffect(() => {
    if (!showTripForm || !selectedRouteCompanyId) return;
    const selectedBusId = form.getFieldValue("bus");
    if (!selectedBusId) return;
    const selectedBus = buses.find((bus) => String(bus._id) === String(selectedBusId));
    const selectedBusCompanyId = getRecordCompanyId(selectedBus);
    if (selectedBusCompanyId && selectedBusCompanyId !== selectedRouteCompanyId) {
      form.setFieldValue("bus", "");
    }
  }, [buses, form, selectedRouteCompanyId, showTripForm]);

  useEffect(() => {
    if (!showTripForm) return;
    const currentMethods = form.getFieldValue("acceptedPaymentMethods") || [];
    const nextMethods = currentMethods.filter((method) => selectedCompanyPaymentMethods.includes(method));
    form.setFieldValue(
      "acceptedPaymentMethods",
      nextMethods.length ? nextMethods : selectedCompanyPaymentMethods.slice(0, 1)
    );
  }, [form, selectedCompanyPaymentMethods, selectedRouteCompanyId, showTripForm]);

  const filteredTrips = useMemo(() => {
    if (superAdmin && !companyFilter) return [];
    return trips.filter((trip) => {
      const tripCompanyId = String(trip.companyId?._id || trip.companyId || trip.route?.companyId || trip.bus?.companyId || "");
      const matchesCompany = !companyFilter || tripCompanyId === String(companyFilter);
      const matchesRoute = !routeFilter || String(trip.route?._id || trip.route || "") === String(routeFilter);
      return matchesCompany && matchesRoute;
    });
  }, [companyFilter, routeFilter, trips, superAdmin]);

  const companySelected = !superAdmin || Boolean(companyFilter);

  const openTripForm = (trip = null) => {
    if (!trip && superAdmin && !companyFilter) {
      message.error("Select a company first.");
      return;
    }
    setEditingTrip(trip);
    const tripRouteId = trip?.route?._id || trip?.route || "";
    const tripRoute = routes.find((route) => String(route._id) === String(tripRouteId));
    const tripOperatingDays = trip && Array.isArray(trip.operatingDays) ? trip.operatingDays : [];
    setSelectedOperatingDays(tripOperatingDays);
    form.setFieldsValue(
      trip
        ? {
            ...emptyTrip,
            ...trip,
            tripCode: trip.tripCode || "",
            route: tripRouteId,
            bus: trip.bus?._id || trip.bus || "",
            departureTime: trip.departureTime || "",
            scheduleStartDate: trip.scheduleStartDate || trip.journeyDate || "",
            scheduleEndDate: trip.scheduleEndDate || "",
            runsContinuously: trip.runsContinuously !== false,
            operatingDays: tripOperatingDays,
            status: trip.status || "Yet To Start",
            acceptedPaymentMethods: trip.acceptedPaymentMethods?.length ? trip.acceptedPaymentMethods : ["EcoCash", "Card Payment"],
            stopSchedule: buildStopScheduleFromRoute(tripRoute, trip.stopSchedule || [], trip.departureTime || ""),
          }
        : { ...emptyTrip, operatingDays: [] }
    );
    setShowTripForm(true);
  };

  useEffect(() => {
    if (!showTripForm || !selectedRoute) return;
    const currentSchedule = form.getFieldValue("stopSchedule") || [];
    const savedSchedule = currentSchedule.length ? currentSchedule : editingTrip?.stopSchedule || [];
    form.setFieldValue("stopSchedule", buildStopScheduleFromRoute(selectedRoute, savedSchedule, selectedDepartureTime));
  }, [editingTrip, form, selectedDepartureTime, selectedRoute, selectedRouteId, showTripForm]);

  const closeTripForm = () => {
    setEditingTrip(null);
    setShowTripForm(false);
    setSelectedOperatingDays([]);
    form.resetFields();
  };

  const changeCompanyFilter = (value) => {
    setCompanyFilter(value || "");
    setRouteFilter("");
    if (!showTripForm || editingTrip) return;
    form.setFieldsValue({ route: "", bus: "", acceptedPaymentMethods: ["EcoCash", "Card Payment"], stopSchedule: [] });
  };

  const saveTrip = async () => {
    try {
      const values = await form.validateFields();
      const operatingDays = selectedOperatingDays;
      if (!Array.isArray(operatingDays) || !operatingDays.length) {
        message.error("Select at least one operating day.");
        return;
      }
      const payload = {
        ...values,
        operatingDays,
        acceptedPaymentMethods: values.acceptedPaymentMethods || [],
        stopSchedule: buildStopScheduleFromRoute(
          selectedRoute,
          form.getFieldValue("stopSchedule") || [],
          values.departureTime
        ),
        _id: editingTrip?._id,
      };
      const response = await axiosInstance.post("/api/trips/save-trip", payload);
      if (response.data.success) {
        message.success(response.data.message);
        closeTripForm();
        getTrips();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.response?.data?.message || error.message);
    }
  };

  const deleteTrip = (trip) => {
    Modal.confirm({
      title: "Delete trip?",
      content: "This removes the scheduled trip for this bus.",
      okText: "Delete",
      okType: "danger",
      onOk: async () => {
        const response = await axiosInstance.post("/api/trips/delete-trip", { _id: trip._id });
        if (response.data.success) {
          message.success(response.data.message);
          getTrips();
        } else {
          message.error(response.data.message);
        }
      },
    });
  };

  const columns = [
    {
      title: "Route",
      render: (_, trip) => (
        <div className="trip-table-summary">
          <strong>{trip.tripCode || "-"}</strong>
          <span>{trip.route?.routeName || `${trip.route?.fromCity || "-"} to ${trip.route?.toCity || "-"}`}</span>
        </div>
      ),
    },
    {
      title: "Bus",
      render: (_, trip) => trip.bus ? `${trip.bus?.name || "-"} ${trip.bus?.number ? `(${trip.bus.number})` : ""}` : <Tag>Not assigned</Tag>,
    },
    {
      title: "Outbound",
      render: (_, trip) => (
        <div className="trip-table-summary">
          <strong>{trip.departureTime || "-"} to {trip.arrivalTime || "-"}</strong>
          <span>
            {trip.scheduleStartDate || trip.journeyDate || "-"}
            {trip.runsContinuously ? " onward" : ` to ${trip.scheduleEndDate || "-"}`}
          </span>
          <span>{Array.isArray(trip.stopSchedule) ? `${trip.stopSchedule.length} scheduled stop(s)` : "No stop schedule"}</span>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={status === "Completed" ? "green" : status === "In Progress" ? "blue" : "orange"}>{status || "-"}</Tag>,
    },
    {
      title: "Payment",
      render: (_, trip) => (
        <Space size={[4, 4]} wrap>
          {(trip.acceptedPaymentMethods?.length ? trip.acceptedPaymentMethods : ["EcoCash", "Card Payment"]).map((method) => (
            <Tag key={method} color={method === "Pay on Boarding" ? "gold" : "green"}>{method}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Actions",
      render: (_, trip) => (
        <Space>
          <button className="secondary-btn trip-table-button" onClick={() => openTripForm(trip)}>Edit</button>
          <button className="outlined trip-table-button" onClick={() => deleteTrip(trip)}>Delete</button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center">
        <PageTitle title="Trips" />
        {companySelected && (
          <button className="primary-btn" onClick={() => openTripForm()}>
            Add Trip
          </button>
        )}
      </div>

      <div className="admin-filter-bar">
        <Select
          allowClear={superAdmin}
          showSearch
          placeholder="Select company first"
          value={companyFilter || undefined}
          optionFilterProp="label"
          onChange={changeCompanyFilter}
          options={companies.map((company) => ({
            value: company._id,
            label: company.companyName,
          }))}
        />
        {companySelected && (
          <Select
            allowClear
            showSearch
            placeholder="Filter by route"
            value={routeFilter || undefined}
            optionFilterProp="label"
            options={routeOptions}
            onChange={(value) => setRouteFilter(value || "")}
          />
        )}
      </div>

      {companySelected && <ResponsiveAntTable columns={columns} dataSource={filteredTrips} rowKey="_id" cardsAlways />}

      <Modal
        title={null}
        visible={showTripForm}
        onCancel={closeTripForm}
        footer={null}
        width="min(1180px, 96vw)"
        className="trip-form-modal"
      >
        <div className="trip-form-title">
          <button type="button" onClick={closeTripForm}>
            <i className="ri-arrow-left-line"></i>
            Trips
          </button>
          <span>/</span>
          <strong>{editingTrip ? "Edit Trip" : "Add Trip"}</strong>
        </div>
        <div className="trip-form-heading">
          <h2>{editingTrip ? "Edit Trip" : "Add Trip"}</h2>
          <p>Assign a configured route to a trip and set the operating days and departure time.</p>
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={emptyTrip}
        >
          <div className="trip-form-section">
            <h3>1. Trip Details</h3>
            <div className="trip-details-grid">
              <Form.Item name="tripCode" label="Trip Name" rules={[{ required: true, message: "Enter trip name" }]}>
                <input placeholder="e.g. Harare - Joburg Morning" />
              </Form.Item>
              <Form.Item name="route" label="Route" rules={[{ required: true, message: "Select a route" }]}>
                <Select showSearch placeholder="Select route" optionFilterProp="label" options={routeOptions} disabled={superAdmin && !companyFilter} />
              </Form.Item>
              <Form.Item name="bus" label="Bus" rules={[{ required: true, message: "Select a bus" }]}>
                <Select showSearch placeholder="Assign bus to this trip" optionFilterProp="label" options={busOptions} />
              </Form.Item>
              <Form.Item
                name="acceptedPaymentMethods"
                label="Accepted Payment Methods"
                rules={[{ required: true, message: "Select at least one payment method" }]}
              >
                <Select
                  mode="multiple"
                  placeholder="Choose payment methods for this trip"
                  options={selectedCompanyPaymentMethods.map((method) => ({ value: method, label: method }))}
                />
              </Form.Item>
              <Form.Item label="Departure From (Start City)">
                <input value={selectedRoute?.fromCity || ""} placeholder="Select a route first" disabled readOnly />
              </Form.Item>
              <Form.Item name="departureTime" label="Departure Time" rules={[{ required: true, message: "Set departure time" }]}>
                <input type="time" />
              </Form.Item>
              <Form.Item name="scheduleStartDate" label="Start Date" rules={[{ required: true, message: "Select start date" }]}>
                <input type="date" />
              </Form.Item>
            </div>
          </div>

          <div className="trip-form-section">
            <h3>2. Operating Days</h3>
            <p className="trip-section-help">Select the days this trip will operate.</p>
            <div className="trip-operating-days">
              {OPERATING_DAYS.map((day) => {
                const isChecked = selectedOperatingDays.includes(day);
                return (
                  <button
                    type="button"
                    className={isChecked ? "active" : ""}
                    key={day}
                    onClick={() => {
                      setSelectedOperatingDays((currentDays) =>
                        currentDays.includes(day)
                          ? currentDays.filter((item) => item !== day)
                          : [...currentDays, day]
                      );
                    }}
                  >
                    <span>{isChecked && <i className="ri-check-line"></i>}</span>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="trip-form-section outbound">
            <h3>3. Trip Preview (Auto Calculated)</h3>
            <p className="trip-section-help">Arrival and departure times are calculated using the minutes between stops from the route.</p>
            <Form.List name="stopSchedule">
              {(fields) => (
                <div className="trip-preview-table-wrap">
                  <table className="trip-preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Stop City</th>
                        <th>Minutes From Previous Stop</th>
                        <th>Stop Minutes</th>
                        <th>Arrival Time</th>
                        <th>Departure Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.length === 0 && (
                        <tr>
                          <td colSpan="5">
                            <div className="trip-stop-empty">Choose a route and departure time to preview this trip.</div>
                          </td>
                        </tr>
                      )}
                      {fields.map((field, index) => {
                        const cityName = form.getFieldValue(["stopSchedule", field.name, "cityName"]) || "City";
                        const minutes = form.getFieldValue(["stopSchedule", field.name, "durationFromPrevious"]);
                        const stopMinutes = form.getFieldValue(["stopSchedule", field.name, "stopMinutes"]);
                        const arrivalDisplay = form.getFieldValue(["stopSchedule", field.name, "arrivalDisplay"]);
                        const departureDisplay = form.getFieldValue(["stopSchedule", field.name, "departureDisplay"]);
                        return (
                          <tr key={field.key}>
                            <td>{index + 1}</td>
                            <td>
                              <strong>{cityName}</strong>
                              <span>{index === 0 ? "Start" : index === fields.length - 1 ? "Destination" : "Stop"}</span>
                            </td>
                            <td>{index === 0 ? "-" : `${minutes || 0} min (${formatDuration(Number(minutes || 0))})`}</td>
                            <td>{index === 0 || index === fields.length - 1 ? "-" : `${stopMinutes || 0} min`}</td>
                            <td>{arrivalDisplay || "-"}</td>
                            <td>{departureDisplay || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Form.List>
          </div>

          <div className="trip-form-section trip-compact-section">
            <h3>Schedule Period</h3>
            <div className="trip-period-row">
              <Form.Item name="runsContinuously" hidden>
                <input />
              </Form.Item>
              <label className="trip-checkbox-inline">
                <input
                  type="checkbox"
                  checked={runsContinuously !== false}
                  onChange={(event) => form.setFieldValue("runsContinuously", event.target.checked)}
                />
                No end date (Run indefinitely)
              </label>
              {runsContinuously === false && (
                <Form.Item name="scheduleEndDate" label="End Date" rules={[{ required: true, message: "Select end date or mark continuous" }]}>
                  <input type="date" />
                </Form.Item>
              )}
            </div>
          </div>

          <div className="trip-form-section">
            <h3>Trip Status</h3>
            <Form.Item name="status" hidden>
              <input />
            </Form.Item>
            <div className="trip-status-toggle">
              {TRIP_STATUSES.map((status) => (
                <button
                  className={selectedStatus === status ? "active" : ""}
                  key={status}
                  type="button"
                  onClick={() => form.setFieldValue("status", status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="trip-form-actions">
            <button type="button" className="outlined" onClick={closeTripForm}>
              Cancel
            </button>
            <button type="button" className="primary-btn" onClick={saveTrip}>
              Save Trip
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default AdminTrips;
