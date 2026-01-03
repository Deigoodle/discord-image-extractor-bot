import { Interaction, ChannelType, MessageFlags } from "discord.js";
import { monitoredChannels, saveState } from "@/state/monitoredChannels";
import { createLogger } from "@/services/logger";

const logger = createLogger('setupCommand');

export async function setupCommand(interaction: Interaction, guildId: string | null) {
    if (!interaction.isChatInputCommand()) return;
  
    const channel = interaction.options.getChannel('channel', true);
  
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Please select a text channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  
    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  
    if (!monitoredChannels.has(guildId)) {
      monitoredChannels.set(guildId, new Set());
    }
  
    const channels = monitoredChannels.get(guildId)!;
    
    if (channels.has(channel.id)) {
      await interaction.reply({
        content: `ℹ️ <#${channel.id}> is already being monitored.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    channels.add(channel.id);
    saveState();
  
    await interaction.reply({
      content: `✅ Successfully added <#${channel.id}> to monitoring! (${channels.size} channel${channels.size > 1 ? 's' : ''} total)`,
      flags: MessageFlags.Ephemeral,
    });
  
    logger.info(`Added channel ${channel.name} (${channel.id}) in guild ${guildId}. Total: ${channels.size}`);
  }