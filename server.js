const express = require("express");
const app = express();
require("dotenv").config();
const dbConfig = require("./config/dbConfig");
const port = process.env.PORT || 5000;
app.use(express.json());

const usersRoute = require("./routes/usersRoute");
const authRoute = require("./routes/authRoute");
const busesRoute = require("./routes/busesRoute");
const bookingsRoute = require("./routes/bookingsRoute");
const routesRoute = require("./routes/routesRoute");
const companiesRoute = require("./routes/companiesRoute");
const notificationsRoute = require("./routes/notificationsRoute");
const tripsRoute = require("./routes/tripsRoute");
const helpDeskRoute = require("./routes/helpDeskRoute");

app.use("/api/auth", authRoute);
app.use("/api/users", usersRoute);
app.use("/api/buses", busesRoute);
app.use("/api/bookings", bookingsRoute);
app.use("/api/routes", routesRoute);
app.use("/api/trips", tripsRoute);
app.use("/api/companies", companiesRoute);
app.use("/api/notifications", notificationsRoute);
app.use("/api/help-desk", helpDeskRoute);
app.use("/api/helpdesk", helpDeskRoute);
const path = require("path");
if(process.env.NODE_ENV === "production")
{
    const clientDistPath = path.resolve(__dirname, "client", "dist");
    const clientBuildPath = path.resolve(__dirname, "client", "build");
    const clientStaticPath = require("fs").existsSync(clientDistPath) ? clientDistPath : clientBuildPath;

    app.use(express.static(clientStaticPath));
  
    app.get("*", (req, res) => {
        res.sendFile(path.resolve(clientStaticPath, "index.html"));
    });
}

app.listen(port, () => console.log(`Node server listening on port ${port}!`));
