const {
  initDashboard,
  registerKeyHandler,
  render,
  updateStatus,
  widgets,
} = require("./src/ui");
const {
  initAutomation,
  startAutomation,
  pauseAutomation,
  resumeAutomation,
  getRunningState,
} = require("./src/automation");
const { auth } = require("./src/api");
const {
  log,
  logToFile,
  checkLogSize,
  clearLogFile,
  backupLogFile,
} = require("./src/utils");

async function main() {
  try {
    checkLogSize();

    initDashboard();

    log("Welcome to KlokApp Chat Automation", "info");
    log("Press S to start, P to pause, R to resume, H for help", "info");
    logToFile("KlokApp Chat Automation started");

    const hasSessionFile = auth.readSessionTokenFromFile() !== null;
    if (hasSessionFile) {
      log("Session token file found! Ready for login.", "success");
      updateStatus("Session token ready. Press S to start", "success");
    } else {
      log(
        "No session token file found. Please add session-token.key file.",
        "warning"
      );
      updateStatus("Missing session-token.key file", "warning");
    }

    render();

    await initAutomation();

    registerKeyHandler("s", () => {
      if (!getRunningState()) {
        const sessionToken = auth.readSessionTokenFromFile();
        if (!sessionToken) {
          log(
            "No session token file found. Please add session-token.key file.",
            "error"
          );
          updateStatus("Missing session-token.key", "error");
          render();
          return;
        }

        log("Starting automation...", "info");
        logToFile("Starting automation (user initiated)");
        startAutomation();
      } else {
        log("Automation already running", "warning");
        logToFile("Start request ignored - automation already running");
      }
    });

    registerKeyHandler("p", () => {
      if (getRunningState()) {
        log("Pausing automation...", "info");
        logToFile("Pausing automation (user initiated)");
        pauseAutomation();
      } else {
        log("Automation not running", "warning");
        logToFile("Pause request ignored - automation not running");
      }
    });

    registerKeyHandler("r", () => {
      if (!getRunningState()) {
        log("Resuming automation...", "info");
        logToFile("Resuming automation (user initiated)");
        resumeAutomation();
      } else {
        log("Automation already running", "warning");
        logToFile("Resume request ignored - automation already running");
      }
    });

    registerKeyHandler("l", () => {
      const backupPath = backupLogFile();
      clearLogFile();
      if (backupPath) {
        log(`Log file cleared and backed up to ${backupPath}`, "success");
        logToFile("Log file cleared and backed up (user initiated)");
      } else {
        log("Log file cleared", "success");
        logToFile("Log file cleared (user initiated)");
      }
      render();
    });

    registerKeyHandler("i", () => {
      const fs = require("fs");
      const path = require("path");

      try {
        const logPath = path.join(process.cwd(), "info.log");
        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          const lastModified = new Date(stats.mtime).toLocaleString();

          log(
            `Log file info: Size=${fileSizeMB}MB, Last Modified: ${lastModified}`,
            "info"
          );
          updateStatus(`Log file: ${fileSizeMB}MB`, "info");
        } else {
          log("Log file does not exist yet", "info");
        }
      } catch (error) {
        log(`Error reading log info: ${error.message}`, "error");
      }

      try {
        const sessionTokenPath = path.join(process.cwd(), "session-token.key");
        if (fs.existsSync(sessionTokenPath)) {
          const stats = fs.statSync(sessionTokenPath);
          const lastModified = new Date(stats.mtime).toLocaleString();
          log(
            `Session token file exists, last modified: ${lastModified}`,
            "info"
          );
        } else {
          log("No session token file found", "warning");
        }
      } catch (error) {
        log(`Error checking session token: ${error.message}`, "error");
      }

      setTimeout(() => {
        updateStatus("Running", getRunningState() ? "success" : "warning");
        render();
      }, 5000);

      render();
    });

    registerKeyHandler("h", () => {
      log("Controls:", "info");
      log("S - Start automation", "info");
      log("P - Pause automation", "info");
      log("R - Resume automation", "info");
      log("L - Clear log file and make backup", "info");
      log("I - Show file information", "info");
      log("H - Show this help", "info");
      log("Q or Esc - Quit application", "info");

      updateStatus("Help - press any key to continue", "info");
      render();

      setTimeout(() => {
        updateStatus(
          getRunningState() ? "Running" : "Ready",
          getRunningState() ? "success" : "info"
        );
        render();
      }, 8000);
    });
  } catch (error) {
    log(`Application error: ${error.message}`, "error");
    logToFile(`Application error: ${error.message}`, { stack: error.stack });
    updateStatus("Error", "error");
    render();
  }
}

main();
