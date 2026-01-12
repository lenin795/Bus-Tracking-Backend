const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const BusStop = require('../models/BusStop');
const Route = require('../models/Route');

// Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get nearest buses by stop code (QR scan result)
router.get('/nearest-buses/:stopCode', async (req, res) => {
  try {
    const { stopCode } = req.params;

    // Find bus stop
    const busStop = await BusStop.findOne({ stopCode, isActive: true });
    if (!busStop) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus stop not found' 
      });
    }

    // Find routes containing this stop
    const routes = await Route.find({ 
      stops: busStop._id,
      isActive: true 
    }).populate('stops');

    if (routes.length === 0) {
      return res.json({
        success: true,
        busStop,
        buses: [],
        message: 'No active routes for this stop'
      });
    }

    // Find active buses on these routes
    const routeIds = routes.map(r => r._id);
    const buses = await Bus.find({ 
      route: { $in: routeIds },
      isActive: true,
      'currentLocation.latitude': { $exists: true },
      'currentLocation.longitude': { $exists: true }
    })
    .populate('driver', 'name phone')
    .populate({
      path: 'route',
      populate: { path: 'stops' }
    });

    // Calculate distance and ETA for each bus
    const busesWithInfo = buses.map(bus => {
      const distance = calculateDistance(
        busStop.location.latitude,
        busStop.location.longitude,
        bus.currentLocation.latitude,
        bus.currentLocation.longitude
      );

      // Find stop index in route
      const stopIndex = bus.route.stops.findIndex(
        s => s._id.toString() === busStop._id.toString()
      );

      // Calculate ETA (assuming 25 km/h average speed in city)
      const avgSpeed = 25;
      const eta = Math.round((distance / avgSpeed) * 60);

      return {
        ...bus.toObject(),
        distanceFromStop: parseFloat(distance.toFixed(2)),
        estimatedArrival: eta,
        stopIndex,
        totalStops: bus.route.stops.length,
        lastUpdate: bus.currentLocation.timestamp
      };
    });

    // Sort by distance (nearest first)
    busesWithInfo.sort((a, b) => a.distanceFromStop - b.distanceFromStop);

    res.json({
      success: true,
      busStop,
      buses: busesWithInfo,
      count: busesWithInfo.length
    });
  } catch (error) {
    console.error('Get nearest buses error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Track specific bus
router.get('/track-bus/:busId', async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId)
      .populate('driver', 'name phone')
      .populate({
        path: 'route',
        populate: { path: 'stops' }
      });

    if (!bus) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus not found' 
      });
    }

    res.json({
      success: true,
      bus
    });
  } catch (error) {
    console.error('Track bus error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get all active buses
router.get('/active-buses', async (req, res) => {
  try {
    const buses = await Bus.find({ isActive: true })
      .populate('driver', 'name phone')
      .populate('route', 'routeName routeNumber');

    res.json({
      success: true,
      count: buses.length,
      buses
    });
  } catch (error) {
    console.error('Get active buses error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Search buses by route
router.get('/search', async (req, res) => {
  try {
    const { routeNumber, routeName } = req.query;

    let query = {};
    if (routeNumber) {
      const routes = await Route.find({ 
        routeNumber: new RegExp(routeNumber, 'i') 
      });
      query.route = { $in: routes.map(r => r._id) };
    }

    const buses = await Bus.find(query)
      .populate('driver', 'name phone')
      .populate('route');

    res.json({
      success: true,
      count: buses.length,
      buses
    });
  } catch (error) {
    console.error('Search buses error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;