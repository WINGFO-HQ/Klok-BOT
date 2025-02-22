const config = require("../../config");
const { makeApiRequest } = require("./auth");
const { log, logToFile } = require("../utils");

let rateLimitInfo = {
  limit: 0,
  remaining: 0,
  resetTime: 0,
  currentUsage: 0,
};

let cooldownActive = false;
let cooldownTimer = null;

/**
 * @returns {Promise<Object>}
 */
async function getRateLimit() {
  try {
    log("Checking rate limit...", "info");
    logToFile("Checking rate limit");

    const response = await makeApiRequest("GET", "/rate-limit");

    rateLimitInfo = {
      limit: response.limit,
      remaining: response.remaining,
      resetTime: response.reset_time,
      currentUsage: response.current_usage || 0,
    };

    let resetTimeFormatted = "N/A";
    if (rateLimitInfo.resetTime > 0) {
      const minutes = Math.floor(rateLimitInfo.resetTime / 60);
      const seconds = rateLimitInfo.resetTime % 60;
      resetTimeFormatted = `${minutes}m ${seconds}s`;
    }

    log(
      `Rate limit: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining`,
      "info"
    );
    logToFile(`Rate limit status`, {
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      resetTime: rateLimitInfo.resetTime,
      resetTimeFormatted: resetTimeFormatted,
      currentUsage: rateLimitInfo.currentUsage,
    });

    return rateLimitInfo;
  } catch (error) {
    throw error;
  }
}

/**
 * @returns {Promise<boolean>}
 */
async function checkRateLimitAvailability() {
  try {
    const { remaining } = await getRateLimit();

    const isAvailable = remaining > 0;
    logToFile(
      `Rate limit availability check: ${
        isAvailable ? "Available" : "Exhausted"
      }`,
      {
        remaining: remaining,
      }
    );

    return isAvailable;
  } catch (error) {
    logToFile(
      `Error checking rate limit, assuming available: ${error.message}`,
      {
        error: error.message,
      },
      false
    );
    return true;
  }
}

/**
 * Cancel current cooldown if active
 * @returns {boolean}
 */
function cancelCooldown() {
  if (!cooldownActive) {
    return false;
  }

  if (cooldownTimer) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }

  cooldownActive = false;
  log("Cooldown cancelled", "info");
  logToFile("Cooldown cancelled manually");

  return true;
}

/**
 * Start cooldown timer
 * @param {Function} onComplete
 * @returns {Promise<boolean>}
 */
async function startCooldown(onComplete) {
  try {
    if (cooldownActive) {
      log("Cooldown already active", "warning");
      logToFile("Cooldown already active");
      return false;
    }

    cooldownActive = true;

    let resetTime = 60;

    try {
      const rateLimit = await getRateLimit();
      resetTime = rateLimit.resetTime;
    } catch (error) {
      logToFile(
        `Failed to get rate limit for cooldown, using default: ${error.message}`,
        {
          error: error.message,
          defaultResetTime: resetTime,
        },
        false
      );
    }

    const cooldownSeconds = resetTime > 0 ? resetTime : 60;

    log(`Starting cooldown for ${cooldownSeconds} seconds...`, "warning");
    logToFile(`Starting cooldown`, {
      durationSeconds: cooldownSeconds,
      estimatedEndTime: new Date(
        Date.now() + cooldownSeconds * 1000
      ).toISOString(),
    });

    return new Promise((resolve) => {
      cooldownTimer = setTimeout(() => {
        cooldownActive = false;
        cooldownTimer = null;
        log("Cooldown complete!", "success");
        logToFile("Cooldown complete!");

        if (onComplete && typeof onComplete === "function") {
          onComplete();
        }

        resolve(true);
      }, cooldownSeconds * 1000);
    });
  } catch (error) {
    cooldownActive = false;
    const errorMsg = `Error during cooldown: ${error.message}`;
    log(errorMsg, "error");
    logToFile("Error during cooldown", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * @returns {boolean}
 */
function isCooldownActive() {
  return cooldownActive;
}

/**
 * @returns {Object}
 */
function getLastKnownRateLimit() {
  return { ...rateLimitInfo };
}

module.exports = {
  getRateLimit,
  checkRateLimitAvailability,
  startCooldown,
  cancelCooldown,
  isCooldownActive,
  getLastKnownRateLimit,
};
