const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Bus = require('../models/Bus');
const Trip = require('../models/Trip');
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');

// Live operations snapshot (Admin only)
router.get('/live-dashboard', auth(['admin']), async (req, res) => {
  try {
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);

    const [
      totalBuses,
      totalRoutes,
      totalStops,
      drivers,
      activeTripsCount,
      activeBuses,
    ] = await Promise.all([
      Bus.countDocuments(),
      Route.countDocuments({ isActive: true }),
      BusStop.countDocuments({ isActive: true }),
      User.find({ role: 'driver', isActive: true }).select('name email phone').sort({ name: 1 }),
      Trip.countDocuments({ status: 'in-progress' }),
      Bus.find({ isActive: true })
        .populate('driver', 'name email phone')
        .populate('route', 'routeName routeNumber')
        .sort({ updatedAt: -1 }),
    ]);

    const assignedDriverIds = new Set(
      activeBuses
        .map((bus) => bus.driver?._id?.toString())
        .filter(Boolean)
    );

    const activeBusIds = activeBuses.map((bus) => bus._id);
    const activeTrips = activeBusIds.length > 0
      ? await Trip.find({ bus: { $in: activeBusIds }, status: 'in-progress' })
          .select('bus startTime status')
          .lean()
      : [];

    const activeTripMap = new Map(
      activeTrips.map((trip) => [trip.bus.toString(), trip])
    );

    const liveBuses = activeBuses.map((bus) => {
      const lastLocationTime = bus.currentLocation?.timestamp || null;
      const isLive = Boolean(lastLocationTime && lastLocationTime >= staleThreshold);
      const currentTrip = activeTripMap.get(bus._id.toString());

      return {
        _id: bus._id,
        busNumber: bus.busNumber,
        busName: bus.busName,
        capacity: bus.capacity,
        status: bus.status,
        isActive: bus.isActive,
        route: bus.route
          ? {
              _id: bus.route._id,
              routeName: bus.route.routeName,
              routeNumber: bus.route.routeNumber,
            }
          : null,
        driver: bus.driver
          ? {
              _id: bus.driver._id,
              name: bus.driver.name,
              email: bus.driver.email,
              phone: bus.driver.phone,
            }
          : null,
        currentLocation: bus.currentLocation || null,
        lastUpdate: lastLocationTime,
        trackingStatus: isLive ? 'live' : 'stale',
        activeTrip: currentTrip
          ? {
              startTime: currentTrip.startTime,
              status: currentTrip.status,
            }
          : null,
      };
    });

    res.json({
      success: true,
      generatedAt: new Date(),
      stats: {
        totalBuses,
        activeBuses: activeBuses.length,
        inactiveBuses: Math.max(totalBuses - activeBuses.length, 0),
        liveBuses: liveBuses.filter((bus) => bus.trackingStatus === 'live').length,
        staleBuses: liveBuses.filter((bus) => bus.trackingStatus === 'stale').length,
        totalDrivers: drivers.length,
        assignedDrivers: assignedDriverIds.size,
        unassignedDrivers: Math.max(drivers.length - assignedDriverIds.size, 0),
        activeTrips: activeTripsCount,
        activeRoutes: totalRoutes,
        activeStops: totalStops,
      },
      liveBuses,
      drivers,
    });
  } catch (error) {
    console.error('Get live dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// Get all drivers (Admin only)
router.get('/drivers', auth(['admin']), async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' })
      .select('name email phone')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: drivers.length,
      drivers
    });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get all users (Admin only)
router.get('/', auth(['admin']), async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true,
      users 
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Delete user (Admin only)
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Cannot delete admin users' 
      });
    }

    // Prevent deleting yourself
    if (userId === req.userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Cannot delete your own account' 
      });
    }

    // If user is a driver, unassign from bus first
    if (user.role === 'driver') {
      await Bus.updateMany(
        { driver: userId }, 
        { $set: { driver: null } }
      );
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
