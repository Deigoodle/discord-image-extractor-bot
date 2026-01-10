import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '@/services/logger';

const logger = createLogger('albumCache');
const DATA_FILE = './data/album-cache.json';

// Map of channel names to album IDs
export const albumCache = new Map<string, string>();

export function loadAlbumCache() {
  try {
    if (existsSync(DATA_FILE)) {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      Object.entries(data).forEach(([channelName, albumId]) => {
        albumCache.set(channelName, albumId as string);
      });
      logger.info(`Loaded ${albumCache.size} album mappings from file`);
    }
  } catch (error) {
    logger.error('Error loading album cache', error);
  }
}

export function saveAlbumCache() {
  try {
    const data: Record<string, string> = {};
    albumCache.forEach((albumId, channelName) => {
      data[channelName] = albumId;
    });
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug('Saved album cache to file');
  } catch (error) {
    logger.error('Error saving album cache', error);
  }
}

export function getAlbumId(channelName: string): string | undefined {
  return albumCache.get(channelName);
}

export function setAlbumId(channelName: string, albumId: string) {
  albumCache.set(channelName, albumId);
  saveAlbumCache();
}
