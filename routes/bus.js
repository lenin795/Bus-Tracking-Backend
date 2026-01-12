const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Bus = require('../models/Bus');
const User = require('../models/User');
const Route = require('../models/Route');

// Get all buses
router.get('/', auth(['admin', 'passenger']), async (req, res) => {
  try {
    const buses = await Bus.find()
      .populate('driver', 'name email phone')
      .populate({
        path: 'route',
        populate: { path: 'stops' }
      })
      .sort({ busNumber: 1 });

    res.json({
      success: true,
      count: buses.length,
      buses
    });
  } catch (error) {
    console.error('Get buses error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get single bus
router.get('/:id', auth(['admin', 'driver', 'passenger']), async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id)
      .populate('driver', 'name email phone')
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
    console.error('Get bus error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Create new bus (Admin only)
router.post('/', auth(['admin']), async (req, res) => {
  try {
    console.log('📝 Creating bus with data:', req.body);
    
    const { busNumber, busName, capacity, driverId, routeId } = req.body;

    // Validation
    if (!busNumber || !busName || !capacity || !routeId) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields (busNumber, busName, capacity, routeId)' 
      });
    }

    // Check if bus number already exists
    const existingBus = await Bus.findOne({ busNumber });
    if (existingBus) {
      return res.status(400).json({ 
        success: false,
        message: 'Bus number already exists' 
      });
    }

    // Verify route exists
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(400).json({ 
        success: false,
        message: 'Route not found. Please select a valid route.' 
      });
    }

    // If driver assigned, verify driver exists
    if (driverId) {
      const driver = await User.findOne({ _id: driverId, role: 'driver' });
      if (!driver) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid driver ID' 
        });
      }

      const busWithDriver = await Bus.findOne({ driver: driverId });
      if (busWithDriver) {
        return res.status(400).json({ 
          success: false,
          message: 'Driver is already assigned to another bus' 
        });
      }
    }

    const bus = new Bus({
      busNumber,
      busName,
      capacity: parseInt(capacity),
      driver: driverId || null,
      route: routeId
    });

    await bus.save();
    console.log('✅ Bus created:', bus._id);

    // Populate after save
    await bus.populate('driver route');

    res.status(201).json({
      success: true,
      message: 'Bus created successfully',
      bus
    });
  } catch (error) {
    console.error('❌ Create bus error:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Update bus (Admin only)
router.put('/:id', auth(['admin']), async (req, res) => {
  try {
    const { busNumber, busName, capacity, driverId, routeId, isActive, status } = req.body;

    const bus = await Bus.findById(req.params.id);
    if (!bus) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus not found' 
      });
    }

    // Update fields
    if (busNumber) bus.busNumber = busNumber;
    if (busName) bus.busName = busName;
    if (capacity) bus.capacity = capacity;
    if (driverId !== undefined) bus.driver = driverId || null;
    if (routeId) bus.route = routeId;
    if (isActive !== undefined) bus.isActive = isActive;
    if (status) bus.status = status;

    await bus.save();
    await bus.populate('driver route');

    res.json({
      success: true,
      message: 'Bus updated successfully',
      bus
    });
  } catch (error) {
    console.error('Update bus error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Delete bus (Admin only)
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const bus = await Bus.findByIdAndDelete(req.params.id);
    
    if (!bus) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus not found' 
      });
    }

    res.json({
      success: true,
      message: 'Bus deleted successfully'
    });
  } catch (error) {
    console.error('Delete bus error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;