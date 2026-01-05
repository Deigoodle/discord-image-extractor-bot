import { ChatInputCommandInteraction, ChannelType, TextChannel, MessageFlags, Message } from "discord.js";
import { extractImages } from "@/utils/messageUtils";
import { downloadImage, getFileNameFromUrl, getMimeTypeFromUrl } from "@/utils/imageUtils";
import { googleDriveService } from "@/services/googleDriveService";
import { createLogger } from "@/services/logger";
import { isMessageSynced, markMessageSynced, saveSyncedMessages } from '@/state/syncedMessages';

const logger = createLogger('SyncCommand');

export async function syncCommand(interaction: ChatInputCommandInteraction, guildId: string | null) {
    // Defer reply since this will take a while
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.channel;
    if (!guildId) {
        await interaction.editReply('❌ This command can only be used in a server.');
        return;
    }
    // Check if it's a text channel
    if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply('❌ This command can only be used in text channels.');
        return;
    }

    // Parse options
    const daysOption = interaction.options.getInteger('days');
    const sinceOption = interaction.options.getString('since');
    const limitOption = interaction.options.getInteger('limit');

    // Calculate cutoff date
    let cutoffDate: Date | null = null;
    let filterDescription = '';

    if (limitOption) {
        filterDescription = `up to ${limitOption} messages`;
    } else if (daysOption) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOption);
        filterDescription = `last ${daysOption} days`;
    } else if (sinceOption) {
        try {
            cutoffDate = new Date(sinceOption);
            if (isNaN(cutoffDate.getTime())) {
                await interaction.editReply('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2024-01-01)');
                return;
            }
            filterDescription = `since ${sinceOption}`;
        } catch (error) {
            await interaction.editReply('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2024-01-01)');
            return;
        }
    } else {
        // Default: last 7 days
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        filterDescription = 'last 7 days (default)';
    }

    logger.info(`Starting sync for channel ${channel.name}, filter: ${filterDescription}`);

    try {
        await interaction.editReply(`🔄 Syncing ${filterDescription}...`);

        // STEP 1: Collect all messages first
        let fetchedCount = 0;
        const batchSize = 100; // Discord API limit
        let lastMessageId: string | undefined;
        let shouldContinue = true;
        const allMessages: Message[] = [];

        while (shouldContinue) {
            const fetchLimit = limitOption
                ? Math.min(batchSize, limitOption - fetchedCount)
                : batchSize;

            if (fetchLimit <= 0) break;

            const messages = await channel.messages.fetch({
                limit: fetchLimit,
                ...(lastMessageId && { before: lastMessageId }),
            });

            if (messages.size === 0) {
                logger.debug('No more messages to fetch');
                break;
            }

            fetchedCount += messages.size;
            lastMessageId = messages.last()?.id;

            // Check cutoff date on oldest message in batch
            const oldestMessage = messages.last();
            if (cutoffDate && oldestMessage && oldestMessage.createdAt < cutoffDate) {
                // Add only messages within range
                messages.forEach((msg) => {
                    if (!cutoffDate || msg.createdAt >= cutoffDate) {
                        allMessages.push(msg);
                    }
                });
                        logger.debug('Reached cutoff date');
                shouldContinue = false;
                break;
            }

            // Add all messages from this batch
            messages.forEach((msg) => allMessages.push(msg));

            if (limitOption && fetchedCount >= limitOption) {
                shouldContinue = false;
                break;
            }

            // Rate limit protection
            if (messages.size === batchSize) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // STEP 2: Reverse to get oldest first
        allMessages.reverse();

        logger.info(`Processing ${allMessages.length} messages`);
        await interaction.editReply(`🔄 Uploading images...`);

        // STEP 3: Get or create folder
        const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const channelFolderId = await googleDriveService.findOrCreateFolder(
            channel.name,
            rootFolderId || undefined
        );

        // STEP 4: Collect all images to upload
        interface ImageTask {
            message: Message;
            imageUrl: string;
            imageIndex: number;
        }

        const imageTasks: ImageTask[] = [];
        
        for (const message of allMessages) {
            if (message.author.bot) continue;
            
            if (isMessageSynced(channel.id, message.id)) {
                logger.debug(`Message ${message.id} already synced, skipping`);
                continue;
            }

            const images = extractImages(message);
            
            for (let i = 0; i < images.length; i++) {
                imageTasks.push({
                    message,
                    imageUrl: images[i],
                    imageIndex: i,
                });
            }
        }

        const totalImages = imageTasks.length;
        let uploadedImages = 0;
        let failedImages = 0;

        logger.info(`Found ${totalImages} images to upload`);
        
        // STEP 5: Process images with concurrency
        const CONCURRENCY = 3; // Upload 3 images at once
        
        for (let i = 0; i < imageTasks.length; i += CONCURRENCY) {
            const batch = imageTasks.slice(i, i + CONCURRENCY);
            
            // Process batch concurrently
            const results = await Promise.allSettled(
                batch.map(async (task) => {
                    const { message, imageUrl, imageIndex } = task;
                    
                    try {
                        logger.debug(`Downloading image from message ${message.id}`);
                        const imageBuffer = await downloadImage(imageUrl);
                        const fileName = getFileNameFromUrl(imageUrl, message.id, imageIndex);
                        const mimeType = getMimeTypeFromUrl(imageUrl);
                        
                        logger.debug(`Uploading ${fileName} to Google Drive`);
                        await googleDriveService.uploadImage(
                            imageBuffer,
                            fileName,
                            channelFolderId,
                            mimeType
                        );
                        
                        return { success: true, messageId: message.id };
                    } catch (error) {
                        logger.error(`Failed to upload image from message ${message.id}`, error);
                        return { success: false, messageId: message.id };
                    }
                })
            );
            
            // Count results
            results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    uploadedImages++;
                } else {
                    failedImages++;
                }
            });
            
            // Mark messages as synced (after processing all their images)
            const processedMessageIds = new Set(batch.map(t => t.message.id));
            processedMessageIds.forEach(msgId => {
                markMessageSynced(channel.id, msgId);
            });
            
            // Update progress
            await interaction.editReply(
                `🔄 Syncing...\n` +
                `📊 ${uploadedImages + failedImages}/${totalImages} images\n` +
                `✅ ${uploadedImages} uploaded` +
                (failedImages > 0 ? ` | ❌ ${failedImages} failed` : '')
            );
        }

        // Save synced messages
        saveSyncedMessages();

        logger.info(`Sync complete: ${uploadedImages}/${totalImages} uploaded, ${failedImages} failed`);

        const summary =
            `✅ Sync complete!\n` +
            `🖼️ ${totalImages} images found\n` +
            `☁️ ${uploadedImages} uploaded` +
            (failedImages > 0 ? `\n⚠️ ${failedImages} failed` : '');

        await interaction.editReply(summary);

    } catch (error) {
        logger.error('Error during sync', error);
        await interaction.editReply('❌ An error occurred during sync. Check logs for details.');
    }
}