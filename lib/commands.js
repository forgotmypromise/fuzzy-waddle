const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commandDefs = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Panel'),

  new SlashCommandBuilder()
    .setName('setlink')
    .setDescription('Set panel urls.')
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
    .setDescription('Set premium role (pretty obvious tbh)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('The role that marks a member as premium')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setresetlimit')
    .setDescription('Set max number of hwid resets')
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
    .setName('resethwidresets')
    .setDescription('Resets hwid resets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('The member to reset')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('genkeys')
    .setDescription('Generate keys.')
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
    .setName('free')
    .setDescription('Send free script (owner / admin / whitelist only)')
    .addStringOption((opt) =>
      opt
        .setName('text')
        .setDescription('The text to send')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the free-command whitelist (owner/admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user to the whitelist')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('User to whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from the whitelist')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('User to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Show everyone currently on the whitelist')
    ),

  new SlashCommandBuilder()
    .setName('obfuscate')
    .setDescription('Obfuscate a Lua script (using online API)')
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('Upload a .lua file to obfuscate')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('preset')
        .setDescription('Obfuscation strength')
        .setRequired(false)
        .addChoices(
          { name: 'Light', value: 'lite' },
          { name: 'Medium', value: 'advanced' },
          { name: 'Heavy', value: 'maximum' }
        )
    ),
].map((cmd) => cmd.toJSON());

module.exports = { commandDefs };
