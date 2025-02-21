const blessed = require("blessed");
const contrib = require("blessed-contrib");
const { setLogBoxes } = require("../utils/logger");

const widgets = {};

/**
 * @param {Object} grid
 * @param {number} startRow
 * @returns {Object}
 */
function createWidgets(grid, startRow = 0) {
  widgets.logBox = grid.set(startRow, 0, 6, 6, contrib.log, {
    fg: "green",
    label: "Log",
    tags: true,
  });

  widgets.chatBox = grid.set(startRow, 6, 6, 6, contrib.log, {
    fg: "white",
    label: "Chat History",
    tags: true,
  });

  widgets.userInfo = grid.set(startRow + 6, 0, 3, 4, contrib.table, {
    keys: true,
    fg: "white",
    label: "User Info",
    columnSpacing: 2,
    columnWidth: [15, 25],
  });

  widgets.pointsGauge = grid.set(startRow + 6, 4, 3, 2, contrib.gauge, {
    label: "Points",
    percent: 0,
    stroke: "green",
    fill: "white",
  });

  widgets.rateLimitGauge = grid.set(startRow + 6, 6, 3, 6, contrib.gauge, {
    label: "Rate Limit",
    percent: 100,
    stroke: "cyan",
    fill: "white",
  });

  widgets.modelsTable = grid.set(startRow + 9, 0, 3, 6, contrib.table, {
    keys: true,
    fg: "white",
    label: "Available Models",
    columnSpacing: 2,
    columnWidth: [20, 20, 10],
  });

  widgets.statusBox = grid.set(startRow + 9, 6, 3, 6, blessed.box, {
    label: "Status",
    content: "{center}Initializing...{/center}",
    tags: true,
    border: {
      type: "line",
    },
    style: {
      fg: "yellow",
      border: {
        fg: "white",
      },
    },
  });

  setLogBoxes(widgets.logBox, widgets.chatBox);

  return widgets;
}

/**
 * Update user info display
 * @param {Object} userInfo
 */
function updateUserInfo(userInfo) {
  if (!widgets.userInfo) return;

  widgets.userInfo.setData({
    headers: ["Field", "Value"],
    data: [
      [
        "User ID",
        userInfo.user_id ? userInfo.user_id.substring(0, 12) + "..." : "N/A",
      ],
      ["Auth Provider", userInfo.auth_provider || "N/A"],
      ["User Exists", userInfo.user_exists ? "Yes" : "No"],
      ["Tier", userInfo.tier || "N/A"],
    ],
  });
}

/**
 * Update points display
 * @param {Object} points
 */
function updatePointsDisplay(points) {
  if (!widgets.pointsGauge) return;

  const maxPoints = 100;
  const percentage = Math.min(100, (points.total / maxPoints) * 100);

  widgets.pointsGauge.setPercent(percentage);
  widgets.pointsGauge.setLabel(
    `Points: ${points.total} (Inf: ${points.inference})`
  );
}

/**
 * Update rate limit display
 * @param {Object} rateLimit
 */
function updateRateLimitDisplay(rateLimit) {
  if (!widgets.rateLimitGauge) return;

  const percentage = (rateLimit.remaining / rateLimit.limit) * 100;

  widgets.rateLimitGauge.setPercent(percentage);

  let resetTimeDisplay = "N/A";
  if (rateLimit.resetTime > 0) {
    const minutes = Math.floor(rateLimit.resetTime / 60);
    const seconds = rateLimit.resetTime % 60;
    resetTimeDisplay = `${minutes}m ${seconds}s`;
  }

  widgets.rateLimitGauge.setLabel(
    `Rate Limit: ${rateLimit.remaining}/${rateLimit.limit} (Reset: ${resetTimeDisplay})`
  );
}

/**
 * Update models table
 * @param {Array} models
 */
function updateModelsTable(models) {
  if (!widgets.modelsTable) return;

  widgets.modelsTable.setData({
    headers: ["Name", "Display", "Pro"],
    data: models.map((model) => [
      model.name,
      model.display,
      model.is_pro ? "Yes" : "No",
    ]),
  });
}

/**
 * Update status display
 * @param {string} status
 * @param {string} type
 */
function updateStatus(status, type = "info") {
  if (!widgets.statusBox) return;

  const colorMap = {
    info: "white",
    success: "green",
    warning: "yellow",
    error: "red",
  };

  const color = colorMap[type] || colorMap.info;

  widgets.statusBox.setContent(
    `{center}{${color}-fg}${status}{/${color}-fg}{/center}`
  );
}

/**
 * Start cooldown display
 * @param {number} seconds
 * @param {Function} onUpdate
 * @returns {Object}
 */
function startCooldownDisplay(seconds, onUpdate) {
  updateStatus(
    `Cooldown: ${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    "warning"
  );

  let remaining = seconds;

  const interval = setInterval(() => {
    remaining--;

    updateStatus(
      `Cooldown: ${Math.floor(remaining / 60)}m ${remaining % 60}s`,
      "warning"
    );

    if (onUpdate && typeof onUpdate === "function") {
      onUpdate(remaining);
    }

    if (remaining <= 0) {
      clearInterval(interval);
      updateStatus("Ready", "success");
    }
  }, 1000);

  return interval;
}

module.exports = {
  createWidgets,
  updateUserInfo,
  updatePointsDisplay,
  updateRateLimitDisplay,
  updateModelsTable,
  updateStatus,
  startCooldownDisplay,
  widgets,
};
