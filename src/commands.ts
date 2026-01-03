import 'dotenv/config';
import { InstallGlobalCommands } from '@/utils';

/**
 * Command Types:
 * 1: Chat Input Command
 * 2: User Context Command
 * 3: Message Context Command
 * 4: User Slash Command
 * 5: Message Slash Command
 * 6: User Context Menu Command
 * 7: Message Context Menu Command
 * 8: User Context Menu Command
 */

const SETUP_COMMAND = {
  name: 'setup',
  description: 'Add a channel to monitor for images',
  type: 1,
  options: [
    {
      type: 7,
      name: 'channel',
      description: 'The text channel to monitor for images',
      required: true,
      channel_types: [0]
    }
  ]
};

const REMOVE_COMMAND = {
  name: 'remove',
  description: 'Remove a channel from monitoring',
  type: 1,
  options: [
    {
      type: 7,
      name: 'channel',
      description: 'The text channel to stop monitoring',
      required: true,
      channel_types: [0]
    }
  ]
};

const STATUS_COMMAND = {
  name: 'status',
  description: 'Check which channels are being monitored',
  type: 1,
};

const ALL_COMMANDS = [SETUP_COMMAND, REMOVE_COMMAND, STATUS_COMMAND];

InstallGlobalCommands(process.env.APP_ID!, ALL_COMMANDS as any);
