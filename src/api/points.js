const config = require("../../config");
const { makeApiRequest } = require("./auth");
const { log, logToFile } = require("../utils");

let lastPointsUpdate = {
  total: 0,
  inference: 0,
  referral: 0,
};

/**

 * @returns {Promise<Object>} Points user
 */
async function getUserPoints() {
  try {
    log("Getting user points...", "info");
    logToFile("Getting user points");

    const response = await makeApiRequest("GET", "/points");

    lastPointsUpdate = {
      total: response.total_points,
      inference: response.points.inference,
      referral: response.points.referral,
    };

    log(`Points retrieved: ${lastPointsUpdate.total} total points`, "success");
    logToFile(
      `Points retrieved: total=${lastPointsUpdate.total}, inference=${lastPointsUpdate.inference}, referral=${lastPointsUpdate.referral}`
    );

    return response;
  } catch (error) {
    const errorMsg = `Error getting points: ${error.message}`;
    log(errorMsg, "error");

    logToFile(
      `Using last known points due to error: ${error.message}`,
      lastPointsUpdate
    );

    throw error;
  }
}

/**
 * @returns {Object}
 */
function getLastKnownPoints() {
  return lastPointsUpdate;
}

module.exports = {
  getUserPoints,
  getLastKnownPoints,
};
