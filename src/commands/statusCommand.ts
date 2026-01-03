import { Interaction, MessageFlags } from "discord.js";
import { monitoredChannels } from "@/state/monitoredChannels";
import { createLogger } from "@/services/logger";

const logger = createLogger('statusCommand');

export async function statusCommand(interaction: Interaction, guildId: string | null) {
    if (!interaction.isChatInputCommand()) return;
  
    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  
    const channels = monitoredChannels.get(guildId);
  
    if (!channels || channels.size === 0) {
      await interaction.reply({
        content: '❌ No channels are currently being monitored. Use `/setup` to add a channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  
    const channelList = Array.from(channels)
      .map(id => `<#${id}>`)
      .join('\n');
  
    await interaction.reply({
      content: `📊 Currently monitoring ${channels.size} channel${channels.size > 1 ? 's' : ''}:\n${channelList}`,
      flags: MessageFlags.Ephemeral,
    });
  }