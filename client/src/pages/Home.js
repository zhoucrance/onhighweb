import { Col, message, Row, Select } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Bus from "../components/Bus";
import { axiosInstance } from "../helpers/axiosInstance";
import OfficeBookingHome from "./OfficeBookingHome";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";

const canShowBus = (bus) =>
  !bus.status || ["Yet To Start", "Active"].includes(bus.status);
const routeIsActive = (route) => route.status !== "Inactive";
const stopIsActive = (stop) => stop.isActive !== false;
const cityKey = (city) => String(city || "").trim().toLowerCase();

const addCityOption = (optionsByKey, city) => {
  const title = String(city || "").trim();
  if (!title) return;
  const key = cityKey(title);
  if (!optionsByKey[key]) {
    optionsByKey[key] = title;
  }
};

const getEmptySearchMessage = (searchResponse) => {
  const fullyBookedCount = Number(searchResponse.fullyBookedCount || 0);

  if (fullyBookedCount > 0) {
    return "All buses for this route and date are fully booked";
  }

  return "No bus yet for this route and journey date";
};

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const cityFilterOption = (input, option) =>
  String(option?.value || "").toLowerCase().includes(String(input || "").toLowerCase());

const cityOptionLabel = (city) => (
  <span className="home-city-option">
    {city}
  </span>
);

function Home() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const userRole = String(user?.role || "").toUpperCase();
  const userStaffTitle = String(user?.staffTitle || "").toUpperCase();
  const shouldShowOfficeBookingHome =
    ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(userRole) ||
    userStaffTitle === "OFFICE_BOOKING";
  const todayDate = getTodayDate();
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    journeyDate: todayDate,
  });
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  const updateFilters = (nextFilters) => {
    setFilters(nextFilters);
    setBuses([]);
    setHasSearched(false);
    setSearchMessage("");
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

  const getBuses = async () => {
    if (!filters.from || !filters.to || !filters.journeyDate) {
      message.error("Select from, to and journey date before searching.");
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
        const availableBuses = (response.data.data || []).filter(canShowBus);
        setBuses(availableBuses);
        setHasSearched(true);
        setSearchMessage(
          availableBuses.length
            ? ""
            : getEmptySearchMessage(response.data)
        );
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
  }, []);

  useEffect(() => {
    if (filters.to && !toCityOptions.some((city) => cityKey(city) === cityKey(filters.to))) {
      updateFilters({ ...filters, to: "" });
    }
  }, [filters, toCityOptions]);

  if (shouldShowOfficeBookingHome) {
    return <OfficeBookingHome />;
  }

  return (
    <div>
      <div className="my-3 py-1">
        <Row gutter={10} align="center">
          <Col lg={6} sm={24} xs={24}>
            <div className="home-search-field">
              <label>
                <i className="ri-map-pin-line"></i>
                From
              </label>
              <Select
                showSearch
                allowClear
                className="home-search-select"
                placeholder="Search departure city"
                optionFilterProp="value"
                filterOption={cityFilterOption}
                value={filters.from || undefined}
                onChange={(value) => updateFilters({ ...filters, from: value || "", to: "" })}
              >
                {fromCityOptions.map((city) => (
                  <Select.Option value={city} key={city} label={city}>
                    {cityOptionLabel(city)}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col lg={6} sm={24} xs={24}>
            <div className="home-search-field">
              <label>
                <i className="ri-map-pin-2-line"></i>
                To
              </label>
              <Select
                showSearch
                allowClear
                className="home-search-select"
                placeholder={filters.from ? "Search destination city" : "Choose From first"}
                optionFilterProp="value"
                filterOption={cityFilterOption}
                value={filters.to || undefined}
                disabled={!filters.from}
                onChange={(value) => updateFilters({ ...filters, to: value || "" })}
              >
                {toCityOptions.map((city) => (
                  <Select.Option value={city} key={city} label={city}>
                    {cityOptionLabel(city)}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col lg={6} sm={24} xs={24}>
            <div className="home-search-field">
              <label>
                <i className="ri-calendar-line"></i>
                Date
              </label>
              <input
                className="home-search-date"
                type="date"
                placeholder="Date"
                min={todayDate}
                value={filters.journeyDate}
                onChange={(event) =>
                  updateFilters({ ...filters, journeyDate: event.target.value })
                }
              />
            </div>
          </Col>
          <Col lg={6} sm={24} xs={24}>
            <div className="home-search-actions">
              <button className="secondary-btn home-filter-button" onClick={getBuses}>
                Filter
              </button>
            </div>
          </Col>
        </Row>
      </div>
      <div>
        {hasSearched && searchMessage && (
          <p className="text-md my-3">{searchMessage}</p>
        )}
        <Row gutter={[15, 15]}>
          {buses.map((bus) => (
            <Col lg={12} xs={24} sm={24} key={bus.tripId || bus._id}>
              <Bus bus={bus} />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
}

export default Home;
