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
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
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

const bookingTabs = [
  { key: "SEARCH", label: "Search Booking" },
  { key: "PAID", label: "Paid Bookings" },
  { key: "CANCELLED", label: "Cancelled Bookings" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "COMPLETED", label: "Completed" },
  { key: "VIEW", label: "View Bookings" },
];

const sourceFilterOptions = [
  { value: "ALL", label: "All" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "OFFICE", label: "Office" },
  { value: "WEB", label: "Direct/Web" },
];

const bookingMatchesSourceFilter = (booking, sourceFilter) => {
  if (sourceFilter === "ALL") return true;
  if (sourceFilter === "WHATSAPP") return booking.source === "WHATSAPP";
  if (sourceFilter === "OFFICE") return booking.sourceLabel === "Office";
  if (sourceFilter === "WEB") return booking.source === "WEB_APP" && booking.sourceLabel !== "Office";
  return true;
};

const escapePdfText = (value) =>
  String(value ?? "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .trim();

const wrapPdfLine = (value, maxLength = 98) => {
  const words = String(value ?? "-").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
};

const buildBookingExportPdf = ({ bookings, title, generatedAt }) => {
  const pageLines = [];
  const pushLine = (text, size = 9) => pageLines.push({ text, size });
  pushLine("OnHighBus Booking Export", 16);
  pushLine(title, 11);
  pushLine(`Generated: ${moment(generatedAt).format("DD MMM YYYY HH:mm")}`, 9);
  pushLine(`Records: ${bookings.length}`, 9);
  pushLine(" ", 8);

  bookings.forEach((booking, index) => {
    const passengers = (booking.passengers || [])
      .map((passenger) => `${passenger.passengerNumber}. ${passenger.fullName} (${passenger.passengerType}, ${passenger.gender}, ${passenger.nationality})`)
      .join("; ");
    [
      `${index + 1}. Ticket: ${booking.ticketNumber || "-"} | ${booking.sourceLabel || booking.source} | ${booking.bookingStatus}`,
      `Customer: ${booking.customer?.name || "-"} | Phone: ${booking.customer?.phone || "-"} | Email: ${booking.customer?.email || "-"}`,
      `Passengers: ${passengers || "-"}`,
      `Emergency: ${booking.emergencyContact?.name || "-"} ${booking.emergencyContact?.phone || ""}`,
      `Trip: ${booking.trip?.from || "-"} to ${booking.trip?.to || "-"} | Date: ${booking.trip?.date || "-"} ${booking.trip?.time || ""}`,
      `Bus: ${booking.trip?.bus || "-"} | Plate: ${booking.trip?.plateNumber || "-"} | Seats: ${booking.trip?.seatText || "-"}`,
      `Boarding: ${booking.trip?.boardingPoint || "-"} | Drop-off: ${booking.trip?.dropOffPoint || "-"}`,
      `Payment: USD ${Number(booking.payment?.amountPaid || 0).toFixed(2)} | ${booking.payment?.paymentMethod || "-"} | ${booking.payment?.paymentStatus || "-"}`,
      `References: ${booking.payment?.paymentReference || "-"} | Merchant: ${booking.payment?.paymentMerchantReference || "-"}`,
      `Created: ${booking.createdAt ? moment(booking.createdAt).format("DD MMM YYYY HH:mm") : "-"}`,
      " ",
    ].forEach((line) => wrapPdfLine(line).forEach((wrapped) => pushLine(wrapped, 8)));
  });

  const pages = [];
  let currentPage = [];
  let y = 748;
  pageLines.forEach((line) => {
    if (y < 48) {
      pages.push(currentPage);
      currentPage = [];
      y = 748;
    }
    currentPage.push({ ...line, y });
    y -= line.size + 5;
  });
  if (currentPage.length) pages.push(currentPage);

  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const streamLines = ["BT"];
    page.forEach((line) => {
      streamLines.push(`/F1 ${line.size} Tf`);
      streamLines.push(`50 ${line.y} Td`);
      streamLines.push(`(${escapePdfText(line.text)}) Tj`);
      streamLines.push(`-50 -${line.y} Td`);
    });
    streamLines.push("ET");
    const contentStream = streamLines.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
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
  const [activeTab, setActiveTab] = useState("SEARCH");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [dateFilters, setDateFilters] = useState({ startDate: "", endDate: "" });
  const [bookingRows, setBookingRows] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const ticketRef = useRef();

  const selectedRefundMethods = selectedBooking?.refundMethods || [];
  const sourceLabel = selectedBooking?.sourceLabel || (selectedBooking?.source === "WHATSAPP" ? "WhatsApp" : "Direct");
  const activeTabLabel = bookingTabs.find((tab) => tab.key === activeTab)?.label || "Search Booking";
  const ticketSearchOptions = ticketSuggestions
    .filter((booking) => bookingMatchesSourceFilter(booking, sourceFilter))
    .map((booking) => ({
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

  const loadBookingRows = useCallback(async () => {
    if (activeTab === "SEARCH") return;

    try {
      setTableLoading(true);
      const response = await axiosInstance.post("/api/bookings/management/list", {
        tab: activeTab,
        source: sourceFilter,
        startDate: dateFilters.startDate,
        endDate: dateFilters.endDate,
      });
      setTableLoading(false);
      if (response.data.success) {
        setBookingRows(response.data.data || []);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      setTableLoading(false);
      message.error(error.response?.data?.message || error.message);
    }
  }, [activeTab, dateFilters.endDate, dateFilters.startDate, sourceFilter]);

  const downloadBookingPdf = (booking) => {
    if (!booking) return;
    const pdf = buildBookingExportPdf({
      bookings: [booking],
      title: `Booking record ${booking.ticketNumber || ""}`.trim(),
      generatedAt: new Date(),
    });
    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `booking-${String(booking.ticketNumber || booking._id || "record").toLowerCase()}-${moment().format("YYYYMMDD-HHmm")}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success("Booking PDF downloaded");
  };

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

  const bookingColumns = useMemo(() => [
    {
      title: "Ticket",
      dataIndex: "ticketNumber",
      render: (value, record) => (
        <button className="bm-link-button" type="button" onClick={() => searchBooking(record.ticketNumber)}>
          {value || "-"}
        </button>
      ),
    },
    {
      title: "Passenger",
      dataIndex: ["customer", "name"],
    },
    {
      title: "Route",
      render: (_, record) => `${record.trip?.from || "-"} to ${record.trip?.to || "-"}`,
    },
    {
      title: "Date",
      render: (_, record) => `${record.trip?.date || "-"} ${record.trip?.time || ""}`.trim(),
    },
    {
      title: "Source",
      render: (_, record) => <Tag color={record.source === "WHATSAPP" ? "green" : "blue"}>{record.sourceLabel || record.source}</Tag>,
    },
    {
      title: "Payment",
      render: (_, record) => `USD ${Number(record.payment?.amountPaid || 0).toFixed(2)}`,
    },
    {
      title: "Status",
      render: (_, record) => statusTag(record.bookingStatus),
    },
    {
      title: "Action",
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => searchBooking(record.ticketNumber)}>
            View
          </Button>
          <Button
            aria-label="Download booking PDF"
            size="small"
            title="Download booking PDF"
            onClick={() => downloadBookingPdf(record)}
          >
            <i className="ri-download-2-line"></i>
          </Button>
        </Space>
      ),
    },
  ], [searchBooking]);

  useEffect(() => {
    const reference = String(searchText || "").trim();
    if (reference.length < 2) return undefined;
    const timer = setTimeout(() => {
      searchBooking(reference, { silent: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [searchText, searchBooking]);

  useEffect(() => {
    loadBookingRows();
  }, [loadBookingRows]);

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
        loadBookingRows();
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
        loadBookingRows();
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

      <div className="booking-flow-strip bm-tab-strip">
        {bookingTabs.map((tab) => (
          <button
            className={`booking-flow-step bm-tab-button ${activeTab === tab.key ? "active" : ""}`}
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
          >
            <strong>{tab.label}</strong>
          </button>
        ))}
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card
            className="bm-card"
            title={
              <div className="bm-search-title">
                <span>{activeTabLabel}</span>
                <Select
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={sourceFilterOptions}
                  className="bm-source-filter"
                />
              </div>
            }
          >
            <Space direction="vertical" className="w-100" size={10}>
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
              <div className="bm-date-row">
                <Input
                  type="date"
                  value={dateFilters.startDate}
                  onChange={(event) => setDateFilters((current) => ({ ...current, startDate: event.target.value }))}
                />
                <Input
                  type="date"
                  value={dateFilters.endDate}
                  onChange={(event) => setDateFilters((current) => ({ ...current, endDate: event.target.value }))}
                />
              </div>
            </Space>
          </Card>

        </Col>

        <Col xs={24} lg={18}>
          {activeTab !== "SEARCH" && (
            <Card
              className="bm-card bm-table-card"
              title={
                <Space>
                  <span>{bookingTabs.find((tab) => tab.key === activeTab)?.label || "Bookings"}</span>
                  <Tag>{bookingRows.length} record(s)</Tag>
                </Space>
              }
            >
              <ResponsiveAntTable
                columns={bookingColumns}
                dataSource={bookingRows}
                loading={tableLoading}
                rowKey="_id"
                pagination={{ pageSize: 10 }}
                mobileTitle={(record) => record.ticketNumber || record.customer?.name || "Booking"}
              />
            </Card>
          )}

          {!selectedBooking && activeTab === "SEARCH" ? (
            <Card className="bm-card bm-empty">
              <Empty description="Search by ticket number to view booking details" />
            </Card>
          ) : selectedBooking ? (
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
                      <p>Nationality</p>
                      <strong>{selectedBooking.customer.nationality || "-"}</strong>
                      <p>Gender</p>
                      <strong>{selectedBooking.customer.gender || "-"}</strong>
                      <p>Date of Birth</p>
                      <strong>{selectedBooking.customer.dateOfBirth || "-"}</strong>
                      <p>Phone</p>
                      <strong>{selectedBooking.customer.phone}</strong>
                      <p>Email</p>
                      <strong>{selectedBooking.customer.email || "-"}</strong>
                      <p>Emergency Contact</p>
                      <strong>
                        {selectedBooking.emergencyContact?.name || "-"}
                        {selectedBooking.emergencyContact?.phone && selectedBooking.emergencyContact.phone !== "-"
                          ? ` (${selectedBooking.emergencyContact.phone})`
                          : ""}
                      </strong>
                      <p>Source</p>
                      <strong>{sourceLabel}</strong>
                      <p>Bookings Count</p>
                      <strong>{selectedBooking.customer.bookingCount}</strong>
                      {selectedBooking.additionalPassengers?.length > 0 && (
                        <>
                          <p>Other Passengers</p>
                          <strong>
                            {selectedBooking.additionalPassengers
                              .map((passenger) => `${passenger.passengerNumber}. ${passenger.fullName} (${passenger.passengerType})`)
                              .join(", ")}
                          </strong>
                        </>
                      )}
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
                      <p>Pesepay Ref</p>
                      <strong>{selectedBooking.payment.paymentReference}</strong>
                      <p>Merchant Ref</p>
                      <strong>{selectedBooking.payment.paymentMerchantReference}</strong>
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
          ) : null}
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
            <p>Nationality: {selectedBooking.customer.nationality || "-"}</p>
            <p>Gender: {selectedBooking.customer.gender || "-"}</p>
            <p>Date of Birth: {selectedBooking.customer.dateOfBirth || "-"}</p>
            <p>Phone: {selectedBooking.customer.phone || "-"}</p>
            <p>Email: {selectedBooking.customer.email || "-"}</p>
            {selectedBooking.additionalPassengers?.length > 0 && (
              <p>
                Other Passengers:{" "}
                {selectedBooking.additionalPassengers
                  .map((passenger) => `${passenger.passengerNumber}. ${passenger.fullName} (${passenger.passengerType})`)
                  .join(", ")}
              </p>
            )}
            <p>
              Emergency Contact: {selectedBooking.emergencyContact?.name || "-"}
              {selectedBooking.emergencyContact?.phone && selectedBooking.emergencyContact.phone !== "-"
                ? ` (${selectedBooking.emergencyContact.phone})`
                : ""}
            </p>
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
