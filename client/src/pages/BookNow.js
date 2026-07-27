import { Col, message, Radio, Row } from "antd";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import SeatSelection from "../components/SeatSelection";
import { axiosInstance } from "../helpers/axiosInstance";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";

const getTodayDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const currencyLabel = (currency) => (String(currency || "").toUpperCase() === "ZAR" ? "R" : "US$");

function BookNow() {
  const [selectedSeats, setSelectedSeats] = useState([]);
  const params = useParams();
  const [searchParams] = useSearchParams();
  const isTripBooking = searchParams.get("type") === "trip";
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [bus, setBus] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState(["EcoCash", "Card Payment"]);
  const [paymentMethod, setPaymentMethod] = useState("Card Payment");
  const todayDate = getTodayDate();
  const isPastJourneyDate = bus?.journeyDate && bus.journeyDate.slice(0, 10) < todayDate;
  const getBus = async () => {
    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post(
        isTripBooking ? "/api/routes/get-trip-by-id" : "/api/buses/get-bus-by-id",
        isTripBooking
          ? {
              _id: params.id,
              fromStopId: searchParams.get("fromStopId"),
              toStopId: searchParams.get("toStopId"),
              journeyDate: searchParams.get("journeyDate"),
            }
          : {
              _id: params.id,
            }
      );
      dispatch(HideLoading());
      if (response.data.success) {
        const nextBus = response.data.data;
        setBus(nextBus);
        const tripMethods = nextBus?.acceptedPaymentMethods?.length ? nextBus.acceptedPaymentMethods : null;
        if (tripMethods) {
          setPaymentMethods(tripMethods);
          setPaymentMethod((current) => (tripMethods.includes(current) ? current : tripMethods[0]));
        }
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  const getPaymentMethods = async () => {
    try {
      const response = await axiosInstance.get("/api/companies");
      if (response.data.success) {
        const company = (response.data.data || [])[0];
        const enabled = company?.enabledPaymentMethods?.length
          ? company.enabledPaymentMethods
          : ["EcoCash", "Card Payment"];
        setPaymentMethods(enabled);
        setPaymentMethod((current) => (enabled.includes(current) ? current : enabled[0]));
      }
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  };

  const bookNow = async () => {
    if (isPastJourneyDate) {
      message.error("Past dates are not allowed for booking.");
      return;
    }

    try {
      dispatch(ShowLoading());
      const response = await axiosInstance.post("/api/bookings/book-seat", {
        bus: bus.busId || bus._id,
        trip: bus.tripId,
        route: bus.routeId,
        fromStop: bus.fromStopId,
        toStop: bus.toStopId,
        fromStopOrder: bus.fromStopOrder,
        toStopOrder: bus.toStopOrder,
        fromCity: bus.from,
        toCity: bus.to,
        departureTime: bus.departure,
        arrivalTime: bus.arrival,
        journeyDate: bus.journeyDate || bus.date,
        travelDate: bus.journeyDate || bus.date,
        boardingPoint: bus.boardingPoint,
        dropOffPoint: bus.dropOffPoint,
        fare: bus.fare,
        amountPaid: Number(bus.fare || 0) * selectedSeats.length,
        currency: bus.currency || bus.fareCurrency || "USD",
        seats: selectedSeats,
        paymentMethod,
        paymentStatus: paymentMethod === "Pay on Boarding" ? "PENDING_PAY_ON_BOARDING" : "Paid",
        bookingStatus: paymentMethod === "Pay on Boarding" ? "RESERVED_AWAITING_PAYMENT" : "CONFIRMED",
        transactionId: "DIRECT-" + Date.now(),
      });
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        navigate("/bookings");
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  useEffect(() => {
    getBus();
    if (!isTripBooking) {
      getPaymentMethods();
    }
  }, []);
  return (
    <div>
      {bus && (
        <Row className="mt-3" gutter={[30, 30]}>
          <Col lg={12} xs={24} sm={24}>
            <h1 className="text-2xl primary-text">{bus.name}</h1>
            <h1 className="text-md">
              {bus.from} - {bus.to}
            </h1>
            <hr />

            <div className="flex flex-col gap-2">
              <p className="text-md">
                Journey Date : {bus.journeyDate}
              </p>
              <p className="text-md">
                Fare : {currencyLabel(bus.currency || bus.fareCurrency)} {bus.fare} /-
              </p>
              <p className="text-md">
                Departure Time : {bus.departure}
              </p>
              <p className="text-md">
                Arrival Time : {bus.arrival}
              </p>
              {bus.boardingPoint && (
                <p className="text-md">Boarding Point : {bus.boardingPoint}</p>
              )}
              {bus.dropOffPoint && (
                <p className="text-md">Drop-off Point : {bus.dropOffPoint}</p>
              )}
              <p className="text-md">
                Capacity : {bus.capacity}
              </p>
              <p className="text-md">
                Seats Left : {bus.seatsLeft ?? bus.capacity - bus.seatsBooked.length}
              </p>
            </div>
            <hr />

            <div className="flex flex-col gap-2">
              <h1 className="text-2xl">
                Selected Seats : {selectedSeats.join(", ")}
              </h1>
              <h1 className="text-2xl mt-2">
                Fare : {currencyLabel(bus.currency || bus.fareCurrency)} {bus.fare * selectedSeats.length} /-
              </h1>
              <div className="mt-2">
                <p className="text-md">Payment Method</p>
                <Radio.Group value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  {paymentMethods.map((method) => (
                    <Radio key={method} value={method}>{method}</Radio>
                  ))}
                </Radio.Group>
              </div>
              <hr />

              <button
                className={`primary-btn ${
                  (selectedSeats.length === 0 || isPastJourneyDate) && "disabled-btn"
                }`}
                disabled={selectedSeats.length === 0 || isPastJourneyDate}
                onClick={bookNow}
              >
                Book Now
              </button>
            </div>
          </Col>
          <Col lg={12} xs={24} sm={24}>
            <SeatSelection
              selectedSeats={selectedSeats}
              setSelectedSeats={setSelectedSeats}
              bus={bus}
            />
          </Col>
        </Row>
      )}
    </div>
  );
}

export default BookNow;
