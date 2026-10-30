const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    /**
     * Which side of the business this category belongs to.
     *
     * Set here rather than on five hundred products: a category called
     * "Panels" says Solar once and every product under it is placed. Left
     * blank, the system reads the names and guesses — see
     * backend/config/aspects.js.
     */
    aspect: {
      type: String,
      enum: ['solar', 'networking', 'electrical', 'other', ''],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Category', CategorySchema);
