const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  routeName: {
    type: String,
    required: true,
    trim: true
  },
  routeNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  stops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusStop'
  }],
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  frequency: {
    type: Number,
    default: 30,
    comment: 'Frequency in minutes'
  },
  distance: {
    type: Number,
    comment: 'Total distance in kilometers'
  },
  estimatedDuration: {
    type: Number,
    comment: 'Estimated duration in minutes'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Route', routeSchema);