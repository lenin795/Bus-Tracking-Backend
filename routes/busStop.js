const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const auth = require('../middleware/auth');
const BusStop = require('../models/BusStop');

const escapeOverpassRegex = (value = '') =>
  value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

const buildAddress = (tags = {}) => {
  const parts = [
    tags['addr:housename'],
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:district'],
    tags['addr:state']
  ].filter(Boolean);

  return parts.join(', ');
};

const normalizeExternalStops = (elements = [], query = '') => {
  const seen = new Set();

  return elements
    .map((element) => {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      const tags = element.tags || {};
      const name = tags.name || query;
      const key = `${name}:${latitude}:${longitude}`;

      if (latitude == null || longitude == null || seen.has(key)) {
        return null;
      }

      seen.add(key);

      return {
        id: `${element.type}-${element.id}`,
        name,
        latitude,
        longitude,
        address: buildAddress(tags),
        locality: tags['addr:city'] || tags.town || tags.village || tags.suburb || '',
        source: 'overpass'
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const searchOverpass = async (query) => {
  const escapedQuery = escapeOverpassRegex(query);
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"]["name"~"${escapedQuery}",i];
      node["public_transport"="platform"]["name"~"${escapedQuery}",i];
      way["highway"="bus_stop"]["name"~"${escapedQuery}",i];
      way["public_transport"="platform"]["name"~"${escapedQuery}",i];
      relation["public_transport"="platform"]["name"~"${escapedQuery}",i];
    );
    out center tags 12;
  `;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });

      if (!response.ok) {
        throw new Error(`Overpass returned ${response.status}`);
      }

      const data = await response.json();
      const results = normalizeExternalStops(data.elements || [], query);
      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      console.error(`Overpass lookup failed at ${endpoint}:`, error.message);
    }
  }

  return [];
};

const searchNominatim = async (query) => {
  const params = new URLSearchParams({
    q: `${query} bus stop`,
    format: 'jsonv2',
    limit: '8',
    addressdetails: '1',
    countrycodes: 'in'
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'BusTrackingApp/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  const data = await response.json();
  const seen = new Set();

  return data
    .map((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      const key = `${item.display_name}:${latitude}:${longitude}`;

      if (Number.isNaN(latitude) || Number.isNaN(longitude) || seen.has(key)) {
        return null;
      }

      seen.add(key);

      return {
        id: `nominatim-${item.place_id}`,
        name: item.name || item.display_name?.split(',')[0] || query,
        latitude,
        longitude,
        address: item.display_name || '',
        locality: item.address?.city || item.address?.town || item.address?.village || item.address?.suburb || '',
        source: 'nominatim'
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

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

// Search public bus-stop data from OpenStreetMap/Overpass
router.get('/external-search', auth(['admin']), async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (query.length < 3) {
    return res.json({
      success: true,
      count: 0,
      results: []
    });
  }

  try {
    let results = await searchOverpass(query);

    if (results.length === 0) {
      results = await searchNominatim(query);
    }

    res.json({
      success: true,
      count: results.length,
      results,
      fallbackUsed: results.some((item) => item.source === 'nominatim')
    });
  } catch (error) {
    console.error('External bus stop search error:', error.message);
    res.json({
      success: true,
      count: 0,
      results: [],
      message: 'External bus stop lookup is temporarily unavailable'
    });
  }
});

// Get bus stop by stop code - case-insensitive
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

    const normalizedCode = stopCode.trim().toUpperCase();

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
      stopCode: normalizedCode,
      location,
      qrCode: qrCodeDataUrl,
      address,
      landmarks
    });

    await busStop.save();

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
      busStop.stopCode = normalizedCode;
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
      trackingUrl
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
