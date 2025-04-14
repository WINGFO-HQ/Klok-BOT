const axios = require("axios");
const { log, logToFile, readFile, fileExists } = require("../utils");
const config = require("../../config");

function getCapsolverApiKey() {
  if (fileExists(config.CAPSOLVER_API_KEY_PATH)) {
    return readFile(config.CAPSOLVER_API_KEY_PATH).trim();
  } else if (process.env.CAPSOLVER_API_KEY) {
    return process.env.CAPSOLVER_API_KEY;
  }
  return null;
}

async function getRecaptchaToken() {
  try {
    log("Obtaining reCAPTCHA token via Capsolver...", "info");
    logToFile("Requesting reCAPTCHA token from Capsolver");

    const apiKey = getCapsolverApiKey();

    if (!apiKey) {
      throw new Error("Capsolver API key not found");
    }

    const createTaskPayload = {
      clientKey: apiKey,
      task: {
        type: "ReCaptchaV3EnterpriseTaskProxyLess",
        websiteURL: "https://klokapp.ai/",
        isEnterprise: true,
      },
    };

    const createTaskResponse = await axios.post(
      "https://api.capsolver.com/createTask",
      createTaskPayload
    );

    if (createTaskResponse.data.errorId) {
      throw new Error(
        `Capsolver error: ${createTaskResponse.data.errorDescription}`
      );
    }

    const taskId = createTaskResponse.data.taskId;
    if (!taskId) {
      throw new Error("Failed to create Capsolver task: No task ID returned");
    }

    log(`Capsolver task created, waiting for solution...`, "info");
    logToFile(`Capsolver task created with ID: ${taskId}`);

    let token = null;
    let maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      attempts++;
      log(
        `Checking Capsolver result (attempt ${attempts}/${maxAttempts})...`,
        "info"
      );

      const getResultPayload = {
        clientKey: apiKey,
        taskId: taskId,
      };

      const resultResponse = await axios.post(
        "https://api.capsolver.com/getTaskResult",
        getResultPayload
      );

      if (resultResponse.data.errorId) {
        throw new Error(
          `Capsolver error: ${resultResponse.data.errorDescription}`
        );
      }

      const status = resultResponse.data.status;

      if (status === "ready") {
        token = resultResponse.data.solution.gRecaptchaResponse;
        log("reCAPTCHA token obtained successfully", "success");
        logToFile("reCAPTCHA token obtained successfully via Capsolver");
        return token;
      }

      if (status === "failed") {
        throw new Error(
          `Capsolver failed to solve the captcha: ${
            resultResponse.data.errorDescription || "Unknown error"
          }`
        );
      }
    }

    throw new Error("Timed out waiting for Capsolver solution");
  } catch (error) {
    log(`Error obtaining reCAPTCHA token: ${error.message}`, "error");
    logToFile("Failed to obtain reCAPTCHA token from Capsolver", {
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  getRecaptchaToken,
};
