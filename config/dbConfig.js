const mongoose = require("mongoose");

const mongoUri = process.env.mongo_url || process.env.MONGO_URI;

if (mongoUri) {
  mongoose.connect(mongoUri);
} else {
  console.log("Mongo Db Connection Skipped: missing mongo_url or MONGO_URI environment variable");
}

const db = mongoose.connection;

db.on("connected", () => {
  console.log("Mongo Db Connection Successfull");
});

db.on("error", () => {
  console.log("Mongo Db Connection Failed");
});
