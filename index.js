const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const fs = require('fs');
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

// ─────────────────────────────────────
//  READ FROM ENVIRONMENT VARIABLES
// ─────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID  = process.env.OWNER_ID;

if (!BOT_TOKEN || !CLIENT_ID || !OWNER_ID) {
  console.error("❌ Missing required env vars: BOT_TOKEN, CLIENT_ID, OWNER_ID");
  process.exit(1);
}
// ─────────────────────────────────────

const DB_FILE   = "./data.json";
const KEYS_FILE = "./keys.json";

// Customize this delay (in milliseconds) between each channel send
const CHANNEL_DELAY_MS = 10000; // 10 seconds – safe & human-like

function loadDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, JSON.stringify({}, null, 2));
  return JSON.parse(fs.readFileSync(KEYS_FILE));
}
function saveKeys(k) { fs.writeFileSync(KEYS_FILE, JSON.stringify(k, null, 2)); }

const activeJobs = {};

function stopJob(uid) {
  if (activeJobs[uid]) {
    clearTimeout(activeJobs[uid].timer);
    delete activeJobs[uid];
  }
}

async function sendSelfMsg(userToken, channelId, message) {
  try {
    const res = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': userToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ content: message })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.message || JSON.stringify(data) };
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function scheduleJob(uid, cfg) {
  stopJob(uid);
  const fire = async () => {
    for (let i = 0; i < cfg.channelIds.length; i++) {
      const channelId = cfg.channelIds[i];
      const result = await sendSelfMsg(cfg.userToken, channelId, cfg.message);
      if (!result.ok) {
        console.error(`[${uid}] Failed to send to ${channelId}: ${result.error}`);
        // Continue to next channel anyway
      }
      // Wait between sends (10 seconds now)
      if (i < cfg.channelIds.length - 1) {
        await delay(CHANNEL_DELAY_MS);
      }
    }
    // Schedule next run
    const base = cfg.intervalMin * 60000;
    const jitter = (Math.random() * 4 - 2) * 60000;
    const nextDelay = Math.max(base + jitter, 60000);
    activeJobs[uid].timer = setTimeout(fire, nextDelay);
  };
  activeJobs[uid] = { ...cfg, timer: null };
  fire(); // Start immediately without a test message
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('claim').setDescription('Claim your Auto-Adv license key')
    .addStringOption(o => o.setName('key').setDescription('Your license key').setRequired(true)),
  new SlashCommandBuilder()
    .setName('panel').setDescription('Open your Auto-Adv control panel'),
  new SlashCommandBuilder()
    .setName('status').setDescription('Check if your auto-adv is running'),
  new SlashCommandBuilder()
    .setName('stop').setDescription('Stop your auto-adv'),
  new SlashCommandBuilder()
    .setName('genkeys').setDescription('[Owner only] Generate license keys')
    .addIntegerOption(o => o.setName('amount').setDescription('How many keys (max 100)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('listkeys').setDescription('[Owner only] List all keys'),
  new SlashCommandBuilder()
    .setName('revokekey').setDescription('[Owner only] Revoke a users key')
    .addUserOption(o => o.setName('user').setDescription('User to revoke').setRequired(true)),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Bot ready: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Slash commands registered');
});

client.on('interactionCreate', async interaction => {

  // ─── OWNER COMMANDS ──────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'genkeys') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: 'Owner only.', ephemeral: true });
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    const keys = loadKeys();
    const generated = [];
    for (let i = 0; i < amount; i++) {
      const rand = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const key = `PIKE-${rand()}-${rand()}-${rand()}`;
      keys[key] = { claimed: false, claimedBy: null, claimedAt: null };
      generated.push(key);
    }
    saveKeys(keys);
    fs.writeFileSync('./generated_keys.txt', generated.join('\n'));
    return interaction.reply({
      content: `Generated **${amount}** keys.`,
      files: ['./generated_keys.txt'],
      ephemeral: true
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'listkeys') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: 'Owner only.', ephemeral: true });
    const keys = loadKeys();
    const total = Object.keys(keys).length;
    const claimed = Object.values(keys).filter(v => v.claimed).length;
    const lines = Object.entries(keys).map(([k, v]) => {
      const status = v.claimed ? 'CLAIMED  ' : 'AVAILABLE';
      const by = v.claimedBy ? ` | user: ${v.claimedBy}` : '';
      return `[${status}] ${k}${by}`;
    });
    const text = `Total: ${total} | Claimed: ${claimed} | Available: ${total - claimed}\n${'─'.repeat(60)}\n` + lines.join('\n');
    fs.writeFileSync('./keys_list.txt', text);
    return interaction.reply({ content: `**${total}** keys total, **${claimed}** claimed:`, files: ['./keys_list.txt'], ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'revokekey') {
    if (interaction.user.id !== OWNER_ID)
      return interaction.reply({ content: 'Owner only.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const db = loadDB();
    const keys = loadKeys();
    if (!db.users[target.id])
      return interaction.reply({ content: `<@${target.id}> has no key.`, ephemeral: true });
    const userKey = db.users[target.id].key;
    stopJob(target.id);
    if (keys[userKey]) { keys[userKey].claimed = false; keys[userKey].claimedBy = null; saveKeys(keys); }
    delete db.users[target.id];
    saveDB(db);
    return interaction.reply({ content: `Revoked key from <@${target.id}>. Key \`${userKey}\` is now available again.`, ephemeral: true });
  }

  // ─── USER COMMANDS ──────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'claim') {
    const keyInput = interaction.options.getString('key').trim().toUpperCase();
    const keys = loadKeys();
    const db   = loadDB();
    const uid  = interaction.user.id;
    if (db.users[uid]?.key)
      return interaction.reply({ content: 'You already have a key! Use `/panel` to manage it.', ephemeral: true });
    const keyData = keys[keyInput];
    if (!keyData)
      return interaction.reply({ content: 'Invalid key. Double check it and try again.', ephemeral: true });
    if (keyData.claimed)
      return interaction.reply({ content: 'This key has already been claimed by someone.', ephemeral: true });

    keys[keyInput] = { claimed: true, claimedBy: uid, claimedAt: new Date().toISOString() };
    saveKeys(keys);
    db.users[uid] = { key: keyInput, config: null };
    saveDB(db);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🔑 Key Claimed')
      .setDescription(`<@${uid}> has claimed an **ADVANCED** key!`)
      .addFields(
        { name: 'Key',     value: `\`${keyInput}\``, inline: false },
        { name: 'User ID', value: `\`${uid}\``, inline: true }
      )
      .setFooter({ text: 'Use /panel to set up your auto-adv' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    const db  = loadDB();
    const uid = interaction.user.id;
    if (!db.users[uid]?.key)
      return interaction.reply({ content: 'You need to `/claim` a key first.', ephemeral: true });

    const isRunning = !!activeJobs[uid];
    const cfg = db.users[uid].config || {};
    const channelDisplay = cfg.channelIds && cfg.channelIds.length > 0 
      ? cfg.channelIds.map(id => `<#${id}>`).join(', ') 
      : '`Not set`';
    const channelCount = cfg.channelIds ? cfg.channelIds.length : 0;

    const embed = new EmbedBuilder()
      .setColor(isRunning ? 0x57F287 : 0xED4245)
      .setTitle('⚙️ Auto-Adv Panel')
      .setDescription('Control your auto-advertisement.')
      .addFields(
        { name: '📡 Status',   value: isRunning ? '🟢 **Running**' : '🔴 **Stopped**', inline: true },
        { name: '📢 Channels',  value: channelDisplay, inline: false },
        { name: '📊 Channel Count', value: `\`${channelCount}/10\``, inline: true },
        { name: '⏱️ Interval', value: cfg.intervalMin ? `\`${cfg.intervalMin} min\`` : '`Not set`', inline: true },
      )
      .setFooter({ text: 'Your token is only used to send messages as you.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_setup').setLabel('⚙️ Setup / Edit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_start').setLabel('▶ Start').setStyle(ButtonStyle.Success).setDisabled(isRunning || !cfg.userToken),
      new ButtonBuilder().setCustomId('panel_stop').setLabel('■ Stop').setStyle(ButtonStyle.Danger).setDisabled(!isRunning),
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'status') {
    const uid = interaction.user.id;
    const db  = loadDB();
    if (!db.users[uid]?.key)
      return interaction.reply({ content: 'No key claimed. Use `/claim` first.', ephemeral: true });
    const cfg = db.users[uid].config || {};
    const channelCount = cfg.channelIds ? cfg.channelIds.length : 0;
    return interaction.reply({
      content: activeJobs[uid]
        ? `🟢 Running — posting to **${channelCount}** channel${channelCount > 1 ? 's' : ''} every ~**${cfg.intervalMin} minutes** with 10s between each channel.`
        : '🔴 Stopped — use `/panel` to start.',
      ephemeral: true
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'stop') {
    const uid = interaction.user.id;
    if (!activeJobs[uid])
      return interaction.reply({ content: 'Nothing is currently running.', ephemeral: true });
    stopJob(uid);
    return interaction.reply({ content: '🔴 Auto-adv stopped.', ephemeral: true });
  }

  // ─── BUTTONS & MODALS ──────────────────────────
  if (interaction.isButton() && interaction.customId === 'panel_setup') {
    const uid = interaction.user.id;
    const cfg = loadDB().users[uid]?.config || {};
    const modal = new ModalBuilder().setCustomId('modal_setup').setTitle('Auto-Adv Setup');
    
    const channelIdsStr = cfg.channelIds ? cfg.channelIds.join(', ') : '';
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('userToken').setLabel('Your Discord Token')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Browser Discord → F12 → Network → send a msg → Authorization header')
          .setValue(cfg.userToken || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('channelIds').setLabel('Channel IDs (max 10, comma separated)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1234567890, 0987654321, 1122334455')
          .setValue(channelIdsStr).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('intervalMin').setLabel('Interval in minutes (e.g. 30)')
          .setStyle(TextInputStyle.Short).setPlaceholder('30')
          .setValue(cfg.intervalMin ? String(cfg.intervalMin) : '30').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('message').setLabel('Your advertisement message')
          .setStyle(TextInputStyle.Paragraph).setPlaceholder('Type your full ad here…')
          .setValue(cfg.message || '').setRequired(true)
      ),
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_setup') {
    const uid         = interaction.user.id;
    const userToken   = interaction.fields.getTextInputValue('userToken').trim();
    const channelIdsInput = interaction.fields.getTextInputValue('channelIds').trim();
    const intervalMin = Math.max(parseInt(interaction.fields.getTextInputValue('intervalMin')) || 30, 1);
    const message     = interaction.fields.getTextInputValue('message');
    
    const channelIds = channelIdsInput.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (channelIds.length === 0) {
      return interaction.reply({ content: '❌ You must specify at least one channel ID.', ephemeral: true });
    }
    if (channelIds.length > 10) {
      return interaction.reply({ content: '❌ Maximum 10 channels allowed. You provided ' + channelIds.length + '.', ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    // Test first channel (only one test to avoid extra sends)
    const test = await sendSelfMsg(userToken, channelIds[0], message);
    if (!test.ok)
      return interaction.editReply(`❌ Test failed on channel ${channelIds[0]}: \`${test.error}\`\nCheck your token and channel ID.`);
    
    // (Optional) test second channel with delay – but we'll skip to reduce risk
    // We trust the user entered correct IDs.
    
    const db = loadDB();
    if (!db.users[uid]) return interaction.editReply('No key found. Use /claim first.');
    db.users[uid].config = { userToken, channelIds, intervalMin, message };
    saveDB(db);
    scheduleJob(uid, { userToken, channelIds, intervalMin, message });
    
    const channelMentions = channelIds.map(id => `<#${id}>`).join(', ');
    return interaction.editReply(
      `✅ **Saved and started!**\nPosting to **${channelIds.length}** channel${channelIds.length > 1 ? 's' : ''}: ${channelMentions}\nEvery **~${intervalMin} minutes** with **10 seconds** between each channel.\nUse \`/stop\` to stop anytime.`
    );
  }

  // ─── START BUTTON – NO TEST ──────────────────
  if (interaction.isButton() && interaction.customId === 'panel_start') {
    const uid = interaction.user.id;
    const db = loadDB();
    const userData = db.users[uid];
    if (!userData) return interaction.reply({ content: 'You have not claimed a key.', ephemeral: true });
    const cfg = userData.config;
    if (!cfg) return interaction.reply({ content: 'No config yet. Use Setup first.', ephemeral: true });
    if (!cfg.channelIds || cfg.channelIds.length === 0) {
      return interaction.reply({ content: 'No channels configured. Use Setup to add channels.', ephemeral: true });
    }

    stopJob(uid);
    scheduleJob(uid, cfg);

    return interaction.reply({
      content: `✅ Started! Posting to **${cfg.channelIds.length}** channel${cfg.channelIds.length > 1 ? 's' : ''} every ~**${cfg.intervalMin}** minutes with 10s between each.`,
      ephemeral: true
    });
  }

  if (interaction.isButton() && interaction.customId === 'panel_stop') {
    stopJob(interaction.user.id);
    return interaction.reply({ content: '🔴 Auto-adv stopped.', ephemeral: true });
  }
});

client.login(BOT_TOKEN);
