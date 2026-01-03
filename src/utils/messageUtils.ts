import { Message } from "discord.js";

export function extractImages(message: Message): string[] {
  const images: string[] = [];

  message.attachments.forEach((attachment) => {
    if (attachment.contentType?.startsWith('image/')) {
      images.push(attachment.url);
    }
  });

  message.embeds.forEach((embed) => {
    if (embed.image?.url) {
      images.push(embed.image.url);
    }
    if (embed.thumbnail?.url) {
      images.push(embed.thumbnail.url);
    }
  });

  return images;
}