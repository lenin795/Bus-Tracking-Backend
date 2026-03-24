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

// ✅ Get bus stop by stop code — case-insensitive
router.get('/code/:stopCode', async (req, res) => {
  try {
    const busStop = await BusStop.findOne({
      stopCode: { $regex: new RegExp(`^${req.params.stopCode}$`, 'i') }
    });
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

    // ✅ Normalize stop code to uppercase before saving
    const normalizedCode = stopCode.trim().toUpperCase();

    // ✅ Case-insensitive duplicate check
    const existingStop = await BusStop.findOne({
      stopCode: { $regex: new RegExp(`^${normalizedCode}$`, 'i') }
    });
    if (existingStop) {
      return res.status(400).json({ 
        success: false,
        message: 'Stop code already exists' 
      });
    }

    const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
    const trackingUrl = `${clientUrl}/track?stop=${normalizedCode}`;
    
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
      stopCode: normalizedCode, // ✅ Always saved as uppercase
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
      qrUrl: trackingUrl
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

    // ✅ Normalize new stop code if provided
    const normalizedCode = stopCode ? stopCode.trim().toUpperCase() : null;

    if (normalizedCode && normalizedCode !== busStop.stopCode) {
      const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
      const trackingUrl = `${clientUrl}/track?stop=${normalizedCode}`;
      
      const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 400,
        margin: 2
      });

      busStop.qrCode = qrCodeDataUrl;
      busStop.stopCode = normalizedCode; // ✅ Save normalized
    }

    if (stopName) busStop.stopName = stopName;
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

    const clientUrl = process.env.CLIENT_URL || 'https://bus-trackingapp.netlify.app';
    const trackingUrl = `${clientUrl}/track?stop=${busStop.stopCode}`;

    res.json({ 
      success: true,
      stopName: busStop.stopName,
      stopCode: busStop.stopCode,
      qrCode: busStop.qrCode,
      trackingUrl: trackingUrl
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

module.exports = router;