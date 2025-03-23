const fs = require("fs");
const path = require("path");
const axios = require("axios");
const config = require("../../config");
const {
  log,
  logToFile,
  logApiRequest,
  logApiResponse,
  logApiError,
  readFile,
  fileExists,
} = require("../utils");

const SESSION_TOKEN_PATH = path.join(process.cwd(), "session-token.key");

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
const RETRY_MULTIPLIER = 1.5;

let sessionToken = null;
let cachedUserInfo = null;

let allTokens = [];
let currentTokenIndex = 0;

/**
 * @returns {string|null}
 */
function getSessionToken() {
  return sessionToken;
}

/**
 * @returns {Object}
 */
function getTokenInfo() {
  return {
    currentIndex: currentTokenIndex,
    totalTokens: allTokens.length,
    hasMultipleTokens: allTokens.length > 1,
  };
}

/**
 * @returns {Array<string>}
 */
function readAllSessionTokensFromFile() {
  try {
    if (fileExists(SESSION_TOKEN_PATH)) {
      const fileContent = readFile(SESSION_TOKEN_PATH);
      if (fileContent && fileContent.trim().length > 0) {
        const tokens = fileContent
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        logToFile("Read session tokens from file", {
          tokenCount: tokens.length,
          tokenPreview: tokens.map((t) => t.substring(0, 10) + "..."),
        });

        return tokens;
      }
    }
    return [];
  } catch (error) {
    logToFile("Error reading session tokens from file", {
      error: error.message,
    });
    return [];
  }
}

/**
 * @param {string}
 * @returns {Promise<boolean>}
 */
async function verifyToken(token) {
  try {
    log("Verifying token validity...", "info");
    logToFile("Verifying token validity");

    const headers = {
      ...config.DEFAULT_HEADERS,
      "X-Session-Token": token,
    };

    const verifyRequest = async () => {
      logApiRequest("GET", `${config.BASE_URL}/me`, null, headers);

      const response = await axios.get(`${config.BASE_URL}/me`, {
        headers: headers,
        timeout: 10000,
      });

      logApiResponse("/me", response.data, response.status, response.headers);
      return response.status === 200;
    };

    return await executeWithRetry(verifyRequest, "Token verification");
  } catch (error) {
    log(`Token verification failed: ${error.message}`, "warning");
    logToFile("Token verification failed", { error: error.message });
    return false;
  }
}

/**
 * @returns {Promise<number>}
 */
async function verifyAndCleanupTokens() {
  try {
    log("Verifying and cleaning up tokens...", "info");
    logToFile("Starting token verification and cleanup");

    const tokens = readAllSessionTokensFromFile();

    if (tokens.length === 0) {
      log("No tokens found to verify", "warning");
      return 0;
    }

    log(`Verifying ${tokens.length} tokens...`, "info");

    const validTokens = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      log(`Verifying token ${i + 1}/${tokens.length}...`, "info");

      const isValid = await verifyToken(token);

      if (isValid) {
        validTokens.push(token);
        log(`Token ${i + 1}/${tokens.length} is valid`, "success");
      } else {
        log(`Token ${i + 1}/${tokens.length} is invalid or expired`, "warning");
      }
    }

    fs.writeFileSync(
      SESSION_TOKEN_PATH,
      validTokens.join("\n") + (validTokens.length > 0 ? "\n" : "")
    );

    log(
      `Token verification complete. ${validTokens.length}/${tokens.length} tokens are valid`,
      validTokens.length > 0 ? "success" : "warning"
    );
    logToFile("Token verification and cleanup completed", {
      totalTokens: tokens.length,
      validTokens: validTokens.length,
    });

    allTokens = validTokens;
    currentTokenIndex = 0;

    return validTokens.length;
  } catch (error) {
    log(`Error during token verification: ${error.message}`, "error");
    logToFile("Token verification failed", { error: error.message });
    return 0;
  }
}

/**
 * @returns {string|null}
 */
function getCurrentSessionToken() {
  if (allTokens.length === 0) {
    allTokens = readAllSessionTokensFromFile();
    currentTokenIndex = 0;
  }

  if (allTokens.length === 0) {
    return null;
  }

  if (currentTokenIndex >= allTokens.length) {
    currentTokenIndex = 0;
  }

  return allTokens[currentTokenIndex];
}

/**
 * @returns {string|null}
 */
function switchToNextToken() {
  if (allTokens.length === 0) {
    allTokens = readAllSessionTokensFromFile();
  }

  if (allTokens.length === 0) {
    return null;
  }

  currentTokenIndex = (currentTokenIndex + 1) % allTokens.length;
  sessionToken = allTokens[currentTokenIndex];

  log(
    `Switched to account ${currentTokenIndex + 1}/${allTokens.length}`,
    "info"
  );
  logToFile(`Switched to next token`, {
    newIndex: currentTokenIndex,
    totalTokens: allTokens.length,
    tokenPreview: sessionToken.substring(0, 10) + "...",
  });

  cachedUserInfo = null;

  return sessionToken;
}

/**
 * @param {Object} headers
 * @returns {Object}
 */
function getAuthHeaders(headers = {}) {
  if (!sessionToken) {
    throw new Error("Not authenticated. Please login first.");
  }

  return {
    ...config.DEFAULT_HEADERS,
    ...headers,
    "X-Session-Token": sessionToken,
  };
}

/**
 * Refresh expired token by re-authenticating with wallet private keys
 * @returns {Promise<boolean>}
 */
async function refreshExpiredToken() {
  try {
    log("Token expired, attempting automatic refresh...", "warning");
    logToFile("Automatic token refresh initiated");

    const privateKeys = process.env.PRIVATE_KEYS
      ? process.env.PRIVATE_KEYS.split(",")
      : [];

    if (privateKeys.length === 0) {
      log("No private keys found in .env file for token refresh", "error");
      logToFile("Token refresh failed - no private keys available");
      return false;
    }

    log(
      `Found ${privateKeys.length} private keys. Re-authenticating...`,
      "info"
    );

    const { Wallet } = require("ethers");
    const walletAddresses = privateKeys
      .map((pk) => {
        try {
          const wallet = new Wallet(pk.trim());
          return wallet.address.toLowerCase();
        } catch (err) {
          return null;
        }
      })
      .filter((addr) => addr !== null);

    log(
      `Identified ${walletAddresses.length} wallet addresses for refresh`,
      "info"
    );
    logToFile("Refreshing tokens for wallets", {
      walletCount: walletAddresses.length,
      addresses: walletAddresses.map((addr) => addr.substring(0, 10) + "..."),
    });

    const oldTokens = readAllSessionTokensFromFile();
    logToFile("Current tokens before refresh", {
      tokenCount: oldTokens.length,
      tokenPreviews: oldTokens.map((t) => t.substring(0, 10) + "..."),
    });

    fs.writeFileSync(SESSION_TOKEN_PATH, "");
    logToFile("Cleared token file before refresh");

    const { authenticateAllWallets } = require("./signin");
    await authenticateAllWallets(privateKeys);

    const newTokens = readAllSessionTokensFromFile();

    if (newTokens.length === 0) {
      log("Re-authentication failed. No valid tokens received.", "error");
      logToFile("Token refresh failed - authentication returned no tokens");

      fs.writeFileSync(
        SESSION_TOKEN_PATH,
        oldTokens.join("\n") + (oldTokens.length > 0 ? "\n" : "")
      );
      logToFile("Restored previous tokens since no new ones were obtained");

      return false;
    }

    await verifyAndCleanupTokens();

    log(
      `Re-authentication successful! ${newTokens.length} accounts refreshed.`,
      "success"
    );
    logToFile("Token refresh successful", {
      tokenCount: newTokens.length,
      newTokenPreviews: newTokens.map((t) => t.substring(0, 10) + "..."),
    });

    allTokens = readAllSessionTokensFromFile();
    currentTokenIndex = 0;
    sessionToken = allTokens[currentTokenIndex];

    return true;
  } catch (error) {
    log(`Token refresh error: ${error.message}`, "error");
    logToFile("Token refresh error", { error: error.message });
    return false;
  }
}

/**
 * @param {Function} requestFn
 * @param {string} requestName
 * @param {number} retryCount
 * @returns {Promise<any>}
 */
async function executeWithRetry(requestFn, requestName, retryCount = 0) {
  try {
    return await requestFn();
  } catch (error) {
    const isNetworkError =
      error.message.includes("socket hang up") ||
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("ECONNREFUSED");

    const isServerError = error.response && error.response.status >= 500;

    const isAuthError =
      error.response &&
      (error.response.status === 401 || error.response.status === 403);

    if (isAuthError) {
      if (allTokens.length > 1) {
        logToFile(
          `Auth error with current token, switching to next token`,
          {
            error: error.message,
            previousTokenIndex: currentTokenIndex,
          },
          false
        );

        switchToNextToken();
        return executeWithRetry(
          requestFn,
          `${requestName} (with new token)`,
          0
        );
      }

      logToFile("Auth error with all tokens, attempting automatic refresh", {
        error: error.message,
      });

      const refreshed = await refreshExpiredToken();
      if (refreshed) {
        log("Token refreshed successfully, retrying request", "success");
        return executeWithRetry(
          requestFn,
          `${requestName} (with refreshed token)`,
          0
        );
      }
    }

    if ((isNetworkError || isServerError) && retryCount < MAX_RETRIES) {
      const nextRetryCount = retryCount + 1;
      const delay = RETRY_DELAY_MS * Math.pow(RETRY_MULTIPLIER, retryCount);

      logToFile(
        `${requestName} failed (${
          error.message
        }). Retrying (${nextRetryCount}/${MAX_RETRIES}) in ${delay / 1000}s...`,
        {
          error: error.message,
          retry: nextRetryCount,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
        },
        false
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      return executeWithRetry(requestFn, requestName, nextRetryCount);
    }

    throw error;
  }
}

/**
 * @param {boolean} switchToken
 * @throws {Error}
 * @returns {Promise<string>}
 */
async function login(switchToken = false) {
  try {
    log("Starting login with session token...", "info");
    logToFile("Starting login with session token");

    if (switchToken || !sessionToken) {
      if (switchToken) {
        switchToNextToken();
      } else {
        sessionToken = getCurrentSessionToken();
      }
    }

    if (!sessionToken) {
      const error = new Error(
        "No session token found. Please add session-token.key file with at least one token."
      );
      log(error.message, "error");
      logToFile("Login failed - no token file or empty file");
      throw error;
    }

    log("Session token loaded", "info");

    log("Validating session token...", "info");

    const validateRequest = async () => {
      log("Testing session token validity...", "info");
      const response = await axios.get(`${config.BASE_URL}/me`, {
        headers: getAuthHeaders(),
      });

      logApiResponse("/me", response.data, response.status, response.headers);
      cachedUserInfo = response.data;
      return response.data;
    };

    try {
      await executeWithRetry(validateRequest, "Token validation");

      log(
        `Session token is valid! Account ${currentTokenIndex + 1}/${
          allTokens.length
        }`,
        "success"
      );
      logToFile("Login successful with session token", {
        userId: cachedUserInfo.user_id,
        authProvider: cachedUserInfo.auth_provider,
        tokenIndex: currentTokenIndex,
        totalTokens: allTokens.length,
      });

      return sessionToken;
    } catch (error) {
      if (allTokens.length > 1) {
        log("Token invalid, trying next token...", "warning");
        switchToNextToken();
        return login(false);
      }

      log(
        "Token invalid and no alternatives available, attempting refresh...",
        "warning"
      );
      const refreshed = await refreshExpiredToken();
      if (refreshed) {
        log("Tokens refreshed successfully, retrying login", "success");
        return login(false);
      }

      throw error;
    }
  } catch (error) {
    const errorMsg = `Login failed: ${error.message}`;
    log(errorMsg, "error");
    logToFile("Login failed", { error: error.message });

    sessionToken = null;
    throw error;
  }
}

/**
 * @param {boolean} useCache
 * @returns {Promise<Object>}
 */
async function getUserInfo(useCache = false) {
  if (useCache && cachedUserInfo) {
    logToFile("Returning user info from cache");
    return cachedUserInfo;
  }

  try {
    log("Getting user information...", "info");
    logToFile("Getting user information");

    const headers = getAuthHeaders();

    const getUserRequest = async () => {
      logApiRequest("GET", `${config.BASE_URL}/me`, null, headers);

      const response = await axios.get(`${config.BASE_URL}/me`, {
        headers: headers,
        timeout: 10000,
      });

      logApiResponse("/me", response.data, response.status, response.headers);

      return response.data;
    };

    const userData = await executeWithRetry(getUserRequest, "Get user info");

    log("User info retrieved successfully", "success");

    cachedUserInfo = userData;

    return userData;
  } catch (error) {
    const errorMsg = `Error getting user info: ${error.message}`;
    log(errorMsg, "error");

    logApiError("/me", error);

    throw error;
  }
}

/**
 * Helper function to make any API request with retry
 * @param {string} method
 * @param {string} endpoint
 * @param {Object} data -
 * @param {Object} additionalHeaders
 * @returns {Promise<Object>}
 */
async function makeApiRequest(
  method,
  endpoint,
  data = null,
  additionalHeaders = {}
) {
  try {
    const headers = getAuthHeaders(additionalHeaders);
    const url = `${config.BASE_URL}${endpoint}`;

    const apiRequest = async () => {
      logApiRequest(method, url, data, headers);

      const requestConfig = {
        method,
        url,
        headers,
        timeout: 10000,
      };

      if (data) {
        requestConfig.data = data;
      }

      const response = await axios(requestConfig);

      logApiResponse(
        endpoint,
        response.data,
        response.status,
        response.headers
      );

      return response.data;
    };

    return await executeWithRetry(apiRequest, `${method} ${endpoint}`);
  } catch (error) {
    const errorMsg = `API request failed (${method} ${endpoint}): ${error.message}`;
    log(errorMsg, "error");
    logApiError(endpoint, error);
    throw error;
  }
}

module.exports = {
  verifyToken,
  verifyAndCleanupTokens,
  login,
  getUserInfo,
  getSessionToken,
  getAuthHeaders,
  getCurrentSessionToken,
  getTokenInfo,
  switchToNextToken,
  makeApiRequest,
  executeWithRetry,
  readAllSessionTokensFromFile,
  refreshExpiredToken,
};
