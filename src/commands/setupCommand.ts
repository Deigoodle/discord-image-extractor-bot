import { Interaction, ChannelType } from "discord.js";
import { monitoredChannels } from "@/state/monitoredChannels";

export async function setupCommand(interaction: Interaction, guildId: string | null) {
    if (!interaction.isChatInputCommand()) return;
  
    const channel = interaction.options.getChannel('channel', true);
  
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Please select a text channel.',
        ephemeral: true,
      });
      return;
    }
  
    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        ephemeral: true,
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
        ephemeral: true,
      });
      return;
    }
    
    channels.add(channel.id);
  
    await interaction.reply({
      content: `✅ Successfully added <#${channel.id}> to monitoring! (${channels.size} channel${channels.size > 1 ? 's' : ''} total)`,
      ephemeral: true,
    });
  
    console.log(`📝 Added channel ${channel.name} (${channel.id}) in guild ${guildId}. Total: ${channels.size}`);
  }