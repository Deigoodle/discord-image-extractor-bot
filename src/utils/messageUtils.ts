import { Message } from "discord.js";

export function extractImages(message: Message): string[] {
  const media: string[] = [];

  message.attachments.forEach((attachment) => {
    // Extract both images and videos
    if (attachment.contentType?.startsWith('image/') || 
        attachment.contentType?.startsWith('video/')) {
      media.push(attachment.url);
    }
  });

  message.embeds.forEach((embed) => {
    if (embed.image?.url) {
      media.push(embed.image.url);
    }
    if (embed.thumbnail?.url) {
      media.push(embed.thumbnail.url);
    }
    // Also extract video embeds
    if (embed.video?.url) {
      media.push(embed.video.url);
    }
  });

  return media;
}