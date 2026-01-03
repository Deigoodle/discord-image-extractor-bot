import { createLogger } from "@/services/logger";
import { Client } from "discord.js";

const logger = createLogger('handleReady');

export function handleReady(client: Client<true>) {
  logger.info(`Logged in as ${client.user?.tag}`);
}
