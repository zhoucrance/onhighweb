import React from "react";
import { useNavigate } from "react-router-dom";

function Bus({ bus }) {
  const navigate = useNavigate();
  const isTrip = bus.searchResultType === "trip";
  const bookingPath = isTrip
    ? `/book-now/${bus.tripId}?type=trip&fromStopId=${bus.fromStopId}&toStopId=${bus.toStopId}&journeyDate=${bus.journeyDate || bus.date || ""}`
    : `/book-now/${bus._id}`;
  return (
    <div className="card p-2">
      <h1 className="text-lg primary-text">{bus.name}</h1>
      {!isTrip && bus.routeName && <p className="text-sm">{bus.routeName}</p>}
      <hr />
      <div className="d-flex justify-content-between">
        <div>
          <p className="text-sm">From</p>
          <p className="text-sm">{bus.from}</p>
        </div>

        <div>
          <p className="text-sm">To</p>
          <p className="text-sm">{bus.to}</p>
        </div>

        <div>
          <p className="text-sm">Fare</p>
          <p className="text-sm">$ {bus.fare} /-</p>
        </div>
      </div>
      {isTrip && (
        <>
          <hr />
          <div className="d-flex justify-content-between">
            <div>
              <p className="text-sm">Boarding</p>
              <p className="text-sm">{bus.boardingPoint}</p>
            </div>
            <div>
              <p className="text-sm">Drop-off</p>
              <p className="text-sm">{bus.dropOffPoint}</p>
            </div>
          </div>
        </>
      )}
      <hr />
      <div className="d-flex justify-content-between align-items-end">
        <div>
          <p className="text-sm">Joureny Date</p>
          <p className="text-sm">{bus.journeyDate}</p>
          {isTrip && (
            <p className="text-sm">
              {bus.departure} - {bus.arrival}
            </p>
          )}
        </div>

        <h1 className="text-lg underline secondary-text" onClick={()=>{
            navigate(bookingPath)
        }}>Book Now</h1>
      </div>
    </div>
  );
}

export default Bus;
