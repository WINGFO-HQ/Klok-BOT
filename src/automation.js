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

let accountSwitchScheduled = false;
const ACCOUNT_SWITCH_INTERVAL = 60 * 10 * 1000;
let accountSwitchTimer = null;
let accountSwitchCountdown = ACCOUNT_SWITCH_INTERVAL / 1000;
let accountSwitchCountdownTimer = null;

/**
 * Format time in seconds to mm:ss format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Update status with current state including account switch timer
 */
function updateStatusWithTimers() {
  if (rateLimit.isCooldownActive()) {
    const rateLimitInfo = rateLimit.getLastKnownRateLimit();

    const tokenInfo = auth.getTokenInfo();
    if (tokenInfo.hasMultipleTokens) {
      updateStatus(
        `Cooldown: ${formatTime(rateLimitInfo.resetTime)} | Account: ${
          tokenInfo.currentIndex + 1
        }/${tokenInfo.totalTokens}`,
        "warning"
      );
    } else {
      updateStatus(
        `Cooldown: ${formatTime(rateLimitInfo.resetTime)}`,
        "warning"
      );
    }
    return;
  }

  const tokenInfo = auth.getTokenInfo();
  if (isRunning && tokenInfo.hasMultipleTokens) {
    updateStatus(
      `Running | Next account in: ${formatTime(
        accountSwitchCountdown
      )} | Account: ${tokenInfo.currentIndex + 1}/${tokenInfo.totalTokens}`,
      "success"
    );
  } else if (isRunning) {
    updateStatus("Running", "success");
  } else {
    updateStatus("Paused", "warning");
  }

  render();
}

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
 * Start the account switch countdown timer
 */
function startAccountSwitchCountdown() {
  if (accountSwitchCountdownTimer) {
    clearInterval(accountSwitchCountdownTimer);
  }

  accountSwitchCountdown = ACCOUNT_SWITCH_INTERVAL / 1000;

  updateStatusWithTimers();

  accountSwitchCountdownTimer = setInterval(() => {
    accountSwitchCountdown--;

    updateStatusWithTimers();

    if (!isRunning) {
      clearInterval(accountSwitchCountdownTimer);
      accountSwitchCountdownTimer = null;
    }

    if (accountSwitchCountdown <= 0) {
      clearInterval(accountSwitchCountdownTimer);
      accountSwitchCountdownTimer = null;
    }
  }, 1000);
}

/**
 * Schedule timed account switching
 */
function scheduleAccountSwitch() {
  if (accountSwitchTimer) {
    clearTimeout(accountSwitchTimer);
    accountSwitchTimer = null;
  }

  const tokenInfo = auth.getTokenInfo();
  if (!tokenInfo.hasMultipleTokens) {
    log("Only one account available, not scheduling account switching", "info");
    logToFile("Account switching not scheduled - only one account available");
    return;
  }

  accountSwitchTimer = setTimeout(async () => {
    if (!isRunning) return;

    log("Scheduled account switch triggered", "info");
    logToFile("Scheduled account switch triggered", {
      previousAccount: tokenInfo.currentIndex + 1,
      totalAccounts: tokenInfo.totalTokens,
    });

    accountSwitchScheduled = true;

    scheduleAccountSwitch();
  }, ACCOUNT_SWITCH_INTERVAL);

  startAccountSwitchCountdown();

  log(
    `Account switch scheduled for ${
      ACCOUNT_SWITCH_INTERVAL / 60000
    } minutes from now`,
    "info"
  );
  logToFile("Account switch scheduled", {
    intervalMinutes: ACCOUNT_SWITCH_INTERVAL / 60000,
    currentAccount: tokenInfo.currentIndex + 1,
    totalAccounts: tokenInfo.totalTokens,
  });
}

/**
 * Switch to next account and re-initialize
 */
async function switchAccount() {
  try {
    log("Switching to next account...", "info");

    auth.switchToNextToken();

    await auth.login();

    const userInfo = await auth.getUserInfo();
    const tokenInfo = auth.getTokenInfo();
    updateUserInfo(userInfo, tokenInfo);

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

    chat.createThread();

    log(
      `Switched to account ${tokenInfo.currentIndex + 1}/${
        tokenInfo.totalTokens
      }`,
      "success"
    );
    logToFile("Account switch completed", {
      newAccount: tokenInfo.currentIndex + 1,
      totalAccounts: tokenInfo.totalTokens,
    });

    if (tokenInfo.hasMultipleTokens) {
      scheduleAccountSwitch();
    }

    render();
    return true;
  } catch (error) {
    log(`Error switching account: ${error.message}`, "error");
    logToFile(`Error switching account: ${error.message}`, {
      error: error.stack,
    });

    consecutiveErrors++;

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log("Multiple account switch failures, stopping automation", "error");
      isRunning = false;
      updateStatus("Stopped - Account Error", "error");
      render();
      return false;
    }

    log("Trying next account...", "warning");
    return switchAccount();
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
    accountSwitchScheduled = false;
    updateStatus("Starting...", "info");
    render();

    checkLogSize();

    log("Starting login...", "info");
    await auth.login();

    const userInfo = await auth.getUserInfo();
    const tokenInfo = auth.getTokenInfo();
    updateUserInfo(userInfo, tokenInfo);

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

    scheduleAccountSwitch();

    updateStatusWithTimers();

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

  if (accountSwitchTimer) {
    clearTimeout(accountSwitchTimer);
    accountSwitchTimer = null;
  }

  if (accountSwitchCountdownTimer) {
    clearInterval(accountSwitchCountdownTimer);
    accountSwitchCountdownTimer = null;
  }

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

  scheduleAccountSwitch();

  log("Automation resumed", "success");
  logToFile("Automation resumed");

  updateStatusWithTimers();

  automationLoop();
}

/**
 * Main automation loop
 */
async function automationLoop() {
  try {
    if (!isRunning) return;

    checkLogSize();

    if (accountSwitchScheduled) {
      accountSwitchScheduled = false;
      log("Performing scheduled account switch", "info");

      const switchSuccess = await switchAccount();
      if (!switchSuccess || !isRunning) {
        return;
      }
    }

    if (rateLimit.isCooldownActive()) {
      const tokenInfo = auth.getTokenInfo();
      if (tokenInfo.hasMultipleTokens) {
        log(
          "Rate limit reached but multiple accounts available. Switching to next account instead of waiting...",
          "info"
        );
        logToFile("Switching account instead of waiting for cooldown");

        rateLimit.cancelCooldown();

        const switchSuccess = await switchAccount();
        if (!switchSuccess || !isRunning) {
          return;
        }

        automationLoop();
        return;
      } else {
        setTimeout(automationLoop, 1000);
        return;
      }
    }

    const rateLimitAvailable = await rateLimit.checkRateLimitAvailability();

    if (!rateLimitAvailable) {
      const tokenInfo = auth.getTokenInfo();

      if (tokenInfo.hasMultipleTokens) {
        log(
          "Rate limit reached. Switching to next account instead of cooldown...",
          "warning"
        );
        logToFile("Switching account instead of cooldown");

        const switchSuccess = await switchAccount();
        if (!switchSuccess || !isRunning) {
          return;
        }

        automationLoop();
        return;
      } else {
        log(
          "Rate limit reached, starting cooldown (no alternative accounts available)",
          "warning"
        );
        logToFile("Rate limit reached, starting cooldown (single account)");

        cooldownTimer = startCooldownDisplay(
          rateLimit.getLastKnownRateLimit().resetTime,
          () => {}
        );

        await rateLimit.startCooldown(() => {
          if (isRunning) {
            updateStatusWithTimers();
            automationLoop();
          }
        });

        return;
      }
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

      if (
        chatError.response &&
        (chatError.response.status === 401 || chatError.response.status === 403)
      ) {
        log("Authentication error, trying to switch account...", "warning");

        const tokenInfo = auth.getTokenInfo();
        if (tokenInfo.hasMultipleTokens) {
          await switchAccount();
        } else {
          log("No alternative accounts available", "error");
          throw chatError;
        }
      } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
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

      if (rateLimitData.remaining <= 1) {
        const tokenInfo = auth.getTokenInfo();
        if (tokenInfo.hasMultipleTokens) {
          log(
            "Rate limit nearly exhausted. Preemptively switching to next account...",
            "info"
          );
          logToFile("Preemptive account switch due to low rate limit", {
            remaining: rateLimitData.remaining,
            limit: rateLimitData.limit,
          });

          const switchSuccess = await switchAccount();
          if (!switchSuccess || !isRunning) {
            return;
          }
        }
      }
    } catch (rateLimitError) {
      logToFile(
        `Failed to update rate limit display: ${rateLimitError.message}`,
        { error: rateLimitError.message },
        false
      );
    }

    updateStatusWithTimers();

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
          updateStatusWithTimers();
          automationLoop();
        }
      }, backoffTime);
    } else {
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        const tokenInfo = auth.getTokenInfo();
        if (tokenInfo.hasMultipleTokens) {
          log("Authentication error, switching to next account...", "warning");

          await switchAccount();

          setTimeout(() => {
            if (isRunning) {
              automationLoop();
            }
          }, 5000);

          return;
        }
      }

      setTimeout(() => {
        if (isRunning) {
          updateStatusWithTimers();
          automationLoop();
        }
      }, 15000);
    }
  }
}

/**
 * Manually switch to next account
 */
async function manualSwitchAccount() {
  const tokenInfo = auth.getTokenInfo();
  if (!tokenInfo.hasMultipleTokens) {
    log("No alternative accounts available", "warning");
    return false;
  }

  return await switchAccount();
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
  manualSwitchAccount,
  getRunningState,
};
