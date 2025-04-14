module.exports = {
  BASE_URL: "https://api1-pp.klokapp.ai/v1",
  GROQ_API_KEY_PATH: "./groq-api.key",
  GROQ_MODEL: "llama3-8b-8192",
  DEFAULT_HEADERS: {
    "content-type": "application/json",
    Origin: "https://klokapp.ai",
    Referer: "https://klokapp.ai/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Sec-Ch-Ua":
      '"Google Chrome";v="135", "Not-A-Brand";v="8", "Chromium";v="135"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
  },
  REFERRAL_CODE: {
    referral_code: "KE245QJV",
  },
  MIN_CHAT_DELAY: 3000,
  MAX_CHAT_DELAY: 10000,

  RECAPTCHA_SITE_KEY: "6LcZrRMrAAAAAKllb4TLb1CWH2LR7iNOKmT7rt3L",
  CAPSOLVER_API_KEY_PATH: "./capsolver-api.key",
};
