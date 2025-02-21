const config = require("../../config");
const { makeApiRequest } = require("./auth");
const { setSelectedModel } = require("./chat");
const { log, logToFile } = require("../utils");

let modelsCache = null;

/**
 * @param {boolean} forceRefresh
 * @returns {Promise<Array>}
 */
async function getModels(forceRefresh = false) {
  try {
    if (modelsCache && !forceRefresh) {
      logToFile("Returning models from cache", {
        modelCount: modelsCache.length,
      });
      return modelsCache;
    }

    log("Getting available models...", "info");
    logToFile("Getting available models");

    const response = await makeApiRequest("GET", "/models");

    modelsCache = response;

    const modelInfo = modelsCache.map((model) => ({
      name: model.name,
      display: model.display,
      id: model.id,
      is_pro: model.is_pro,
      active: model.active,
    }));

    log(`Retrieved ${modelsCache.length} available models`, "success");
    logToFile(`Retrieved ${modelsCache.length} available models`, {
      models: modelInfo,
    });

    return modelsCache;
  } catch (error) {
    throw error;
  }
}

/**
 * @returns {Promise<string>}
 */
async function selectDefaultModel() {
  try {
    const models = await getModels();

    const modelStatuses = models.map((model) => ({
      name: model.name,
      is_pro: model.is_pro,
      active: model.active,
    }));

    logToFile("Available models for selection", { models: modelStatuses });

    const defaultModel = models.find(
      (model) => !model.is_pro && model.active
    )?.name;

    if (!defaultModel) {
      const error = new Error("No suitable default model found");
      logToFile("No suitable default model found", { models: modelStatuses });
      throw error;
    }

    setSelectedModel(defaultModel);
    log(`Default model selected: ${defaultModel}`, "success");
    logToFile(`Default model selected: ${defaultModel}`);

    return defaultModel;
  } catch (error) {
    const errorMsg = `Error selecting default model: ${error.message}`;
    log(errorMsg, "error");
    logToFile("Error selecting default model", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  getModels,
  selectDefaultModel,
};
