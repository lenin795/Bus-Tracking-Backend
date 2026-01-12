const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});
console.log("DEBUG MONGO URI:", process.env.MONGO_URI);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Connection Error:", err));


// Import Routes
const authRoutes = require('./routes/auth');
const busRoutes = require('./routes/bus');
const routeRoutes = require('./routes/route');
const busStopRoutes = require('./routes/busStop');
const driverRoutes = require('./routes/driver');
const passengerRoutes = require('./routes/passenger');
const userRoutes = require('./routes/users'); 

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/bus-stops', busStopRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/passenger', passengerRoutes);
app.use('/api/users',userRoutes);

// Socket.IO - Real-time Location Tracking
const activeBuses = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Driver starts location sharing
  socket.on('driver:start-sharing', (data) => {
    const { busId, driverId } = data;
    activeBuses.set(busId, { socketId: socket.id, driverId });
    socket.join(`bus-${busId}`);
    console.log(`📍 Driver ${driverId} sharing location for bus ${busId}`);
  });

  // Driver sends location update
  socket.on('driver:location-update', (data) => {
    const { busId, latitude, longitude, speed, heading } = data;
    
    // Broadcast to all tracking this bus
    io.to(`bus-${busId}`).emit('bus:location-update', {
      busId,
      location: { latitude, longitude },
      speed,
      heading,
      timestamp: new Date()
    });
  });

  // Passenger subscribes to bus tracking
  socket.on('passenger:track-bus', (data) => {
    const { busId } = data;
    socket.join(`bus-${busId}`);
    console.log(`👤 Passenger tracking bus ${busId}`);
  });

  // Passenger unsubscribes
  socket.on('passenger:untrack-bus', (data) => {
    const { busId } = data;
    socket.leave(`bus-${busId}`);
  });

  // Driver stops sharing
  socket.on('driver:stop-sharing', (data) => {
    const { busId } = data;
    activeBuses.delete(busId);
    socket.leave(`bus-${busId}`);
    io.to(`bus-${busId}`).emit('bus:offline', { busId });
  });

  socket.on('disconnect', () => {
    // Clean up disconnected drivers
    for (const [busId, data] of activeBuses.entries()) {
      if (data.socketId === socket.id) {
        activeBuses.delete(busId);
        io.to(`bus-${busId}`).emit('bus:offline', { busId });
      }
    }
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { app, io };