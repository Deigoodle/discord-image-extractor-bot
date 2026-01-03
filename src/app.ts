import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';
import { handleReady } from '@/handlers/handleReady';
import { handleInteraction } from '@/handlers/handleInteracion';
import { handleMessage } from '@/handlers/handleMessage';

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

client.login(process.env.DISCORD_TOKEN);