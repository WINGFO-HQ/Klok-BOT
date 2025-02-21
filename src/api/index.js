const auth = require("./auth");
const chat = require("./chat");
const models = require("./models");
const points = require("./points");
const rateLimit = require("./rate-limit");

module.exports = {
  auth,
  chat,
  models,
  points,
  rateLimit,
};
