import React, { useEffect, useState } from "react";
import { Col, Form, Input, message, Modal, Row, Select } from "antd";
import { axiosInstance } from "../helpers/axiosInstance";
import { useDispatch } from "react-redux";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";

const busColorOptions = [
  { value: "red", label: "Red", color: "#dc2626" },
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "green", label: "Green", color: "#16a34a" },
  { value: "yellow", label: "Yellow", color: "#facc15" },
  { value: "orange", label: "Orange", color: "#f97316" },
  { value: "purple", label: "Purple", color: "#7c3aed" },
  { value: "pink", label: "Pink", color: "#ec4899" },
  { value: "cyan", label: "Cyan", color: "#06b6d4" },
  { value: "teal", label: "Teal", color: "#0d9488" },
  { value: "lime", label: "Lime", color: "#84cc16" },
  { value: "indigo", label: "Indigo", color: "#4f46e5" },
  { value: "violet", label: "Violet", color: "#8b5cf6" },
  { value: "maroon", label: "Maroon", color: "#7f1d1d" },
  { value: "navy", label: "Navy", color: "#1e3a8a" },
  { value: "olive", label: "Olive", color: "#3f6212" },
  { value: "gold", label: "Gold", color: "#d4a017" },
  { value: "silver", label: "Silver", color: "#94a3b8" },
  { value: "bronze", label: "Bronze", color: "#b45309" },
  { value: "turquoise", label: "Turquoise", color: "#14b8a6" },
  { value: "magenta", label: "Magenta", color: "#d946ef" },
  { value: "coral", label: "Coral", color: "#fb7185" },
  { value: "brown", label: "Brown", color: "#92400e" },
  { value: "black", label: "Black", color: "#111827" },
  { value: "white", label: "White", color: "#ffffff" },
  { value: "skyblue", label: "Sky Blue", color: "#38bdf8" },
  { value: "mint", label: "Mint", color: "#86efac" },
  { value: "lavender", label: "Lavender", color: "#c4b5fd" },
  { value: "crimson", label: "Crimson", color: "#be123c" },
  { value: "amber", label: "Amber", color: "#f59e0b" },
  { value: "charcoal", label: "Charcoal", color: "#374151" },
];

const ColorOptionLabel = ({ option }) => (
  <span className="d-flex align-items-center gap-2">
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        backgroundColor: option.color,
        border: "1px solid #d9dfeb",
        display: "inline-block",
      }}
    />
    {option.label}
  </span>
);

function BusForm({
  showBusForm,
  setShowBusForm,
  type = "add",
  getData,
  selectedBus,
  setSelectedBus,
}) {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  const [companies, setCompanies] = useState([]);

  const initialValues = selectedBus
    ? {
        ...selectedBus,
        icon_color: selectedBus.icon_color || selectedBus.iconColor || "blue",
      }
    : {
        type: "AC",
        status: "Active",
        icon_color: "blue",
      };

  const onFinish = async (values) => {
    try {
      dispatch(ShowLoading());
      let response = null;
      if (type === "add") {
        response = await axiosInstance.post("/api/buses/add-bus", values);
      } else {
        response = await axiosInstance.post("/api/buses/update-bus", {
          ...values,
          _id: selectedBus._id,
        });
      }
      if (response.data.success) {
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
      getData();
      setShowBusForm(false);
      setSelectedBus(null);

      dispatch(HideLoading());
    } catch (error) {
      message.error(error.message);
      dispatch(HideLoading());
    }
  };

  useEffect(() => {
    if (!showBusForm) return;
    const loadCompanies = async () => {
      try {
        const response = await axiosInstance.get("/api/companies");
        if (response.data.success) {
          const nextCompanies = response.data.data || [];
          setCompanies(nextCompanies);
          if (nextCompanies.length === 1 && !form.getFieldValue("companyId")) {
            form.setFieldValue("companyId", nextCompanies[0]._id);
          }
        }
      } catch (error) {
        message.error(error.response?.data?.message || "Failed to load companies.");
      }
    };
    loadCompanies();
  }, [form, showBusForm]);

  useEffect(() => {
    form.setFieldsValue(initialValues);
  }, [showBusForm, selectedBus]);

  const companyOptions = companies.map((company) => ({
    value: company._id,
    label: company.companyName,
  }));

  return (
    <Modal
      width={800}
      title={type === "add" ? "Add Bus" : "Update Bus"}
      visible={showBusForm}
      onCancel={() => {
        setSelectedBus(null);
        setShowBusForm(false);
      }}
      footer={false}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initialValues}
      >
        <Row gutter={[10, 10]}>
          {companyOptions.length > 1 && (
            <Col lg={24} xs={24}>
              <Form.Item label="Company" name="companyId" rules={[{ required: true, message: "Select company." }]}>
                <Select
                  showSearch
                  placeholder="Select company"
                  optionFilterProp="label"
                  options={companyOptions}
                />
              </Form.Item>
            </Col>
          )}
          <Col lg={24} xs={24}>
            <Form.Item label="Bus Name" name="name" rules={[{ required: true }]}>
              <input type="text" />
            </Form.Item>
          </Col>
          <Col lg={12} xs={24}>
            <Form.Item
              label="Bus Number Plate"
              name="number"
              normalize={(value) => String(value || "").toUpperCase()}
              rules={[
                { required: true, message: "Bus number is required." },
                { whitespace: true, message: "Bus number is required." },
              ]}
            >
              <Input addonBefore="Plate" placeholder="ABC-1234" maxLength={24} />
            </Form.Item>
          </Col>
          <Col lg={12} xs={24}>
            <Form.Item label="Capacity" name="capacity" rules={[{ required: true }]}>
              <input type="number" />
            </Form.Item>
          </Col>

          <Col lg={12} xs={24}>
            <Form.Item label="Type" name="type" rules={[{ required: true }]}>
              <select>
                <option value="AC">AC</option>
                <option value="Non-AC">Non-AC</option>
              </select>
            </Form.Item>
          </Col>
          <Col lg={12} xs={24}>
            <Form.Item label="Bus Color" name="icon_color" rules={[{ required: true }]}>
              <Select optionLabelProp="label" optionFilterProp="searchLabel" showSearch>
                {busColorOptions.map((option) => (
                  <Select.Option
                    value={option.value}
                    key={option.value}
                    label={<ColorOptionLabel option={option} />}
                    searchLabel={option.label}
                  >
                    <ColorOptionLabel option={option} />
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col lg={12} xs={24}>
            <Form.Item label="Status" name="status" initialValue="Active">
              <select>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </Form.Item>
          </Col>
        </Row>

        <div className="d-flex justify-content-end">
          <button className="primary-btn" type="submit">
            Save
          </button>
        </div>
      </Form>
    </Modal>
  );
}

export default BusForm;
