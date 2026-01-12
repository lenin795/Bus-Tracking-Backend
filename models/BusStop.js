const mongoose = require('mongoose');

const busStopSchema = new mongoose.Schema({
  stopName: {
    type: String,
    required: true,
    trim: true
  },
  stopCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    }
  },
  qrCode: {
    type: String,
    comment: 'Base64 encoded QR code'
  },
  address: {
    type: String,
    trim: true
  },
  landmarks: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create geospatial index for location-based queries
busStopSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('BusStop', busStopSchema);