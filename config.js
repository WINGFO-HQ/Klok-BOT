module.exports = {
  BASE_URL: "https://api1-pp.klokapp.ai/v1",

  GROQ_API_KEY_PATH: "./groq-api.key",

  GROQ_MODEL: "llama3-8b-8192",

  DEFAULT_HEADERS: {
    Origin: "https://klokapp.ai",
    Referer: "https://klokapp.ai/",
  },

  MIN_CHAT_DELAY: 3000,
  MAX_CHAT_DELAY: 10000,
};
