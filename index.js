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
    ActivityType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const {
    getGuildConfig,
    setGuildLink,
    setPremiumRole,
    setResetLimit,
    loadWhitelist,
    addToWhitelist,
    removeFromWhitelist,
    isWhitelisted
} = require('./lib/storage');

const resetsModule = require('./lib/resets');
const { generateKey } = require('./lib/keygen');
const { commandDefs } = require('./lib/commands');
const DATA_DIR = require('./lib/data-dir');

const useReset =
    resetsModule.useReset ||
    resetsModule.consumeReset;

const getRemaining =
    resetsModule.getRemaining ||
    resetsModule.getResetsRemaining;

const resetUser =
    resetsModule.resetUser ||
    resetsModule.resetResets ||
    resetsModule.clearUserResets;

const DEFAULT_MAX_RESETS =
    resetsModule.DEFAULT_MAX_RESETS ||
    resetsModule.DEFAULT_RESETS ||
    3;


// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================

function validateEnv() {
    const required = [
        'DISCORD_TOKEN',
        'CLIENT_ID',
        'POLO_API_URL',
        'ADMIN_SECRET'
    ];

    const missing = required.filter(
        key => !process.env[key]
    );

    if (missing.length) {
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

process.on('unhandledRejection', err => {
    console.error('Unhandled promise rejection:', err);
});

process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
});


// =====================================================
// OWNER / ADMIN PERMISSIONS
// =====================================================

function getOwnerIds() {
    return (process.env.OWNER_IDS || '')
        .split(/[,\s]+/)
        .map(id => id.trim())
        .filter(Boolean);
}

function canUseRestrictedCommand(interaction) {
    const userId = interaction.user.id;

    if (getOwnerIds().includes(userId)) return true;
    if (isWhitelisted(userId)) return true;
    if (interaction.memberPermissions?.has('Administrator')) return true;
    if (interaction.memberPermissions?.has('ManageGuild')) return true;

    return false;
}

function canManageWhitelist(interaction) {
    const userId = interaction.user.id;

    if (getOwnerIds().includes(userId)) return true;
    if (interaction.memberPermissions?.has('Administrator')) return true;
    if (interaction.memberPermissions?.has('ManageGuild')) return true;

    return false;
}


// =====================================================
// CLOUDFLARE API
// =====================================================

const POLO_API_URL =
    process.env.POLO_API_URL.replace(/\/+$/, '');

const ADMIN_SECRET =
    process.env.ADMIN_SECRET;


/**
 * Authenticated Cloudflare request.
 *
 * ADMIN_SECRET stays inside the bot environment.
 */
async function cloudflareRequest(endpoint, body = {}) {
    const response = await fetch(
        `${POLO_API_URL}${endpoint}`,
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_SECRET}`
            },

            body: JSON.stringify(body)
        }
    );

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Cloudflare returned an invalid response (${response.status})`
        );
    }

    if (!response.ok || data.success === false) {
        const error = new Error(
            data.message ||
            `Cloudflare API error (${response.status})`
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}


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
    const rest = new REST({
        version: '10'
    }).setToken(
        process.env.DISCORD_TOKEN
    );

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

            console.log(
                'Guild slash commands registered.'
            );

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
            'Failed to register commands:',
            err
        );
    }
}


// =====================================================
// URL NORMALIZER
// =====================================================

function normalizeURL(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    value = value.trim();

    if (!value) {
        return null;
    }

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

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
// LINK BUTTON
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
                error
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
    let config = {};

    try {
        config =
            getGuildConfig(guildId) || {};
    } catch (error) {
        console.error(
            'Failed to load guild config:',
            error
        );
    }

    const getButton =
        createLinkOrButton(
            'Get Script',
            '📄',
            config.getLink,
            'polo_get',
            ButtonStyle.Danger
        );

    const xpButton =
        createLinkOrButton(
            'Get XP Script',
            '⚡',
            config.xpLink,
            'polo_xp',
            ButtonStyle.Danger
        );

    const premiumButton =
        createLinkOrButton(
            'Get Premium Key',
            '💎',
            config.premiumLink,
            'polo_premium',
            ButtonStyle.Success
        );

    const helpButton =
        createLinkOrButton(
            'Help',
            '❓',
            config.helpLink,
            'polo_help',
            ButtonStyle.Danger
        );

    const row1 =
        new ActionRowBuilder().addComponents(
            getButton,
            xpButton,
            new ButtonBuilder()
                .setCustomId('polo_redeem')
                .setLabel('Redeem Key')
                .setEmoji('🔑')
                .setStyle(ButtonStyle.Secondary)
        );

    const row2 =
        new ActionRowBuilder().addComponents(
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

    const row3 =
        new ActionRowBuilder().addComponents(
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

    const statuses = [
        {
            name: '/polo',
            type: ActivityType.Watching
        },

        {
            name: 'RH2',
            type: ActivityType.Competing
        },

        {
            name: 'polohub',
            type: ActivityType.Playing
        }
    ];

    let currentStatus = 0;

    function updateStatus() {

        const status =
            statuses[currentStatus];

        client.user.setPresence({
            activities: [
                {
                    name: status.name,
                    type: status.type
                }
            ],

            status: 'online'
        });

        currentStatus =
            (currentStatus + 1) %
            statuses.length;
    }

    updateStatus();

    setInterval(
        updateStatus,
        10000
    );
});


client.on('error', err => {
    console.error(
        'Discord client error:',
        err
    );
});


// =====================================================
// INTERACTION HANDLER
// =====================================================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            // =================================================
            // SLASH COMMANDS
            // =================================================

            if (interaction.isChatInputCommand()) {

                // ---------------------------------------------
                // /panel
                // ---------------------------------------------

                if (
                    interaction.commandName === 'panel'
                ) {

                    await interaction.reply({
                        embeds: [
                            buildPanelEmbed()
                        ],

                        components:
                            buildPanelRows(
                                interaction.guildId
                            )
                    });

                    return;
                }


                // ---------------------------------------------
                // /free
                // ---------------------------------------------

                if (
                    interaction.commandName === 'free'
                ) {

                    if (
                        !canUseRestrictedCommand(
                            interaction
                        )
                    ) {

                        await interaction.reply({
                            content:
                                '❌ You do not have permission to use this command.',
                            ephemeral: true
                        });

                        return;
                    }

                    const text =
                        interaction.options.getString(
                            'text',
                            true
                        );

                    await interaction.reply({
                        content: text
                    });

                    return;
                }


                // ---------------------------------------------
                // /whitelist
                // ---------------------------------------------

                if (
                    interaction.commandName === 'whitelist'
                ) {

                    if (
                        !canManageWhitelist(
                            interaction
                        )
                    ) {

                        await interaction.reply({
                            content:
                                '❌ Only owners and admins can manage the whitelist.',
                            ephemeral: true
                        });

                        return;
                    }

                    const sub =
                        interaction.options.getSubcommand();

                    if (sub === 'add') {

                        const user =
                            interaction.options.getUser(
                                'user',
                                true
                            );

                        const added =
                            addToWhitelist(
                                user.id
                            );

                        await interaction.reply({
                            content: added
                                ? `✅ Added **${user.tag}** (\`${user.id}\`) to the whitelist.`
                                : `ℹ️ **${user.tag}** is already on the whitelist.`,
                            ephemeral: true
                        });

                        return;
                    }

                    if (sub === 'remove') {

                        const user =
                            interaction.options.getUser(
                                'user',
                                true
                            );

                        const removed =
                            removeFromWhitelist(
                                user.id
                            );

                        await interaction.reply({
                            content: removed
                                ? `✅ Removed **${user.tag}** from the whitelist.`
                                : `ℹ️ **${user.tag}** was not on the whitelist.`,
                            ephemeral: true
                        });

                        return;
                    }

                    if (sub === 'list') {

                        const list =
                            loadWhitelist();

                        if (!list.length) {

                            await interaction.reply({
                                content:
                                    '📋 The whitelist is currently empty.',
                                ephemeral: true
                            });

                            return;
                        }

                        const lines =
                            await Promise.all(
                                list.map(
                                    async id => {

                                        try {

                                            const u =
                                                await interaction.client.users.fetch(id);

                                            return `• **${u.tag}** (\`${id}\`)`;

                                        } catch {

                                            return `• Unknown user (\`${id}\`)`;
                                        }
                                    }
                                )
                            );

                        await interaction.reply({
                            content:
                                `📋 **Whitelist** (${list.length}):\n${lines.join('\n')}`,
                            ephemeral: true
                        });

                        return;
                    }
                }


                // ---------------------------------------------
                // /setlink
                // ---------------------------------------------

                if (
                    interaction.commandName === 'setlink'
                ) {

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

                    setGuildLink(
                        interaction.guildId,
                        button,
                        url.trim()
                    );

                    const labels = {
                        getLink: 'Get Script',
                        xpLink: 'Get XP Script',
                        premiumLink: 'Get Premium Key',
                        helpLink: 'Help'
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
                    interaction.commandName === 'setpremiumrole'
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
                    interaction.commandName === 'setresetlimit'
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
                // ---------------------------------------------

                if (
                    interaction.commandName === 'resethwidresets'
                ) {

                    if (
                        typeof resetUser !== 'function'
                    ) {

                        await interaction.reply({
                            content:
                                '❌ Reset system error.',
                            ephemeral: true
                        });

                        return;
                    }

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


                // =================================================
                // /genkeys
                // =================================================

                if (
                    interaction.commandName === 'genkeys'
                ) {

                    if (
                        !canManageWhitelist(
                            interaction
                        )
                    ) {

                        await interaction.reply({
                            content:
                                '❌ You do not have permission to generate keys.',
                            ephemeral: true
                        });

                        return;
                    }

                    const amount =
                        interaction.options.getInteger(
                            'amount',
                            true
                        );

                    const format =
                        interaction.options.getString(
                            'format'
                        ) || 'polo';

                    await interaction.deferReply({
                        ephemeral: true
                    });

                    const generated = [];

                    for (
                        let i = 0;
                        i < amount;
                        i++
                    ) {

                        const key =
                            generateKey(format);

                        try {

                            await cloudflareRequest(
                                '/create',
                                {
                                    key
                                }
                            );

                            generated.push(key);

                        } catch (error) {

                            console.error(
                                `Failed creating ${key}:`,
                                error
                            );
                        }
                    }

                    if (!generated.length) {

                        await interaction.editReply({
                            content:
                                '❌ Failed to create any keys. Check your Cloudflare API configuration.'
                        });

                        return;
                    }

                    await interaction.editReply({
                        content:
                            `✅ Generated **${generated.length}** key(s) and saved them to Cloudflare KV:\n\n` +
                            '```text\n' +
                            generated.join('\n') +
                            '\n```'
                    });

                    return;
                }


                // =================================================
                // /obfuscate
                // =================================================

                if (
                    interaction.commandName === 'obfuscate'
                ) {

                    await handleObfuscate(
                        interaction
                    );

                    return;
                }
            }


            // =================================================
            // BUTTONS
            // =================================================

            if (interaction.isButton()) {

                // ---------------------------------------------
                // Redeem button
                // ---------------------------------------------

                if (
                    interaction.customId === 'polo_redeem'
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
                // Reset
                // ---------------------------------------------

                if (
                    interaction.customId === 'polo_reset'
                ) {

                    if (
                        typeof useReset !== 'function' ||
                        typeof getRemaining !== 'function'
                    ) {

                        await interaction.reply({
                            content:
                                '❌ Reset system is not configured correctly.',
                            ephemeral: true
                        });

                        return;
                    }

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
                    } =
                        useReset(
                            interaction.guildId,
                            interaction.user.id,
                            maxResets
                        );

                    if (success) {

                        await interaction.reply({
                            content:
                                `🔄 Reset complete.\nYou have **${remaining}/${maxResets}** resets left.`,
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
                // Status
                // ---------------------------------------------

                if (
                    interaction.customId === 'polo_status'
                ) {

                    const config =
                        getGuildConfig(
                            interaction.guildId
                        ) || {};

                    const maxResets =
                        config.resetLimit ||
                        DEFAULT_MAX_RESETS;

                    let resetsLeft =
                        maxResets;

                    if (
                        typeof getRemaining === 'function'
                    ) {

                        resetsLeft =
                            getRemaining(
                                interaction.guildId,
                                interaction.user.id,
                                maxResets
                            );
                    }

                    if (
                        !config.premiumRoleId
                    ) {

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
                    replies[
                        interaction.customId
                    ];

                if (content) {

                    await interaction.reply({
                        content,
                        ephemeral: true
                    });
                }

                return;
            }


            // =================================================
            // REDEEM MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId === 'polo_redeem_modal'
            ) {

                const inputKey =
                    interaction.fields
                        .getTextInputValue(
                            'key_input'
                        )
                        .trim();

                if (!inputKey) {

                    await interaction.reply({
                        content:
                            '❌ Please enter a key.',
                        ephemeral: true
                    });

                    return;
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                try {

                    /*
                     * IMPORTANT:
                     *
                     * We use /redeem here, NOT /verify.
                     *
                     * The Discord user's ID is sent to Cloudflare,
                     * allowing the Worker to permanently associate
                     * the redeemed key with this Discord account.
                     */
                    const result =
                        await cloudflareRequest(
                            '/redeem',
                            {
                                key: inputKey,
                                discordId: interaction.user.id
                            }
                        );


                    // -----------------------------------------
                    // Key already belongs to this user
                    // -----------------------------------------

                    if (
                        result.alreadyRedeemed
                    ) {

                        const roleId =
                            process.env.PREMIUM_ROLE_ID ||
                            getGuildConfig(
                                interaction.guildId
                            )?.premiumRoleId ||
                            '1409762874754203742';

                        try {

                            await interaction.member.roles.add(
                                roleId
                            );

                            await interaction.editReply({
                                content:
                                    `ℹ️ This key is already linked to your Discord account.\n` +
                                    `You have been given the <@&${roleId}> role.`
                            });

                        } catch (error) {

                            console.error(
                                'Failed to give existing redemption role:',
                                error
                            );

                            await interaction.editReply({
                                content:
                                    'ℹ️ This key is already linked to your Discord account, but I could not give you the role. Contact an administrator.'
                            });
                        }

                        return;
                    }


                    // -----------------------------------------
                    // Successful first redemption
                    // -----------------------------------------

                    const roleId =
                        process.env.PREMIUM_ROLE_ID ||
                        getGuildConfig(
                            interaction.guildId
                        )?.premiumRoleId ||
                        '1409762874754203742';

                    try {

                        await interaction.member.roles.add(
                            roleId
                        );

                        await interaction.editReply({
                            content:
                                `✅ **Key redeemed successfully!**\n\n` +
                                `🔑 Your key is now permanently linked to your Discord account.\n` +
                                `💎 You have been given the <@&${roleId}> role.`
                        });

                    } catch (error) {

                        console.error(
                            'Failed to give redemption role:',
                            error
                        );

                        await interaction.editReply({
                            content:
                                `✅ **Key redeemed successfully!**\n\n` +
                                `🔑 Your key is now linked to your Discord account.\n` +
                                `⚠️ I could not give you the premium role. Contact an administrator.`
                        });
                    }

                } catch (error) {

                    console.error(
                        'Key redemption error:',
                        error
                    );

                    // -----------------------------------------
                    // Specific Cloudflare errors
                    // -----------------------------------------

                    if (
                        error.status === 409
                    ) {

                        await interaction.editReply({
                            content:
                                '❌ That key has already been redeemed by another Discord account.'
                        });

                        return;
                    }

                    if (
                        error.status === 403
                    ) {

                        await interaction.editReply({
                            content:
                                `❌ ${error.message || 'That key is invalid or disabled.'}`
                        });

                        return;
                    }

                    await interaction.editReply({
                        content:
                            '❌ Could not connect to the license server. Please try again later.'
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

                if (
                    interaction.deferred
                ) {

                    await interaction.editReply({
                        content:
                            '❌ An error occurred while processing this interaction.'
                    });

                } else if (
                    !interaction.replied
                ) {

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
    }
);


// =====================================================
// OBFUSCATE HANDLER
// =====================================================

async function handleObfuscate(
    interaction
) {

    const attachment =
        interaction.options.getAttachment(
            'file'
        );

    const preset =
        interaction.options.getString(
            'preset'
        ) || 'advanced';

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
        !attachment.name
            .toLowerCase()
            .endsWith('.lua')
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
        500 * 1024
    ) {

        await interaction.reply({
            content:
                '❌ File is too large. Maximum size is **500 KB**.',
            ephemeral: true
        });

        return;
    }

    await interaction.deferReply();

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

        const source =
            await response.text();

        const apiRes =
            await fetch(
                'https://hide.lat/api/obfuscate',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        source,
                        tier: preset,
                        banner: false
                    })
                }
            );

        if (!apiRes.ok) {

            const errText =
                await apiRes
                    .text()
                    .catch(
                        () => 'Unknown error'
                    );

            throw new Error(
                `API returned ${apiRes.status}: ${errText.slice(0, 200)}`
            );
        }

        const data =
            await apiRes.json();

        const obfuscated =
            data.code ||
            data.result ||
            data.output ||
            data.obfuscated ||
            (
                typeof data === 'string'
                    ? data
                    : null
            );

        if (
            !obfuscated ||
            typeof obfuscated !== 'string'
        ) {

            throw new Error(
                'API did not return obfuscated code'
            );
        }

        const tempDir =
            path.join(
                __dirname,
                'temp'
            );

        if (
            !fs.existsSync(tempDir)
        ) {

            fs.mkdirSync(
                tempDir,
                {
                    recursive: true
                }
            );
        }

        const outName =
            `obfuscated-${attachment.name}`;

        const outPath =
            path.join(
                tempDir,
                `${interaction.user.id}-${Date.now()}-${outName}`
            );

        fs.writeFileSync(
            outPath,
            obfuscated,
            'utf8'
        );

        const file =
            new AttachmentBuilder(
                outPath,
                {
                    name: outName
                }
            );

        const embed =
            new EmbedBuilder()
                .setColor(0x00ff88)
                .setTitle(
                    '🔒 Lua Obfuscated'
                )
                .setDescription(
                    `Successfully obfuscated **${attachment.name}**\n\n` +
                    `Preset: **${preset}**\n` +
                    `Provider: hide.lat`
                )
                .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            files: [file]
        });

        setTimeout(() => {

            try {

                if (
                    fs.existsSync(outPath)
                ) {

                    fs.unlinkSync(
                        outPath
                    );
                }

            } catch {}

        }, 15000);

    } catch (error) {

        console.error(
            'Obfuscation error:',
            error
        );

        await interaction.editReply({
            content:
                `❌ Obfuscation failed: \`${error.message}\``
        });
    }
}


// =====================================================
// LOGIN
// =====================================================

client.login(
    process.env.DISCORD_TOKEN
).catch(err => {

    console.error(
        'Failed to log in to Discord:',
        err
    );

    process.exit(1);
});
