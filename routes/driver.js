const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Bus = require('../models/Bus');
const Trip = require('../models/Trip');
const LocationHistory = require('../models/LocationHistory');

// Get driver's assigned bus
router.get('/my-bus', auth(['driver']), async (req, res) => {
  try {
    const bus = await Bus.findOne({ driver: req.userId })
      .populate('route')
      .populate({
        path: 'route',
        populate: { path: 'stops' }
      });

    if (!bus) {
      return res.status(404).json({ 
        success: false,
        message: 'No bus assigned to you' 
      });
    }

    res.json({
      success: true,
      bus
    });
  } catch (error) {
    console.error('Get driver bus error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Start trip
router.post('/start-trip', auth(['driver']), async (req, res) => {
  try {
    const { busId } = req.body;

    // Verify bus belongs to driver
    const bus = await Bus.findOne({ _id: busId, driver: req.userId });
    if (!bus) {
      return res.status(403).json({ 
        success: false,
        message: 'This bus is not assigned to you' 
      });
    }

    // Check for existing active trip
    const activeTrip = await Trip.findOne({ 
      bus: busId, 
      status: 'in-progress' 
    });

    if (activeTrip) {
      return res.status(400).json({ 
        success: false,
        message: 'There is already an active trip for this bus',
        trip: activeTrip
      });
    }

    // Create new trip
    const trip = new Trip({
      bus: busId,
      driver: req.userId,
      route: bus.route,
      startTime: new Date(),
      status: 'in-progress'
    });

    await trip.save();

    // Update bus status
    await Bus.findByIdAndUpdate(busId, { 
      isActive: true,
      status: 'in-service'
    });

    res.status(201).json({
      success: true,
      message: 'Trip started successfully',
      trip
    });
  } catch (error) {
    console.error('Start trip error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get current trip
router.get('/current-trip', auth(['driver']), async (req, res) => {
  try {
    const bus = await Bus.findOne({ driver: req.userId });
    
    if (!bus) {
      return res.status(404).json({ 
        success: false,
        message: 'No bus assigned' 
      });
    }

    const trip = await Trip.findOne({ 
      bus: bus._id, 
      status: 'in-progress' 
    })
    .populate('bus')
    .populate('route');

    if (!trip) {
      return res.status(404).json({ 
        success: false,
        message: 'No active trip found' 
      });
    }

    res.json({
      success: true,
      trip
    });
  } catch (error) {
    console.error('Get current trip error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// End trip
router.post('/end-trip', auth(['driver']), async (req, res) => {
  try {
    const { tripId } = req.body;

    const trip = await Trip.findOne({ 
      _id: tripId, 
      driver: req.userId,
      status: 'in-progress'
    });

    if (!trip) {
      return res.status(404).json({ 
        success: false,
        message: 'Active trip not found' 
      });
    }

    // Calculate trip statistics
    const locationRecords = await LocationHistory.find({
      bus: trip.bus,
      timestamp: { $gte: trip.startTime }
    }).sort({ timestamp: 1 });

    let totalDistance = 0;
    let totalSpeed = 0;

    for (let i = 1; i < locationRecords.length; i++) {
      const prev = locationRecords[i - 1];
      const curr = locationRecords[i];
      
      // Calculate distance between consecutive points
      const distance = calculateDistance(
        prev.location.latitude,
        prev.location.longitude,
        curr.location.latitude,
        curr.location.longitude
      );
      
      totalDistance += distance;
      if (curr.speed) totalSpeed += curr.speed;
    }

    const averageSpeed = locationRecords.length > 0 
      ? totalSpeed / locationRecords.length 
      : 0;

    // Update trip
    trip.status = 'completed';
    trip.endTime = new Date();
    trip.totalDistance = totalDistance;
    trip.averageSpeed = averageSpeed;

    await trip.save();

    // Update bus status
    await Bus.findByIdAndUpdate(trip.bus, { 
      isActive: false,
      status: 'available'
    });

    res.json({
      success: true,
      message: 'Trip ended successfully',
      trip
    });
  } catch (error) {
    console.error('End trip error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Save location (batch save)
router.post('/save-location', auth(['driver']), async (req, res) => {
  try {
    const { busId, latitude, longitude, speed, heading, accuracy } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false,
        message: 'Location coordinates required' 
      });
    }

    // Verify bus belongs to driver
    const bus = await Bus.findOne({ _id: busId, driver: req.userId });
    if (!bus) {
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized' 
      });
    }

    // Update bus current location
    await Bus.findByIdAndUpdate(busId, {
      currentLocation: {
        latitude,
        longitude,
        timestamp: new Date()
      }
    });

    // Save to location history
    const locationHistory = new LocationHistory({
      bus: busId,
      driver: req.userId,
      location: { latitude, longitude },
      speed: speed || 0,
      heading,
      accuracy
    });

    await locationHistory.save();

    res.json({
      success: true,
      message: 'Location saved successfully'
    });
  } catch (error) {
    console.error('Save location error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get trip history
router.get('/trip-history', auth(['driver']), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const trips = await Trip.find({ driver: req.userId })
      .populate('bus', 'busNumber busName')
      .populate('route', 'routeName routeNumber')
      .sort({ startTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Trip.countDocuments({ driver: req.userId });

    res.json({
      success: true,
      trips,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get trip history error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Helper function - Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

module.exports = router;