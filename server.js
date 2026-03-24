const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

/* =========================
   CORS CONFIGURATION
========================= */

const allowedOrigins = [
  "http://localhost:3000",
  "https://bus-trackingapp.netlify.app"
];

console.log("🔧 Allowed CORS Origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, curl, mobile apps)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.error("❌ Blocked by CORS:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ IMPORTANT: Node 22 compatible preflight handling
app.options(/.*/, cors());

/* =========================
   BODY PARSERS
========================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================
   SOCKET.IO SETUP
========================= */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/* =========================
   MONGODB CONNECTION
========================= */
console.log(
  "DEBUG MONGO URI:",
  process.env.MONGO_URI ? "✅ Set" : "❌ Missing"
);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

/* =========================
   BASIC ROUTES
========================= */
app.get("/", (req, res) => {
  res.send("🚍 Bus Tracking Backend Running");
});

// Health check (CORS + server test)
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    time: new Date(),
  });
});

/* =========================
   API ROUTES
========================= */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/buses", require("./routes/bus"));
app.use("/api/routes", require("./routes/route"));
app.use("/api/bus-stops", require("./routes/busStop"));
app.use("/api/driver", require("./routes/driver"));
app.use("/api/passenger", require("./routes/passenger"));
app.use("/api/users", require("./routes/users"));

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : undefined,
  });
});

/* =========================
   SOCKET.IO LOGIC
========================= */
const activeBuses = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Socket Connected:", socket.id);

  // Driver starts sharing location
  socket.on("driver:start-sharing", ({ busId, driverId }) => {
    activeBuses.set(busId, { socketId: socket.id, driverId });
    socket.join(`bus-${busId}`);
    console.log(`📍 Driver ${driverId} started sharing bus ${busId}`);
    socket.emit("driver:sharing-started", { busId });
  });

  // Driver sends location updates
  socket.on(
    "driver:location-update",
    ({ busId, latitude, longitude, speed, heading }) => {
      io.to(`bus-${busId}`).emit("bus:location-update", {
        busId,
        location: { latitude, longitude },
        speed,
        heading,
        timestamp: new Date(),
      });
    }
  );

  // Passenger starts tracking
  socket.on("passenger:track-bus", ({ busId }) => {
    socket.join(`bus-${busId}`);
    console.log(`👤 Passenger ${socket.id} tracking bus ${busId}`);
  });

  // Passenger stops tracking
  socket.on("passenger:untrack-bus", ({ busId }) => {
    socket.leave(`bus-${busId}`);
  });

  // Driver stops sharing
  socket.on("driver:stop-sharing", ({ busId }) => {
    activeBuses.delete(busId);
    io.to(`bus-${busId}`).emit("bus:offline", { busId });
    socket.leave(`bus-${busId}`);
    console.log(`🛑 Bus ${busId} offline`);
  });

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    for (const [busId, data] of activeBuses.entries()) {
      if (data.socketId === socket.id) {
        activeBuses.delete(busId);
        io.to(`bus-${busId}`).emit("bus:offline", { busId });
        console.log(`📴 Bus ${busId} offline (driver disconnected)`);
      }
    }
    console.log("❌ Socket Disconnected:", socket.id);
  });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for trusted origins`);
  console.log(`📡 Socket.IO ready`);
});

module.exports = { app, io };
