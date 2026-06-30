export const formatSeatNumbers = (seats) => {
  const seatList = Array.isArray(seats) ? seats : [seats].filter(Boolean);
  return seatList
    .map((seat) => Number(seat))
    .filter((seat) => Number.isFinite(seat))
    .sort((firstSeat, secondSeat) => firstSeat - secondSeat)
    .join(", ");
};
