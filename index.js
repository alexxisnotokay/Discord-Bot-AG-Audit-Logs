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
  console.error('Missing required environment variables!');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const LAST_LOG_ID_FILE = './last_log_id.txt';

function getLastLogId() {
  try {
    return fs.readFileSync(LAST_LOG_ID_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

function setLastLogId(id) {
  fs.writeFileSync(LAST_LOG_ID_FILE, id, 'utf-8');
}

async function fetchAuditLogs() {
  const url = `https://groups.roblox.com/v2/groups/${ROBLOX_GROUP_ID}/audit-logs?limit=25`;
  try {
    const res = await fetch(url, { headers: { 'x-api-key': ROBLOX_API_KEY } });
    if (!res.ok) {
      console.error(`Roblox API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('Fetch error:', err);
    return [];
  }
}

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

  // Filter logs newer than lastLogId
  const newLogs = lastLogId ? logs.filter(log => log.id > lastLogId) : logs;

  if (newLogs.length === 0) {
    console.log('No new audit logs.');
    return;
  }

  newLogs.reverse(); // Oldest first

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
  mainLoop();
  setInterval(mainLoop, Number(POLL_INTERVAL_MS));
});

client.login(DISCORD_BOT_TOKEN);
