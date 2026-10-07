/**
 * Seed the Young Generation "Cape Town -> Harare" route, its 22 stops and the
 * full forward fare matrix - instead of typing it all into the AdminRoutes UI.
 *
 * This script is additive: it does NOT change any existing app code. It writes
 * the same `routes`, `route_stops` and `route_fares` documents the existing
 * POST /api/routes/save-route endpoint would create, so the data behaves
 * identically in search, booking and admin screens.
 *
 * The company "Young Generation" must already exist (it does). We only look it
 * up by name; we never create or modify the company.
 *
 * Fares: the table lists one USD value per stop, meaning "fare from this stop
 * onward to Harare". We treat each value as fare-to-destination and derive each
 * forward segment fare as (fareToHarare[from] - fareToHarare[to]). That both
 * reproduces every "-> Harare" price and guarantees the non-increasing fare
 * matrix the save-route validator enforces.
 *
 * Times (arrival/departure) are intentionally NOT stored on route_stops - the
 * save-route endpoint forces those blank there; clock times live on a Trip.
 * We only use the table's times to derive travel minutes between stops.
 *
 * Usage (run from the onhighweb folder, where .env with mongo_url lives):
 *   node scripts/seed-young-generation-cape-town-harare.js            # dry run
 *   node scripts/seed-young-generation-cape-town-harare.js --apply    # write
 *   node scripts/seed-young-generation-cape-town-harare.js --apply --companyId=<id>
 *
 * Re-running is idempotent: the route is matched by routeCode and its stops and
 * fares are replaced (deleteMany + insertMany), exactly like save-route does.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Company = require("../models/companyModel");
const Route = require("../models/routeModel");
const RouteStop = require("../models/routeStopModel");
const RouteFare = require("../models/routeFareModel");

const normalize = (value) => String(value || "").trim();
const getArgValue = (name) => {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const isApply = process.argv.includes("--apply");
const companyIdArgRaw = getArgValue("--companyId");
const companyIdArg =
  companyIdArgRaw && companyIdArgRaw !== "PASTE_COMPANY_ID_HERE" ? companyIdArgRaw : "";

const ROUTE_CODE = "YG-CPT-HRE";
const ROUTE_NAME = "Cape Town - Harare (Young Generation)";
const FARE_CURRENCY = "USD";

const companyNameQuery = {
  companyName: { $regex: "young\\s*generation", $options: "i" },
};

// "HH:MM" -> minutes since midnight.
const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalize(value));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

// Travel minutes between the previous stop's departure and this stop's arrival,
// wrapping across midnight and across multi-day legs. The border crossing (long
// wait) is modelled as stopMinutes, not as travel time.
const travelMinutesBetween = (prevDeparture, arrival) => {
  const start = toMinutes(prevDeparture);
  const end = toMinutes(arrival);
  if (start === null || end === null) return 60; // safe placeholder (>0) to satisfy validation
  let diff = end - start;
  while (diff <= 0) diff += 1440; // next day
  return diff;
};

/**
 * The real-world table. `fareToHarare` is the USD column (fare from this stop
 * through to Harare). The border row carries no fare. Harare is drop-off only.
 * `travelScope` flips to International once we cross into Zimbabwe.
 */
const TABLE = [
  { city: "Cape Town", boarding: "Main departure point", arrival: "", departure: "10:00", waitMin: 15, fareToHarare: 140, scope: "International" },
  { city: "Bellville", boarding: "Opposite Melomed Hospital", arrival: "10:30", departure: "10:40", waitMin: 10, fareToHarare: 135, scope: "International" },
  { city: "Worcester", boarding: "Engine Garage", arrival: "12:15", departure: "12:25", waitMin: 10, fareToHarare: 125, scope: "International" },
  { city: "De Doorns", boarding: "Engine Garage", arrival: "13:05", departure: "13:15", waitMin: 10, fareToHarare: 120, scope: "International" },
  { city: "Bloemfontein", boarding: "Engine Garage", arrival: "18:45", departure: "19:00", waitMin: 15, fareToHarare: 105, scope: "International" },
  { city: "Three Sisters", boarding: "Shell Garage", arrival: "21:15", departure: "21:25", waitMin: 10, fareToHarare: 95, scope: "International" },
  { city: "Midrand", boarding: "Big Bird / Engine Garage", arrival: "01:30", departure: "01:45", waitMin: 15, fareToHarare: 80, scope: "International" },
  { city: "Polokwane", boarding: "Toll Gate", arrival: "04:30", departure: "04:40", waitMin: 10, fareToHarare: 65, scope: "International" },
  { city: "Mokopane", boarding: "Toll Gate", arrival: "05:35", departure: "05:45", waitMin: 10, fareToHarare: 55, scope: "International" },
  { city: "Louis Trichardt", boarding: "Shell Garage", arrival: "07:15", departure: "07:25", waitMin: 10, fareToHarare: 45, scope: "International" },
  { city: "Musina", boarding: "Designated pickup point", arrival: "08:20", departure: "08:30", waitMin: 10, fareToHarare: 35, scope: "International" },
  { city: "Beitbridge Border (South Africa)", boarding: "Border processing", arrival: "09:30", departure: "12:00", waitMin: 150, fareToHarare: null, scope: "International" },
  { city: "Beitbridge", boarding: "Bus pickup point", arrival: "12:00", departure: "12:10", waitMin: 10, fareToHarare: 30, scope: "International" },
  { city: "Rutenga", boarding: "Designated bus stop", arrival: "13:45", departure: "13:55", waitMin: 10, fareToHarare: 25, scope: "Local" },
  { city: "Lundi", boarding: "Designated bus stop", arrival: "14:20", departure: "14:30", waitMin: 10, fareToHarare: 23, scope: "Local" },
  { city: "Ngundu", boarding: "Designated bus stop", arrival: "14:55", departure: "15:05", waitMin: 10, fareToHarare: 20, scope: "Local" },
  { city: "Masvingo", boarding: "Main bus pickup/drop-off", arrival: "16:05", departure: "16:20", waitMin: 15, fareToHarare: 18, scope: "Local" },
  { city: "Chaka", boarding: "Designated bus stop", arrival: "17:15", departure: "17:25", waitMin: 10, fareToHarare: 15, scope: "Local" },
  { city: "Mvuma", boarding: "Designated bus stop", arrival: "18:25", departure: "18:35", waitMin: 10, fareToHarare: 12, scope: "Local" },
  { city: "Chivhu", boarding: "Designated bus stop", arrival: "19:20", departure: "19:30", waitMin: 10, fareToHarare: 10, scope: "Local" },
  { city: "Boka", boarding: "Designated bus stop", arrival: "20:25", departure: "20:35", waitMin: 10, fareToHarare: 8, scope: "Local" },
  { city: "Harare", boarding: "Final drop-off", arrival: "21:45", departure: "", waitMin: 0, fareToHarare: 0, scope: "Local" },
];

// A fare anchor per stop so we can derive any forward segment by subtraction.
// The border row (null) inherits the next Zimbabwe-side value so the matrix
// stays monotonic; Harare anchors at 0 (drop-off only).
const buildFareAnchors = () => {
  const anchors = TABLE.map((row) => row.fareToHarare);
  for (let i = anchors.length - 1; i >= 0; i -= 1) {
    if (anchors[i] === null || anchors[i] === undefined) {
      anchors[i] = i + 1 < anchors.length ? anchors[i + 1] : 0;
    }
  }
  return anchors;
};

// Country per stop: everything up to and including the South African border
// post is "ZA"; Beitbridge (Zimbabwe side) onwards is "ZW".
const BORDER_INDEX = TABLE.findIndex((row) => /border/i.test(row.city));
const countryForIndex = (index) => (BORDER_INDEX >= 0 && index <= BORDER_INDEX ? "ZA" : "ZW");

const buildStops = () =>
  TABLE.map((row, index) => {
    const isFirst = index === 0;
    const isLast = index === TABLE.length - 1;
    const durationFromPrevious = isFirst
      ? ""
      : `${travelMinutesBetween(TABLE[index - 1].departure, row.arrival)} min`;
    return {
      cityName: row.city,
      stopOrder: index + 1,
      boardingPoint: row.boarding,
      boardingPoints: [row.boarding],
      travelScope: row.scope === "International" ? "International" : "Local",
      country: countryForIndex(index),
      distanceFromPrevious: isFirst ? "" : "0 km", // placeholder, edit in web
      durationFromPrevious,
      stopMinutes: isFirst || isLast ? "0" : String(row.waitMin),
      isActive: true,
    };
  });

// Full forward fare matrix: fare(from -> to) = anchor[from] - anchor[to],
// clamped to a $1 minimum so every pair is a positive fare the validator keeps.
const buildFareDocs = (anchors) => {
  const fares = [];
  for (let from = 0; from < TABLE.length; from += 1) {
    for (let to = from + 1; to < TABLE.length; to += 1) {
      const raw = Number(anchors[from]) - Number(anchors[to]);
      const fare = raw > 0 ? raw : 1;
      fares.push({ fromStopOrder: from + 1, toStopOrder: to + 1, fare });
    }
  }
  return fares;
};

const main = async () => {
  const mongoUrl = normalize(process.env.mongo_url).replace(/^"|"$/g, "");
  if (!mongoUrl) throw new Error("mongo_url is missing in .env");

  await mongoose.connect(mongoUrl);

  const company = companyIdArg
    ? await Company.findById(companyIdArg)
    : await Company.findOne(companyNameQuery);

  if (!company) {
    throw new Error(
      companyIdArg
        ? `No company found with _id ${companyIdArg}.`
        : "Young Generation company not found. Pass --companyId=<id> to be explicit."
    );
  }

  const stops = buildStops();
  const anchors = buildFareAnchors();
  const fares = buildFareDocs(anchors);
  const requiredFareCount = (stops.length * (stops.length - 1)) / 2;

  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);
  console.log(`Company: ${company.companyName} (${company._id})`);
  console.log(`Route: ${ROUTE_NAME} [${ROUTE_CODE}]`);
  console.log(`From: ${stops[0].cityName}  To: ${stops[stops.length - 1].cityName}`);
  console.log(`Stops: ${stops.length}`);
  console.log(`Fare pairs: ${fares.length} (required ${requiredFareCount})`);
  console.log("Sample '-> Harare' fares (should match the table):");
  const harareOrder = stops.length;
  [1, 5, 13, 17].forEach((order) => {
    const pair = fares.find((f) => f.fromStopOrder === order && f.toStopOrder === harareOrder);
    console.log(`  ${stops[order - 1].cityName} -> Harare = $${pair ? pair.fare : "?"}`);
  });

  if (fares.length !== requiredFareCount) {
    throw new Error(`Fare pair count ${fares.length} != required ${requiredFareCount}.`);
  }

  if (!isApply) {
    console.log("\nDry run only. Re-run with --apply to write the route, stops and fares.");
    return;
  }

  // Upsert the route by routeCode within this company (idempotent re-runs).
  let route = await Route.findOne({
    routeCode: new RegExp(`^${ROUTE_CODE}$`, "i"),
    companyId: company._id,
  });

  const routeData = {
    routeName: ROUTE_NAME,
    routeCode: ROUTE_CODE,
    companyId: company._id,
    fromCity: stops[0].cityName,
    toCity: stops[stops.length - 1].cityName,
    totalDistance: "0 km", // placeholder, edit in web
    estimatedDuration: "0 min", // placeholder, edit in web
    fareCurrency: FARE_CURRENCY,
    fareExchangeRate: "", // placeholder, edit in web
    status: "Active",
  };

  if (route) {
    route = await Route.findByIdAndUpdate(route._id, routeData, { new: true });
    console.log(`\nUpdated existing route ${route._id}`);
  } else {
    route = await new Route(routeData).save();
    console.log(`\nCreated route ${route._id}`);
  }

  // Replace stops and fares, exactly like POST /api/routes/save-route.
  await RouteStop.deleteMany({ route: route._id });
  await RouteFare.deleteMany({ route: route._id });

  const createdStops = await RouteStop.insertMany(
    stops.map((stop) => ({
      route: route._id,
      cityName: stop.cityName,
      stopOrder: stop.stopOrder,
      arrivalTime: "",
      departureTime: "",
      boardingPoint: stop.boardingPoints[0] || stop.boardingPoint,
      boardingPoints: stop.boardingPoints,
      travelScope: stop.travelScope,
      country: stop.country,
      distanceFromPrevious: stop.distanceFromPrevious,
      durationFromPrevious: stop.durationFromPrevious,
      stopMinutes: stop.stopMinutes,
      isActive: stop.isActive,
    }))
  );

  const stopByOrder = {};
  createdStops.forEach((stop) => {
    stopByOrder[stop.stopOrder] = stop;
  });

  const fareDocs = fares
    .map((fareItem) => {
      const fromStop = stopByOrder[fareItem.fromStopOrder];
      const toStop = stopByOrder[fareItem.toStopOrder];
      if (!fromStop || !toStop || !(fareItem.fare > 0)) return null;
      return {
        route: route._id,
        fromStop: fromStop._id,
        toStop: toStop._id,
        fare: fareItem.fare,
      };
    })
    .filter(Boolean);

  if (fareDocs.length) {
    await RouteFare.insertMany(fareDocs);
  }

  console.log(`Inserted stops: ${createdStops.length}`);
  console.log(`Inserted fares: ${fareDocs.length}`);
  console.log("\nDone. Open AdminRoutes to review and edit placeholder values (distances, duration, exchange rate).");
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
