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

module.exports = router;