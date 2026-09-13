const { SlashCommandBuilder } = require('discord.js');

const adminCommands = [
    'setlink',
    'setpremiumrole',
    'setresetlimit',
    'resethwidresets',
    'genkeys',
    'setstatus',
    'toggleapps',
    'setscript',
    'disable',
    'enable',
    'blacklist'
];

const commandDefs = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the Polo license panel.'),

    new SlashCommandBuilder()
        .setName('free')
        .setDescription('Send the configured free-script message.')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('Message to send')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manage the bot whitelist.')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Add a user to the whitelist.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to whitelist')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Remove a user from the whitelist.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('Show the whitelist.')
        ),

    new SlashCommandBuilder()
        .setName('setlink')
        .setDescription('Set a panel button link.')
        .addStringOption(option =>
            option
                .setName('button')
                .setDescription('Panel button')
                .setRequired(true)
                .addChoices(
                    { name: 'Get Script', value: 'getLink' },
                    { name: 'Get XP Script', value: 'xpLink' },
                    { name: 'Get Premium Key', value: 'premiumLink' },
                    { name: 'Help', value: 'helpLink' }
                )
        )
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('URL for the button')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('setpremiumrole')
        .setDescription('Set the premium Discord role.')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Premium role')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('setresetlimit')
        .setDescription('Set the HWID reset limit per member.')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Maximum number of resets')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName('resethwidresets')
        .setDescription('Clear a member\'s HWID reset counter.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Member')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('genkeys')
        .setDescription('Generate license keys.')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of keys to generate')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addStringOption(option =>
            option
                .setName('format')
                .setDescription('Key format')
                .setRequired(false)
                .addChoices(
                    { name: 'Polo', value: 'polo' }
                )
        ),

    new SlashCommandBuilder()
        .setName('obfuscate')
        .setDescription('Obfuscate a Lua file.')
        .addAttachmentOption(option =>
            option
                .setName('file')
                .setDescription('Lua file')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('preset')
                .setDescription('Obfuscation preset')
                .setRequired(false)
                .addChoices(
                    { name: 'Advanced', value: 'advanced' },
                    { name: 'Standard', value: 'standard' }
                )
        ),

    new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Set the support status.')
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('Until time, e.g. 12am, 3:30pm, 15:30')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Support status reason')
                .setRequired(true)
                .addChoices(
                    { name: 'Asleep', value: 'asleep' },
                    { name: 'Break', value: 'break' },
                    { name: 'Busy', value: 'busy' },
                    { name: 'Offline', value: 'offline' },
                    { name: 'Working', value: 'working' },
                    { name: 'At School / Not Home', value: 'school' }
                )
        ),

    new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Apply for a server role.')
        .addStringOption(option =>
            option
                .setName('role')
                .setDescription('Application type')
                .setRequired(true)
                .addChoices(
                    { name: 'Media', value: 'media' },
                    { name: 'Staff', value: 'staff' },
                    { name: 'Helper', value: 'helper' }
                )
        ),

    new SlashCommandBuilder()
        .setName('toggleapps')
        .setDescription('Open or close application types (Media / Staff / Helper).')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Which application to toggle')
                .setRequired(true)
                .addChoices(
                    { name: 'Media', value: 'media' },
                    { name: 'Staff', value: 'staff' },
                    { name: 'Helper', value: 'helper' },
                    { name: 'All', value: 'all' }
                )
        )
        .addStringOption(option =>
            option
                .setName('state')
                .setDescription('Open or close')
                .setRequired(true)
                .addChoices(
                    { name: 'Open', value: 'open' },
                    { name: 'Closed', value: 'closed' }
                )
        ),


    new SlashCommandBuilder()
        .setName('setscript')
        .setDescription('Set the script text sent when someone presses Get Script / Get XP Script.')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Which button this script is for')
                .setRequired(true)
                .addChoices(
                    { name: 'Get Script', value: 'get' },
                    { name: 'Get XP Script', value: 'xp' }
                )
        )
        .addStringOption(option =>
            option
                .setName('content')
                .setDescription('The script / message to send (or leave empty and use a file)')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('file')
                .setDescription('Optional .lua / .txt file with the script')
                .setRequired(false)
        ),

    // =====================================================
    // LICENSE MANAGEMENT
    // =====================================================

    new SlashCommandBuilder()
        .setName('disable')
        .setDescription('Disable a license key.')
        .addStringOption(option =>
            option
                .setName('key')
                .setDescription('License key')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('enable')
        .setDescription('Enable a disabled license key.')
        .addStringOption(option =>
            option
                .setName('key')
                .setDescription('License key')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Permanently blacklist a license key.')
        .addStringOption(option =>
            option
                .setName('key')
                .setDescription('License key')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Optional blacklist reason')
                .setRequired(false)
        )
].map(command => command.toJSON());

module.exports = {
    commandDefs,
    adminCommands
};
