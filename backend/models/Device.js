const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: [true, 'Device model is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Device price is required'],
      min: [0, 'Price cannot be negative'],
    },
    serial_number: {
      type: String,
      unique: true,
      trim: true,
      sparse: true,
    },
    udid: {
      type: String,
      unique: true,
      trim: true,
      sparse: true,
    },
    imei: {
      type: String,
      trim: true,
    },
    lock_status: {
      type: String,
      enum: ['locked', 'unlocked'],
      default: 'unlocked',
    },
    sold_status: {
      type: String,
      enum: ['available', 'sold'],
      default: 'available',
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Device', DeviceSchema);
