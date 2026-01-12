const mongoose = require('mongoose');
const BusStop = require('./models/BusStop');
const QRCode = require('qrcode');
require('dotenv').config();

async function fixAllQRCodes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    console.log('🔗 Client URL:', clientUrl, '\n');

    const busStops = await BusStop.find();
    console.log(`📍 Found ${busStops.length} bus stops to update\n`);

    for (const stop of busStops) {
      // Generate URL for tracking page
      const trackingUrl = `${clientUrl}/track?stop=${stop.stopCode}`;
      
      console.log(`Updating: ${stop.stopName} (${stop.stopCode})`);
      console.log(`  Old QR: ${stop.qrCode.substring(0, 50)}...`);
      console.log(`  New URL: ${trackingUrl}`);
      
      // Generate new QR code with URL
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

      // Update the bus stop
      stop.qrCode = qrCodeDataUrl;
      await stop.save();
      
      console.log(`  ✅ Updated!\n`);
    }

    console.log('✅ All QR codes have been regenerated with URLs!');
    console.log('\n📱 Test by scanning any QR code from admin panel');
    console.log(`   Should open: ${clientUrl}/track?stop=STOP_CODE`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAllQRCodes();