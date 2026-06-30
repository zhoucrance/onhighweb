import { message, Progress, Select, Tag } from "antd";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";

function AdminSeatAvailability() {
  const dispatch = useDispatch();
  const [buses, setBuses] = useState([]);
  const [busFilter, setBusFilter] = useState("");

  const getSeatAvailability = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/buses/get-seat-availability", {});
      dispatch(HideLoading());
      if (response.data.success) {
        setBuses(response.data.data);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  }, [dispatch]);

  useEffect(() => {
    getSeatAvailability();
  }, [getSeatAvailability]);

  const filteredBuses = useMemo(() => {
    if (!busFilter) return buses;
    return buses.filter((bus) => bus._id === busFilter);
  }, [busFilter, buses]);

  const totals = useMemo(() => {
    return filteredBuses.reduce(
      (acc, bus) => {
        acc.capacity += Number(bus.capacity || 0);
        acc.booked += Number(bus.bookedSeatsCount || 0);
        acc.left += Number(bus.seatsLeft || 0);
        if (Number(bus.seatsLeft || 0) === 0 && Number(bus.capacity || 0) > 0) {
          acc.full += 1;
        }
        return acc;
      },
      { capacity: 0, booked: 0, left: 0, full: 0 }
    );
  }, [filteredBuses]);

  const renderSeats = (seats) => {
    if (!seats?.length) {
      return <span className="seat-availability-muted">None</span>;
    }
    const visibleSeats = seats.slice(0, 12);
    return (
      <div className="seat-chip-list">
        {visibleSeats.map((seat) => (
          <span className="seat-chip" key={seat}>
            {seat}
          </span>
        ))}
        {seats.length > visibleSeats.length && (
          <span className="seat-chip more">+{seats.length - visibleSeats.length}</span>
        )}
      </div>
    );
  };

  const columns = [
    {
      title: "Bus",
      render: (text, record) => (
        <div>
          <strong>{record.name}</strong>
          <p className="seat-availability-muted">{record.number}</p>
        </div>
      ),
    },
    {
      title: "Route",
      render: (text, record) =>
        record.route
          ? `${record.route.routeName} (${record.route.fromCity} - ${record.route.toCity})`
          : `${record.from || "-"} - ${record.to || "-"}`,
    },
    {
      title: "Journey Date",
      dataIndex: "journeyDate",
      render: (date) => date || "-",
    },
    {
      title: "Status",
      render: (text, record) => (
        <Tag color={record.status === "Active" ? "green" : "default"}>
          {record.status || record.tripStatus || "Yet To Start"}
        </Tag>
      ),
    },
    {
      title: "Capacity",
      dataIndex: "capacity",
      sorter: (a, b) => Number(a.capacity || 0) - Number(b.capacity || 0),
    },
    {
      title: "Booked",
      dataIndex: "bookedSeatsCount",
      sorter: (a, b) => Number(a.bookedSeatsCount || 0) - Number(b.bookedSeatsCount || 0),
    },
    {
      title: "Seats Left",
      dataIndex: "seatsLeft",
      sorter: (a, b) => Number(a.seatsLeft || 0) - Number(b.seatsLeft || 0),
      render: (seatsLeft) => (
        <strong className={seatsLeft === 0 ? "seat-availability-full" : ""}>
          {seatsLeft}
        </strong>
      ),
    },
    {
      title: "Occupancy",
      dataIndex: "occupancyPercentage",
      sorter: (a, b) =>
        Number(a.occupancyPercentage || 0) - Number(b.occupancyPercentage || 0),
      render: (percent) => (
        <Progress
          percent={percent}
          size="small"
          status={percent >= 100 ? "exception" : "active"}
        />
      ),
    },
    {
      title: "Available Seats",
      dataIndex: "availableSeats",
      render: renderSeats,
    },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between my-2">
        <PageTitle title="Seat Availability" />
        <button className="primary-btn" onClick={getSeatAvailability}>
          Refresh
        </button>
      </div>

      <div className="seat-availability-summary">
        <div>
          <span>Total Seats</span>
          <strong>{totals.capacity}</strong>
        </div>
        <div>
          <span>Booked Seats</span>
          <strong>{totals.booked}</strong>
        </div>
        <div>
          <span>Seats Left</span>
          <strong>{totals.left}</strong>
        </div>
        <div>
          <span>Full Buses</span>
          <strong>{totals.full}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <Select
          allowClear
          showSearch
          placeholder="Filter seats by bus"
          value={busFilter || undefined}
          optionFilterProp="label"
          onChange={(value) => setBusFilter(value || "")}
        >
          {buses.map((bus) => (
            <Select.Option
              key={bus._id}
              value={bus._id}
              label={`${bus.name || ""} ${bus.number || ""}`}
            >
              {bus.name} ({bus.number})
            </Select.Option>
          ))}
        </Select>
      </div>

      <ResponsiveAntTable columns={columns} dataSource={filteredBuses} rowKey="_id" scroll={{ x: 1100 }} cardsAlways />
    </div>
  );
}

export default AdminSeatAvailability;
