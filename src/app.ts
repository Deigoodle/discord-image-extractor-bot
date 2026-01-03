import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';
import { handleReady } from '@/handlers/handleReady';
import { handleInteraction } from '@/handlers/handleInteracion';
import { handleMessage } from '@/handlers/handleMessage';
import { loadState } from '@/state/monitoredChannels';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, handleReady);
client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.MessageCreate, handleMessage);

loadState(); // Load the state from data file
client.login(process.env.DISCORD_TOKEN);