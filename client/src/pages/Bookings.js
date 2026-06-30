import { message, Modal, Select } from "antd";
import axios from "axios";
import moment from "moment";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import PageTitle from "../components/PageTitle";
import ResponsiveAntTable from "../components/ResponsiveAntTable";
import { axiosInstance } from "../helpers/axiosInstance";
import { formatSeatNumbers } from "../helpers/seatDisplay";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";
import { useReactToPrint } from "react-to-print";

function Bookings() {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [ticketFilter, setTicketFilter] = useState("");
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);

  const getDisplayTicketNumber = (booking) =>
    booking?.ticketNumber || booking?.ticket_number || booking?.booking_reference || booking?.transactionId || booking?._id || "-";

  const getTicketFileName = (booking) => {
    const bookingRef = getDisplayTicketNumber(booking);
    return `ticket-${bookingRef}.pdf`;
  };

  const getBookingStatus = (booking) =>
    String(booking?.bookingStatus || booking?.status || "").toUpperCase();

  const getBoardedStatus = (booking) =>
    String(booking?.boardedStatus || "").toUpperCase();

  const isCancelledCredited = (booking) =>
    getBookingStatus(booking).includes("CREDIT");

  const isBoarded = (booking) =>
    getBookingStatus(booking) === "BOARDED" || getBoardedStatus(booking) === "BOARDED";

  const formatMoney = (value) => Number(value || 0).toFixed(2);

  const getTicketModeTitle = (booking) =>
    isBoarded(booking) ? "Boarding Ticket" : "Office Booking Ticket";

  const getTicketBoardingLabel = (booking) =>
    isBoarded(booking) ? "BOARDED - Ready to travel" : "NOT BOARDED - Boarding required";

  const hasCreditInfo = (booking) =>
    Number(booking?.creditAppliedAmount || 0) > 0 || String(booking?.paymentMethod || "").toLowerCase() === "credits";

  const canBoardAndPrint = (booking) =>
    !isCancelledCredited(booking) && !getBookingStatus(booking).includes("CANCEL") && !isBoarded(booking);

  const escapePdfText = (value) =>
    String(value ?? "-")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .trim();

  const getTicketPdf = (booking) => {
    const journeyDate = booking?.journeyDate ? moment(booking.journeyDate).format("DD-MM-YYYY") : "-";
    const seats = formatSeatNumbers(booking?.seats || []);
    const totalAmount = Number(booking?.fare || 0) * (booking?.seats?.length || 0);
    const creditAppliedAmount = Number(booking?.creditAppliedAmount || 0);
    const creditRemainingBalance = Number(booking?.creditRemainingBalance || 0);
    const lines = [
      { text: getTicketModeTitle(booking), size: 18 },
      { text: `Ticket No: ${getDisplayTicketNumber(booking)}`, size: 11 },
      { text: `Boarding Status: ${getTicketBoardingLabel(booking)}`, size: 11 },
      { text: `Bus: ${booking?.name || "-"}`, size: 11 },
      { text: `Route: ${booking?.from || "-"} - ${booking?.to || "-"}`, size: 11 },
      { text: "----------------------------------------", size: 11 },
      { text: `Journey Date: ${journeyDate}`, size: 11 },
      { text: `Journey Time: ${booking?.departure || "-"}`, size: 11 },
      ...(booking?.boardingPoint ? [{ text: `Boarding Point: ${booking.boardingPoint}`, size: 11 }] : []),
      ...(booking?.dropOffPoint ? [{ text: `Drop-off Point: ${booking.dropOffPoint}`, size: 11 }] : []),
      { text: "----------------------------------------", size: 11 },
      { text: `Seat Numbers: ${seats}`, size: 11 },
      { text: "----------------------------------------", size: 11 },
      { text: `Total Amount: ${totalAmount} /-`, size: 11 },
      ...(hasCreditInfo(booking)
        ? [
            { text: `Credits Used: USD ${formatMoney(creditAppliedAmount)}`, size: 11 },
            { text: `Credit Balance Left: USD ${formatMoney(creditRemainingBalance)}`, size: 11 },
          ]
        : []),
    ];

    const streamLines = ["BT", "50 790 Td", "16 TL"];
    lines.forEach((line, index) => {
      streamLines.push(`/F1 ${line.size} Tf`);
      if (index > 0) streamLines.push("T*");
      streamLines.push(`(${escapePdfText(line.text)}) Tj`);
    });
    streamLines.push("ET");
    const contentStream = streamLines.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

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

  const downloadTicket = (booking = selectedBooking) => {
    if (!booking) return;
    const blob = new Blob([getTicketPdf(booking)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getTicketFileName(booking);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const mapBooking = (booking) => {
    const bus = booking.bus || {};
    return {
      ...booking,
      ...bus,
      bookingId: booking._id,
      name: bus.name,
      number: bus.number,
      from: booking.fromCity || bus.from,
      to: booking.toCity || bus.to,
      journeyDate: booking.trip?.journeyDate || booking.journeyDate || bus.journeyDate,
      departure: booking.departureTime || bus.departure,
      arrival: booking.arrivalTime || bus.arrival,
      boardingPoint: booking.boardingPoint || bus.boardingPoint,
      dropOffPoint: booking.dropOffPoint || bus.dropOffPoint,
      fare: booking.fare || bus.fare,
      ticketNumber: getDisplayTicketNumber(booking),
      key: booking._id,
    };
  };

  const updateBookingInList = (booking) => {
    const mappedBooking = mapBooking(booking);
    setBookings((currentBookings) =>
      currentBookings.map((item) =>
        item.bookingId === mappedBooking.bookingId ? mappedBooking : item
      )
    );
    return mappedBooking;
  };

  const getBookings = async () => {
    try {
      dispatch(ShowLoading());
      const storedRole = String(user?.role || "").trim();
      const hasScopedBookingAccess = user?.isAdmin || Boolean(storedRole);
      const endpoint = hasScopedBookingAccess ? "/api/bookings/get-all-bookings" : "/api/bookings/get-bookings-by-user-id";
      const response = await axiosInstance.post(endpoint, hasScopedBookingAccess ? {} : { userId: user?._id });
      dispatch(HideLoading());
      if (response.data.success) {
        const mappedData = response.data.data
          .map(mapBooking)
          .sort((firstBooking, secondBooking) => {
            const firstDate = new Date(firstBooking.createdAt || firstBooking._id || 0).getTime();
            const secondDate = new Date(secondBooking.createdAt || secondBooking._id || 0).getTime();
            return secondDate - firstDate;
          });
        setBookings(mappedData);
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
      title: "Ticket Number",
      dataIndex: "ticketNumber",
      key: "ticketNumber",
    },
    {
      title: "Bus Name",
      dataIndex: "name",
      key: "bus",
    },
    {
      title: "Bus Number",
      dataIndex: "number",
      key: "bus",
    },
    {
      title: "Journey Date",
      dataIndex: "journeyDate",
    },
    {
      title: "Journey Time",
      dataIndex: "departure",
    },
    {
      title: "Seats",
      dataIndex: "seats",
      render: (seats) => {
        return formatSeatNumbers(seats);
      },
    },
    {
      title: "Status",
      render: (text, record) => {
        if (isCancelledCredited(record)) return "Cancelled & Credited";
        if (getBookingStatus(record).includes("CANCEL")) return "Cancelled";
        return isBoarded(record) ? "Boarded" : "Not Boarded";
      },
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 150,
      render: (text, record) => (
        <div className="booking-ticket-actions">
          {isCancelledCredited(record) ? (
            <p className="booking-ticket-action" onClick={() => handleApplyCredits(record)}>
              Apply Credits
            </p>
          ) : canBoardAndPrint(record) ? (
            <p className="booking-ticket-action" onClick={() => handleBoardAndPrint(record)}>
              Board & Print Ticket
            </p>
          ) : (
            <p
              className="booking-ticket-action"
              onClick={() => {
                setSelectedBooking(record);
                setShowPrintModal(true);
              }}
            >
              Print Ticket
            </p>
          )}
          <p className="booking-ticket-action" onClick={() => downloadTicket(record)}>
            Download Ticket
          </p>
        </div>
      ),
    },
  ];

  const filteredBookings = useMemo(() => {
    if (!ticketFilter) return bookings;
    return bookings.filter((booking) => booking.bookingId === ticketFilter || booking._id === ticketFilter);
  }, [bookings, ticketFilter]);

  useEffect(() => {
    getBookings();
  }, []);

  const componentRef = useRef();
  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
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
        bookingId: selectedBooking.bookingId || selectedBooking._id,
        ticketNumber: getDisplayTicketNumber(selectedBooking),
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

  const handleBoardAndPrint = async (booking) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/board-ticket", {
        bookingId: booking.bookingId || booking._id,
        ticketNumber: getDisplayTicketNumber(booking),
      });
      dispatch(HideLoading());
      if (response.data.success) {
        const updatedBooking = updateBookingInList(response.data.data);
        setSelectedBooking(updatedBooking);
        setShowPrintModal(true);
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  const handleApplyCredits = async (booking) => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/apply-ticket-credits", {
        bookingId: booking.bookingId || booking._id,
        ticketNumber: getDisplayTicketNumber(booking),
      });
      dispatch(HideLoading());
      if (response.data.success) {
        updateBookingInList(response.data.data);
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.response?.data?.message || error.message);
    }
  };

  return (
    <div className="bookings-page">
      <PageTitle title="Bookings" />
      <div className="admin-filter-bar">
        <Select
          allowClear
          showSearch
          placeholder="Filter by ticket number"
          value={ticketFilter || undefined}
          optionFilterProp="label"
          onChange={(value) => setTicketFilter(value || "")}
        >
          {bookings.map((booking) => (
            <Select.Option
              key={booking.bookingId || booking._id}
              value={booking.bookingId || booking._id}
              label={booking.ticketNumber}
            >
              {booking.ticketNumber}
            </Select.Option>
          ))}
        </Select>
      </div>
      <div className="mt-2">
        <ResponsiveAntTable dataSource={filteredBookings} columns={columns} rowKey="_id" />
      </div>

      {showPrintModal && (
        <Modal
          title="Print Ticket"
          onCancel={() => {
            setShowPrintModal(false);
            setSelectedBooking(null);
          }}
          visible={showPrintModal}
          footer={[
            <button type="button" className="primary-btn" key="print" onClick={handlePrintTicket}>
              Print
            </button>,
          ]}
        >
          <div className="ticket-print-card" ref={componentRef}>
            <div className="ticket-print-header">
              <div>
                <p className="ticket-print-title">{getTicketModeTitle(selectedBooking)}</p>
                <p className="ticket-print-number">Ticket No: {getDisplayTicketNumber(selectedBooking)}</p>
              </div>
              <span className={`ticket-print-status ${isBoarded(selectedBooking) ? "boarded" : "not-boarded"}`}>
                {getTicketBoardingLabel(selectedBooking)}
              </span>
            </div>
            <hr />
            <div className="ticket-print-grid">
              <p><span>Bus:</span> {selectedBooking.name}</p>
              <p><span>Route:</span> {selectedBooking.from} - {selectedBooking.to}</p>
            </div>
            <hr />
            <div className="ticket-print-grid">
              <p>
                <span>Journey Date:</span>{" "}
                {moment(selectedBooking.journeyDate).format("DD-MM-YYYY")}
              </p>
              <p>
                <span>Journey Time:</span> {selectedBooking.departure}
              </p>
              {selectedBooking.boardingPoint && (
                <p>
                  <span>Boarding Point:</span> {selectedBooking.boardingPoint}
                </p>
              )}
              {selectedBooking.dropOffPoint && (
                <p>
                  <span>Drop-off Point:</span> {selectedBooking.dropOffPoint}
                </p>
              )}
            </div>
            <hr />
            <p>
              <span>Seat Numbers:</span> <br />
              {formatSeatNumbers(selectedBooking.seats)}
            </p>
            <hr />
            <p>
              <span>Total Amount:</span>{" "}
              {selectedBooking.fare * selectedBooking.seats.length} /-
            </p>
            {hasCreditInfo(selectedBooking) && (
              <div className="ticket-print-credit">
                <p><span>Credits Used:</span> USD {formatMoney(selectedBooking.creditAppliedAmount)}</p>
                <p><span>Credit Balance Left:</span> USD {formatMoney(selectedBooking.creditRemainingBalance)}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Bookings;
