import { createLogger } from '@/services/logger';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const logger = createLogger('monitoredChannels');

const DATA_FILE = join(process.cwd(), 'data', 'monitored-channels.json');

export const monitoredChannels = new Map<string, Set<string>>();

// Load state from file
export function loadState() {
  try {
    if (existsSync(DATA_FILE)) {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      
      // Convert object to Map with Sets
      Object.entries(data).forEach(([guildId, channelIds]) => {
        monitoredChannels.set(guildId, new Set(channelIds as string[]));
      });
      
      logger.info(`Loaded monitored channels from file: ${DATA_FILE}`);
    }
  } catch (error) {
    logger.error('Error loading state:', error);
  }
}

// Save state to file
export function saveState() {
  try {
    // Convert Map with Sets to plain object
    const data: Record<string, string[]> = {};
    monitoredChannels.forEach((channels, guildId) => {
      data[guildId] = Array.from(channels);
    });
    
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved monitored channels to file: ${DATA_FILE}`);
  } catch (error) {
    logger.error('Error saving state:', error);
  }
}