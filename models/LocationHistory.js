const mongoose = require('mongoose');

const locationHistorySchema = new mongoose.Schema({
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
  speed: {
    type: Number,
    default: 0,
    comment: 'Speed in km/h'
  },
  heading: {
    type: Number,
    comment: 'Direction in degrees'
  },
  accuracy: {
    type: Number,
    comment: 'GPS accuracy in meters'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index for efficient querying
locationHistorySchema.index({ bus: 1, timestamp: -1 });
locationHistorySchema.index({ driver: 1, timestamp: -1 });

// TTL index to auto-delete old records after 30 days
locationHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('LocationHistory', locationHistorySchema);