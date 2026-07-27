import { message, Modal, Select } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import BusForm from "../../components/BusForm";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { isSuperAdmin } from "../../helpers/permissions";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";

const busColorStyles = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#facc15",
  orange: "#f97316",
  purple: "#7c3aed",
  pink: "#ec4899",
  cyan: "#06b6d4",
  teal: "#0d9488",
  lime: "#84cc16",
  indigo: "#4f46e5",
  violet: "#8b5cf6",
  maroon: "#7f1d1d",
  navy: "#1e3a8a",
  olive: "#3f6212",
  gold: "#d4a017",
  silver: "#94a3b8",
  bronze: "#b45309",
  turquoise: "#14b8a6",
  magenta: "#d946ef",
  coral: "#fb7185",
  brown: "#92400e",
  black: "#111827",
  white: "#ffffff",
  skyblue: "#38bdf8",
  mint: "#86efac",
  lavender: "#c4b5fd",
  crimson: "#be123c",
  amber: "#f59e0b",
  charcoal: "#374151",
};

function AdminBuses() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const superAdmin = isSuperAdmin(user);
  const [showBusForm, setShowBusForm] = useState(false);
  const [buses, setBuses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [busFilter, setBusFilter] = useState("");
  const [selectedBus, setSelectedBus] = useState(null);
  const getBuses = async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/buses/get-all-buses", {});
      dispatch(HideLoading());
      if (response.data.success) {
        setBuses(response.data.data);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  const getCompanies = async () => {
    try {
      const response = await axiosInstance.get("/api/companies");
      if (response.data.success) {
        const nextCompanies = response.data.data || [];
        setCompanies(nextCompanies);
        if (!superAdmin && nextCompanies.length === 1) {
          setCompanyFilter(nextCompanies[0]._id);
        }
      }
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to load companies.");
    }
  };

  const deleteBus = async (id) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/buses/delete-bus", {
        _id: id,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        getBuses();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
    },
    {
      title: "Number",
      dataIndex: "number",
    },
    {
      title: "Capacity",
      dataIndex: "capacity",
    },
    {
      title: "Type",
      dataIndex: "type",
    },
    {
      title: "Color",
      dataIndex: "icon_color",
      render: (color = "blue") => (
        <span className="d-flex align-items-center gap-2">
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: busColorStyles[color] || busColorStyles.blue,
              display: "inline-block",
              border: "1px solid #d9dfeb",
            }}
          />
          {color}
        </span>
      ),
    },
    {
      title: "Route",
      dataIndex: "route",
      render: (route) => route ? `${route.routeName} (${route.fromCity} - ${route.toCity})` : "-",
    },
    {
      title: "Journey Date",
      dataIndex: "journeyDate",
    },
    {
      title: "Status",
      dataIndex: "status",
    },
    {
      title: "Action",
      dataIndex: "action",
      render: (action, record) => (
        <div className="d-flex gap-3">
          <i
            className="ri-delete-bin-line"
            onClick={() =>
              Modal.confirm({
                title: "Delete bus?",
                content: `This will delete ${record.name} (${record.number}).`,
                okText: "Delete",
                okType: "danger",
                cancelText: "Cancel",
                onOk: () => deleteBus(record._id),
              })
            }
          ></i>
          <i
            className="ri-pencil-line"
            onClick={() => {
              setSelectedBus(record);
              setShowBusForm(true);
            }}
          ></i>
        </div>
      ),
    },
  ];

  const companyBuses = useMemo(() => {
    if (superAdmin && !companyFilter) return [];
    return buses.filter((bus) => {
      const busCompanyId = String(bus.companyId?._id || bus.companyId || "");
      return !companyFilter || busCompanyId === String(companyFilter);
    });
  }, [buses, companyFilter, superAdmin]);

  const filteredBuses = useMemo(() => {
    if (!busFilter) return companyBuses;
    return companyBuses.filter((bus) => bus._id === busFilter);
  }, [busFilter, companyBuses]);

  const companySelected = !superAdmin || Boolean(companyFilter);

  useEffect(() => {
    getBuses();
    getCompanies();
  }, []);

  const openAddBus = () => {
    if (superAdmin && !companyFilter) {
      message.error("Select a company first.");
      return;
    }
    setSelectedBus(null);
    setShowBusForm(true);
  };

  return (
    <div>
      <div className="d-flex justify-content-between my-2">
        <PageTitle title="Buses" />
        {companySelected && (
          <button className="primary-btn" onClick={openAddBus}>
            Add Bus
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
          onChange={(value) => {
            setCompanyFilter(value || "");
            setBusFilter("");
          }}
          options={companies.map((company) => ({
            value: company._id,
            label: company.companyName,
          }))}
        />
        {companySelected && (
          <Select
            allowClear
            showSearch
            placeholder="Filter by bus"
            value={busFilter || undefined}
            optionFilterProp="label"
            onChange={(value) => setBusFilter(value || "")}
          >
            {companyBuses.map((bus) => (
              <Select.Option
                key={bus._id}
                value={bus._id}
                label={`${bus.name || ""} ${bus.number || ""}`}
              >
                {bus.name} ({bus.number})
              </Select.Option>
            ))}
          </Select>
        )}
      </div>

      {companySelected && <ResponsiveAntTable columns={columns} dataSource={filteredBuses} rowKey="_id" cardsAlways />}

      {showBusForm && (
        <BusForm
          showBusForm={showBusForm}
          setShowBusForm={setShowBusForm}
          type={selectedBus ? "edit" : "add"}
          selectedBus={selectedBus}
          setSelectedBus={setSelectedBus}
          getData={getBuses}
          selectedCompanyId={selectedBus ? "" : companyFilter}
        />
      )}
    </div>
  );
}

export default AdminBuses;
