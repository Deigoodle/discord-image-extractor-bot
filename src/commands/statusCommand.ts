import { Interaction } from "discord.js";
import { monitoredChannels } from "@/state/monitoredChannels";

export async function statusCommand(interaction: Interaction, guildId: string | null) {
    if (!interaction.isChatInputCommand()) return;
  
    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }
  
    const channels = monitoredChannels.get(guildId);
  
    if (!channels || channels.size === 0) {
      await interaction.reply({
        content: '❌ No channels are currently being monitored. Use `/setup` to add a channel.',
        ephemeral: true,
      });
      return;
    }
  
    const channelList = Array.from(channels)
      .map(id => `<#${id}>`)
      .join('\n');
  
    await interaction.reply({
      content: `📊 Currently monitoring ${channels.size} channel${channels.size > 1 ? 's' : ''}:\n${channelList}`,
      ephemeral: true,
    });
  }