const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    full_name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    ghana_card_id: {
      type: String,
      trim: true,
    },
    photos: {
      ghana_card_front: {
        type: String,
        default: null,
      },
      ghana_card_back: {
        type: String,
        default: null,
      },
      customer_photo: {
        type: String,
        default: null,
      },
      guarantor_photo: {
        type: String,
        default: null,
      },
    },
    occupation: {
      type: String,
      trim: true,
    },
    income: {
      amount: {
        type: Number,
        default: 0,
      },
      source: {
        type: String,
        trim: true,
      },
    },
    location: {
      region: {
        type: String,
        trim: true,
      },
      district: {
        type: String,
        trim: true,
      },
      town: {
        type: String,
        trim: true,
      },
      landmark: {
        type: String,
        trim: true,
      },
      gps_address: {
        type: String,
        trim: true,
      },
    },
    guarantor: {
      full_name: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      ghana_card_id: {
        type: String,
        trim: true,
      },
      relationship: {
        type: String,
        trim: true,
      },
    },
    proof_of_income: {
      type: String,
      default: null,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Customer', CustomerSchema);
