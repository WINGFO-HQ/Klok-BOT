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

    if (isAuthError && allTokens.length > 1) {
      logToFile(
        `Auth error with current token, switching to next token`,
        {
          error: error.message,
          previousTokenIndex: currentTokenIndex,
        },
        false
      );

      switchToNextToken();

      return executeWithRetry(requestFn, `${requestName} (with new token)`, 0);
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
};
