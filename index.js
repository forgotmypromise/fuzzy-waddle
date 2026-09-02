```js
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    REST,
    Routes,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const {
    getGuildConfig,
    setGuildLink,
    setPremiumRole,
    setResetLimit
} = require('./lib/storage');

const { redeemKey, addKeys } = require('./lib/keys');

const {
    useReset,
    getRemaining,
    resetUser,
    DEFAULT_MAX_RESETS
} = require('./lib/resets');

const { generateKey } = require('./lib/keygen');
const { commandDefs } = require('./lib/commands');
const DATA_DIR = require('./lib/data-dir');

const execFileAsync = promisify(execFile);


// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================

function validateEnv() {
    const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter(
        (key) => !process.env[key]
    );

    if (missing.length > 0) {
        console.error(
            `Missing required environment variable(s): ${missing.join(', ')}`
        );
        process.exit(1);
    }
}

validateEnv();

console.log(
    `Data directory: ${DATA_DIR}${
        process.env.DATA_DIR
            ? ''
            : ' (default — set DATA_DIR to a mounted Volume path on Railway)'
    }`
);


// =====================================================
// ERROR HANDLING
// =====================================================

process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});


// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});


// =====================================================
// COMMAND REGISTRATION
// =====================================================

async function registerCommands() {
    const rest = new REST({ version: '10' })
        .setToken(process.env.DISCORD_TOKEN);

    try {
        if (process.env.GUILD_ID) {

            await rest.put(
                Routes.applicationGuildCommands(
                    process.env.CLIENT_ID,
                    process.env.GUILD_ID
                ),
                {
                    body: commandDefs
                }
            );

            console.log('Guild slash commands registered.');

        } else {

            await rest.put(
                Routes.applicationCommands(
                    process.env.CLIENT_ID
                ),
                {
                    body: commandDefs
                }
            );

            console.log(
                'Global slash commands registered.'
            );
        }

    } catch (err) {
        console.error(
            'Failed to register slash commands:',
            err
        );
    }
}


// =====================================================
// URL NORMALIZER
// Allows:
// example.com
// discord.gg/test
// https://example.com
// http://example.com
// =====================================================

function normalizeURL(value) {

    if (!value || typeof value !== 'string') {
        return null;
    }

    value = value.trim();

    if (!value) {
        return null;
    }

    // Already has protocol
    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    // Automatically add HTTPS
    return `https://${value}`;
}


// =====================================================
// PANEL EMBED
// =====================================================

function buildPanelEmbed() {

    return new EmbedBuilder()
        .setColor(0xab0000)
        .setTitle('🎮 Polo Panel')
        .setDescription(
            '**Key Manager System**\n\n' +
            '🚀 Access and manage your account through the buttons below.\n\n' +

            '**Available Features:**\n' +
            '📄 **Get Script** — Get Script\n' +
            '⚡ **Get XP Script** — Get XP Script\n' +
            '🔑 **Redeem Key** — Upgrade your access level\n' +
            '🔄 **Reset HWID** — Reset HWID\n' +
            '📊 **View Status** — Check your account info\n' +
            '❓ **Help** — Get support and guidance'
        )
        .setFooter({
            text: 'Polo Panel • Key Manager System'
        })
        .setTimestamp();
}


// =====================================================
// CREATE SAFE LINK BUTTON
// =====================================================

function createLinkOrButton(
    label,
    emoji,
    url,
    customId,
    fallbackStyle = ButtonStyle.Secondary
) {

    const normalizedURL = normalizeURL(url);

    if (normalizedURL) {

        try {

            return new ButtonBuilder()
                .setLabel(label)
                .setEmoji(emoji)
                .setStyle(ButtonStyle.Link)
                .setURL(normalizedURL);

        } catch (error) {

            console.error(
                `Invalid URL for ${label}:`,
                normalizedURL
            );
        }
    }

    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setEmoji(emoji)
        .setStyle(fallbackStyle);
}


// =====================================================
// PANEL BUTTONS
// =====================================================

function buildPanelRows(guildId) {

    let config;

    try {
        config = getGuildConfig(guildId) || {};
    } catch (error) {
        console.error(
            'Failed to load guild config:',
            error
        );

        config = {};
    }


    const getButton = createLinkOrButton(
        'Get Script',
        '📄',
        config.getLink,
        'polo_get',
        ButtonStyle.Danger
    );


    const xpButton = createLinkOrButton(
        'Get XP Script',
        '⚡',
        config.xpLink,
        'polo_xp',
        ButtonStyle.Danger
    );


    const premiumButton = createLinkOrButton(
        'Get Premium Key',
        '💎',
        config.premiumLink,
        'polo_premium',
        ButtonStyle.Success
    );


    const helpButton = createLinkOrButton(
        'Help',
        '❓',
        config.helpLink,
        'polo_help',
        ButtonStyle.Danger
    );


    const row1 = new ActionRowBuilder()
        .addComponents(

            getButton,

            xpButton,

            new ButtonBuilder()
                .setCustomId('polo_redeem')
                .setLabel('Redeem Key')
                .setEmoji('🔑')
                .setStyle(ButtonStyle.Secondary)

        );


    const row2 = new ActionRowBuilder()
        .addComponents(

            premiumButton,

            new ButtonBuilder()
                .setCustomId('polo_reset')
                .setLabel('Reset')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('polo_status')
                .setLabel('View Status')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary)

        );


    const row3 = new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId('polo_obfuscate')
                .setLabel('Obfuscate')
                .setEmoji('🛠️')
                .setStyle(ButtonStyle.Secondary),

            helpButton

        );


    return [
        row1,
        row2,
        row3
    ];
}


// =====================================================
// READY
// =====================================================

client.once('ready', async () => {

    console.log(
        `Logged in as ${client.user.tag}`
    );

    await registerCommands();

});


client.on('error', (err) => {

    console.error(
        'Discord client error:',
        err
    );

});


// =====================================================
// INTERACTION HANDLER
// =====================================================

client.on('interactionCreate', async (interaction) => {

    try {


        // =================================================
        // SLASH COMMANDS
        // =================================================

        if (interaction.isChatInputCommand()) {


            // ---------------------------------------------
            // /panel
            // ---------------------------------------------

            if (interaction.commandName === 'panel') {

                await interaction.reply({

                    embeds: [
                        buildPanelEmbed()
                    ],

                    components:
                        buildPanelRows(interaction.guildId)

                });

                return;
            }


            // ---------------------------------------------
            // /setlink
            // ---------------------------------------------

            if (interaction.commandName === 'setlink') {

                const button =
                    interaction.options.getString(
                        'button',
                        true
                    );

                const url =
                    interaction.options.getString(
                        'url',
                        true
                    );

                if (!url || !url.trim()) {

                    await interaction.reply({

                        content:
                            '❌ Please provide a value.',

                        ephemeral: true

                    });

                    return;
                }


                setGuildLink(
                    interaction.guildId,
                    button,
                    url.trim()
                );


                const labels = {

                    getLink:
                        'Get Script',

                    xpLink:
                        'Get XP Script',

                    premiumLink:
                        'Get Premium Key',

                    helpLink:
                        'Help'

                };


                await interaction.reply({

                    content:
                        `✅ **${labels[button] || button}** button updated.\n\n` +
                        `Value: \`${url}\`\n\n` +
                        `Run \`/panel\` again to post an updated panel.`,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // /setpremiumrole
            // ---------------------------------------------

            if (
                interaction.commandName ===
                'setpremiumrole'
            ) {

                const role =
                    interaction.options.getRole(
                        'role',
                        true
                    );


                setPremiumRole(
                    interaction.guildId,
                    role.id
                );


                await interaction.reply({

                    content:
                        `✅ **${role.name}** is now the premium role.`,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // /setresetlimit
            // ---------------------------------------------

            if (
                interaction.commandName ===
                'setresetlimit'
            ) {

                const amount =
                    interaction.options.getInteger(
                        'amount',
                        true
                    );


                setResetLimit(
                    interaction.guildId,
                    amount
                );


                await interaction.reply({

                    content:
                        `✅ Reset limit set to **${amount}** per member.`,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // /resethwidresets
            // FIXED COMMAND NAME
            // ---------------------------------------------

            if (
                interaction.commandName ===
                'resethwidresets'
            ) {

                const user =
                    interaction.options.getUser(
                        'user',
                        true
                    );


                const config =
                    getGuildConfig(
                        interaction.guildId
                    ) || {};


                const maxResets =
                    config.resetLimit ||
                    DEFAULT_MAX_RESETS;


                resetUser(
                    interaction.guildId,
                    user.id
                );


                await interaction.reply({

                    content:
                        `✅ Cleared HWID resets for **${user.tag}**.\n` +
                        `They now have **${maxResets}/${maxResets}** available.`,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // /genkeys
            // ---------------------------------------------

            if (
                interaction.commandName ===
                'genkeys'
            ) {

                const amount =
                    interaction.options.getInteger(
                        'amount',
                        true
                    );


                const format =
                    interaction.options.getString(
                        'format'
                    ) || 'polo';


                const newKeys =
                    Array.from(
                        { length: amount },
                        () => generateKey(format)
                    );


                addKeys(newKeys);


                await interaction.reply({

                    content:
                        `✅ Generated **${amount}** key(s):\n` +
                        `\`\`\`\n` +
                        newKeys.join('\n') +
                        `\n\`\`\``,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // /obfuscate
            // ---------------------------------------------

            if (
                interaction.commandName ===
                'obfuscate'
            ) {

                await handleObfuscate(interaction);

                return;
            }

        }


        // =================================================
        // BUTTON INTERACTIONS
        // =================================================

        if (interaction.isButton()) {


            // ---------------------------------------------
            // REDEEM KEY
            // ---------------------------------------------

            if (
                interaction.customId ===
                'polo_redeem'
            ) {

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            'polo_redeem_modal'
                        )
                        .setTitle(
                            'Redeem a Key'
                        );


                const keyInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'key_input'
                        )
                        .setLabel(
                            'Enter your key'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);


                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            keyInput
                        )

                );


                await interaction.showModal(
                    modal
                );

                return;
            }


            // ---------------------------------------------
            // RESET
            // ---------------------------------------------

            if (
                interaction.customId ===
                'polo_reset'
            ) {

                const config =
                    getGuildConfig(
                        interaction.guildId
                    ) || {};


                const maxResets =
                    config.resetLimit ||
                    DEFAULT_MAX_RESETS;


                const {
                    success,
                    remaining
                } = useReset(

                    interaction.guildId,
                    interaction.user.id,
                    maxResets

                );


                if (success) {

                    await interaction.reply({

                        content:
                            `🔄 Reset complete.\n` +
                            `You have **${remaining}/${maxResets}** resets left.`,

                        ephemeral: true

                    });

                } else {

                    await interaction.reply({

                        content:
                            `❌ You've used all **${maxResets}** resets.`,

                        ephemeral: true

                    });

                }

                return;
            }


            // ---------------------------------------------
            // STATUS
            // ---------------------------------------------

            if (
                interaction.customId ===
                'polo_status'
            ) {

                const config =
                    getGuildConfig(
                        interaction.guildId
                    ) || {};


                const maxResets =
                    config.resetLimit ||
                    DEFAULT_MAX_RESETS;


                const resetsLeft =
                    getRemaining(

                        interaction.guildId,
                        interaction.user.id,
                        maxResets

                    );


                if (!config.premiumRoleId) {

                    await interaction.reply({

                        content:
                            `📊 **Status:** Premium role has not been configured.\n` +
                            `🔄 Resets remaining: **${resetsLeft}/${maxResets}**`,

                        ephemeral: true

                    });

                    return;
                }


                const member =
                    interaction.member;


                const isPremium =
                    member?.roles?.cache?.has(
                        config.premiumRoleId
                    ) ?? false;


                await interaction.reply({

                    content:

                        isPremium

                            ? `📊 **Status:** 💎 Premium\n🔄 Resets remaining: **${resetsLeft}/${maxResets}**`

                            : `📊 **Status:** Not Premium\n🔄 Resets remaining: **${resetsLeft}/${maxResets}**`,

                    ephemeral: true

                });

                return;
            }


            // ---------------------------------------------
            // PLACEHOLDER BUTTONS
            // ---------------------------------------------

            const replies = {

                polo_get:
                    '📄 No link has been set for **Get Script** yet.',

                polo_xp:
                    '⚡ No link has been set for **Get XP Script** yet.',

                polo_premium:
                    '💎 No link has been set for **Get Premium Key** yet.',

                polo_obfuscate:
                    '🛠️ Upload a Lua file using the `/obfuscate` command.',

                polo_help:
                    '❓ No help link has been configured yet.'

            };


            const content =
                replies[interaction.customId];


            if (content) {

                await interaction.reply({

                    content,

                    ephemeral: true

                });

            }

            return;
        }


        // =================================================
        // MODAL SUBMISSIONS
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
            'polo_redeem_modal'
        ) {

            const inputKey =
                interaction.fields.getTextInputValue(
                    'key_input'
                );


            const success =
                redeemKey(inputKey);


            if (success) {

                const roleId =
                    '1409762874754203742';


                try {

                    await interaction.member.roles.add(
                        roleId
                    );


                    await interaction.reply({

                        content:
                            `✅ Key redeemed successfully!\n` +
                            `You have been given the <@&${roleId}> role.`,

                        ephemeral: true

                    });

                } catch (error) {

                    console.error(
                        'Failed to give redemption role:',
                        error
                    );


                    await interaction.reply({

                        content:
                            '✅ Key redeemed successfully, but I could not give you the role. Contact an administrator.',

                        ephemeral: true

                    });

                }

            } else {

                await interaction.reply({

                    content:
                        '❌ That key is invalid or has already been used.',

                    ephemeral: true

                });

            }

            return;
        }


    } catch (error) {

        console.error(
            'Interaction error:',
            error
        );


        try {

            if (interaction.deferred) {

                await interaction.editReply({

                    content:
                        '❌ An error occurred while processing this interaction.'

                });

            } else if (!interaction.replied) {

                await interaction.reply({

                    content:
                        '❌ An internal error occurred. Check the bot console.',

                    ephemeral: true

                });

            }

        } catch (replyError) {

            console.error(
                'Failed to send error response:',
                replyError
            );

        }

    }

});


// =====================================================
// OBFUSCATE HANDLER
// =====================================================

async function handleObfuscate(interaction) {

    const attachment =
        interaction.options.getAttachment(
            'file'
        );


    const preset =
        interaction.options.getString(
            'preset'
        ) || 'medium';


    if (!attachment) {

        await interaction.reply({

            content:
                '❌ Please upload a Lua file.',

            ephemeral: true

        });

        return;
    }


    if (
        !attachment.name ||
        !attachment.name.toLowerCase().endsWith('.lua')
    ) {

        await interaction.reply({

            content:
                '❌ Please upload a `.lua` file.',

            ephemeral: true

        });

        return;
    }


    if (
        attachment.size >
        2 * 1024 * 1024
    ) {

        await interaction.reply({

            content:
                '❌ File is too large. Maximum size is 2MB.',

            ephemeral: true

        });

        return;
    }


    await interaction.deferReply();


    const jobId =
        `${interaction.user.id}-${Date.now()}`;


    const tempDir =
        path.join(
            __dirname,
            'temp'
        );


    if (!fs.existsSync(tempDir)) {

        fs.mkdirSync(
            tempDir,
            {
                recursive: true
            }
        );

    }


    const inputPath =
        path.join(
            tempDir,
            `${jobId}-input.lua`
        );


    const outputPath =
        path.join(
            tempDir,
            `${jobId}-obfuscated.lua`
        );


    try {

        const response =
            await fetch(
                attachment.url
            );


        if (!response.ok) {

            throw new Error(
                'Failed to download attachment'
            );

        }


        const buffer =
            Buffer.from(
                await response.arrayBuffer()
            );


        fs.writeFileSync(
            inputPath,
            buffer
        );


        await execFileAsync(

            'lua',

            [
                path.join(
                    __dirname,
                    'obfuscator',
                    'obfuscate.lua'
                ),

                inputPath,

                outputPath,

                preset
            ],

            {

                timeout: 30000,

                maxBuffer:
                    10 * 1024 * 1024

            }

        );


        if (!fs.existsSync(outputPath)) {

            throw new Error(
                'Obfuscator did not generate an output file'
            );

        }


        const outputFile =
            new AttachmentBuilder(
                outputPath,
                {
                    name:
                        `obfuscated-${attachment.name}`
                }
            );


        const embed =
            new EmbedBuilder()

                .setTitle(
                    '🔒 Lua Obfuscated'
                )

                .setDescription(

                    `Successfully obfuscated **${attachment.name}**\n\n` +
                    `Preset: **${preset}**`

                );


        await interaction.editReply({

            embeds: [
                embed
            ],

            files: [
                outputFile
            ]

        });


    } catch (error) {

        console.error(
            'Obfuscation error:',
            error
        );


        await interaction.editReply({

            content:
                `❌ Obfuscation failed: \`${error.message}\``

        });


    } finally {

        setTimeout(() => {

            for (
                const file of [
                    inputPath,
                    outputPath
                ]
            ) {

                if (fs.existsSync(file)) {

                    try {

                        fs.unlinkSync(file);

                    } catch {}

                }

            }

        }, 10000);

    }

}


// =====================================================
// LOGIN
// =====================================================

client.login(process.env.DISCORD_TOKEN)
    .catch((err) => {

        console.error(
            'Failed to log in to Discord:',
            err
        );

        process.exit(1);

    });
```
