const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');

// Get all routes
router.get('/', async (req, res) => {
  try {
    const routes = await Route.find()
      .populate('stops')
      .sort({ routeNumber: 1 });

    res.json({
      success: true,
      count: routes.length,
      routes
    });
  } catch (error) {
    console.error('Get routes error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get single route
router.get('/:id', async (req, res) => {
  try {
    const route = await Route.findById(req.params.id).populate('stops');

    if (!route) {
      return res.status(404).json({ 
        success: false,
        message: 'Route not found' 
      });
    }

    res.json({
      success: true,
      route
    });
  } catch (error) {
    console.error('Get route error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Create route (Admin only)
router.post('/', auth(['admin']), async (req, res) => {
  try {
    const { routeName, routeNumber, stops, startTime, endTime, frequency, distance, estimatedDuration } = req.body;

    if (!routeName || !routeNumber || !stops || !startTime || !endTime) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Check if route number exists
    const existingRoute = await Route.findOne({ routeNumber });
    if (existingRoute) {
      return res.status(400).json({ 
        success: false,
        message: 'Route number already exists' 
      });
    }

    // Verify all stops exist
    const stopIds = stops.map(s => s);
    const validStops = await BusStop.find({ _id: { $in: stopIds } });
    if (validStops.length !== stopIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'One or more invalid stop IDs' 
      });
    }

    const route = new Route({
      routeName,
      routeNumber,
      stops,
      startTime,
      endTime,
      frequency,
      distance,
      estimatedDuration
    });

    await route.save();
    await route.populate('stops');

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      route
    });
  } catch (error) {
    console.error('Create route error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Update route (Admin only)
router.put('/:id', auth(['admin']), async (req, res) => {
  try {
    const { routeName, routeNumber, stops, startTime, endTime, frequency, distance, estimatedDuration, isActive } = req.body;

    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ 
        success: false,
        message: 'Route not found' 
      });
    }

    // Update fields
    if (routeName) route.routeName = routeName;
    if (routeNumber) route.routeNumber = routeNumber;
    if (stops) route.stops = stops;
    if (startTime) route.startTime = startTime;
    if (endTime) route.endTime = endTime;
    if (frequency !== undefined) route.frequency = frequency;
    if (distance !== undefined) route.distance = distance;
    if (estimatedDuration !== undefined) route.estimatedDuration = estimatedDuration;
    if (isActive !== undefined) route.isActive = isActive;

    await route.save();
    await route.populate('stops');

    res.json({
      success: true,
      message: 'Route updated successfully',
      route
    });
  } catch (error) {
    console.error('Update route error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Delete route (Admin only)
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    
    if (!route) {
      return res.status(404).json({ 
        success: false,
        message: 'Route not found' 
      });
    }

    res.json({
      success: true,
      message: 'Route deleted successfully'
    });
  } catch (error) {
    console.error('Delete route error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;