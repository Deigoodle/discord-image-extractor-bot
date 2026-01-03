import { Message } from "discord.js";
import { monitoredChannels } from "@/state/monitoredChannels";
import { extractImages } from "@/utils/extractImages";

export async function handleMessage(message: Message) {
    if (message.author.bot) return;
    if (!message.guildId) return;
  
    const channels = monitoredChannels.get(message.guildId);
    
    if (channels && channels.has(message.channelId)) {
      const images = extractImages(message);
  
      if (images.length > 0) {
        console.log(`🖼️  Found ${images.length} image(s) in message ${message.id} from #${message.channel}:`);
        images.forEach((url) => console.log(`   - ${url}`));
      }
    }
  }