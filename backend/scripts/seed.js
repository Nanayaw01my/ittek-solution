require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const User = require('../models/User');

  // Delete existing seed users so we start fresh
  await User.deleteMany({ email: { $in: ['admin@tritech.com', 'staff@tritech.com'] } });

  const salt = await bcrypt.genSalt(10);

  await User.create([
    {
      name: 'Tritech Admin',
      email: 'admin@tritech.com',
      password: await bcrypt.hash('admin123', salt),
      role: 'admin',
      is_active: true,
    },
    {
      name: 'Tritech Staff',
      email: 'staff@tritech.com',
      password: await bcrypt.hash('staff123', salt),
      role: 'staff',
      staff_id: 'Tri001',
      is_active: true,
    },
  ]);

  // Verify they were saved correctly
  const admin = await User.findOne({ email: 'admin@tritech.com' }).select('+password');
  const adminOk = await bcrypt.compare('admin123', admin.password);

  const staff = await User.findOne({ email: 'staff@tritech.com' }).select('+password');
  const staffOk = await bcrypt.compare('staff123', staff.password);

  console.log(`admin@tritech.com  password check: ${adminOk ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`staff@tritech.com  password check: ${staffOk ? 'PASS ✓' : 'FAIL ✗'}`);

  if (!adminOk || !staffOk) {
    console.error('Seed verification failed!');
    process.exit(1);
  }

  console.log('Seed complete.');
  await mongoose.disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
