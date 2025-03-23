const fs = require("fs");
const axios = require("axios");
const { Wallet } = require("ethers");
const crypto = require("crypto");
const path = require("path");
const config = require("../../config");
const { log, logToFile } = require("../utils");

async function signMessage(wallet) {
  const nonce = generateNonce();
  const timestamp = new Date().toISOString();
  const message = `klokapp.ai wants you to sign in with your Ethereum account:
${wallet.address}


URI: https://klokapp.ai/
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${timestamp}`;

  return {
    signature: await wallet.signMessage(message),
    message: message,
    nonce: nonce,
    timestamp: timestamp,
  };
}

function generateNonce() {
  return Buffer.from(crypto.randomBytes(48)).toString("hex");
}

async function authenticate(wallet) {
  try {
    const signResult = await signMessage(wallet);

    const payload = {
      signedMessage: signResult.signature,
      message: signResult.message,
      referral_code: `${config.REFERRAL_CODE}`,
    };

    log(`[INFO] Authenticating for ${wallet.address}...`, "info");
    logToFile(`Authenticating wallet`, {
      address: wallet.address,
      addressPreview: wallet.address.substring(0, 10) + "...",
    });

    const response = await axios.post(`${config.BASE_URL}/verify`, payload, {
      headers: config.DEFAULT_HEADERS,
      timeout: 60000, // Timeout 60s
    });

    const { session_token } = response.data;
    log(`[SUCCESS] Token received for ${wallet.address}`, "success");
    logToFile(`Authentication successful`, {
      address: wallet.address.substring(0, 10) + "...",
      tokenPreview: session_token.substring(0, 10) + "...",
    });

    const tokenPath = path.join(process.cwd(), "session-token.key");
    fs.appendFileSync(tokenPath, `${session_token}\n`);
    return { token: session_token, address: wallet.address };
  } catch (error) {
    log(`[ERROR] Failed for ${wallet.address}: ${error.message}`, "error");
    logToFile(`Authentication failed`, {
      address: wallet.address.substring(0, 10) + "...",
      error: error.message,
    });

    if (error.response) {
      log(
        `[ERROR] Status: ${error.response.status}, Data:`,
        error.response.data,
        "error"
      );
      logToFile(`Authentication error details`, {
        status: error.response.status,
        data: error.response.data,
      });
    }
    return null;
  }
}

module.exports = {
  authenticate,
  signMessage,
  generateNonce,
  authenticateAllWallets: async (privateKeys) => {
    const tokens = [];
    const refreshedWallets = [];

    if (!privateKeys || privateKeys.length === 0) {
      log("[ERROR] No private keys provided", "error");
      logToFile("No private keys provided for authentication");
      return tokens;
    }

    log(`[INFO] Authenticating ${privateKeys.length} wallets...`, "info");
    logToFile(`Starting authentication for ${privateKeys.length} wallets`);

    for (const key of privateKeys) {
      try {
        const wallet = new Wallet(key.trim());
        const result = await authenticate(wallet);

        if (result) {
          tokens.push(result.token);
          refreshedWallets.push({
            address: wallet.address.toLowerCase(),
            token: result.token.substring(0, 10) + "...",
          });
        }
      } catch (error) {
        log(`[ERROR] Invalid private key: ${error.message}`, "error");
        logToFile(`Invalid private key`, { error: error.message });
      }
    }

    log(
      `[INFO] Authentication complete. ${tokens.length}/${privateKeys.length} successful`,
      "info"
    );
    logToFile(`Authentication complete`, {
      successful: tokens.length,
      total: privateKeys.length,
      refreshedWallets: refreshedWallets.map(
        (w) => w.address.substring(0, 10) + "..."
      ),
    });

    return tokens;
  },
};
