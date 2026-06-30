import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useReactToPrint } from "react-to-print";
import PageTitle from "../../components/PageTitle";
import { axiosInstance } from "../../helpers/axiosInstance";
import { formatSeatNumbers } from "../../helpers/seatDisplay";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";
import "../../resourses/booking-management.css";

const refundLabels = {
  CASH: "Cash Refund",
  ECOCASH_REVERSAL: "EcoCash Reversal",
  CREDITS: "Credits",
};

const statusColors = {
  CONFIRMED: "green",
  BOARDED: "blue",
  INVALID_PAYMENT: "red",
  CANCELLED_AND_REFUNDED: "red",
  CANCELLED_AND_CREDITED: "purple",
  NOT_BOARDED: "orange",
};

function AdminBookingManagement() {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState("");
  const [ticketSuggestions, setTicketSuggestions] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancelStep, setCancelStep] = useState("details");
  const [cancellationDraft, setCancellationDraft] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const ticketRef = useRef();

  const selectedRefundMethods = selectedBooking?.refundMethods || [];
  const sourceLabel = selectedBooking?.sourceLabel || (selectedBooking?.source === "WHATSAPP" ? "WhatsApp" : "Direct");
  const ticketSearchOptions = ticketSuggestions.map((booking) => ({
    value: booking.ticketNumber,
    label: (
      <div className="bm-search-option">
        <strong>{booking.ticketNumber}</strong>
        <span>{booking.sourceLabel || (booking.source === "WHATSAPP" ? "WhatsApp" : "Direct")}</span>
      </div>
    ),
  }));

  const statusTag = (value) => (
    <Tag color={statusColors[value] || "default"}>{String(value || "-").replaceAll("_", " ")}</Tag>
  );

  const loadTicketSuggestions = useCallback(async () => {
    try {
      const response = await axiosInstance.post("/api/bookings/management/recent", {});
      if (response.data.success) {
        setTicketSuggestions(response.data.data || []);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  }, []);

  const searchBooking = useCallback(async (ticketNumber = searchText, options = {}) => {
    const reference = String(ticketNumber || "").trim();
    if (!reference) {
      if (!options.silent) {
        message.warning("Enter a ticket number");
      }
      return;
    }

    try {
      if (!options.silent) {
        dispatch(ShowLoading());
      }
      const response = await axiosInstance.post("/api/bookings/management/search", {
        ticketNumber: reference,
      });
      if (!options.silent) {
        dispatch(HideLoading());
      }
      if (response.data.success) {
        setSelectedBooking(response.data.data);
        setCancelStep("details");
        setCancellationDraft(null);
        setCompletion(null);
        setSearchText(reference);
      } else {
        if (!options.silent) {
          message.error(response.data.message);
        }
      }
    } catch (error) {
      if (!options.silent) {
        dispatch(HideLoading());
      }
      if (!options.silent) {
        message.error(error.response?.data?.message || error.message);
      }
    }
  }, [dispatch, searchText]);

  useEffect(() => {
    const reference = String(searchText || "").trim();
    if (reference.length < 2) return undefined;
    const timer = setTimeout(() => {
      searchBooking(reference, { silent: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [searchText, searchBooking]);

  const markAsBoarded = async () => {
    if (!selectedBooking) return;

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/management/mark-boarded", {
        ticketNumber: selectedBooking.ticketNumber,
        boardedAtCity: selectedBooking.trip.from,
        boardedAtPlace: selectedBooking.trip.boardingPoint,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        setSelectedBooking(response.data.data);
        setPrintOpen(true);
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const reviewCancellation = async () => {
    try {
      const values = await form.validateFields();
      setCancellationDraft(values);
      setCancelStep("review");
    } catch (error) {
      message.warning("Complete cancellation details");
    }
  };

  const confirmCancellation = async () => {
    if (!selectedBooking || !cancellationDraft) return;

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/management/cancel", {
        ticketNumber: selectedBooking.ticketNumber,
        cancellationReason: cancellationDraft.cancellationReason,
        cancellationNote: cancellationDraft.cancellationNote,
        refundMethod: cancellationDraft.refundMethod,
      });
      dispatch(HideLoading());
      if (response.data.success) {
        setSelectedBooking(response.data.data.booking);
        setCompletion(response.data.data);
        setCancelStep("completed");
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const handlePrint = useReactToPrint({
    content: () => ticketRef.current,
    documentTitle: selectedBooking?.ticketNumber || "ticket",
  });

  const showReprintAlert = (ticketNumber) =>
    new Promise((resolve) => {
      Modal.warning({
        title: "Ticket already printed",
        content: `Alert: Ticket ${ticketNumber} was already printed before. This is a reprint.`,
        okText: "Continue",
        onOk: resolve,
      });
    });

  const handlePrintTicket = async () => {
    if (!selectedBooking) return;
    try {
      const response = await axiosInstance.post("/api/bookings/mark-ticket-printed", {
        bookingId: selectedBooking._id,
        ticketNumber: selectedBooking.ticketNumber,
      });
      if (response.data.success) {
        if (response.data.data?.wasAlreadyPrinted) {
          await showReprintAlert(response.data.data.ticketNumber);
        }
        setSelectedBooking({
          ...selectedBooking,
          printCount: response.data.data?.printCount,
          lastPrintedAt: response.data.data?.lastPrintedAt,
        });
        handlePrint();
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  };

  const cancelAlert = useMemo(() => {
    if (!selectedBooking) return null;
    if (!selectedBooking.isTicketValid) {
      return {
        type: "error",
        message: selectedBooking.invalidReason || "Payment failed. This ticket is not valid.",
      };
    }
    if (selectedBooking.bookingStatus === "BOARDED" || selectedBooking.boardedStatus === "BOARDED") {
      return {
        type: "success",
        message: "This ticket has been used (Boarded). Cancellation is not allowed.",
      };
    }
    return null;
  }, [selectedBooking]);

  return (
    <div className="booking-management-page">
      <PageTitle title="Booking Management" />

      <div className="booking-flow-strip">
        {["Search Booking", "View Booking", "Cancel Booking", "Choose Refund", "Confirm", "Completed"].map(
          (step, index) => (
            <div className="booking-flow-step" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          )
        )}
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card className="bm-card" title="Search Booking">
            <AutoComplete
              className="bm-ticket-search"
              options={ticketSearchOptions}
              value={searchText}
              onChange={setSearchText}
              onFocus={loadTicketSuggestions}
              onSelect={(value) => searchBooking(value)}
              onInputKeyDown={(event) => {
                if (event.key === "Enter") {
                  searchBooking();
                }
              }}
              filterOption={(inputValue, option) =>
                String(option?.value || "").toLowerCase().includes(inputValue.toLowerCase())
              }
            >
              <Input
                placeholder="Ticket number or last 2 digits"
                prefix={<i className="ri-search-line bm-ticket-search-icon"></i>}
              />
            </AutoComplete>
          </Card>
        </Col>

        <Col xs={24} lg={18}>
          {!selectedBooking ? (
            <Card className="bm-card bm-empty">
              <Empty description="Search by ticket number to view booking details" />
            </Card>
          ) : (
            <Space direction="vertical" size={16} className="w-100">
              <Card
                className="bm-card"
                title={
                  <Space>
                    <span>Booking Details</span>
                    {statusTag(selectedBooking.bookingStatus)}
                    <Tag color={selectedBooking.source === "WHATSAPP" ? "green" : "blue"}>{sourceLabel}</Tag>
                  </Space>
                }
              >
                <div className="bm-ticket-heading">
                  <strong>Ticket No: {selectedBooking.ticketNumber}</strong>
                </div>

                {cancelAlert && <Alert showIcon className="mb-3" type={cancelAlert.type} message={cancelAlert.message} />}

                {selectedBooking.credits?.hasCredits && (
                  <Alert
                    showIcon
                    className="mb-3"
                    type={Number(selectedBooking.credits.activeBalance || 0) > 0 ? "success" : "info"}
                    message={`Credits on this ticket: USD ${Number(selectedBooking.credits.activeBalance || 0).toFixed(2)} available`}
                    description={`Total credits assigned: USD ${Number(selectedBooking.credits.totalAmount || 0).toFixed(2)}`}
                  />
                )}

                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}>
                    <div className="bm-info-panel">
                      <h4>Customer Details</h4>
                      <p>Name</p>
                      <strong>{selectedBooking.customer.name}</strong>
                      <p>Phone</p>
                      <strong>{selectedBooking.customer.phone}</strong>
                      <p>Source</p>
                      <strong>{sourceLabel}</strong>
                      <p>Bookings Count</p>
                      <strong>{selectedBooking.customer.bookingCount}</strong>
                    </div>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="bm-info-panel">
                      <h4>Trip Details</h4>
                      <p>Bus</p>
                      <strong>{selectedBooking.trip.bus}</strong>
                      <p>Plate Number</p>
                      <strong>{selectedBooking.trip.plateNumber}</strong>
                      <p>Route</p>
                      <strong>
                        {selectedBooking.trip.from} to {selectedBooking.trip.to}
                      </strong>
                      <p>Date / Time</p>
                      <strong>
                        {selectedBooking.trip.date} {selectedBooking.trip.time}
                      </strong>
                      <p>Seat No.</p>
                      <strong>{selectedBooking.trip.seatText}</strong>
                    </div>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="bm-info-panel">
                      <h4>Payment Details</h4>
                      <p>Amount Paid</p>
                      <strong>USD {selectedBooking.payment.amountPaid.toFixed(2)}</strong>
                      <p>Payment Method</p>
                      <strong>{selectedBooking.payment.paymentMethod}</strong>
                      <p>Payment Status</p>
                      {statusTag(selectedBooking.payment.paymentStatus)}
                      <p>Boarded Status</p>
                      {statusTag(selectedBooking.boardedStatus)}
                      {selectedBooking.credits?.hasCredits && (
                        <>
                          <p>Ticket Credits</p>
                          <strong>USD {Number(selectedBooking.credits.activeBalance || 0).toFixed(2)}</strong>
                        </>
                      )}
                    </div>
                  </Col>
                </Row>

                {selectedBooking.credits?.items?.length > 0 && (
                  <Descriptions bordered size="small" column={1} className="mt-3">
                    {selectedBooking.credits.items.map((credit, index) => (
                      <Descriptions.Item
                        key={credit._id || index}
                        label={`Credit ${index + 1}`}
                      >
                        USD {Number(credit.balance || 0).toFixed(2)} balance of USD {Number(credit.amount || 0).toFixed(2)}
                        {" "}· {credit.status}
                        {credit.validUntil ? ` · Valid until ${moment(credit.validUntil).format("DD MMM YYYY")}` : ""}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                )}

                {cancelStep === "details" && (
                  <div className="bm-actions">
                    {selectedBooking.canMarkBoarded && (
                      <Button type="primary" onClick={markAsBoarded}>
                        Mark as Boarded & Print Ticket
                      </Button>
                    )}
                    <Button disabled={!selectedBooking.canCancel} onClick={() => setCancelStep("cancel")}>
                      Cancel Booking
                    </Button>
                  </div>
                )}
              </Card>

              {cancelStep === "cancel" && (
                <Card className="bm-card" title="Cancel Booking">
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                      cancellationReason: "Customer Request",
                      refundMethod: selectedRefundMethods[0],
                    }}
                  >
                    <Form.Item
                      label="Cancellation Reason"
                      name="cancellationReason"
                      rules={[{ required: true, message: "Select cancellation reason" }]}
                    >
                      <Select>
                        <Select.Option value="Customer Request">Customer Request</Select.Option>
                        <Select.Option value="Admin Manual">Admin Manual</Select.Option>
                        <Select.Option value="Service Change">Service Change</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item label="Additional Note" name="cancellationNote">
                      <Input.TextArea rows={3} placeholder="Optional note" />
                    </Form.Item>
                    <Form.Item
                      label="Refund Method"
                      name="refundMethod"
                      rules={[{ required: true, message: "Choose refund method" }]}
                    >
                      <Radio.Group className="bm-refund-options">
                        {selectedRefundMethods.map((method) => (
                          <Radio key={method} value={method}>
                            <strong>{refundLabels[method]}</strong>
                            <span>
                              {method === "CREDITS"
                                ? "Assign credits equal to the cancelled ticket amount."
                                : method === "ECOCASH_REVERSAL"
                                ? "Reverse to original EcoCash number."
                                : "Refund will be paid in cash at terminal."}
                            </span>
                          </Radio>
                        ))}
                      </Radio.Group>
                    </Form.Item>
                    <Descriptions bordered size="small" column={1}>
                      <Descriptions.Item label="Refund Amount">
                        USD {selectedBooking.payment.amountPaid.toFixed(2)}
                      </Descriptions.Item>
                    </Descriptions>
                    <div className="bm-actions">
                      <Button onClick={() => setCancelStep("details")}>Back</Button>
                      <Button type="primary" onClick={reviewCancellation}>
                        Review Cancellation
                      </Button>
                    </div>
                  </Form>
                </Card>
              )}

              {cancelStep === "review" && cancellationDraft && (
                <Card className="bm-card" title="Review & Confirm Cancellation">
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="Customer">{selectedBooking.customer.name}</Descriptions.Item>
                    <Descriptions.Item label="Route">
                      {selectedBooking.trip.from} to {selectedBooking.trip.to}
                    </Descriptions.Item>
                    <Descriptions.Item label="Travel Date">
                      {selectedBooking.trip.date} {selectedBooking.trip.time}
                    </Descriptions.Item>
                    <Descriptions.Item label="Refund Method">
                      {refundLabels[cancellationDraft.refundMethod]}
                    </Descriptions.Item>
                    <Descriptions.Item label="Refund Amount">
                      USD {selectedBooking.payment.amountPaid.toFixed(2)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Note">{cancellationDraft.cancellationNote || "-"}</Descriptions.Item>
                  </Descriptions>
                  <div className="bm-actions">
                    <Button onClick={() => setCancelStep("cancel")}>Back</Button>
                    <Button type="primary" className="bm-green-button" onClick={confirmCancellation}>
                      Confirm Cancellation
                    </Button>
                  </div>
                </Card>
              )}

              {cancelStep === "completed" && completion && (
                <Card className="bm-card bm-completed">
                  <i className="ri-checkbox-circle-line"></i>
                  <h3>
                    {completion.credit ? "Credits Applied Successfully" : "Cancellation Successful"}
                  </h3>
                  <p>Ticket No: {completion.booking.ticketNumber}</p>
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="Final Status">
                      {statusTag(completion.booking.bookingStatus)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Refund Method">
                      {refundLabels[cancellationDraft.refundMethod]}
                    </Descriptions.Item>
                    <Descriptions.Item label={completion.credit ? "Credits Added" : "Refund Amount"}>
                      USD {completion.booking.payment.amountPaid.toFixed(2)}
                    </Descriptions.Item>
                    {completion.credit && (
                      <Descriptions.Item label="Valid Until">
                        {moment(completion.credit.validUntil).format("DD MMM YYYY")}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                  <Button type="primary" ghost className="mt-3" onClick={() => setCancelStep("details")}>
                    View Booking
                  </Button>
                </Card>
              )}
            </Space>
          )}
        </Col>
      </Row>

      <Modal
        title="Boarded Ticket"
        visible={printOpen}
        onCancel={() => setPrintOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPrintOpen(false)}>
            Close
          </Button>,
          <Button key="print" type="primary" onClick={handlePrintTicket}>
            Print Ticket
          </Button>,
        ]}
      >
        {selectedBooking && (
          <div ref={ticketRef} className="bm-print-ticket">
            <h2>OnhighBus Ticket</h2>
            <p>Ticket No: {selectedBooking.ticketNumber}</p>
            <p>Passenger: {selectedBooking.customer.name}</p>
            <p>
              Route: {selectedBooking.trip.from} to {selectedBooking.trip.to}
            </p>
            <p>
              Date: {selectedBooking.trip.date} {selectedBooking.trip.time}
            </p>
            <p>Seat(s): {formatSeatNumbers(selectedBooking.trip.seats)}</p>
            <p>Status: Boarded</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AdminBookingManagement;
