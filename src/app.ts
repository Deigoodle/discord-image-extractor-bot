import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';

import { handleReady } from '@/handlers/handleReady';
import { handleInteraction } from '@/handlers/handleInteracion';
import { handleMessage } from '@/handlers/handleMessage';
import { loadState } from '@/state/monitoredChannels';
import { googleDriveService } from '@/services/googleDriveService';
import { createLogger } from '@/services/logger';

const logger = createLogger('app');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.once(Events.ClientReady, handleReady);
client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.MessageCreate, handleMessage);

// Initialize services
async function start() {
  try {
    loadState();
    await googleDriveService.initialize();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

start();