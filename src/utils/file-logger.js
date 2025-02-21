const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");

const LOG_FILE_PATH = path.join(process.cwd(), "info.log");
const MAX_LOG_SIZE_MB = 10;
const BACKUP_COUNT = 3;

let uiLogger = null;

/**
 * @param {Function} logger
 */
function setUILogger(logger) {
  uiLogger = logger;
}

function checkLogSize() {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return;
    }

    const stats = fs.statSync(LOG_FILE_PATH);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB >= MAX_LOG_SIZE_MB) {
      rotateLogFile();
    }
  } catch (error) {
    console.error(`Error checking log file size: ${error.message}`);
  }
}

function rotateLogFile() {
  try {
    for (let i = BACKUP_COUNT; i > 0; i--) {
      const oldFile = `${LOG_FILE_PATH}.${i}`;

      if (fs.existsSync(oldFile) && i === BACKUP_COUNT) {
        fs.unlinkSync(oldFile);
      }

      if (i > 1) {
        const evenOlderFile = `${LOG_FILE_PATH}.${i - 1}`;
        if (fs.existsSync(evenOlderFile)) {
          fs.renameSync(evenOlderFile, oldFile);
        }
      }
    }

    if (fs.existsSync(LOG_FILE_PATH)) {
      fs.renameSync(LOG_FILE_PATH, `${LOG_FILE_PATH}.1`);
    }

    const header = `=== KlokApp Automation Log - Created at ${new Date().toISOString()} ===\n\n`;
    fs.writeFileSync(LOG_FILE_PATH, header);
  } catch (error) {
    console.error(`Error rotating log file: ${error.message}`);
  }
}

/**
 * @param {any} data
 * @param {number} indent
 * @returns {string}
 */
function formatData(data, indent = 0) {
  if (data === null || data === undefined) {
    return "null";
  }

  const spaces = " ".repeat(indent);

  try {
    if (typeof data === "string") {
      if (data.trim().startsWith("{") || data.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(data);
          return formatData(parsed, indent);
        } catch {
          return data;
        }
      }
      return data;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return "[]";

      let result = "[\n";
      data.forEach((item, index) => {
        result += `${spaces}  ${formatData(item, indent + 2)}`;
        if (index < data.length - 1) {
          result += ",";
        }
        result += "\n";
      });
      result += `${spaces}]`;
      return result;
    }

    if (typeof data === "object") {
      if (Object.keys(data).length === 0) return "{}";

      let result = "{\n";
      Object.entries(data).forEach(([key, value], index, arr) => {
        result += `${spaces}  "${key}": ${formatData(value, indent + 2)}`;
        if (index < arr.length - 1) {
          result += ",";
        }
        result += "\n";
      });
      result += `${spaces}}`;
      return result;
    }

    return String(data);
  } catch (error) {
    return `[Non-serializable data: ${error.message}]`;
  }
}

/**
 * @param {string} message
 * @param {Object} data
 * @param {boolean} showInUI
 * @param {string} type
 */
function logToFile(message, data = null, showInUI = true, type = "info") {
  try {
    checkLogSize();

    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    let logMessage = `[${timestamp}] ${message}`;

    if (data) {
      logMessage += `\nDATA: ${formatData(data)}\n`;
    }

    logMessage += "\n";

    fs.appendFileSync(LOG_FILE_PATH, logMessage);

    if (showInUI && uiLogger) {
      uiLogger(message, type);
    }
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

/**
 * @param {string} method
 * @param {string} endpoint
 * @param {Object} data
 * @param {Object} headers
 * @param {boolean} showInUI
 */
function logApiRequest(
  method,
  endpoint,
  data = null,
  headers = null,
  showInUI = true
) {
  try {
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    let logMessage = `[${timestamp}] API REQUEST: ${method} ${endpoint}\n`;

    if (headers) {
      const safeHeaders = { ...headers };

      if (safeHeaders["X-Session-Token"])
        safeHeaders["X-Session-Token"] = "***FILTERED***";
      if (safeHeaders["Authorization"])
        safeHeaders["Authorization"] = "***FILTERED***";

      logMessage += `HEADERS: ${formatData(safeHeaders)}\n`;
    }

    if (data) {
      logMessage += `REQUEST DATA: ${formatData(data)}\n`;
    }

    logMessage += "\n";

    fs.appendFileSync(LOG_FILE_PATH, logMessage);

    if (showInUI && uiLogger) {
      uiLogger(`API REQUEST: ${method} ${endpoint}`, "info");
    }
  } catch (error) {
    console.error(`Error logging API request: ${error.message}`);
  }
}

/**
 * @param {string} endpoint
 * @param {Object|string} response
 * @param {number} status
 * @param {Object} headers
 * @param {boolean} showInUI
 */
function logApiResponse(
  endpoint,
  response,
  status = 200,
  headers = null,
  showInUI = true
) {
  try {
    checkLogSize();

    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    let logMessage = `[${timestamp}] API RESPONSE: ${endpoint} (Status: ${status})\n`;

    if (headers) {
      logMessage += `RESPONSE HEADERS: ${formatData(headers)}\n`;
    }

    if (response !== undefined && response !== null) {
      logMessage += `RESPONSE BODY: ${formatData(response)}\n`;
    } else {
      logMessage += `RESPONSE BODY: <empty>\n`;
    }

    logMessage += "\n";

    fs.appendFileSync(LOG_FILE_PATH, logMessage);

    if (showInUI && uiLogger) {
      uiLogger(
        `API RESPONSE: ${endpoint} (${status})`,
        status >= 200 && status < 300 ? "success" : "error"
      );
    }
  } catch (error) {
    console.error(`Error logging API response: ${error.message}`);

    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const fallbackMsg = `[${timestamp}] API RESPONSE (Simplified - error in full logging): ${endpoint} (Status: ${status})\n\n`;
    fs.appendFileSync(LOG_FILE_PATH, fallbackMsg);
  }
}

/**
 * @param {string} endpoint
 * @param {Error} error
 * @param {boolean} showInUI
 */
function logApiError(endpoint, error, showInUI = true) {
  try {
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    let logMessage = `[${timestamp}] API ERROR: ${endpoint}\n`;

    const errorDetails = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    if (error.response) {
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.headers = error.response.headers;
      errorDetails.data = error.response.data;
    } else if (error.request) {
      errorDetails.request = "Request was made but no response received";
    }

    logMessage += `ERROR DETAILS: ${formatData(errorDetails)}\n\n`;

    fs.appendFileSync(LOG_FILE_PATH, logMessage);

    if (showInUI && uiLogger) {
      uiLogger(`API ERROR: ${endpoint} - ${error.message}`, "error");
    }
  } catch (err) {
    console.error(`Error logging API error: ${err.message}`);

    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const fallbackMsg = `[${timestamp}] API ERROR (Simplified): ${endpoint} - ${error.message}\n\n`;
    fs.appendFileSync(LOG_FILE_PATH, fallbackMsg);
  }
}

function clearLogFile() {
  try {
    const header = `=== KlokApp Automation Log - Cleared at ${new Date().toISOString()} ===\n\n`;
    fs.writeFileSync(LOG_FILE_PATH, header);
  } catch (error) {
    console.error(`Error clearing log file: ${error.message}`);
  }
}

function backupLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return;
    }

    const timestamp = format(new Date(), "yyyyMMdd_HHmmss");
    const backupPath = `${LOG_FILE_PATH}.backup_${timestamp}`;

    fs.copyFileSync(LOG_FILE_PATH, backupPath);

    return backupPath;
  } catch (error) {
    console.error(`Error backing up log file: ${error.message}`);
    return null;
  }
}

if (!fs.existsSync(LOG_FILE_PATH)) {
  try {
    const header = `=== KlokApp Automation Log - Created at ${new Date().toISOString()} ===\n\n`;
    fs.writeFileSync(LOG_FILE_PATH, header);
  } catch (error) {
    console.error(`Error creating log file: ${error.message}`);
  }
}

module.exports = {
  setUILogger,
  logToFile,
  logApiRequest,
  logApiResponse,
  logApiError,
  clearLogFile,
  backupLogFile,
  checkLogSize,
  rotateLogFile,
  formatData,
};
