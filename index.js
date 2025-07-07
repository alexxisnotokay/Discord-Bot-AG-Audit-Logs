const fs = require('fs');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const {
  ROBLOX_GROUP_ID,
  ROBLOX_API_KEY,
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  POLL_INTERVAL_MS = 60000,
} = process.env;

if (!ROBLOX_GROUP_ID || !ROBLOX_API_KEY || !DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  console.error('Missing one or more required environment variables.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const LAST_LOG_ID_FILE = './last_log_id.txt';

// Read last log ID from file or null
function getLastLogId() {
  try {
    const id = fs.readFileSync(LAST_LOG_ID_FILE, 'utf-8');
    return id.trim();
  } catch {
    return null;
  }
}

// Save last log ID to file
function setLastLogId(id) {
  fs.writeFileSync(LAST_LOG_ID_FILE, id, 'utf-8');
}

// Fetch recent audit logs from Roblox Group API
async function fetchAuditLogs() {
  const url = `https://groups.roblox.com/v2/groups/${ROBLOX_GROUP_ID}/audit-logs?limit=25`;
  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': ROBLOX_API_KEY },
    });
    if (!response.ok) {
      console.error(`Roblox API error: ${response.status} ${response.statusText}`);
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error('Fetch error:', err);
    return [];
  }
}

// Format a log entry into a readable Discord message
function formatLogEntry(log) {
  return `**${log.actionType}**
By: **${log.responsible.username}** (UserId: ${log.responsible.userId})
At: <t:${Math.floor(new Date(log.created).getTime() / 1000)}:F>
Details: ${log.description || 'No details provided.'}`;
}

async function mainLoop() {
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel) {
    console.error('Discord channel not found!');
    return;
  }

  let lastLogId = getLastLogId();

  const logs = await fetchAuditLogs();

  // Logs are usually ordered newest first
  // We want to send only new logs newer than lastLogId
  const newLogs = lastLogId
    ? logs.filter(log => log.id > lastLogId)
    : logs;

  if (newLogs.length === 0) {
    console.log('No new audit logs.');
    return;
  }

  // Send new logs oldest first to keep order
  newLogs.reverse();

  for (const log of newLogs) {
    try {
      await channel.send(formatLogEntry(log));
      setLastLogId(log.id);
      lastLogId = log.id;
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Run immediately, then at intervals
  mainLoop();
  setInterval(mainLoop, Number(POLL_INTERVAL_MS));
});

client.login(DISCORD_BOT_TOKEN);
