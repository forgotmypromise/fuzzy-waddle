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
          { name: 'Get Script', value: 'getLink' },
          { name: 'Get XP Script', value: 'xpLink' },
          { name: 'Get Premium Key', value: 'premiumLink' },

          { name: 'Help', value: 'helpLink' }
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

  new SlashCommandBuilder()
    .setName('setresetlimit')
    .setDescription('Set how many resets each member gets before needing to contact staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Number of resets per member (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName('resetresets')
    .setDescription("Clear a member's used resets back to their full limit")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('The member to reset')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('genkeys')
    .setDescription('Generate redeemable keys and add them to keys.txt')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('How many keys to generate (1-50)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addStringOption((opt) =>
      opt
        .setName('format')
        .setDescription('Key format')
        .setRequired(false)
        .addChoices(
          { name: 'POLO-XXXXXXXX (POLO- + 8-char hash)', value: 'polo' },
          { name: 'XXXXXXXXX (9 random letters)', value: 'random9' }
        )
    ),

  new SlashCommandBuilder()
    .setName('obfuscate')
    .setDescription('Not implemented yet — placeholder command'),
].map((cmd) => cmd.toJSON());

module.exports = { commandDefs };
