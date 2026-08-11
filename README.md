━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AUTO-ADV BOT — SETUP GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — Create the bot
  1. Go to https://discord.com/developers/applications
  2. Click New Application → give it a name
  3. Go to Bot tab → click Add Bot
  4. Click Reset Token → copy it (this is BOT_TOKEN)
  5. Copy Application ID from General Information (this is CLIENT_ID)
  6. Under Bot → Privileged Gateway Intents → enable all 3 toggles
  7. OAuth2 → URL Generator → tick "bot" and "applications.commands"
     → tick "Administrator" permission → copy URL → invite bot to server

STEP 2 — Fill in index.js
  Open index.js and fill in:
    BOT_TOKEN = your bot token
    CLIENT_ID = your application ID
    OWNER_ID  = your personal Discord user ID
                (Settings → Advanced → Developer Mode ON → right-click your name → Copy ID)

STEP 3 — Run the bot
  Install Node.js from https://nodejs.org
  Open terminal in the bot folder and run:
    npm install
    node index.js

STEP 4 — Generate keys
  In Discord, type:
    /genkeys amount:100
  It sends you a .txt file with 100 keys.
  Each key expires 10 days AFTER the user claims it.   <-- (Note: keys do not expire in this version)

STEP 5 — Give keys to users
  Send them a key. They do:
    /claim PIKE-XXXX-XXXX-XXXX
    /panel → Setup → paste their Discord token, channel ID, message, interval
  Done! It runs automatically as them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMANDS

User commands:
  /claim <key>   — Claim a license key
  /panel         — Open control panel (setup, start, stop)
  /status        — Check if auto-adv is running
  /stop          — Stop auto-adv

Owner commands:
  /genkeys <amount>   — Generate up to 100 keys
  /listkeys           — See all keys and who claimed them
  /revokekey <user>   — Remove a user's key

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ RATE LIMIT PROTECTION
  Messages are sent with a 2-second delay between each channel to avoid hitting Discord's rate limits.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
