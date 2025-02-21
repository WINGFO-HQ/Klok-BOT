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

/**
 * @returns {string|null}
 */
function getSessionToken() {
  return sessionToken;
}

/**
 * @returns {string|null}
 */
function readSessionTokenFromFile() {
  try {
    if (fileExists(SESSION_TOKEN_PATH)) {
      const token = readFile(SESSION_TOKEN_PATH);
      if (token && token.trim().length > 0) {
        logToFile("Read session token from file", {
          tokenLength: token.length,
          tokenPreview: token.substring(0, 10) + "...",
        });
        return token.trim();
      }
    }
    return null;
  } catch (error) {
    logToFile("Error reading session token from file", {
      error: error.message,
    });
    return null;
  }
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
 * @throws {Error}
 * @returns {Promise<string>}
 */
async function login() {
  try {
    log("Starting login with session token...", "info");
    logToFile("Starting login with session token");

    const token = readSessionTokenFromFile();

    if (!token) {
      const error = new Error(
        "No session token found. Please add session-token.key file."
      );
      log(error.message, "error");
      logToFile("Login failed - no token file");
      throw error;
    }

    sessionToken = token;
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

    await executeWithRetry(validateRequest, "Token validation");

    log("Session token is valid!", "success");
    logToFile("Login successful with session token", {
      userId: cachedUserInfo.user_id,
      authProvider: cachedUserInfo.auth_provider,
    });

    return sessionToken;
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
 * @param {string} method
 * @param {string} endpoint
 * @param {Object} data
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
  readSessionTokenFromFile,
  makeApiRequest,
  executeWithRetry,
};
