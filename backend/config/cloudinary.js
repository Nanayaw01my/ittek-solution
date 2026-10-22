const cloudinary = require('cloudinary').v2;

/**
 * Cloudinary, however this server was told about it.
 *
 * Two ways are in use in the wild: three separate variables, or the single
 * CLOUDINARY_URL that Cloudinary's own dashboard hands you. The SDK reads
 * CLOUDINARY_URL by itself at load — and calling config() with three
 * undefined values wiped that out, leaving a perfectly well configured
 * server looking unconfigured. So the explicit values are only applied when
 * they actually exist.
 */
const explicit = {};
if (process.env.CLOUDINARY_CLOUD_NAME) explicit.cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
if (process.env.CLOUDINARY_API_KEY) explicit.api_key = process.env.CLOUDINARY_API_KEY;
if (process.env.CLOUDINARY_API_SECRET) explicit.api_secret = process.env.CLOUDINARY_API_SECRET;
if (Object.keys(explicit).length) cloudinary.config(explicit);

module.exports = cloudinary;
