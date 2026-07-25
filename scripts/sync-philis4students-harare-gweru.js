require("dotenv").config();
const mongoose = require("mongoose");

const Company = require("../models/companyModel");
const Route = require("../models/routeModel");
const Bus = require("../models/busModel");
const Trip = require("../models/tripModel");
const Booking = require("../models/bookingsModel");
const RouteStop = require("../models/routeStopModel");
const RouteFare = require("../models/routeFareModel");

const normalize = (value) => String(value || "").trim();
const getArgValue = (name) => {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const isApply = process.argv.includes("--apply");
const syncAllRoutes = process.argv.includes("--all-routes");
const companyIdArgRaw = getArgValue("--companyId");
const companyIdArg =
  companyIdArgRaw && companyIdArgRaw !== "PASTE_COMPANY_ID_HERE" ? companyIdArgRaw : "";
const fromCity = normalize(getArgValue("--from")) || "Harare";
const toPattern = normalize(getArgValue("--to")) || "gweru|gweu|msu";

const companyNameQuery = {
  companyName: {
    $regex: "phili?s|philips|phils",
    $options: "i",
  },
};
const preferredCompanyNameQuery = {
  companyName: {
    $regex: "^\\s*(phils|philis|philips)\\s*(4|for)?\\s*students\\s*$",
    $options: "i",
  },
};

const exactCityRegex = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const philisBusNameRegex = /phils|philis|philips/i;

const uniqueObjectIds = (values) => {
  const byId = new Map();
  values.filter(Boolean).forEach((value) => {
    byId.set(String(value), value);
  });
  return [...byId.values()];
};

const getFirstSchedule = (trip) =>
  [...(trip?.stopSchedule || [])]
    .filter((stop) => stop?.isActive !== false)
    .sort((first, second) => Number(first.stopOrder || 0) - Number(second.stopOrder || 0))[0] || {};

const getLastSchedule = (trip) =>
  [...(trip?.stopSchedule || [])]
    .filter((stop) => stop?.isActive !== false)
    .sort((first, second) => Number(first.stopOrder || 0) - Number(second.stopOrder || 0))
    .pop() || {};

const resolveRouteFare = async (routeId, fromStop, toStop) => {
  if (!fromStop || !toStop) return 0;
  const exactFare = await RouteFare.findOne({
    route: routeId,
    fromStop: fromStop._id,
    toStop: toStop._id,
  });
  if (Number(exactFare?.fare || 0) > 0) return Number(exactFare.fare);

  const stops = await RouteStop.find({
    route: routeId,
    isActive: { $ne: false },
    stopOrder: { $gte: Number(fromStop.stopOrder || 0), $lte: Number(toStop.stopOrder || 0) },
  }).sort({ stopOrder: 1 });
  let totalFare = 0;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const legFare = await RouteFare.findOne({
      route: routeId,
      fromStop: stops[index]._id,
      toStop: stops[index + 1]._id,
    });
    const fareValue = Number(legFare?.fare || 0);
    if (fareValue <= 0) return 0;
    totalFare += fareValue;
  }
  return totalFare;
};

const getRouteRepairData = async (route) => {
  const stops = await RouteStop.find({ route: route._id, isActive: { $ne: false } }).sort({ stopOrder: 1 });
  const firstStop = stops[0] || null;
  const lastStop = stops[stops.length - 1] || null;
  const fullRouteFare = await resolveRouteFare(route._id, firstStop, lastStop);
  return { stops, firstStop, lastStop, fullRouteFare };
};

const main = async () => {
  const mongoUrl = normalize(process.env.mongo_url).replace(/^"|"$/g, "");
  if (!mongoUrl) throw new Error("mongo_url is missing in .env");

  await mongoose.connect(mongoUrl);

  const targetCompany = companyIdArg
    ? await Company.findById(companyIdArg)
    : await Company.findOne(preferredCompanyNameQuery) || await Company.findOne(companyNameQuery);
  const matchingCompanies = await Company.find(companyIdArg ? { _id: companyIdArg } : companyNameQuery)
    .select("companyName")
    .sort({ companyName: 1 });

  if (!targetCompany) {
    throw new Error("Target Philips/Philis/Phils company not found.");
  }
  if (!companyIdArg && matchingCompanies.length > 1) {
    const preferredMatches = matchingCompanies.filter((company) =>
      preferredCompanyNameQuery.companyName.$regex &&
      new RegExp(preferredCompanyNameQuery.companyName.$regex, "i").test(company.companyName)
    );
    if (preferredMatches.length !== 1 || String(preferredMatches[0]._id) !== String(targetCompany._id)) {
      console.log("More than one possible company matched. Re-run with --companyId=<id>.");
      matchingCompanies.forEach((company) => console.log(`${company._id} ${company.companyName}`));
      process.exitCode = 1;
      return;
    }
    console.log(`Multiple Philips-style companies found; using exact student company: ${targetCompany.companyName}.`);
  }

  if (companyIdArgRaw === "PASTE_COMPANY_ID_HERE") {
    console.log("Ignoring placeholder companyId and using automatic company detection.");
    matchingCompanies.forEach((company) => console.log(`${company._id} ${company.companyName}`));
  }

  const routeQuery = syncAllRoutes
    ? { companyId: targetCompany._id }
    : {
        fromCity: exactCityRegex(fromCity),
        $or: [
          { toCity: { $regex: toPattern, $options: "i" } },
          { routeName: { $regex: toPattern, $options: "i" } },
        ],
      };
  const seedRoutes = await Route.find(routeQuery).select("routeName routeCode fromCity toCity companyId");
  const seedRouteIds = seedRoutes.map((route) => route._id);
  const philisBuses = syncAllRoutes
    ? await Bus.find({
        $or: [
          { companyId: targetCompany._id },
          { name: philisBusNameRegex },
          { number: philisBusNameRegex },
        ],
      }).select("name number route companyId from to fare departure arrival journeyDate")
    : [];
  const philisBusIds = philisBuses.map((bus) => bus._id);
  const seedTripClauses = [
    ...(seedRouteIds.length ? [{ route: { $in: seedRouteIds } }] : []),
    ...(philisBusIds.length ? [{ bus: { $in: philisBusIds } }] : []),
    ...(syncAllRoutes ? [{ companyId: targetCompany._id }] : []),
  ];
  const seedTrips = seedTripClauses.length
    ? await Trip.find({ $or: seedTripClauses })
        .select("tripCode route bus companyId stopSchedule departureTime arrivalTime scheduleStartDate journeyDate")
    : [];
  const routeIds = uniqueObjectIds([
    ...seedRouteIds,
    ...philisBuses.map((bus) => bus.route),
    ...seedTrips.map((trip) => trip.route),
  ]);
  const routes = routeIds.length
    ? await Route.find({ _id: { $in: routeIds } }).select("routeName routeCode fromCity toCity companyId")
    : [];
  const trips = routeIds.length || philisBusIds.length
    ? await Trip.find({
        $or: [
          ...(routeIds.length ? [{ route: { $in: routeIds } }] : []),
          ...(philisBusIds.length ? [{ bus: { $in: philisBusIds } }] : []),
        ],
      }).select("tripCode route bus companyId stopSchedule departureTime arrivalTime scheduleStartDate journeyDate")
    : [];
  const busIdsFromTrips = trips.map((trip) => trip.bus).filter(Boolean);
  const buses = routeIds.length || busIdsFromTrips.length || philisBuses.length
    ? await Bus.find({
        $or: [
          ...(routeIds.length ? [{ route: { $in: routeIds } }] : []),
          ...(busIdsFromTrips.length ? [{ _id: { $in: busIdsFromTrips } }] : []),
          ...(!syncAllRoutes ? [{ from: exactCityRegex(fromCity), to: { $regex: toPattern, $options: "i" } }] : []),
          ...(philisBusIds.length ? [{ _id: { $in: philisBusIds } }] : []),
        ],
      }).select("name number route companyId from to fare departure arrival journeyDate")
    : [];
  const busIds = buses.map((bus) => bus._id);
  const routeRepairEntries = await Promise.all(routes.map(async (route) => [String(route._id), await getRouteRepairData(route)]));
  const routeRepairById = Object.fromEntries(routeRepairEntries);

  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);
  console.log(`Scope: ${syncAllRoutes ? "all discovered Philips/Philis4Students routes" : `${fromCity} to ${toPattern}`}`);
  console.log(`Target company: ${targetCompany.companyName} (${targetCompany._id})`);
  console.log(`Routes matched: ${routes.length}`);
  routes.forEach((route) => {
    const repair = routeRepairById[String(route._id)] || {};
    console.log(`- route ${route._id} ${route.routeName} ${route.fromCity} -> ${route.toCity} | full fare: ${repair.fullRouteFare || 0}`);
    if (!repair.fullRouteFare) {
      console.log(`  WARNING: no positive full-route fare found in route_fares for ${route.routeName}`);
    }
  });
  console.log(`Trips matched: ${trips.length}`);
  trips.forEach((trip) => console.log(`- trip ${trip._id} ${trip.tripCode || ""}`));
  console.log(`Buses matched: ${buses.length}`);
  buses.forEach((bus) => console.log(`- bus ${bus._id} ${bus.name} ${bus.number || ""}`));

  if (!routes.length && !trips.length && !buses.length) {
    console.log("No matching records found. Nothing to update.");
    return;
  }

  if (!isApply) {
    console.log("Dry run only. Re-run with --apply to update companyId, fare and time fields.");
    return;
  }

  const companyId = targetCompany._id;
  const busBulkUpdates = buses
    .map((bus) => {
      const relatedTrip =
        trips.find((trip) => String(trip.bus || "") === String(bus._id)) ||
        trips.find((trip) => String(trip.route || "") === String(bus.route || ""));
      const routeId = String(bus.route || relatedTrip?.route || routeIds[0] || "");
      const route = routes.find((item) => String(item._id) === routeId) || routes[0];
      const repair = routeRepairById[String(route?._id || "")] || {};
      const firstSchedule = getFirstSchedule(relatedTrip);
      const lastSchedule = getLastSchedule(relatedTrip);
      const fare = Number(repair.fullRouteFare || bus.fare || 0);
      const set = {
        companyId,
        route: route?._id || bus.route,
        from: repair.firstStop?.cityName || route?.fromCity || bus.from,
        to: repair.lastStop?.cityName || route?.toCity || bus.to,
        departure: normalize(firstSchedule.departureTime || relatedTrip?.departureTime || repair.firstStop?.departureTime || bus.departure),
        arrival: normalize(lastSchedule.arrivalTime || relatedTrip?.arrivalTime || repair.lastStop?.arrivalTime || bus.arrival),
        journeyDate: normalize(relatedTrip?.scheduleStartDate || relatedTrip?.journeyDate || bus.journeyDate),
      };
      if (fare > 0) set.fare = fare;
      return {
        updateOne: {
          filter: { _id: bus._id },
          update: { $set: set },
        },
      };
    });

  const [routeResult, tripResult, busResult, bookingResult] = await Promise.all([
    routeIds.length ? Route.updateMany({ _id: { $in: routeIds } }, { $set: { companyId } }) : { modifiedCount: 0 },
    routeIds.length ? Trip.updateMany({ route: { $in: routeIds } }, { $set: { companyId } }) : { modifiedCount: 0 },
    busBulkUpdates.length ? Bus.bulkWrite(busBulkUpdates) : { modifiedCount: 0 },
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
