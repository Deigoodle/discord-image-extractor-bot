import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '@/services/logger';

const logger = createLogger('syncedMessages');
const DATA_FILE = './data/synced-messages.json';

// Set of synced message IDs per channel
export const syncedMessages = new Map<string, Set<string>>();

export function loadSyncedMessages() {
  try {
    if (existsSync(DATA_FILE)) {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      Object.entries(data).forEach(([channelId, messageIds]) => {
        syncedMessages.set(channelId, new Set(messageIds as string[]));
      });
      logger.info('Loaded synced messages from file');
    }
  } catch (error) {
    logger.error('Error loading synced messages', error);
  }
}

export function saveSyncedMessages() {
  try {
    const data: Record<string, string[]> = {};
    syncedMessages.forEach((messageIds, channelId) => {
      data[channelId] = Array.from(messageIds);
    });
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Error saving synced messages', error);
  }
}

export function isMessageSynced(channelId: string, messageId: string): boolean {
  const messages = syncedMessages.get(channelId);
  return messages ? messages.has(messageId) : false;
}

export function markMessageSynced(channelId: string, messageId: string) {
  if (!syncedMessages.has(channelId)) {
    syncedMessages.set(channelId, new Set());
  }
  syncedMessages.get(channelId)!.add(messageId);
}