const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// ===== CORS SETTINGS =====
// Remove trailing slash from CLIENT_URL if present
const clientUrl = process.env.CLIENT_URL?.replace(/\/$/, '') || 'http://localhost:3000';

console.log("🔧 CORS Origin:", clientUrl);

app.use(cors({
  origin: clientUrl,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Handle preflight requests explicitly

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== SOCKET.IO =====
const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ===== MONGODB =====
console.log("DEBUG MONGO:", process.env.MONGO_URI ? "✅ Set" : "❌ Missing");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.send("🚍 Bus Tracking Backend Running");
});

// Test endpoint to verify CORS
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    cors: clientUrl,
    timestamp: new Date()
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/buses", require("./routes/bus"));
app.use("/api/routes", require("./routes/route"));
app.use("/api/bus-stops", require("./routes/busStop"));
app.use("/api/driver", require("./routes/driver"));
app.use("/api/passenger", require("./routes/passenger"));
app.use("/api/users", require("./routes/users"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).json({ 
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== SOCKET LOGIC =====
const activeBuses = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // Driver starts sharing location
  socket.on("driver:start-sharing", ({ busId, driverId }) => {
    activeBuses.set(busId, { socketId: socket.id, driverId });
    socket.join(`bus-${busId}`);
    console.log(`📍 Driver ${driverId} started sharing bus ${busId}`);
    
    // Emit confirmation back to driver
    socket.emit("driver:sharing-started", { busId, driverId });
  });

  // Driver sends location update
  socket.on("driver:location-update", (data) => {
    const { busId, latitude, longitude, speed, heading } = data;

    console.log(`📍 Broadcasting location for bus ${busId} to room bus-${busId}`);
    console.log(`   Location: ${latitude}, ${longitude}, Speed: ${speed}`);
    
    // Emit to the specific bus room (all passengers tracking this bus)
    io.to(`bus-${busId}`).emit("bus:location-update", {
      busId,
      location: { latitude, longitude },
      speed,
      heading,
      timestamp: new Date()
    });

    // Log number of passengers watching this bus
    const roomSize = io.sockets.adapter.rooms.get(`bus-${busId}`)?.size || 0;
    console.log(`📡 ${roomSize - 1} passengers tracking bus ${busId}`); // -1 to exclude driver
  });

  // Passenger starts tracking a bus
  socket.on("passenger:track-bus", ({ busId }) => {
    socket.join(`bus-${busId}`);
    console.log(`👤 Passenger ${socket.id} started tracking bus ${busId}`);
    
    // Send current bus status if available
    const busData = activeBuses.get(busId);
    if (busData) {
      socket.emit("bus:status", { busId, online: true });
    } else {
      socket.emit("bus:status", { busId, online: false });
    }
  });

  // Passenger stops tracking a bus
  socket.on("passenger:untrack-bus", ({ busId }) => {
    socket.leave(`bus-${busId}`);
    console.log(`👤 Passenger ${socket.id} stopped tracking bus ${busId}`);
  });

  // Driver stops sharing location
  socket.on("driver:stop-sharing", ({ busId }) => {
    activeBuses.delete(busId);
    socket.leave(`bus-${busId}`);
    io.to(`bus-${busId}`).emit("bus:offline", { busId });
    console.log(`🛑 Driver stopped sharing bus ${busId}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // Check if this was a driver and clean up
    for (const [busId, data] of activeBuses.entries()) {
      if (data.socketId === socket.id) {
        activeBuses.delete(busId);
        io.to(`bus-${busId}`).emit("bus:offline", { busId });
        console.log(`📴 Bus ${busId} went offline (driver disconnected)`);
      }
    }
    console.log("❌ Disconnected:", socket.id);
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${clientUrl}`);
  console.log(`📡 Socket.IO ready`);
});

module.exports = { app, io };