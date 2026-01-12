const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  currentStopIndex: {
    type: Number,
    default: 0
  },
  completedStops: [{
    stopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusStop'
    },
    arrivalTime: Date,
    departureTime: Date
  }],
  totalDistance: {
    type: Number,
    default: 0,
    comment: 'Total distance traveled in km'
  },
  averageSpeed: {
    type: Number,
    comment: 'Average speed in km/h'
  },
  passengers: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

tripSchema.index({ bus: 1, status: 1 });
tripSchema.index({ driver: 1, startTime: -1 });

module.exports = mongoose.model('Trip', tripSchema);