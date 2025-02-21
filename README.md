# KlokApp Chat Automation

Terminal-based automation tool for KlokApp AI chat with session token authentication and resilient retry mechanism.

## Features

- **Session token authentication** - Direct login using KlokApp session token
- **Interactive dashboard** - Beautiful terminal UI with blessed and blessed-contrib
- **Automated prompts** - Generate creative prompts using Groq API
- **Rate limit management** - Automatic cooldown when rate limits are reached
- **Point tracking** - Real-time monitoring of inference points
- **Automatic retry** - Resilient handling of network and server errors
- **Stream verification** - Point-based verification when streams are aborted
- **Detailed logging** - Comprehensive logging for monitoring and debugging

## Directory Structure

```
klokapp-automation/
├── package.json         # Project dependencies
├── session-token.key    # Session token for login (required)
├── groq-api.key         # Groq API key
├── info.log             # Log file for monitoring
├── index.js             # Main entry point
├── config.js            # App configuration
└── src/
    ├── api/             # KlokApp API functions
    ├── ui/              # UI components
    ├── services/        # External services
    └── utils/           # Utilities
```

## Setup

1. **Clone Repository**:

   ```
   git clone https://github.com/WINGFO-HQ/Klok-BOT.git
   cd Klok-BOT
   ```

2. **Install dependencies**:

   ```
   npm install
   ```

3. **KlokApp Account**:

   - Register at [KlokApp](https://klokapp.ai?referral_code=KE245QJV)
   - After registering, you'll need to get your session token

4. **Session Token** (Required):

   - Login to KlokApp in your browser
   - Open browser developer tools (F12)
   - Go to Application tab > Local Storage > https://klokapp.ai
   - Find and copy the `session_token` value
   - Edit `session-token.key` file with this value:
     ```
     echo "YOUR_SESSION_TOKEN_HERE" > session-token.key
     ```

5. **Groq API Key** (Required):
   - Get your API key from [Groq](https://console.groq.com/)
   - Edit `groq-api.key` file with this key:
     ```
     echo "YOUR_GROQ_API_KEY_HERE" > groq-api.key
     ```

## Running

Start the automation:

```
npm start
```

## Keyboard Controls

- `S` - Start automation (requires session-token.key file)
- `P` - Pause automation
- `R` - Resume automation
- `L` - Clear log file and create backup
- `I` - Display file information (log size, session token status)
- `H` - Show help
- `Q` or `Esc` - Quit application

## Retry Mechanism

This application includes a sophisticated retry mechanism to handle connectivity issues:

- **Automatic Retry**: If network or server errors (5xx) occur, the script will automatically retry
- **Exponential Backoff**: Each failed attempt will increase the waiting time exponentially
- **Error Logging**: All errors and retries are recorded in the log for debugging
- **Automatic Recovery**: The system will attempt to continue automation after server returns to normal

## Stream Handling

The application has a robust mechanism for handling aborted streams:

- **Point Verification**: If a stream is aborted, the app will check if points increased to verify success
- **Automatic Continuation**: Even with stream errors, the automation will continue running
- **Consecutive Error Management**: If multiple errors occur in sequence, the app will take longer breaks

## Log Features

- All program activities and API responses are recorded in the `info.log` file
- Detailed log format for API debugging
- Log file automatically rotated when reaching 10MB
- Up to 3 backup files (`info.log.1`, `info.log.2`, `info.log.3`) are kept
- Press `L` to clear logs and create manual backup
- Press `I` to view current log file information

## Automation Flow

1. Login with session token
2. Get user information
3. Get user points
4. Get available models list
5. Select active non-pro model
6. Create new chat thread
7. Automation loop:
   - Check rate limit
   - Generate prompt with Groq API
   - Send chat message
   - Update points and rate limit information
   - If rate limit is reached, enter cooldown
   - Wait 3-10 seconds before next message
   - Repeat until program is stopped

## Additional Commands

Clear log file from command line:

```
npm run clear-logs
```

## Main Dependencies

- `axios` - HTTP client
- `blessed` and `blessed-contrib` - Terminal UI
- `groq-sdk` - Generate prompts with Groq API
- `date-fns` - Date and time formatting

## Note

- This script is for educational and demonstration purposes only
- Session tokens have a limited validity period. If a token expires, get a new token and update the `session-token.key` file
- KlokApp rate limits may change, the script will adjust automatically
- If you frequently encounter "socket hang up" errors, the KlokApp server may be busy or unstable - the script will automatically retry

## Links

- [Github](https://github.com/WINGFO-HQ)
- [Telegram](https://t.me/infomindao)
