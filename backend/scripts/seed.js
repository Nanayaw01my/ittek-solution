require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../models/User');
    const Category = require('../models/Category');
    const Supplier = require('../models/Supplier');
    const Product = require('../models/Product');
    const Settings = require('../models/Settings');

    // ── Seed Super Admin ──
    const adminExists = await User.findOne({ role: 'Super Admin' });
    if (!adminExists) {
      await User.create({
        username: 'superadmin',
        email: 'admin@dandorsolar.com',
        password: 'Admin@123',
        role: 'Super Admin',
        is_active: true,
      });
      console.log('Super Admin created: admin@dandorsolar.com / Admin@123');
    } else {
      console.log('Super Admin already exists. Skipping.');
    }

    // ── Seed Default Settings ──
    const settingsExists = await Settings.findOne();
    if (!settingsExists) {
      await Settings.create({
        company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
        company_address: 'Accra, Ghana',
        company_phone: '+233 XX XXX XXXX',
        company_email: 'info@dandorsolar.com',
        currency_symbol: 'GH₵',
        tax_rate: 0,
        low_stock_alert: 5,
        receipt_header: 'DAN & DOR SOLAR COMPANY LIMITED',
        receipt_footer: 'Thank you for your business! Powered by ITTEK Solution.',
        notification_settings: {
          large_sale_threshold: 5000,
          expense_threshold: 1000,
          email_notifications: true,
        },
      });
      console.log('Default Settings created.');
    } else {
      console.log('Settings already exist. Skipping.');
    }

    // ── Seed Categories ──
    const categoryNames = ['Solar Panels', 'Batteries', 'Inverters', 'Accessories', 'Lighting'];
    const categories = {};
    for (const name of categoryNames) {
      const existing = await Category.findOne({ name });
      if (!existing) {
        const cat = await Category.create({ name });
        categories[name] = cat._id;
        console.log(`Category created: ${name}`);
      } else {
        categories[name] = existing._id;
        console.log(`Category exists: ${name}`);
      }
    }

    // ── Seed Suppliers ──
    const supplierData = [
      { name: 'SolarTech Ghana Ltd', phone: '+233 24 123 4567', address: 'Industrial Area, Accra', email: 'sales@solartechghana.com' },
      { name: 'PowerSun Distributors', phone: '+233 26 987 6543', address: 'Tema, Greater Accra', email: 'info@powersun.gh' },
      { name: 'GreenEnergy Supplies', phone: '+233 20 555 7890', address: 'Kumasi, Ashanti Region', email: 'contact@greenenergy.gh' },
      { name: 'EcoSolar Imports', phone: '+233 27 444 5555', address: 'Takoradi, Western Region', email: 'orders@ecosolar.gh' },
    ];

    const supplierIds = {};
    for (const sup of supplierData) {
      const existing = await Supplier.findOne({ name: sup.name });
      if (!existing) {
        const s = await Supplier.create(sup);
        supplierIds[sup.name] = s._id;
        console.log(`Supplier created: ${sup.name}`);
      } else {
        supplierIds[sup.name] = existing._id;
        console.log(`Supplier exists: ${sup.name}`);
      }
    }

    // ── Seed Products ──
    const productData = [
      {
        name: '200W Monocrystalline Solar Panel',
        barcode: 'SP-MONO-200W',
        category_id: categories['Solar Panels'],
        supplier_id: supplierIds['SolarTech Ghana Ltd'],
        quantity: 25,
        cost_price: 850,
        selling_price: 1100,
        low_stock_level: 5,
      },
      {
        name: '300W Polycrystalline Solar Panel',
        barcode: 'SP-POLY-300W',
        category_id: categories['Solar Panels'],
        supplier_id: supplierIds['SolarTech Ghana Ltd'],
        quantity: 15,
        cost_price: 1200,
        selling_price: 1550,
        low_stock_level: 5,
      },
      {
        name: '100Ah Deep Cycle Battery',
        barcode: 'BAT-DC-100AH',
        category_id: categories['Batteries'],
        supplier_id: supplierIds['PowerSun Distributors'],
        quantity: 30,
        cost_price: 650,
        selling_price: 850,
        low_stock_level: 8,
      },
      {
        name: '200Ah Lithium Battery',
        barcode: 'BAT-LI-200AH',
        category_id: categories['Batteries'],
        supplier_id: supplierIds['PowerSun Distributors'],
        quantity: 10,
        cost_price: 2800,
        selling_price: 3500,
        low_stock_level: 3,
      },
      {
        name: '1000W Pure Sine Wave Inverter',
        barcode: 'INV-PSW-1000',
        category_id: categories['Inverters'],
        supplier_id: supplierIds['GreenEnergy Supplies'],
        quantity: 20,
        cost_price: 750,
        selling_price: 950,
        low_stock_level: 5,
      },
      {
        name: '2500W Hybrid Inverter',
        barcode: 'INV-HYB-2500',
        category_id: categories['Inverters'],
        supplier_id: supplierIds['GreenEnergy Supplies'],
        quantity: 8,
        cost_price: 2200,
        selling_price: 2800,
        low_stock_level: 3,
      },
      {
        name: 'Solar Charge Controller 30A',
        barcode: 'ACC-SCC-30A',
        category_id: categories['Accessories'],
        supplier_id: supplierIds['EcoSolar Imports'],
        quantity: 40,
        cost_price: 180,
        selling_price: 250,
        low_stock_level: 10,
      },
      {
        name: 'MC4 Connector Set (Pair)',
        barcode: 'ACC-MC4-PR',
        category_id: categories['Accessories'],
        supplier_id: supplierIds['EcoSolar Imports'],
        quantity: 100,
        cost_price: 15,
        selling_price: 25,
        low_stock_level: 20,
      },
      {
        name: '10W LED Solar Street Light',
        barcode: 'LGT-LED-10W',
        category_id: categories['Lighting'],
        supplier_id: supplierIds['SolarTech Ghana Ltd'],
        quantity: 35,
        cost_price: 220,
        selling_price: 300,
        low_stock_level: 8,
      },
      {
        name: '6-in-1 Solar Cable 10M',
        barcode: 'ACC-CAB-10M',
        category_id: categories['Accessories'],
        supplier_id: supplierIds['EcoSolar Imports'],
        quantity: 50,
        cost_price: 95,
        selling_price: 140,
        low_stock_level: 10,
      },
    ];

    let productsCreated = 0;
    for (const prod of productData) {
      const existing = await Product.findOne({ barcode: prod.barcode });
      if (!existing) {
        await Product.create(prod);
        productsCreated++;
        console.log(`Product created: ${prod.name} - GH₵${prod.selling_price}`);
      } else {
        console.log(`Product exists: ${prod.name}`);
      }
    }

    console.log(`\n========================================`);
    console.log(`  ITTEK Solution Seed Complete`);
    console.log(`  Categories: ${categoryNames.length}`);
    console.log(`  Suppliers: ${supplierData.length}`);
    console.log(`  Products Created: ${productsCreated}`);
    console.log(`  Login: admin@dandorsolar.com / Admin@123`);
    console.log(`========================================\n`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (error) {
    console.error('Seed error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
