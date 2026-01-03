import { Interaction } from "discord.js";
import { setupCommand } from "@/commands/setupCommand";
import { removeCommand } from "@/commands/removeCommand";
import { statusCommand } from "@/commands/statusCommand";
import { createLogger } from "@/services/logger";

const logger = createLogger('handleInteraction');

export async function handleInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;
  
    const { commandName, guildId } = interaction;
  
    if (commandName === 'setup') {
      await setupCommand(interaction, guildId);
    }
  
    if (commandName === 'remove') {
      await removeCommand(interaction, guildId);
    }
  
    if (commandName === 'status') {
      await statusCommand(interaction, guildId);
    }
  }