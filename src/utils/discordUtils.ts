import { ApplicationCommand } from 'discord.js';
import 'dotenv/config';
import { createLogger } from '@/services/logger';

const logger = createLogger('discordUtils');

export async function DiscordRequest(endpoint: string, options: any) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    logger.error(`Discord API error: ${res.status} - ${JSON.stringify(data)}`);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId: string, commands: ApplicationCommand[]) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    logger.info(`Installing ${commands.length} global commands...`);
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
    logger.info('Successfully registered application commands');
  } catch (err) {
    logger.error('Error installing global commands:', err);
    throw err;
  }
}