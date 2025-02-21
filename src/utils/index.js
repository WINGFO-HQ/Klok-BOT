const fileUtils = require("./file");
const logger = require("./logger");
const fileLogger = require("./file-logger");

fileLogger.setUILogger(logger.log);

module.exports = {
  ...fileUtils,
  ...logger,
  ...fileLogger,
};
