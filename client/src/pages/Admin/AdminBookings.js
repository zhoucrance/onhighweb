import { message, Modal } from "antd";
import moment from "moment";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { formatSeatNumbers } from "../../helpers/seatDisplay";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";
import { useReactToPrint } from "react-to-print";

function Bookings() {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookings, setBookings] = useState([]);
  const dispatch = useDispatch();
  const getBookings = useCallback(async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post(
        "/api/bookings/get-all-bookings",
        {}
      );
      dispatch(HideLoading());
      if (response.data.success) {
        const mappedData = response.data.data.map((booking) => {
          const bus = booking.bus || {};
          return {
            ...booking,
            ...bus,
            bookingId: booking._id,
            name: bus.name,
            number: bus.number,
            from: booking.fromCity || bus.from,
            to: booking.toCity || bus.to,
            journeyDate: booking.trip?.journeyDate || bus.journeyDate,
            departure: booking.departureTime || bus.departure,
            arrival: booking.arrivalTime || bus.arrival,
            boardingPoint: booking.boardingPoint || bus.boardingPoint,
            dropOffPoint: booking.dropOffPoint || bus.dropOffPoint,
            fare: booking.fare || bus.fare,
            key: booking._id,
          };
        });
        setBookings(mappedData);
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  }, [dispatch]);

  const columns = [
    {
      title: "Ticket No",
      dataIndex: "ticketNumber",
      render: (ticketNumber, record) => ticketNumber || record.transactionId || "-",
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
      title: "Action",
      dataIndex: "action",
      render: (text, record) => (
        <div>
          <p
            className="text-md underline"
            onClick={() => {
              setSelectedBooking(record);
              setShowPrintModal(true);
            }}
          >
            Print Ticekt
          </p>
        </div>
      ),
    },
  ];

  useEffect(() => {
    getBookings();
  }, [getBookings]);

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
        ticketNumber: selectedBooking.ticketNumber || selectedBooking.transactionId,
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

  return (
    <div>
      <PageTitle title="Bookings" />
      <div className="mt-2">
        <ResponsiveAntTable dataSource={bookings} columns={columns} rowKey="_id" cardsAlways />
      </div>

      {showPrintModal && (
        <Modal
          title="Print Ticket"
          onCancel={() => {
            setShowPrintModal(false);
            setSelectedBooking(null);
          }}
          visible={showPrintModal}
          okText="Print"
          onOk={handlePrintTicket}
        >
          <div className="d-flex flex-column p-5" ref={componentRef}>
            <p>Ticket No : {selectedBooking.ticketNumber || selectedBooking.transactionId}</p>
            <p>Bus : {selectedBooking.name}</p>
            <p>
              {selectedBooking.from} - {selectedBooking.to}
            </p>
            <hr />
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
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Bookings;
