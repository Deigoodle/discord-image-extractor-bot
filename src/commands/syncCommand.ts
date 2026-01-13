import { ChatInputCommandInteraction, ChannelType, TextChannel, MessageFlags, Message } from "discord.js";
import { extractImages } from "@/utils/messageUtils";
import { downloadImage, getFileNameFromUrl, getMimeTypeFromUrl } from "@/utils/imageUtils";
import { googlePhotosService } from "@/services/googlePhotosService";
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
        // STEP 0: Test Google Photos API connection first
        await interaction.editReply(`🔍 Testing Google Photos API connection...`);
        logger.info('Testing Google Photos API before sync...');
        
        const apiWorking = await googlePhotosService.testConnection();
        if (!apiWorking) {
            await interaction.editReply('❌ Google Photos API test failed. Check logs for details. Cannot proceed with sync.');
            return;
        }
        
        logger.info('✅ Google Photos API test passed, proceeding with sync');
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
        await interaction.editReply(`🔄 Uploading media...`);

        // STEP 3: Get or create folder
        let albumId = await googlePhotosService.findOrCreateAlbum(channel.name);

        // STEP 4: Collect all media to upload (images and videos)
        interface MediaTask {
            message: Message;
            mediaUrl: string;
            mediaIndex: number;
        }

        const mediaTasks: MediaTask[] = [];
        
        for (const message of allMessages) {
            if (message.author.bot) continue;
            
            if (isMessageSynced(channel.id, message.id)) {
                logger.debug(`Message ${message.id} already synced, skipping`);
                continue;
            }

            const media = extractImages(message);
            
            for (let i = 0; i < media.length; i++) {
                mediaTasks.push({
                    message,
                    mediaUrl: media[i],
                    mediaIndex: i,
                });
            }
        }

        const totalMedia = mediaTasks.length;
        let uploadedMedia = 0;
        let failedMedia = 0;

        logger.info(`Found ${totalMedia} media files to upload`);
        
        // STEP 5: Process media ONE AT A TIME (Google Photos has strict rate limits)
        const DELAY_BETWEEN_UPLOADS = 0; // 2 seconds between uploads
        
        for (let i = 0; i < mediaTasks.length; i++) {
            const task = mediaTasks[i];
            const { message, mediaUrl, mediaIndex } = task;
            
            try {
                logger.debug(`Downloading media from message ${message.id} (${i + 1}/${totalMedia})`);
                const mediaBuffer = await downloadImage(mediaUrl);
                const fileName = getFileNameFromUrl(mediaUrl, message.id, mediaIndex);
                const mimeType = getMimeTypeFromUrl(mediaUrl);
                
                try {
                    logger.debug(`Uploading ${fileName} to Google Photos`);
                    await googlePhotosService.uploadImage(
                        mediaBuffer,
                        fileName,
                        albumId,
                        mimeType
                    );
                } catch (uploadError: any) {
                    // Check if error is due to invalid album ID
                    if (uploadError.response?.data?.error?.message?.includes('Invalid album ID')) {
                        logger.warn(`Invalid album ID detected, creating fresh album and retrying...`);
                        // Get a fresh album ID and retry
                        albumId = await googlePhotosService.findOrCreateAlbum(channel.name, true);
                        logger.info(`Retrying upload with new album ID: ${albumId}`);
                        await googlePhotosService.uploadImage(
                            mediaBuffer,
                            fileName,
                            albumId,
                            mimeType
                        );
                    } else {
                        throw uploadError;
                    }
                }
                
                uploadedMedia++;
                markMessageSynced(channel.id, message.id);
                
                // Update progress every 5 media files or on last media
                if (uploadedMedia % 5 === 0 || i === mediaTasks.length - 1) {
                    await interaction.editReply(
                        `🔄 Syncing...\n` +
                        `📊 ${uploadedMedia + failedMedia}/${totalMedia} files\n` +
                        `✅ ${uploadedMedia} uploaded` +
                        (failedMedia > 0 ? ` | ❌ ${failedMedia} failed` : '')
                    );
                }
                
                // Add delay between uploads to avoid rate limiting
                if (i < mediaTasks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_UPLOADS));
                }
                
            } catch (error) {
                logger.error(`Failed to upload media from message ${message.id}`, error);
                failedMedia++;
            }
        }

        // Save synced messages
        saveSyncedMessages();

        logger.info(`Sync complete: ${uploadedMedia}/${totalMedia} uploaded, ${failedMedia} failed`);

        const summary =
            `✅ Sync complete!\n` +
            `🖼️ ${totalMedia} media files found\n` +
            `☁️ ${uploadedMedia} uploaded` +
            (failedMedia > 0 ? `\n⚠️ ${failedMedia} failed` : '');

        await interaction.editReply(summary);

    } catch (error) {
        logger.error('Error during sync', error);
        await interaction.editReply('❌ An error occurred during sync. Check logs for details.');
    }
}