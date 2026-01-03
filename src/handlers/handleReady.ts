import { Client } from "discord.js";

export function handleReady(client: Client<true>) {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
}
