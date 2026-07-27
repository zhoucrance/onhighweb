import { Button, Checkbox, Form, Input, Select, Tag, message } from "antd";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";
import "../../resourses/service-fees.css";

function AdminPesepaySettings() {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  const [methodForm] = Form.useForm();
  const [companies, setCompanies] = useState([]);
  const paymentMethodOptions = ["EcoCash", "Card Payment", "Pay on Boarding"];

  const getSettings = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.get("/api/companies/pesepay-settings/list");
      dispatch(HideLoading());
      if (response.data.success) {
        setCompanies(response.data.data || []);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  }, [dispatch]);

  useEffect(() => {
    getSettings();
  }, [getSettings]);

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: company._id,
        label: company.companyName,
      })),
    [companies]
  );

  const selectedCompanyId = Form.useWatch("companyId", form);
  const selectedCompany = companies.find((company) => company._id === selectedCompanyId);
  const selectedMethodCompanyId = Form.useWatch("methodCompanyId", methodForm);
  const selectedMethodCompany = companies.find((company) => company._id === selectedMethodCompanyId);

  useEffect(() => {
    if (selectedMethodCompany) {
      methodForm.setFieldsValue({
        enabledPaymentMethods: selectedMethodCompany.enabledPaymentMethods?.length
          ? selectedMethodCompany.enabledPaymentMethods
          : ["EcoCash", "Card Payment"],
      });
    }
  }, [methodForm, selectedMethodCompany]);

  const onFinish = async (values) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.patch(`/api/companies/pesepay-settings/${values.companyId}`, {
        pesepayIntegrationKey: values.pesepayIntegrationKey,
        pesepayEncryptionKey: values.pesepayEncryptionKey,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        form.resetFields(["pesepayIntegrationKey", "pesepayEncryptionKey"]);
        getSettings();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const savePaymentMethods = async (values) => {
    try {
      if (!values.enabledPaymentMethods?.length) {
        message.error("At least one payment method must be enabled.");
        return;
      }
      dispatch(ShowLoading());
      const response = await axiosInstance.patch(`/api/companies/payment-methods/${values.methodCompanyId}`, {
        enabledPaymentMethods: values.enabledPaymentMethods,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        getSettings();
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
      title: "Company",
      dataIndex: "companyName",
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: "Integration Key",
      render: (_, record) => (
        <Tag color={record.hasPesepayIntegrationKey ? "green" : "default"}>
          {record.hasPesepayIntegrationKey ? "Saved" : "Missing"}
        </Tag>
      ),
    },
    {
      title: "Encryption Key",
      render: (_, record) => (
        <Tag color={record.hasPesepayEncryptionKey ? "green" : "default"}>
          {record.hasPesepayEncryptionKey ? "Saved" : "Missing"}
        </Tag>
      ),
    },
    {
      title: "Updated",
      render: (_, record) =>
        record.pesepayKeysUpdatedAt
          ? new Date(record.pesepayKeysUpdatedAt).toLocaleString()
          : "Not set",
    },
    {
      title: "Enabled Methods",
      render: (_, record) => (
        <div className="service-fee-tags">
          {(record.enabledPaymentMethods?.length ? record.enabledPaymentMethods : ["EcoCash", "Card Payment"]).map((method) => (
            <Tag key={method} color={method === "Pay on Boarding" ? "gold" : "green"}>{method}</Tag>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="service-fees-page">
      <div className="service-fee-header">
        <div>
          <PageTitle title="Payments" />
          <p>Set the payment integration keys for the company that should receive each bus payment.</p>
        </div>
        <button className="primary-btn" onClick={getSettings}>
          <i className="ri-refresh-line"></i> Refresh
        </button>
      </div>

      <div className="service-fee-grid">
        <section className="service-fee-panel">
          <div className="service-fee-panel-title">
            <i className="ri-bank-card-line"></i>
            <div>
              <h2>Company Payment Setup</h2>
              <p>Choose a company and save the two payment keys registered for that company.</p>
            </div>
          </div>

          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item label="Company" name="companyId" rules={[{ required: true, message: "Select a company." }]}>
              <Select
                options={companyOptions}
                placeholder="Choose company"
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) =>
                  String(option?.label || "").toLowerCase().includes(String(input || "").toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              label="Integration Key"
              name="pesepayIntegrationKey"
              rules={[{ required: true, message: "Enter the payment integration key." }]}
            >
              <Input.Password placeholder="Paste integration key" autoComplete="new-password" />
            </Form.Item>

            <Form.Item
              label="Encryption Key"
              name="pesepayEncryptionKey"
              rules={[{ required: true, message: "Enter the payment encryption key." }]}
            >
              <Input.Password placeholder="Paste encryption key" autoComplete="new-password" />
            </Form.Item>

            <div className="service-fee-preview">
              <span>Target</span>
              <strong>{selectedCompany?.companyName || "Choose a company"}</strong>
              <p>New values replace the stored keys. Saved secret values are not shown again.</p>
            </div>

            <Button className="primary-btn service-fee-save" htmlType="submit">
              Save Payment Keys
            </Button>
          </Form>
        </section>
        <section className="service-fee-panel">
          <div className="service-fee-panel-title">
            <i className="ri-secure-payment-line"></i>
            <div>
              <h2>Payment Method Authority</h2>
              <p>Choose which payment methods operators and passengers can use for a company.</p>
            </div>
          </div>

          <Form
            form={methodForm}
            layout="vertical"
            onFinish={savePaymentMethods}
            initialValues={{ enabledPaymentMethods: ["EcoCash", "Card Payment"] }}
          >
            <Form.Item label="Company" name="methodCompanyId" rules={[{ required: true, message: "Select a company." }]}>
              <Select
                options={companyOptions}
                placeholder="Choose company"
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) =>
                  String(option?.label || "").toLowerCase().includes(String(input || "").toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item
              label="Accepted Payment Methods"
              name="enabledPaymentMethods"
              rules={[{ required: true, message: "Enable at least one payment method." }]}
            >
              <Checkbox.Group className="service-fee-checkboxes">
                {paymentMethodOptions.map((method) => (
                  <Checkbox key={method} value={method}>{method}</Checkbox>
                ))}
              </Checkbox.Group>
            </Form.Item>
            <div className="service-fee-preview">
              <span>Current Methods</span>
              <strong>{selectedMethodCompany?.companyName || "Choose a company"}</strong>
              <p>EcoCash and Card Payment are enabled by default. Pay on Boarding can be enabled later by super admin.</p>
            </div>
            <Button className="primary-btn service-fee-save" htmlType="submit">
              Save Payment Methods
            </Button>
          </Form>
        </section>
      </div>

      <section className="service-fee-panel mt-3">
        <div className="service-fee-table-title">
          <h2>Company Key Status</h2>
          <span>{companies.length} companies</span>
        </div>
        <ResponsiveAntTable columns={columns} dataSource={companies} rowKey="_id" scroll={{ x: 900 }} cardsAlways />
      </section>
    </div>
  );
}

export default AdminPesepaySettings;
