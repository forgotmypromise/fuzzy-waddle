const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commandDefs = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the Polo Panel embed with its action buttons'),

  new SlashCommandBuilder()
    .setName('setlink')
    .setDescription('Set the URL a panel button opens when clicked')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('button')
        .setDescription('Which button to set the link for')
        .setRequired(true)
        .addChoices(
          { name: 'Get', value: 'getLink' },
          { name: 'Get XP', value: 'xpLink' },
          { name: 'Get Premium Key', value: 'premiumLink' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('url')
        .setDescription('The URL this button should open')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setpremiumrole')
    .setDescription('Set which role counts as "Premium" for the View Status button')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('The role that marks a member as premium')
        .setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

module.exports = { commandDefs };
