import { message, Modal, Select } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import RouteForm from "../../components/RouteForm";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";

function AdminRoutes() {
  const dispatch = useDispatch();
  const [routes, setRoutes] = useState([]);
  const [routeFilter, setRouteFilter] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [showRouteForm, setShowRouteForm] = useState(false);

  const showRequestError = (error) => {
    if (error.response?.status === 404) {
      message.error("Routes API not found. Restart the backend server and try again.");
      return;
    }
    message.error(error.response?.data?.message || error.message);
  };

  const getRoutes = async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/routes/get-all-routes", {});
      dispatch(HideLoading());
      if (response.data.success) {
        setRoutes(response.data.data);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      showRequestError(error);
    }
  };

  const deleteRoute = async (id) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/routes/delete-route", {
        _id: id,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        getRoutes();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      showRequestError(error);
    }
  };

  useEffect(() => {
    getRoutes();
  }, []);

  const columns = [
    {
      title: "Route Name",
      dataIndex: "routeName",
    },
    {
      title: "Code",
      dataIndex: "routeCode",
    },
    {
      title: "From",
      dataIndex: "fromCity",
    },
    {
      title: "To",
      dataIndex: "toCity",
    },
    {
      title: "Distance",
      dataIndex: "totalDistance",
      render: (text) => text || "-",
    },
    {
      title: "Duration",
      dataIndex: "estimatedDuration",
      render: (text) => text || "-",
    },
    {
      title: "Stops",
      render: (text, record) => record.stops?.length || 0,
    },
    {
      title: "Status",
      dataIndex: "status",
    },
    {
      title: "Action",
      render: (text, record) => (
        <div className="d-flex gap-3">
          <i
            className="ri-delete-bin-line"
            onClick={() =>
              Modal.confirm({
                title: "Delete route?",
                content: `This will delete ${record.routeName} and all of its stops and fares.`,
                okText: "Delete",
                okType: "danger",
                cancelText: "Cancel",
                onOk: () => deleteRoute(record._id),
              })
            }
          ></i>
          <i
            className="ri-pencil-line"
            onClick={() => {
              setSelectedRoute(record);
              setShowRouteForm(true);
            }}
          ></i>
        </div>
      ),
    },
  ];

  const filteredRoutes = useMemo(() => {
    if (!routeFilter) return routes;
    return routes.filter((route) => route._id === routeFilter);
  }, [routeFilter, routes]);

  return (
    <div>
      <div className="d-flex justify-content-between my-2">
        <PageTitle title="Routes" />
        <button className="primary-btn" onClick={() => setShowRouteForm(true)}>
          Add Route
        </button>
      </div>
      <div className="admin-filter-bar">
        <Select
          allowClear
          showSearch
          placeholder="Filter by route"
          value={routeFilter || undefined}
          optionFilterProp="label"
          onChange={(value) => setRouteFilter(value || "")}
        >
          {routes.map((route) => (
            <Select.Option
              key={route._id}
              value={route._id}
              label={`${route.routeName || ""} ${route.routeCode || ""}`}
            >
              {route.routeName} ({route.routeCode})
            </Select.Option>
          ))}
        </Select>
      </div>
      <ResponsiveAntTable columns={columns} dataSource={filteredRoutes} rowKey="_id" cardsAlways />
      {showRouteForm && (
        <RouteForm
          showRouteForm={showRouteForm}
          setShowRouteForm={setShowRouteForm}
          selectedRoute={selectedRoute}
          setSelectedRoute={setSelectedRoute}
          getData={getRoutes}
        />
      )}
    </div>
  );
}

export default AdminRoutes;
