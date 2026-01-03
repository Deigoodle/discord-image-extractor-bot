import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

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
      
      console.log('📂 Loaded monitored channels from file');
    }
  } catch (error) {
    console.error('❌ Error loading state:', error);
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
  } catch (error) {
    console.error('❌ Error saving state:', error);
  }
}