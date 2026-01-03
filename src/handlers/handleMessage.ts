import { Message } from "discord.js";
import { monitoredChannels } from "@/state/monitoredChannels";
import { extractImages } from "@/utils/messageUtils";
import { downloadImage, getFileNameFromUrl, getMimeTypeFromUrl } from "@/utils/imageUtils";
import { googleDriveService } from "@/services/googleDriveService";

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guildId) return;

  const channels = monitoredChannels.get(message.guildId);
  
  if (channels && channels.has(message.channelId)) {
    const images = extractImages(message);

    if (images.length > 0) {
      console.log(`🖼️  Found ${images.length} image(s) in message ${message.id}`);
      
      try {
        // Get channel name for folder
        const channel = message.channel;
        const channelName = ('name' in channel && channel.name) ? channel.name : message.channelId;
        
        // Find or create folder for this channel
        const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const channelFolderId = await googleDriveService.findOrCreateFolder(channelName, rootFolderId || 'root');
        
        // Upload each image
        for (let i = 0; i < images.length; i++) {
          const imageUrl = images[i];
          console.log(`   📥 Downloading: ${imageUrl}`);
          
          const imageBuffer = await downloadImage(imageUrl);
          const fileName = getFileNameFromUrl(imageUrl, message.id, i);
          const mimeType = getMimeTypeFromUrl(imageUrl);
          
          console.log(`   ☁️  Uploading to Google Drive: ${fileName}`);
          const driveLink = await googleDriveService.uploadImage(imageBuffer, fileName, channelFolderId, mimeType);
          
          console.log(`   ✅ Uploaded: ${driveLink}`);
        }
        
        // React to show success
        await message.react('✅');
        
      } catch (error) {
        console.error('❌ Error processing images:', error);
        await message.react('❌');
      }
    }
  }
}