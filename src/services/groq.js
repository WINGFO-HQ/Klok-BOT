const { Groq } = require("groq-sdk");
const config = require("../../config");
const { readFile, fileExists, log } = require("../utils");

let groqClient = null;

/**
 * @returns {Object}
 */
function initGroqClient() {
  try {
    if (groqClient) return groqClient;

    let apiKey;

    if (fileExists(config.GROQ_API_KEY_PATH)) {
      apiKey = readFile(config.GROQ_API_KEY_PATH);
    } else {
      apiKey = process.env.GROQ_API_KEY;
    }

    if (!apiKey) {
      throw new Error(
        "Groq API key not found. Please create groq-api.key file or set GROQ_API_KEY env variable."
      );
    }

    groqClient = new Groq({ apiKey });
    log("Groq client initialized successfully", "success");

    return groqClient;
  } catch (error) {
    log(`Error initializing Groq client: ${error.message}`, "error");
    throw error;
  }
}

/**
 * @returns {Promise<string>}
 */
async function generateUserMessage() {
  try {
    const client = initGroqClient();

    const completion = await client.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Generate a random, interesting question or prompt for an AI assistant. Keep it concise (max 2 sentences) and make it something that would lead to an engaging response.",
        },
        {
          role: "user",
          content: "Generate a single interesting prompt.",
        },
      ],
      model: config.GROQ_MODEL,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    log(`Error generating message with Groq: ${error.message}`, "error");
    return "Hi there, can you tell me something interesting?";
  }
}

module.exports = {
  initGroqClient,
  generateUserMessage,
};
