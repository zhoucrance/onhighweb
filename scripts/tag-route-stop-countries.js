/**
 * Tag the `country` field on an EXISTING route's stops, in place.
 *
 * Unlike the seed script this never deletes or recreates stops, so stop IDs
 * (which trips reference) stay exactly the same. It only sets `country`.
 *
 * Stops up to and including the border stop get --before (default ZA);
 * stops after it get --after (default ZW). If the route has no stop whose name
 * contains "border", every stop gets --before.
 *
 * Usage (from the onhighweb folder, where .env with mongo_url lives):
 *   node scripts/tag-route-stop-countries.js                       # dry run, YG-CPT-HRE
 *   node scripts/tag-route-stop-countries.js --apply
 *   node scripts/tag-route-stop-countries.js --routeCode=XYZ --before=ZW --after=BW --apply
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Route = require("../models/routeModel");
const RouteStop = require("../models/routeStopModel");

const normalize = (value) => String(value || "").trim();
const getArgValue = (name) => {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const isApply = process.argv.includes("--apply");
const routeCode = normalize(getArgValue("--routeCode")) || "YG-CPT-HRE";
const beforeCountry = (normalize(getArgValue("--before")) || "ZA").toUpperCase().slice(0, 2);
const afterCountry = (normalize(getArgValue("--after")) || "ZW").toUpperCase().slice(0, 2);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const main = async () => {
  const mongoUrl = normalize(process.env.mongo_url).replace(/^"|"$/g, "");
  if (!mongoUrl) throw new Error("mongo_url is missing in .env");
  await mongoose.connect(mongoUrl);

  const route = await Route.findOne({ routeCode: new RegExp(`^${escapeRegex(routeCode)}$`, "i") });
  if (!route) throw new Error(`Route with code ${routeCode} not found.`);

  const stops = await RouteStop.find({ route: route._id }).sort({ stopOrder: 1 });
  const borderIndex = stops.findIndex((stop) => /border/i.test(stop.cityName || ""));

  const plan = stops.map((stop, index) => ({
    _id: stop._id,
    cityName: stop.cityName,
    current: stop.country || "",
    next: borderIndex < 0 || index <= borderIndex ? beforeCountry : afterCountry,
  }));

  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);
  console.log(`Route: ${route.routeName} [${route.routeCode}] (${route._id})`);
  console.log(`Border stop: ${borderIndex >= 0 ? stops[borderIndex].cityName : "none found"}`);
  plan.forEach((item) => console.log(`  ${item.cityName}: '${item.current}' -> '${item.next}'`));

  if (!isApply) {
    console.log("\nDry run only. Re-run with --apply to set the country on these stops.");
    return;
  }

  const result = await RouteStop.bulkWrite(
    plan.map((item) => ({
      updateOne: { filter: { _id: item._id }, update: { $set: { country: item.next } } },
    }))
  );
  console.log(`\nUpdated stops: ${result.modifiedCount || 0}`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
