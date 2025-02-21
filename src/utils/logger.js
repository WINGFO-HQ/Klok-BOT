let logBox = null;
let chatBox = null;

/**
 * @param {Object} log
 * @param {Object} chat
 */
function setLogBoxes(log, chat) {
  logBox = log;
  chatBox = chat;
}

/**
 * @param {string} message
 * @param {string} type
 */
function log(message, type = "info") {
  if (!logBox) return;

  const colorMap = {
    info: "white",
    success: "green",
    warning: "yellow",
    error: "red",
  };

  const color = colorMap[type] || colorMap.info;
  logBox.log(`{${color}-fg}${message}{/${color}-fg}`);
}

/**
 * @param {string} message
 * @param {string} role
 */
function logChat(message, role) {
  if (!chatBox) return;

  const color = role === "user" ? "blue" : "green";
  const prefix = role === "user" ? "User: " : "AI: ";

  const maxLength = 100;
  const displayMessage =
    message.length > maxLength
      ? `${message.substring(0, maxLength)}...`
      : message;

  chatBox.log(`{${color}-fg}${prefix}${displayMessage}{/${color}-fg}`);
}

module.exports = {
  setLogBoxes,
  log,
  logChat,
};
