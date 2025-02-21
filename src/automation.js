const { auth, chat, models, points, rateLimit } = require("./api");
const { groq } = require("./services");
const { log, logToFile, checkLogSize } = require("./utils");
const {
  updateStatus,
  updateUserInfo,
  updatePointsDisplay,
  updateRateLimitDisplay,
  updateModelsTable,
  startCooldownDisplay,
  render,
} = require("./ui");

let isRunning = false;
let cooldownTimer = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Initialize automation (connect to services)
 */
async function initAutomation() {
  try {
    log("Initializing services...", "info");
    logToFile("Initializing automation services");
    updateStatus("Initializing...", "info");
    render();

    await groq.initGroqClient();

    updateStatus("Ready to start", "success");
    render();

    return true;
  } catch (error) {
    log(`Initialization error: ${error.message}`, "error");
    logToFile(`Initialization error: ${error.message}`, { error: error.stack });
    updateStatus("Init Failed", "error");
    render();
    return false;
  }
}

/**
 * Start the automation process
 */
async function startAutomation() {
  if (isRunning) {
    log("Automation already running", "warning");
    return;
  }

  try {
    isRunning = true;
    consecutiveErrors = 0;
    updateStatus("Starting...", "info");
    render();

    checkLogSize();

    log("Starting login...", "info");
    await auth.login();

    const userInfo = await auth.getUserInfo();
    updateUserInfo(userInfo);

    const pointsData = await points.getUserPoints();
    updatePointsDisplay({
      total: pointsData.total_points,
      inference: pointsData.points.inference,
      referral: pointsData.points.referral,
    });

    const rateLimitData = await rateLimit.getRateLimit();
    updateRateLimitDisplay({
      limit: rateLimitData.limit,
      remaining: rateLimitData.remaining,
      resetTime: rateLimitData.resetTime,
      currentUsage: rateLimitData.currentUsage,
    });

    const modelList = await models.getModels();
    updateModelsTable(modelList);

    await models.selectDefaultModel();

    chat.createThread();

    updateStatus("Running", "success");
    render();

    automationLoop();
  } catch (error) {
    isRunning = false;
    log(`Error starting automation: ${error.message}`, "error");
    logToFile(`Error starting automation: ${error.message}`, {
      error: error.stack,
    });
    updateStatus("Start Failed", "error");
    render();

    if (
      error.message.includes("socket hang up") ||
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("ECONNREFUSED") ||
      (error.response && error.response.status >= 500)
    ) {
      log(`Attempting to restart automation in 10 seconds...`, "info");
      updateStatus("Auto-restarting in 10s...", "warning");
      render();

      setTimeout(() => {
        if (!isRunning) {
          log(`Auto-restarting automation...`, "info");
          startAutomation();
        }
      }, 10000);
    }
  }
}

/**
 * Pause the automation
 */
function pauseAutomation() {
  if (!isRunning) {
    log("Automation not running", "warning");
    return;
  }

  isRunning = false;
  updateStatus("Paused", "warning");
  log("Automation paused", "warning");
  logToFile("Automation paused");
  render();
}

/**
 * Resume the automation
 */
function resumeAutomation() {
  if (isRunning) {
    log("Automation already running", "warning");
    return;
  }

  if (rateLimit.isCooldownActive()) {
    log("Cannot resume during cooldown", "warning");
    logToFile("Resume attempt failed - cooldown active");
    return;
  }

  isRunning = true;
  consecutiveErrors = 0;
  updateStatus("Running", "success");
  log("Automation resumed", "success");
  logToFile("Automation resumed");
  render();

  automationLoop();
}

/**
 * Main automation loop
 */
async function automationLoop() {
  try {
    if (!isRunning) return;

    checkLogSize();

    if (rateLimit.isCooldownActive()) {
      setTimeout(automationLoop, 1000);
      return;
    }

    const rateLimitAvailable = await rateLimit.checkRateLimitAvailability();

    if (!rateLimitAvailable) {
      log("Rate limit reached, starting cooldown", "warning");
      logToFile("Rate limit reached, starting cooldown");

      cooldownTimer = startCooldownDisplay(
        rateLimit.getLastKnownRateLimit().resetTime,
        () => {}
      );

      await rateLimit.startCooldown(() => {
        if (isRunning) {
          automationLoop();
        }
      });

      return;
    }

    const userMessage = await groq.generateUserMessage();

    consecutiveErrors = 0;

    try {
      await chat.sendChatMessage(userMessage);

      consecutiveErrors = 0;
    } catch (chatError) {
      consecutiveErrors++;

      logToFile(
        `Chat error (consecutive: ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${chatError.message}`,
        {
          error: chatError.message,
          userMessage: userMessage,
        }
      );

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log(
          `Too many consecutive errors (${consecutiveErrors}). Taking a longer break...`,
          "error"
        );
        updateStatus("Multiple errors, pausing...", "error");
        render();

        await new Promise((resolve) => setTimeout(resolve, 180000));

        consecutiveErrors = 0;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    try {
      const pointsData = await points.getUserPoints();
      updatePointsDisplay({
        total: pointsData.total_points,
        inference: pointsData.points.inference,
        referral: pointsData.points.referral,
      });
    } catch (pointsError) {
      logToFile(
        `Failed to update points display: ${pointsError.message}`,
        { error: pointsError.message },
        false
      );
    }

    try {
      const rateLimitData = await rateLimit.getRateLimit();
      updateRateLimitDisplay({
        limit: rateLimitData.limit,
        remaining: rateLimitData.remaining,
        resetTime: rateLimitData.resetTime,
        currentUsage: rateLimitData.currentUsage,
      });
    } catch (rateLimitError) {
      logToFile(
        `Failed to update rate limit display: ${rateLimitError.message}`,
        { error: rateLimitError.message },
        false
      );
    }

    render();

    const delay = Math.floor(Math.random() * 7000) + 3000;
    log(`Waiting ${delay / 1000} seconds before next message...`, "info");

    setTimeout(automationLoop, delay);
  } catch (error) {
    log(`Error in automation loop: ${error.message}`, "error");
    logToFile(`Error in automation loop: ${error.message}`, {
      error: error.stack,
    });
    updateStatus("Error", "error");
    render();

    consecutiveErrors++;

    if (
      error.message.includes("socket hang up") ||
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("ECONNREFUSED") ||
      (error.response && error.response.status >= 500)
    ) {
      let backoffTime = 5000;

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        backoffTime = 180000;
        log(
          `Too many consecutive errors (${consecutiveErrors}). Taking a longer break...`,
          "error"
        );
        consecutiveErrors = 0;
      } else if (consecutiveErrors > 1) {
        backoffTime = 15000;
      }

      updateStatus(`Retrying in ${backoffTime / 1000}s...`, "warning");
      render();

      setTimeout(() => {
        if (isRunning) {
          updateStatus("Retrying...", "warning");
          render();
          automationLoop();
        }
      }, backoffTime);
    } else {
      setTimeout(() => {
        if (isRunning) {
          updateStatus("Retrying...", "warning");
          render();
          automationLoop();
        }
      }, 15000);
    }
  }
}

/**
 * Get the current running state
 * @returns {boolean}
 */
function getRunningState() {
  return isRunning;
}

module.exports = {
  initAutomation,
  startAutomation,
  pauseAutomation,
  resumeAutomation,
  getRunningState,
};
