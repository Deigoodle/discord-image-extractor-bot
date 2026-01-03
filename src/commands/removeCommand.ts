import { Interaction, ChannelType } from "discord.js";
import { monitoredChannels, saveState } from "@/state/monitoredChannels";

export async function removeCommand(interaction: Interaction, guildId: string | null) {
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
  
    const channels = monitoredChannels.get(guildId);
    
    if (!channels || !channels.has(channel.id)) {
      await interaction.reply({
        content: `ℹ️ <#${channel.id}> is not being monitored.`,
        ephemeral: true,
      });
      return;
    }
    
    channels.delete(channel.id);
    
    if (channels.size === 0) {
      monitoredChannels.delete(guildId);
    }
    saveState(); // Save the state to the data file
  
    await interaction.reply({
      content: `✅ Removed <#${channel.id}> from monitoring. (${channels.size} channel${channels.size !== 1 ? 's' : ''} remaining)`,
      ephemeral: true,
    });
  
    console.log(`🗑️  Removed channel ${channel.name} (${channel.id}) from guild ${guildId}. Remaining: ${channels.size}`);
  }
