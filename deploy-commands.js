// Optional manual command registration. Not required on Railway — index.js
// registers commands automatically every time the bot starts. Use this
// script if you want to register commands locally without starting the bot.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { commandDefs } = require('./lib/commands');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandDefs }
      );
      console.log('Guild slash commands registered (instant).');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commandDefs }
      );
      console.log('Global slash commands registered (can take up to ~1 hour to appear).');
    }
  } catch (err) {
    console.error(err);
  }
})();
