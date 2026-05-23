const axios = require('axios');

const SIMPLEMDM_BASE_URL = 'https://a.simplemdm.com/api/v1';

const getAuthConfig = () => ({
  auth: {
    username: process.env.SIMPLEMDM_API_KEY,
    password: '',
  },
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Lock a device via SimpleMDM using its UDID.
 * Sends an MDM lock command to the device.
 * @param {string} udid - Device UDID
 * @returns {Object} SimpleMDM API response
 */
const lockDevice = async (udid) => {
  try {
    // First find the device by UDID
    const device = await findDeviceByUDID(udid);
    if (!device) {
      throw new Error(`Device with UDID ${udid} not found in SimpleMDM`);
    }

    const deviceId = device.id;

    // Send lock command
    const response = await axios.post(
      `${SIMPLEMDM_BASE_URL}/devices/${deviceId}/lock`,
      {},
      getAuthConfig()
    );

    return {
      success: true,
      data: response.data,
      message: `Lock command sent to device ${deviceId}`,
    };
  } catch (error) {
    const errorMessage =
      error.response?.data?.errors?.[0] || error.message || 'Failed to lock device';
    console.error(`SimpleMDM lockDevice error for UDID ${udid}:`, errorMessage);
    throw new Error(errorMessage);
  }
};

/**
 * Unlock a device via SimpleMDM using its UDID.
 * Clears the MDM lock command on the device.
 * @param {string} udid - Device UDID
 * @returns {Object} SimpleMDM API response
 */
const unlockDevice = async (udid) => {
  try {
    const device = await findDeviceByUDID(udid);
    if (!device) {
      throw new Error(`Device with UDID ${udid} not found in SimpleMDM`);
    }

    const deviceId = device.id;

    // Send clear passcode / activation lock bypass command to effectively unlock
    const response = await axios.post(
      `${SIMPLEMDM_BASE_URL}/devices/${deviceId}/clear_passcode`,
      {},
      getAuthConfig()
    );

    return {
      success: true,
      data: response.data,
      message: `Unlock command sent to device ${deviceId}`,
    };
  } catch (error) {
    const errorMessage =
      error.response?.data?.errors?.[0] || error.message || 'Failed to unlock device';
    console.error(`SimpleMDM unlockDevice error for UDID ${udid}:`, errorMessage);
    throw new Error(errorMessage);
  }
};

/**
 * Get the current status/details of a device by UDID.
 * @param {string} udid - Device UDID
 * @returns {Object} Device status data
 */
const getDeviceStatus = async (udid) => {
  try {
    const device = await findDeviceByUDID(udid);
    if (!device) {
      throw new Error(`Device with UDID ${udid} not found in SimpleMDM`);
    }

    const deviceId = device.id;

    const response = await axios.get(
      `${SIMPLEMDM_BASE_URL}/devices/${deviceId}`,
      getAuthConfig()
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    const errorMessage =
      error.response?.data?.errors?.[0] || error.message || 'Failed to get device status';
    console.error(`SimpleMDM getDeviceStatus error for UDID ${udid}:`, errorMessage);
    throw new Error(errorMessage);
  }
};

/**
 * Find a SimpleMDM device record by UDID.
 * Searches through the devices list.
 * @param {string} udid - Device UDID
 * @returns {Object|null} SimpleMDM device object or null if not found
 */
const findDeviceByUDID = async (udid) => {
  try {
    let page = 1;
    const limit = 100;

    while (true) {
      const response = await axios.get(`${SIMPLEMDM_BASE_URL}/devices`, {
        ...getAuthConfig(),
        params: { limit, starting_after: page > 1 ? (page - 1) * limit : undefined },
      });

      const devices = response.data?.data || [];

      const found = devices.find(
        (d) => d.attributes?.unique_identifier === udid || d.attributes?.udid === udid
      );

      if (found) return found;

      // Check if there are more pages
      if (!response.data?.has_more || devices.length < limit) {
        break;
      }

      page++;
    }

    return null;
  } catch (error) {
    console.error(`SimpleMDM findDeviceByUDID error:`, error.message);
    return null;
  }
};

module.exports = { lockDevice, unlockDevice, getDeviceStatus };
