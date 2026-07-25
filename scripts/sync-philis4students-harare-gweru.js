require("dotenv").config();
const mongoose = require("mongoose");

const Company = require("../models/companyModel");
const Route = require("../models/routeModel");
const Bus = require("../models/busModel");
const Trip = require("../models/tripModel");
const Booking = require("../models/bookingsModel");

const normalize = (value) => String(value || "").trim();
const getArgValue = (name) => {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const isApply = process.argv.includes("--apply");
const companyIdArg = getArgValue("--companyId");
const fromCity = normalize(getArgValue("--from")) || "Harare";
const toPattern = normalize(getArgValue("--to")) || "gweru|gweu|msu";

const companyNameQuery = {
  companyName: {
    $regex: "phili?s|philips|phils",
    $options: "i",
  },
};

const exactCityRegex = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

const main = async () => {
  const mongoUrl = normalize(process.env.mongo_url).replace(/^"|"$/g, "");
  if (!mongoUrl) throw new Error("mongo_url is missing in .env");

  await mongoose.connect(mongoUrl);

  const targetCompany = companyIdArg
    ? await Company.findById(companyIdArg)
    : await Company.findOne(companyNameQuery);
  const matchingCompanies = await Company.find(companyIdArg ? { _id: companyIdArg } : companyNameQuery)
    .select("companyName")
    .sort({ companyName: 1 });

  if (!targetCompany) {
    throw new Error("Target Philips/Philis/Phils company not found.");
  }
  if (!companyIdArg && matchingCompanies.length > 1) {
    console.log("More than one possible company matched. Re-run with --companyId=<id>.");
    matchingCompanies.forEach((company) => console.log(`${company._id} ${company.companyName}`));
    process.exitCode = 1;
    return;
  }

  const routeQuery = {
    fromCity: exactCityRegex(fromCity),
    $or: [
      { toCity: { $regex: toPattern, $options: "i" } },
      { routeName: { $regex: toPattern, $options: "i" } },
    ],
  };
  const routes = await Route.find(routeQuery).select("routeName routeCode fromCity toCity companyId");
  const routeIds = routes.map((route) => route._id);
  const trips = routeIds.length
    ? await Trip.find({ route: { $in: routeIds } }).select("tripCode route bus companyId")
    : [];
  const busIdsFromTrips = trips.map((trip) => trip.bus).filter(Boolean);
  const buses = routeIds.length || busIdsFromTrips.length
    ? await Bus.find({
        $or: [
          { route: { $in: routeIds } },
          { _id: { $in: busIdsFromTrips } },
          { from: exactCityRegex(fromCity), to: { $regex: toPattern, $options: "i" } },
        ],
      }).select("name number route companyId from to")
    : [];
  const busIds = buses.map((bus) => bus._id);

  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);
  console.log(`Target company: ${targetCompany.companyName} (${targetCompany._id})`);
  console.log(`Routes matched: ${routes.length}`);
  routes.forEach((route) => {
    console.log(`- route ${route._id} ${route.routeName} ${route.fromCity} -> ${route.toCity}`);
  });
  console.log(`Trips matched: ${trips.length}`);
  trips.forEach((trip) => console.log(`- trip ${trip._id} ${trip.tripCode || ""}`));
  console.log(`Buses matched: ${buses.length}`);
  buses.forEach((bus) => console.log(`- bus ${bus._id} ${bus.name} ${bus.number || ""}`));

  if (!routes.length && !trips.length && !buses.length) {
    console.log("No matching Harare to Gweru/MSU records found. Nothing to update.");
    return;
  }

  if (!isApply) {
    console.log("Dry run only. Re-run with --apply to update companyId fields.");
    return;
  }

  const companyId = targetCompany._id;
  const [routeResult, tripResult, busResult, bookingResult] = await Promise.all([
    routeIds.length ? Route.updateMany({ _id: { $in: routeIds } }, { $set: { companyId } }) : { modifiedCount: 0 },
    routeIds.length ? Trip.updateMany({ route: { $in: routeIds } }, { $set: { companyId } }) : { modifiedCount: 0 },
    busIds.length ? Bus.updateMany({ _id: { $in: busIds } }, { $set: { companyId } }) : { modifiedCount: 0 },
    routeIds.length || busIds.length
      ? Booking.updateMany(
          {
            $or: [
              { route: { $in: routeIds } },
              { trip: { $in: trips.map((trip) => trip._id) } },
              { bus: { $in: busIds } },
            ],
          },
          { $set: { companyId } }
        )
      : { modifiedCount: 0 },
  ]);

  console.log(`Updated routes: ${routeResult.modifiedCount || 0}`);
  console.log(`Updated trips: ${tripResult.modifiedCount || 0}`);
  console.log(`Updated buses: ${busResult.modifiedCount || 0}`);
  console.log(`Updated bookings: ${bookingResult.modifiedCount || 0}`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
