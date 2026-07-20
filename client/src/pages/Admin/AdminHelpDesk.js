import { Button, Card, Col, Descriptions, Input, Modal, Row, Select, Space, Table, Tag, Typography, message } from "antd";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import PageTitle from "../../components/PageTitle";
import { axiosInstance } from "../../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";

const statusColors = {
  OPEN: "red",
  IN_PROGRESS: "orange",
  SOLVED: "green",
};

const statusLabel = (value) => String(value || "OPEN").replaceAll("_", " ");

function AdminHelpDesk() {
  const dispatch = useDispatch();
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState("OPEN");
  const [internalNote, setInternalNote] = useState("");

  const fetchRequests = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.get("/api/help-desk", {
        params: {
          status: statusFilter,
          search,
        },
      });
      if (response.data.success) {
        setRequests(response.data.data || []);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    } finally {
      dispatch(HideLoading());
    }
  }, [dispatch, search, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openDetails = (record) => {
    setSelectedRequest(record);
    setNextStatus(record.status || "OPEN");
    setInternalNote(record.internalNote || "");
    setDetailsOpen(true);
  };

  const updateStatus = async () => {
    if (!selectedRequest) return;
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post(`/api/help-desk/${selectedRequest._id}/status`, {
        status: nextStatus,
        internalNote,
      });
      if (response.data.success) {
        message.success("Help request updated");
        setDetailsOpen(false);
        fetchRequests();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    } finally {
      dispatch(HideLoading());
    }
  };

  const counts = useMemo(() => ({
    open: requests.filter((request) => request.status === "OPEN").length,
    inProgress: requests.filter((request) => request.status === "IN_PROGRESS").length,
    solved: requests.filter((request) => request.status === "SOLVED").length,
  }), [requests]);

  const columns = [
    {
      title: "Ticket",
      dataIndex: "ticketNumber",
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{record.passengerName || "WhatsApp customer"}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Subject",
      dataIndex: "subjectLabel",
      render: (value) => value || "Other",
    },
    {
      title: "Contact",
      render: (_, record) => record.phoneNumber || record.phone_number || "-",
    },
    {
      title: "Company",
      render: (_, record) => record.companyId?.companyName || "Unassigned",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (value) => <Tag color={statusColors[value] || "default"}>{statusLabel(value)}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      render: (value) => value ? moment(value).format("DD MMM YYYY HH:mm") : "-",
    },
    {
      title: "Action",
      render: (_, record) => (
        <Button type="link" onClick={() => openDetails(record)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="admin-help-desk-page">
      <PageTitle title="Help Desk" />

      <Row gutter={[16, 16]} className="mb-3">
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary">Open</Typography.Text>
            <h2>{counts.open}</h2>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary">In Progress</Typography.Text>
            <h2>{counts.inProgress}</h2>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary">Solved</Typography.Text>
            <h2>{counts.solved}</h2>
          </Card>
        </Col>
      </Row>

      <Card>
        <Row gutter={[12, 12]} className="mb-3">
          <Col xs={24} md={10}>
            <Input.Search
              allowClear
              placeholder="Search ticket, subject, phone, passenger"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onSearch={fetchRequests}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select value={statusFilter} onChange={setStatusFilter} className="w-100">
              <Select.Option value="ALL">All Statuses</Select.Option>
              <Select.Option value="OPEN">Open</Select.Option>
              <Select.Option value="IN_PROGRESS">In Progress</Select.Option>
              <Select.Option value="SOLVED">Solved</Select.Option>
            </Select>
          </Col>
          <Col xs={24} md={4}>
            <Button onClick={fetchRequests}>Refresh</Button>
          </Col>
        </Row>

        <Table columns={columns} dataSource={requests} rowKey="_id" pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title="Help Request"
        visible={detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        onOk={updateStatus}
        okText="Update"
      >
        {selectedRequest && (
          <Space direction="vertical" className="w-100" size="middle">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Ticket">{selectedRequest.ticketNumber}</Descriptions.Item>
              <Descriptions.Item label="Subject">{selectedRequest.subjectLabel || "Other"}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selectedRequest.phoneNumber || selectedRequest.phone_number || "-"}</Descriptions.Item>
              <Descriptions.Item label="Passenger">{selectedRequest.passengerName || "-"}</Descriptions.Item>
              <Descriptions.Item label="Description">{selectedRequest.description}</Descriptions.Item>
            </Descriptions>
            <Select value={nextStatus} onChange={setNextStatus} className="w-100">
              <Select.Option value="OPEN">Open</Select.Option>
              <Select.Option value="IN_PROGRESS">In Progress</Select.Option>
              <Select.Option value="SOLVED">Solved</Select.Option>
            </Select>
            <Input.TextArea
              rows={3}
              placeholder="Internal note"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </Space>
        )}
      </Modal>
    </div>
  );
}

export default AdminHelpDesk;
