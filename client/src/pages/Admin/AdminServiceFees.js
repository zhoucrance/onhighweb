import { Form, InputNumber, Select, Switch, Tag, message } from "antd";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";
import "../../resourses/service-fees.css";

const money = (value) => `USD ${Number(value || 0).toFixed(2)}`;

const formatServiceFee = (record) => {
  if (!record.serviceFeeEnabled) return "Not applied";
  const amount = Number(record.serviceFeeAmount || 0);
  return record.serviceFeeMode === "percentage" ? `${amount}%` : money(amount);
};

function AdminServiceFees() {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  const [buses, setBuses] = useState([]);
  const [serviceFeeMode, setServiceFeeMode] = useState("fixed");
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(true);
  const [serviceFeeAmount, setServiceFeeAmount] = useState(0);

  const getServiceFees = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/buses/get-service-fees", {});
      dispatch(HideLoading());
      if (response.data.success) {
        setBuses(response.data.data || []);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  }, [dispatch]);

  useEffect(() => {
    getServiceFees();
  }, [getServiceFees]);

  const busOptions = useMemo(() => buses.map((bus) => ({
    value: bus._id,
    label: `${bus.name} (${bus.number})`,
  })), [buses]);

  const summary = useMemo(() => {
    return buses.reduce(
      (acc, bus) => {
        acc.total += 1;
        if (bus.serviceFeeEnabled) acc.active += 1;
        if (bus.serviceFeeMode === "fixed") acc.fixed += 1;
        if (bus.serviceFeeMode === "percentage") acc.percentage += 1;
        return acc;
      },
      { total: 0, active: 0, fixed: 0, percentage: 0 }
    );
  }, [buses]);

  const selectedBusId = Form.useWatch("busId", form);
  const selectedBus = buses.find((bus) => bus._id === selectedBusId);
  const previewText = serviceFeeEnabled
    ? serviceFeeMode === "percentage"
      ? `${Number(serviceFeeAmount || 0)}% service fee`
      : `${money(serviceFeeAmount)} service fee`
    : "Service fee disabled";

  const onFinish = async (values) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/buses/update-service-fees", {
        targetType: "single",
        busIds: [values.busId],
        serviceFeeEnabled: values.serviceFeeEnabled,
        serviceFeeMode: values.serviceFeeMode,
        serviceFeeAmount: values.serviceFeeAmount,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        getServiceFees();
        form.setFieldsValue({ busId: undefined });
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const columns = [
    {
      title: "Bus",
      render: (text, record) => (
        <div className="service-fee-bus">
          <strong>{record.name}</strong>
          <span>{record.number}</span>
        </div>
      ),
    },
    {
      title: "Fare",
      dataIndex: "fare",
      render: money,
    },
    {
      title: "Service Fee",
      render: (text, record) => (
        <Tag color={record.serviceFeeEnabled ? "green" : "default"}>
          {formatServiceFee(record)}
        </Tag>
      ),
    },
    {
      title: "Status",
      render: (text, record) => (
        <span className={record.serviceFeeEnabled ? "service-fee-status active" : "service-fee-status"}>
          {record.serviceFeeEnabled ? "Applied" : "Off"}
        </span>
      ),
    },
  ];

  return (
    <div className="service-fees-page">
      <div className="service-fee-header">
        <div>
          <PageTitle title="Service Fee" />
          <p>Set the fee formerly known as GST directly on one selected bus.</p>
        </div>
        <button className="primary-btn" onClick={getServiceFees}>
          <i className="ri-refresh-line"></i> Refresh
        </button>
      </div>

      <div className="service-fee-summary">
        <div>
          <span>Total Buses</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Fee Applied</span>
          <strong>{summary.active}</strong>
        </div>
        <div>
          <span>Fixed Fee</span>
          <strong>{summary.fixed}</strong>
        </div>
        <div>
          <span>Percentage</span>
          <strong>{summary.percentage}</strong>
        </div>
      </div>

      <div className="service-fee-grid">
        <section className="service-fee-panel">
          <div className="service-fee-panel-title">
            <i className="ri-price-tag-3-line"></i>
            <div>
              <h2>Apply Service Fee</h2>
              <p>Choose the target and save the amount to the selected bus records.</p>
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              serviceFeeEnabled: true,
              serviceFeeMode: "fixed",
              serviceFeeAmount: 0,
              busId: undefined,
            }}
            onFinish={onFinish}
            onValuesChange={(changed, allValues) => {
              if (changed.serviceFeeMode) setServiceFeeMode(changed.serviceFeeMode);
              if (changed.serviceFeeEnabled !== undefined) setServiceFeeEnabled(changed.serviceFeeEnabled);
              if (changed.serviceFeeAmount !== undefined) setServiceFeeAmount(changed.serviceFeeAmount);
              if (allValues.serviceFeeAmount !== undefined) setServiceFeeAmount(allValues.serviceFeeAmount);
            }}
          >
            <Form.Item
              label="Bus"
              name="busId"
              rules={[{ required: true, message: "Select a bus." }]}
            >
              <Select
                optionFilterProp="label"
                options={busOptions}
                placeholder="Choose one bus"
                showSearch
              />
            </Form.Item>

            <div className="service-fee-inline">
              <Form.Item label="Fee Type" name="serviceFeeMode" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="fixed">Fixed USD</Select.Option>
                  <Select.Option value="percentage">Percentage</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Amount"
                name="serviceFeeAmount"
                rules={[
                  { required: true, message: "Enter service fee amount." },
                  {
                    validator: (_, value) => {
                      const amount = Number(value || 0);
                      if (amount < 0) return Promise.reject(new Error("Fee cannot be negative."));
                      if (serviceFeeMode === "percentage" && amount > 100) {
                        return Promise.reject(new Error("Percentage cannot exceed 100."));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <InputNumber min={0} precision={2} addonBefore={serviceFeeMode === "percentage" ? "%" : "USD"} />
              </Form.Item>
            </div>

            <Form.Item label="Enable Fee" name="serviceFeeEnabled" valuePropName="checked">
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>

            <div className="service-fee-preview">
              <span>Preview</span>
              <strong>{previewText}</strong>
              <p>{selectedBus ? `${selectedBus.name} (${selectedBus.number}) will be updated.` : "Choose a bus to apply the fee."}</p>
            </div>

            <button className="primary-btn service-fee-save" type="submit">
              Save Service Fee
            </button>
          </Form>
        </section>
      </div>

      <section className="service-fee-panel mt-3">
        <div className="service-fee-table-title">
          <h2>Current Service Fee Settings</h2>
          <span>{summary.active} active</span>
        </div>
        <ResponsiveAntTable columns={columns} dataSource={buses} rowKey="_id" scroll={{ x: 900 }} cardsAlways />
      </section>
    </div>
  );
}

export default AdminServiceFees;
