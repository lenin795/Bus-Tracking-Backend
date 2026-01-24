const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

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
      const Bus = require('../models/Bus');
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