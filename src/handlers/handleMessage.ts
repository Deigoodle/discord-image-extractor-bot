import { Message } from "discord.js";

import { monitoredChannels } from "@/state/monitoredChannels";
import { extractImages } from "@/utils/messageUtils";
import { downloadImage, getFileNameFromUrl, getMimeTypeFromUrl } from "@/utils/imageUtils";
import { googlePhotosService } from "@/services/googlePhotosService";
import { createLogger } from "@/services/logger";
import { markMessageSynced, saveSyncedMessages } from "@/state/syncedMessages";
import { clearAlbumId } from "@/state/albumCache";

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
  
  //logger.debug('Channel is monitored, checking for media...');
  
  // Extract images and videos
  const media = extractImages(message);
  //logger.debug(`Attachments: ${message.attachments.size}, Embeds: ${message.embeds.length}, Media found: ${media.length}`);
  
  if (media.length === 0) {
    logger.debug('No media found in message');
    return;
  }

  logger.info(`Found ${media.length} media file(s) in message ${message.id}`);
  
  try {
    // Get channel name for album
    const channel = message.channel;
    const channelName = ('name' in channel && channel.name) ? channel.name : message.channelId;
    logger.debug(`Channel name for album: ${channelName}`);
    
    // Find or create album for this channel
    let albumId: string | null = null;
    try {
      albumId = await googlePhotosService.findOrCreateAlbum(channelName);
      logger.debug(`Album ID: ${albumId}`);
    } catch (error: any) {
      logger.warn(`Could not get/create album: ${error.message}. Will upload to library instead.`);
      // Continue without album - photos will be uploaded to library
    }
    
    // Upload each media file (image or video)
    for (let i = 0; i < media.length; i++) {
      const mediaUrl = media[i];
      logger.info(`Downloading media ${i + 1}/${media.length}: ${mediaUrl}`);
      
      const mediaBuffer = await downloadImage(mediaUrl);
      logger.debug(`Downloaded ${mediaBuffer.length} bytes`);
      
      const fileName = getFileNameFromUrl(mediaUrl, message.id, i);
      const mimeType = getMimeTypeFromUrl(mediaUrl);
      logger.debug(`File: ${fileName}, MIME: ${mimeType}`);
      
      try {
        logger.info(`Uploading to Google Photos: ${fileName}`);
        const photoLink = await googlePhotosService.uploadImage(mediaBuffer, fileName, albumId, mimeType);
        logger.info(`Successfully uploaded: ${photoLink}`);
      } catch (uploadError: any) {
        // Check if error is due to invalid/not found album ID
        const errorMessage = uploadError.response?.data?.error?.message || '';
        const isInvalidAlbum = errorMessage.includes('Invalid album ID') || 
                               errorMessage.includes('does not match any albums');
        
        if (isInvalidAlbum) {
          logger.warn(`Album ID not found, searching for existing album and retrying...`);
          // Clear the invalid cached ID and search for existing album
          clearAlbumId(channelName);
          // Search for existing album or create new one
          albumId = await googlePhotosService.findOrCreateAlbum(channelName);
          logger.info(`Retrying upload with album ID: ${albumId}`);
          const photoLink = await googlePhotosService.uploadImage(mediaBuffer, fileName, albumId, mimeType);
          logger.info(`Successfully uploaded after retry: ${photoLink}`);
        } else {
          throw uploadError;
        }
      }
    }
    
    // React to show success
    await message.react('✅');
    logger.debug('Added success reaction');

    markMessageSynced(message.channelId, message.id);
    saveSyncedMessages();
    
  } catch (error) {
    logger.error('Error processing media', error);
    await message.react('❌');
  }
}