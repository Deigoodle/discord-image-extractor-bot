import { Message } from "discord.js";

import { monitoredChannels } from "@/state/monitoredChannels";
import { extractImages } from "@/utils/messageUtils";
import { downloadImage, getFileNameFromUrl, getMimeTypeFromUrl } from "@/utils/imageUtils";
import { googleDriveService } from "@/services/googleDriveService";
import { createLogger } from "@/services/logger";
import { markMessageSynced, saveSyncedMessages } from "@/state/syncedMessages";

const logger = createLogger('MessageHandler');

export async function handleMessage(message: Message) {
  // Log every message received
  logger.debug(`Message received: ${message.id} from ${message.author.tag} (${message.author.id})`);
  
  // Check if bot message
  if (message.author.bot) {
    logger.debug(`Ignoring bot message from ${message.author.tag}`);
    return;
  }
  
  // Check if DM
  if (!message.guildId) {
    logger.debug('Ignoring DM message');
    return;
  }

  //logger.debug(`Guild: ${message.guildId}, Channel: ${message.channelId}`);
  
  // Check if channel is monitored
  const channels = monitoredChannels.get(message.guildId);
  //logger.debug(`Monitored channels in this guild: ${channels ? Array.from(channels).join(', ') : 'none'}`);
  
  if (!channels || !channels.has(message.channelId)) {
    logger.debug('Channel not monitored, skipping');
    return;
  }
  
  //logger.debug('Channel is monitored, checking for images...');
  
  // Extract images
  const images = extractImages(message);
  //logger.debug(`Attachments: ${message.attachments.size}, Embeds: ${message.embeds.length}, Images found: ${images.length}`);
  
  if (images.length === 0) {
    logger.debug('No images found in message');
    return;
  }

  logger.info(`Found ${images.length} image(s) in message ${message.id}`);
  
  try {
    // Get channel name for folder
    const channel = message.channel;
    const channelName = ('name' in channel && channel.name) ? channel.name : message.channelId;
    logger.debug(`Channel name for folder: ${channelName}`);
    
    // Find or create folder for this channel
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    logger.debug(`Root folder ID: ${rootFolderId || 'not set'}`);
    
    const channelFolderId = await googleDriveService.findOrCreateFolder(channelName, rootFolderId || 'root');
    logger.debug(`Channel folder ID: ${channelFolderId}`);
    
    // Upload each image
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      logger.info(`Downloading image ${i + 1}/${images.length}: ${imageUrl}`);
      
      const imageBuffer = await downloadImage(imageUrl);
      logger.debug(`Downloaded ${imageBuffer.length} bytes`);
      
      const fileName = getFileNameFromUrl(imageUrl, message.id, i);
      const mimeType = getMimeTypeFromUrl(imageUrl);
      logger.debug(`File: ${fileName}, MIME: ${mimeType}`);
      
      logger.info(`Uploading to Google Drive: ${fileName}`);
      const driveLink = await googleDriveService.uploadImage(imageBuffer, fileName, channelFolderId, mimeType);
      
      logger.info(`Successfully uploaded: ${driveLink}`);
    }
    
    // React to show success
    await message.react('✅');
    logger.debug('Added success reaction');

    markMessageSynced(message.channelId, message.id);
    saveSyncedMessages();
    
  } catch (error) {
    logger.error('Error processing images', error);
    await message.react('❌');
  }
}