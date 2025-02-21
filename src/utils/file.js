const fs = require("fs");

/**
 * @param {string} path
 * @returns {string}
 */
function readFile(path) {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch (error) {
    throw new Error(`Error reading file ${path}: ${error.message}`);
  }
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function fileExists(path) {
  try {
    return fs.existsSync(path);
  } catch (error) {
    return false;
  }
}

module.exports = {
  readFile,
  fileExists,
};
