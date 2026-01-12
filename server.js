const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// ===== CORS SETTINGS =====
app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== SOCKET.IO =====
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

// ===== MONGODB =====
console.log("DEBUG MONGO:", process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.send("🚍 Bus Tracking Backend Running");
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/buses", require("./routes/bus"));
app.use("/api/routes", require("./routes/route"));
app.use("/api/bus-stops", require("./routes/busStop"));
app.use("/api/driver", require("./routes/driver"));
app.use("/api/passenger", require("./routes/passenger"));
app.use("/api/users", require("./routes/users"));

// ===== SOCKET LOGIC =====
const activeBuses = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("driver:start-sharing", ({ busId, driverId }) => {
    activeBuses.set(busId, { socketId: socket.id, driverId });
    socket.join(`bus-${busId}`);
    console.log(`📍 Driver ${driverId} started bus ${busId}`);
  });

  socket.on("driver:location-update", (data) => {
    const { busId, latitude, longitude, speed, heading } = data;

    io.to(`bus-${busId}`).emit("bus:location-update", {
      busId,
      location: { latitude, longitude },
      speed,
      heading,
      timestamp: new Date()
    });
  });

  socket.on("passenger:track-bus", ({ busId }) => {
    socket.join(`bus-${busId}`);
    console.log(`👤 Passenger tracking ${busId}`);
  });

  socket.on("driver:stop-sharing", ({ busId }) => {
    activeBuses.delete(busId);
    socket.leave(`bus-${busId}`);
    io.to(`bus-${busId}`).emit("bus:offline", { busId });
  });

  socket.on("disconnect", () => {
    for (const [busId, data] of activeBuses.entries()) {
      if (data.socketId === socket.id) {
        activeBuses.delete(busId);
        io.to(`bus-${busId}`).emit("bus:offline", { busId });
      }
    }
    console.log("❌ Disconnected:", socket.id);
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

module.exports = { app, io };
