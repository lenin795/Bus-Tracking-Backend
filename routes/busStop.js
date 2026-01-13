const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const auth = require('../middleware/auth');
const BusStop = require('../models/BusStop');

// Get all bus stops
router.get('/', async (req, res) => {
  try {
    const busStops = await BusStop.find().sort({ stopName: 1 });
    res.json({
      success: true,
      count: busStops.length,
      busStops
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get bus stop by ID
router.get('/:id', async (req, res) => {
  try {
    const busStop = await BusStop.findById(req.params.id);
    if (!busStop) {
      return res.status(404).json({ success: false, message: 'Bus stop not found' });
    }
    res.json({ success: true, busStop });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get bus stop by stop code
router.get('/code/:stopCode', async (req, res) => {
  try {
    const busStop = await BusStop.findOne({ stopCode: req.params.stopCode });
    if (!busStop) {
      return res.status(404).json({ success: false, message: 'Bus stop not found' });
    }
    res.json({ success: true, busStop });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create bus stop with QR code (Admin only)
router.post('/', auth(['admin']), async (req, res) => {
  try {
    const { stopName, stopCode, location, address, landmarks } = req.body;

    if (!stopName || !stopCode || !location?.latitude || !location?.longitude) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    const existingStop = await BusStop.findOne({ stopCode });
    if (existingStop) {
      return res.status(400).json({ 
        success: false,
        message: 'Stop code already exists' 
      });
    }

    // ✅ FIXED: Use production URL for QR code
    const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
    const trackingUrl = `${clientUrl}/track?stop=${stopCode}`;
    
    console.log('🔗 Generating QR code for URL:', trackingUrl);
    
    const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const busStop = new BusStop({
      stopName,
      stopCode,
      location,
      qrCode: qrCodeDataUrl,
      address,
      landmarks
    });

    await busStop.save();

    console.log('✅ Bus stop created with QR code URL:', trackingUrl);

    res.status(201).json({
      success: true,
      message: 'Bus stop created successfully',
      busStop,
      qrUrl: trackingUrl // Include URL in response for verification
    });
  } catch (error) {
    console.error('Create bus stop error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Update bus stop (Admin only)
router.put('/:id', auth(['admin']), async (req, res) => {
  try {
    const { stopName, stopCode, location, address, landmarks, isActive } = req.body;

    const busStop = await BusStop.findById(req.params.id);
    if (!busStop) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus stop not found' 
      });
    }

    // ✅ FIXED: Regenerate QR code with production URL if stop code changes
    if (stopCode && stopCode !== busStop.stopCode) {
      const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
      const trackingUrl = `${clientUrl}/track?stop=${stopCode}`;
      
      const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 400,
        margin: 2
      });

      busStop.qrCode = qrCodeDataUrl;
    }

    if (stopName) busStop.stopName = stopName;
    if (stopCode) busStop.stopCode = stopCode;
    if (location) busStop.location = location;
    if (address) busStop.address = address;
    if (landmarks) busStop.landmarks = landmarks;
    if (isActive !== undefined) busStop.isActive = isActive;

    await busStop.save();

    res.json({
      success: true,
      message: 'Bus stop updated successfully',
      busStop
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Delete bus stop (Admin only)
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    const busStop = await BusStop.findByIdAndDelete(req.params.id);
    if (!busStop) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus stop not found' 
      });
    }
    res.json({
      success: true,
      message: 'Bus stop deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Download QR code
router.get('/:id/qr-code', async (req, res) => {
  try {
    const busStop = await BusStop.findById(req.params.id);
    if (!busStop) {
      return res.status(404).json({ 
        success: false,
        message: 'Bus stop not found' 
      });
    }

    // ✅ FIXED: Use production URL
    const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
    const trackingUrl = `${clientUrl}/track?stop=${busStop.stopCode}`;

    res.json({ 
      success: true,
      stopName: busStop.stopName,
      stopCode: busStop.stopCode,
      qrCode: busStop.qrCode,
      trackingUrl: trackingUrl // Include URL for reference
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;