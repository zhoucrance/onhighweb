/**
 * Seed (or update) the "Tenda Executive" demo company used by the public
 * booking Pesepay flow (routes/tendaDemoRoute.js).
 *
 * When the server is connected to Mongo, tendaDemoRoute looks up a company that
 * has Pesepay keys instead of reading them from .env. On a fresh local database
 * there is no such company, so payment initiation fails with
 * "No PesePay keys found". This script creates that company from the Pesepay
 * keys already in your .env, so local behaves like production.
 *
 * It is additive and idempotent: it upserts by company name and never deletes
 * anything. Safe to re-run.
 *
 * Usage (from the onhighweb folder, where .env lives):
 *   node scripts/seed-tenda-demo-company.js            # dry run
 *   node scripts/seed-tenda-demo-company.js --apply    # write
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Company = require("../models/companyModel");

const normalize = (value) => String(value || "").trim();
const isApply = process.argv.includes("--apply");

const COMPANY_NAME =
  normalize(process.env.TENDA_PESEPAY_COMPANY_NAME) ||
  normalize(process.env.TENDA_DEMO_PESEPAY_COMPANY_NAME) ||
  "Tenda Executive";

const PAYMENT_METHODS = ["EcoCash", "Card Payment"];

const getKeys = () => {
  const mode = normalize(process.env.PESEPAY_MODE || "sandbox").toUpperCase();
  const prefix = mode === "LIVE" ? "LIVE" : "SANDBOX";
  const integrationKey = normalize(
    process.env[`PESEPAY_${prefix}_INTEGRATION_KEY`] || process.env.PESEPAY_INTEGRATION_KEY
  );
  const encryptionKey = normalize(
    process.env[`PESEPAY_${prefix}_ENCRYPTION_KEY`] || process.env.PESEPAY_ENCRYPTION_KEY
  );
  return { mode, prefix, integrationKey, encryptionKey };
};

const main = async () => {
  const mongoUrl = normalize(process.env.mongo_url || process.env.MONGO_URI).replace(/^"|"$/g, "");
  if (!mongoUrl) throw new Error("mongo_url (or MONGO_URI) is missing in .env");

  const { mode, prefix, integrationKey, encryptionKey } = getKeys();
  if (!integrationKey || !encryptionKey) {
    throw new Error(
      `No Pesepay keys in .env for mode ${mode}. Set PESEPAY_${prefix}_INTEGRATION_KEY and PESEPAY_${prefix}_ENCRYPTION_KEY.`
    );
  }

  await mongoose.connect(mongoUrl);

  const existing = await Company.findOne({ companyName: new RegExp(`^${COMPANY_NAME}$`, "i") });

  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}`);
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`Company: ${COMPANY_NAME} (${existing ? "update existing " + existing._id : "create new"})`);
  console.log(`Pesepay mode: ${mode}`);
  console.log(`  integrationKey set: ${Boolean(integrationKey)}`);
  console.log(`  encryptionKey  set: ${Boolean(encryptionKey)}`);
  console.log(`  paymentMethods : ${PAYMENT_METHODS.join(", ")}`);

  if (!isApply) {
    console.log("\nDry run only. Re-run with --apply to write the company.");
    return;
  }

  const update = {
    companyName: COMPANY_NAME,
    companyStatus: "Active",
    pesepayIntegrationKey: integrationKey,
    pesepayEncryptionKey: encryptionKey,
    pesepayKeysUpdatedAt: new Date(),
    enabledPaymentMethods: PAYMENT_METHODS,
    paymentMethodsUpdatedAt: new Date(),
  };

  if (existing) {
    await Company.updateOne({ _id: existing._id }, { $set: update });
    console.log(`\nUpdated company ${existing._id}`);
  } else {
    const created = await new Company(update).save();
    console.log(`\nCreated company ${created._id}`);
  }
  console.log("Done. Restart the onhighweb server so it picks up the company.");
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
