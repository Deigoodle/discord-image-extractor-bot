import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { googlePhotosService } from "@/services/googlePhotosService";
import { createLogger } from "@/services/logger";

const logger = createLogger('TestCommand');

export async function testCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        logger.info('Testing Google Photos API connection...');
        await interaction.editReply('🔍 Testing Google Photos API connection...');
        
        const success = await googlePhotosService.testConnection();
        
        if (success) {
            await interaction.editReply('✅ Google Photos API is working correctly!');
        } else {
            await interaction.editReply('❌ Google Photos API test failed. Check logs for details.');
        }
    } catch (error) {
        logger.error('Error during test', error);
        await interaction.editReply('❌ An error occurred during the test. Check logs for details.');
    }
}
