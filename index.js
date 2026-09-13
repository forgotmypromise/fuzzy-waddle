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
    isWhitelisted,
    setSupportStatus,
    getSupportStatus,
    getAppStatus,
    setAppStatus,
    isAppOpen
} = require('./lib/storage');

const resetsModule = require('./lib/resets');

const {
    generateKey
} = require('./lib/keygen');

const {
    commandDefs
} = require('./lib/commands');

const DATA_DIR =
    require('./lib/data-dir');

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

    const missing =
        required.filter(
            key => !process.env[key]
        );

    if (missing.length) {
        console.error(
            `Missing required environment variable(s): ${missing.join(', ')}`
        );

        process.exit(1);
    }

    if (!process.env.DISCORD_WEBHOOK) {
        console.warn(
            'DISCORD_WEBHOOK is not configured. Webhook logging is disabled.'
        );
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

process.on(
    'unhandledRejection',
    err => {
        console.error(
            'Unhandled promise rejection:',
            err
        );
    }
);

process.on(
    'uncaughtException',
    err => {
        console.error(
            'Uncaught exception:',
            err
        );
    }
);


// =====================================================
// OWNER / ADMIN PERMISSIONS
// =====================================================

function getOwnerIds() {
    return (
        process.env.OWNER_IDS || ''
    )
        .split(/[,\s]+/)
        .map(id => id.trim())
        .filter(Boolean);
}

function canUseRestrictedCommand(
    interaction
) {
    const userId =
        interaction.user.id;

    if (
        getOwnerIds().includes(userId)
    ) {
        return true;
    }

    if (
        isWhitelisted(userId)
    ) {
        return true;
    }

    if (
        interaction.memberPermissions?.has(
            'Administrator'
        )
    ) {
        return true;
    }

    if (
        interaction.memberPermissions?.has(
            'ManageGuild'
        )
    ) {
        return true;
    }

    return false;
}

function canManageWhitelist(
    interaction
) {
    const userId =
        interaction.user.id;

    if (
        getOwnerIds().includes(userId)
    ) {
        return true;
    }

    if (
        interaction.memberPermissions?.has(
            'Administrator'
        )
    ) {
        return true;
    }

    if (
        interaction.memberPermissions?.has(
            'ManageGuild'
        )
    ) {
        return true;
    }

    return false;
}


// =====================================================
// SUPPORT STATUS
// =====================================================

const SUPPORT_USER_ID =
    '1374126925077024828';

const REASON_MESSAGES = {
    asleep: 'is asleep',
    break: 'is currently on break',
    busy: 'is currently busy / away',
    offline: 'is currently offline / unavailable',
    working: 'is currently working on something else',
    school: 'is currently at school / not home'
};


// =====================================================
// PANEL BUTTON ACCESS CONTROL
// =====================================================

const PANEL_ALLOWED_ROLE_ID =
    process.env.PANEL_ALLOWED_ROLE_ID || '1409762874754203742';
const PANEL_BLACKLISTED_ROLE_ID =
    process.env.PANEL_BLACKLISTED_ROLE_ID || '1409765159164969071';

/**
 * Panel buttons (except Help) require PANEL_ALLOWED_ROLE_ID.
 * PANEL_BLACKLISTED_ROLE_ID is blocked from everything except Help.
 * Help is available to everyone.
 */
function canUsePanelButton(interaction, customId) {
    const isHelp = customId === 'polo_help';

    const member = interaction.member;
    const roles = member?.roles?.cache;

    const hasAllowed =
        roles?.has(PANEL_ALLOWED_ROLE_ID) === true;
    const hasBlacklisted =
        roles?.has(PANEL_BLACKLISTED_ROLE_ID) === true;

    // Help: open to everyone (including blacklisted)
    if (isHelp) {
        return { allowed: true };
    }

    // Blacklisted role: blocked from all non-help panel buttons
    if (hasBlacklisted) {
        return {
            allowed: false,
            reason:
                '❌ You are not allowed to use this panel button.'
        };
    }

    // All other panel buttons require the allowed role
    if (!hasAllowed) {
        return {
            allowed: false,
            reason:
                '❌ You need the required role to use this panel button.'
        };
    }

    return { allowed: true };
}


function parseUntilTime(timeStr) {
    if (!timeStr) return null;

    const cleaned =
        timeStr
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '');

    const match =
        cleaned.match(
            /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i
        );

    if (!match) return null;

    let hour =
        parseInt(match[1], 10);

    const minute =
        match[2]
            ? parseInt(match[2], 10)
            : 0;

    const meridiem =
        match[3]
            ? match[3].toLowerCase()
            : null;

    if (
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    if (meridiem) {
        if (
            hour < 1 ||
            hour > 12
        ) {
            return null;
        }

        if (
            meridiem === 'pm' &&
            hour !== 12
        ) {
            hour += 12;
        }

        if (
            meridiem === 'am' &&
            hour === 12
        ) {
            hour = 0;
        }
    } else {
        if (
            hour < 0 ||
            hour > 23
        ) {
            return null;
        }
    }

    const now =
        new Date();

    const target =
        new Date(now);

    target.setHours(
        hour,
        minute,
        0,
        0
    );

    if (target <= now) {
        target.setDate(
            target.getDate() + 1
        );
    }

    return target;
}


// =====================================================
// DISCORD WEBHOOK LOGGING
// =====================================================

async function sendDiscordLog({
    title,
    description,
    color = 0xab0000,
    fields = []
}) {
    const webhookURL =
        process.env.DISCORD_WEBHOOK;

    if (!webhookURL) {
        return;
    }

    try {
        const embed = {
            title,
            description,
            color,
            fields,
            timestamp:
                new Date().toISOString(),
            footer: {
                text:
                    'Polo License System'
            }
        };

        const response =
            await fetch(
                webhookURL,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json'
                    },
                    body: JSON.stringify({
                        embeds: [embed]
                    })
                }
            );

        if (!response.ok) {
            console.error(
                `Discord webhook failed: HTTP ${response.status}`
            );
        }

    } catch (error) {
        console.error(
            'Discord webhook error:',
            error
        );
    }
}


// =====================================================
// CLOUDFLARE API
// =====================================================

const POLO_API_URL =
    process.env.POLO_API_URL
        .replace(/\/+$/, '');

const ADMIN_SECRET =
    process.env.ADMIN_SECRET;


/**
 * Authenticated Cloudflare request.
 *
 * ADMIN_SECRET never leaves Railway.
 */
async function cloudflareRequest(
    endpoint,
    body = {}
) {
    const response =
        await fetch(
            `${POLO_API_URL}${endpoint}`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json',

                    'Authorization':
                        `Bearer ${ADMIN_SECRET}`
                },

                body:
                    JSON.stringify(body)
            }
        );

    let data;

    try {
        data =
            await response.json();
    } catch {
        throw new Error(
            `Cloudflare returned an invalid response (${response.status})`
        );
    }

    if (
        !response.ok ||
        data.success === false
    ) {
        const error =
            new Error(
                data.message ||
                `Cloudflare API error (${response.status})`
            );

        error.status =
            response.status;

        error.data =
            data;

        throw error;
    }

    return data;
}


// =====================================================
// DISCORD CLIENT
// =====================================================

const client =
    new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });


// =====================================================
// COMMAND REGISTRATION
// =====================================================

async function registerCommands() {
    const rest =
        new REST({
            version: '10'
        }).setToken(
            process.env.DISCORD_TOKEN
        );

    /*
     * IMPORTANT:
     *
     * Remove duplicate command definitions before sending
     * them to Discord.
     *
     * Discord uses the command name as the unique identifier.
     * If commandDefs accidentally contains the same command
     * more than once, only the last copy will be registered.
     */
    const uniqueCommands =
        Array.from(
            new Map(
                commandDefs.map(
                    command => [
                        command.name,
                        command
                    ]
                )
            ).values()
        );

    console.log(
        `Registering ${uniqueCommands.length} unique slash commands...`
    );

    try {

        /*
         * PUT replaces the complete global command set.
         *
         * This means old/duplicated commands are removed
         * instead of another copy being added.
         */
        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body:
                    uniqueCommands
            }
        );

        console.log(
            'Global slash commands registered successfully.'
        );

        /*
         * Guild commands are also replaced completely.
         * This prevents old duplicated guild commands.
         */
        if (
            process.env.GUILD_ID
        ) {
            await rest.put(
                Routes.applicationGuildCommands(
                    process.env.CLIENT_ID,
                    process.env.GUILD_ID
                ),
                {
                    body:
                        uniqueCommands
                }
            );

            console.log(
                `Guild slash commands registered successfully for ${process.env.GUILD_ID}.`
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
    if (
        !value ||
        typeof value !== 'string'
    ) {
        return null;
    }

    value =
        value.trim();

    if (!value) {
        return null;
    }

    if (
        /^https?:\/\//i.test(value)
    ) {
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
            '🔄 **Reset HWID** — Reset Roblox binding\n' +
            '📊 **View Status** — Check your account info\n' +
            '❓ **Help** — Get support and guidance'
        )
        .setFooter({
            text:
                'Polo Panel • Key Manager System'
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
    const normalizedURL =
        normalizeURL(url);

    if (normalizedURL) {
        try {
            return new ButtonBuilder()
                .setLabel(label)
                .setEmoji(emoji)
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    normalizedURL
                );

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
        .setStyle(
            fallbackStyle
        );
}


// =====================================================
// PANEL BUTTONS
// =====================================================

function buildPanelRows(guildId) {
    let config = {};

    try {
        config =
            getGuildConfig(
                guildId
            ) || {};

    } catch (error) {
        console.error(
            'Failed to load guild config:',
            error
        );
    }

    // Get Script / Get XP always use custom buttons so we can
    // send the configured script as an ephemeral message.
    const getButton = new ButtonBuilder()
        .setCustomId('polo_get')
        .setLabel('Get Script')
        .setEmoji('📄')
        .setStyle(ButtonStyle.Danger);

    const xpButton = new ButtonBuilder()
        .setCustomId('polo_xp')
        .setLabel('Get XP Script')
        .setEmoji('⚡')
        .setStyle(ButtonStyle.Danger);

    // Premium must be a custom button so role checks apply
    // (Link buttons cannot be restricted by the bot).
    const premiumButton = new ButtonBuilder()
        .setCustomId('polo_premium')
        .setLabel('Get Premium Key')
        .setEmoji('💎')
        .setStyle(ButtonStyle.Success);

    // Help can remain a link if configured; open to everyone.
    // If no link is set, it falls back to a custom button.
    const helpButton =
        createLinkOrButton(
            'Help',
            '❓',
            config.helpLink,
            'polo_help',
            ButtonStyle.Danger
        );

    const row1 =
        new ActionRowBuilder()
            .addComponents(
                getButton,
                xpButton,

                new ButtonBuilder()
                    .setCustomId(
                        'polo_redeem'
                    )
                    .setLabel(
                        'Redeem Key'
                    )
                    .setEmoji('🔑')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

    const row2 =
        new ActionRowBuilder()
            .addComponents(
                premiumButton,

                new ButtonBuilder()
                    .setCustomId(
                        'polo_reset'
                    )
                    .setLabel(
                        'Reset'
                    )
                    .setEmoji('🔄')
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        'polo_status'
                    )
                    .setLabel(
                        'View Status'
                    )
                    .setEmoji('📊')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

    const row3 =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        'polo_obfuscate'
                    )
                    .setLabel(
                        'Obfuscate'
                    )
                    .setEmoji('🛠️')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

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

client.once(
    'ready',
    async () => {
        console.log(
            `Logged in as ${client.user.tag}`
        );

        await registerCommands();

        const statuses = [
            {
                name: '/polo',
                type:
                    ActivityType.Watching
            },
            {
                name: 'RH2',
                type:
                    ActivityType.Competing
            },
            {
                name: 'polohub',
                type:
                    ActivityType.Playing
            }
        ];

        let currentStatus = 0;

        function updateStatus() {
            const status =
                statuses[currentStatus];

            client.user.setPresence({
                activities: [
                    {
                        name:
                            status.name,
                        type:
                            status.type
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
    }
);


client.on(
    'error',
    err => {
        console.error(
            'Discord client error:',
            err
        );
    }
);


// =====================================================
// TICKET CHANNEL AUTO-REPLY
// =====================================================

client.on(
    'channelCreate',
    async channel => {
        try {
            if (
                channel.type !== 0
            ) {
                return;
            }

            if (
                !channel.name ||
                !/^ticket-\d+/i.test(
                    channel.name
                )
            ) {
                return;
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1500
                    )
            );

            const status =
                getSupportStatus(
                    channel.guildId
                );

            let message;

            if (status) {
                const reasonText =
                    REASON_MESSAGES[
                        status.reason
                    ] ||
                    status.reason;

                message =
                    `Hello thank you for contacting support, currently <@${SUPPORT_USER_ID}> ${reasonText}. ` +
                    `We will try to reply and help you as soon as possible.`;
            } else {
                message =
                    'Hello thank you for creating a ticket, please be patient and our support team will be right with you.';
            }

            await channel.send(
                message
            );

        } catch (err) {
            console.error(
                'Failed to send ticket welcome message:',
                err
            );
        }
    }
);


// =====================================================
// FREE SCRIPT AUTO-REPLY
// =====================================================

client.on(
    'messageCreate',
    async message => {
        try {
            if (
                message.author.bot
            ) {
                return;
            }

            if (
                !message.guild
            ) {
                return;
            }

            const content =
                message.content.toLowerCase();

            const isAskingAboutFreeScript =
                (
                    content.includes(
                        'free script'
                    ) ||
                    content.includes(
                        'free scripts'
                    )
                ) &&
                (
                    content.includes('how') ||
                    content.includes('where') ||
                    content.includes('get') ||
                    content.includes('obtain') ||
                    content.includes('can i') ||
                    content.includes('do i')
                );

            const exactTriggers = [
                'how do i get the free script',
                'how do i get free script',
                'how to get the free script',
                'how to get free script',
                'where is the free script',
                'where can i get the free script',
                'how do i get free',
                'get free script',
                'how get free script'
            ];

            const matched =
                isAskingAboutFreeScript ||
                exactTriggers.some(
                    t =>
                        content.includes(t)
                );

            if (!matched) {
                return;
            }

            console.log(
                `[Free Script] Triggered by ${message.author.tag}: "${message.content}"`
            );

            await message.reply({
                content:
                    'You can obtain the free script by following the steps here: https://discord.com/channels/1409757916990541826/1544406119097831504'
            });

        } catch (err) {
            console.error(
                'Free script auto-reply error:',
                err
            );
        }
    }
);


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

            if (
                interaction.isChatInputCommand()
            ) {

                // ---------------------------------------------
                // /panel
                // ---------------------------------------------

                if (
                    interaction.commandName ===
                    'panel'
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
                    interaction.commandName ===
                    'free'
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
                    interaction.commandName ===
                    'whitelist'
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
                        interaction.options
                            .getSubcommand();

                    if (
                        sub === 'add'
                    ) {
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
                            content:
                                added
                                    ? `✅ Added **${user.tag}** (\`${user.id}\`) to the whitelist.`
                                    : `ℹ️ **${user.tag}** is already on the whitelist.`,
                            ephemeral: true
                        });

                        return;
                    }

                    if (
                        sub === 'remove'
                    ) {
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
                            content:
                                removed
                                    ? `✅ Removed **${user.tag}** from the whitelist.`
                                    : `ℹ️ **${user.tag}** was not on the whitelist.`,
                            ephemeral: true
                        });

                        return;
                    }

                    if (
                        sub === 'list'
                    ) {
                        const list =
                            loadWhitelist();

                        if (
                            !list.length
                        ) {
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
                                                await interaction.client.users.fetch(
                                                    id
                                                );

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
                    interaction.commandName ===
                    'setlink'
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



                // =================================================
                // /setscript
                // =================================================

                if (
                    interaction.commandName ===
                    'setscript'
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

                    if (!interaction.guildId) {
                        await interaction.reply({
                            content:
                                '❌ Use this command in a server.',
                            ephemeral: true
                        });
                        return;
                    }

                    const type =
                        interaction.options.getString(
                            'type',
                            true
                        );

                    let content =
                        interaction.options.getString(
                            'content'
                        ) || '';

                    const file =
                        interaction.options.getAttachment(
                            'file'
                        );

                    if (file) {
                        try {
                            const res = await fetch(file.url);
                            if (!res.ok) {
                                throw new Error(
                                    `Failed to download file (${res.status})`
                                );
                            }
                            content = await res.text();
                        } catch (err) {
                            await interaction.reply({
                                content:
                                    `❌ Could not read the uploaded file: ${err.message || err}`,
                                ephemeral: true
                            });
                            return;
                        }
                    }

                    content = String(content || '').trim();

                    if (!content) {
                        await interaction.reply({
                            content:
                                '❌ Provide script `content` text and/or a `file` attachment.',
                            ephemeral: true
                        });
                        return;
                    }

                    const key =
                        type === 'xp'
                            ? 'xpScript'
                            : 'getScript';

                    const label =
                        type === 'xp'
                            ? 'Get XP Script'
                            : 'Get Script';

                    setGuildLink(
                        interaction.guildId,
                        key,
                        content
                    );

                    const preview =
                        content.length > 200
                            ? content.slice(0, 200) + '…'
                            : content;

                    await interaction.reply({
                        content:
                            `✅ **${label}** content saved (${content.length} characters).\n\n` +
                            `Preview:\n\`\`\`lua\n${preview}\n\`\`\`\n` +
                            `Users who press the panel button will receive this as an ephemeral message only they can see.`,
                        ephemeral: true
                    });

                    return;
                }


                if (
                    interaction.commandName ===
                    'setpremiumrole'
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
                    interaction.commandName ===
                    'resethwidresets'
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

                    if (
                        typeof resetUser !==
                        'function'
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
                // /disable
                // =================================================

                if (
                    interaction.commandName ===
                    'disable'
                ) {
                    if (
                        !canManageWhitelist(
                            interaction
                        )
                    ) {
                        await interaction.reply({
                            content:
                                '❌ You do not have permission to disable licenses.',
                            ephemeral: true
                        });

                        return;
                    }

                    const key =
                        interaction.options.getString(
                            'key',
                            true
                        ).trim();

                    await interaction.deferReply({
                        ephemeral: true
                    });

                    try {
                        const result =
                            await cloudflareRequest(
                                '/disable',
                                {
                                    key
                                }
                            );

                        await interaction.editReply({
                            content:
                                `🔒 **License disabled successfully.**\n\n` +
                                `🔑 Key: \`${key}\`\n` +
                                `📌 Status: **${result.status || 'disabled'}**`
                        });

                        await sendDiscordLog({
                            title:
                                '🔒 License Disabled',

                            description:
                                'A license key was disabled.',

                            color:
                                0xffaa00,

                            fields: [
                                {
                                    name:
                                        'Admin',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Key',
                                    value:
                                        `\`${key}\``,
                                    inline: false
                                }
                            ]
                        });

                    } catch (error) {
                        console.error(
                            'Disable license error:',
                            error
                        );

                        await interaction.editReply({
                            content:
                                `❌ Failed to disable license.\n\n` +
                                `**${error.message || 'Unknown error'}**`
                        });
                    }

                    return;
                }


                // =================================================
                // /enable
                // =================================================

                if (
                    interaction.commandName ===
                    'enable'
                ) {
                    if (
                        !canManageWhitelist(
                            interaction
                        )
                    ) {
                        await interaction.reply({
                            content:
                                '❌ You do not have permission to enable licenses.',
                            ephemeral: true
                        });

                        return;
                    }

                    const key =
                        interaction.options.getString(
                            'key',
                            true
                        ).trim();

                    await interaction.deferReply({
                        ephemeral: true
                    });

                    try {
                        const result =
                            await cloudflareRequest(
                                '/enable',
                                {
                                    key
                                }
                            );

                        await interaction.editReply({
                            content:
                                `🔓 **License enabled successfully.**\n\n` +
                                `🔑 Key: \`${key}\`\n` +
                                `📌 Status: **${result.status || 'enabled'}**\n` +
                                `🎮 Roblox binding has been cleared.`
                        });

                        await sendDiscordLog({
                            title:
                                '🔓 License Enabled',

                            description:
                                'A disabled license key was enabled.',

                            color:
                                0x00ff88,

                            fields: [
                                {
                                    name:
                                        'Admin',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Key',
                                    value:
                                        `\`${key}\``,
                                    inline: false
                                }
                            ]
                        });

                    } catch (error) {
                        console.error(
                            'Enable license error:',
                            error
                        );

                        await interaction.editReply({
                            content:
                                `❌ Failed to enable license.\n\n` +
                                `**${error.message || 'Unknown error'}**`
                        });
                    }

                    return;
                }


                // =================================================
                // /blacklist
                // =================================================

                if (
                    interaction.commandName ===
                    'blacklist'
                ) {
                    if (
                        !canManageWhitelist(
                            interaction
                        )
                    ) {
                        await interaction.reply({
                            content:
                                '❌ You do not have permission to blacklist licenses.',
                            ephemeral: true
                        });

                        return;
                    }

                    const key =
                        interaction.options.getString(
                            'key',
                            true
                        ).trim();

                    const reason =
                        interaction.options.getString(
                            'reason'
                        )?.trim() ||
                        'No reason provided';

                    await interaction.deferReply({
                        ephemeral: true
                    });

                    try {
                        const result =
                            await cloudflareRequest(
                                '/blacklist',
                                {
                                    key,
                                    reason,
                                    blacklistedBy:
                                        interaction.user.id
                                }
                            );

                        await interaction.editReply({
                            content:
                                `🚫 **License permanently blacklisted.**\n\n` +
                                `🔑 Key: \`${key}\`\n` +
                                `📝 Reason: **${reason}**\n` +
                                `📌 Status: **${result.status || 'blacklisted'}**\n\n` +
                                `This license can no longer be enabled.`
                        });

                        await sendDiscordLog({
                            title:
                                '🚫 License Blacklisted',

                            description:
                                'A license key was permanently blacklisted.',

                            color:
                                0xff0000,

                            fields: [
                                {
                                    name:
                                        'Admin',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Key',
                                    value:
                                        `\`${key}\``,
                                    inline: false
                                },
                                {
                                    name:
                                        'Reason',
                                    value:
                                        reason.slice(
                                            0,
                                            1024
                                        ),
                                    inline: false
                                }
                            ]
                        });

                    } catch (error) {
                        console.error(
                            'Blacklist license error:',
                            error
                        );

                        await interaction.editReply({
                            content:
                                `❌ Failed to blacklist license.\n\n` +
                                `**${error.message || 'Unknown error'}**`
                        });
                    }

                    return;
                }


                // =================================================
                // /genkeys
                // =================================================

                if (
                    interaction.commandName ===
                    'genkeys'
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
                            generateKey(
                                format
                            );

                        try {
                            await cloudflareRequest(
                                '/create',
                                {
                                    key
                                }
                            );

                            generated.push(
                                key
                            );

                        } catch (error) {
                            console.error(
                                `Failed creating ${key}:`,
                                error
                            );
                        }
                    }

                    if (
                        !generated.length
                    ) {
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

                    await sendDiscordLog({
                        title:
                            '🔑 Keys Generated',

                        description:
                            'New license keys were generated.',

                        color:
                            0x00aaff,

                        fields: [
                            {
                                name:
                                    'Discord User',
                                value:
                                    `<@${interaction.user.id}>`,
                                inline: true
                            },
                            {
                                name:
                                    'Discord ID',
                                value:
                                    `\`${interaction.user.id}\``,
                                inline: true
                            },
                            {
                                name:
                                    'Amount',
                                value:
                                    `\`${generated.length}\``,
                                inline: true
                            },
                            {
                                name:
                                    'Format',
                                value:
                                    `\`${format}\``,
                                inline: true
                            }
                        ]
                    });

                    return;
                }


                // =================================================
                // /obfuscate
                // =================================================

                if (
                    interaction.commandName ===
                    'obfuscate'
                ) {
                    await handleObfuscate(
                        interaction
                    );

                    return;
                }


                // =================================================
                // /setstatus
                // =================================================

                if (
                    interaction.commandName ===
                    'setstatus'
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

                    const timeStr =
                        interaction.options.getString(
                            'time',
                            true
                        );

                    const reason =
                        interaction.options.getString(
                            'reason',
                            true
                        );

                    const until =
                        parseUntilTime(
                            timeStr
                        );

                    if (!until) {
                        await interaction.reply({
                            content:
                                '❌ Could not parse the time. Try formats like `12am`, `00:00`, `3:30pm`, or `15:30`.',
                            ephemeral: true
                        });

                        return;
                    }

                    setSupportStatus(
                        interaction.guildId,
                        until.getTime(),
                        reason
                    );

                    const readable =
                        until.toLocaleString(
                            'en-US',
                            {
                                hour:
                                    'numeric',
                                minute:
                                    '2-digit',
                                hour12:
                                    true,
                                month:
                                    'short',
                                day:
                                    'numeric'
                            }
                        );

                    const reasonText =
                        REASON_MESSAGES[
                            reason
                        ] || reason;

                    await interaction.reply({
                        content:
                            `✅ Support status set.\n` +
                            `Until: **${readable}**\n` +
                            `Reason: **${reasonText}**\n\n` +
                            `New tickets will now show this status until that time.`,
                        ephemeral: true
                    });

                    return;
                }


                // ---------------------------------------------
                // /apply
                // ---------------------------------------------

                if (
                    interaction.commandName ===
                    'apply'
                ) {
                    const role =
                        interaction.options.getString(
                            'role',
                            true
                        );

                    const appStatus = getAppStatus(interaction.guildId);

                    if (!isAppOpen(interaction.guildId, role)) {
                        const label =
                            role.charAt(0).toUpperCase() +
                            role.slice(1);
                        const openOnes = Object.entries(appStatus)
                            .filter(([, open]) => open)
                            .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

                        await interaction.reply({
                            content:
                                `❌ **${label}** applications are currently **closed**.\n\n` +
                                (openOnes.length
                                    ? `Currently open: **${openOnes.join(', ')}**`
                                    : 'No applications are open right now.'),
                            ephemeral: true
                        });

                        return;
                    }

                    // ---------- MEDIA ----------
                    if (role === 'media') {
                        const modal =
                            new ModalBuilder()
                                .setCustomId(
                                    'media_application_modal'
                                )
                                .setTitle(
                                    'Media Application'
                                );

                        const channelLink =
                            new TextInputBuilder()
                                .setCustomId(
                                    'channel_link'
                                )
                                .setLabel(
                                    'Channel / Content Link'
                                )
                                .setPlaceholder(
                                    'https://youtube.com/@yourchannel or TikTok link'
                                )
                                .setStyle(
                                    TextInputStyle.Short
                                )
                                .setRequired(true)
                                .setMaxLength(
                                    200
                                );

                        const platform =
                            new TextInputBuilder()
                                .setCustomId(
                                    'platform'
                                )
                                .setLabel(
                                    'Platform'
                                )
                                .setPlaceholder(
                                    'YouTube, TikTok, Instagram, Twitch, etc.'
                                )
                                .setStyle(
                                    TextInputStyle.Short
                                )
                                .setRequired(true)
                                .setMaxLength(
                                    50
                                );

                        const followers =
                            new TextInputBuilder()
                                .setCustomId(
                                    'followers'
                                )
                                .setLabel(
                                    'Follower / Subscriber Count'
                                )
                                .setPlaceholder(
                                    'e.g. 12.5K'
                                )
                                .setStyle(
                                    TextInputStyle.Short
                                )
                                .setRequired(true)
                                .setMaxLength(
                                    30
                                );

                        const niche =
                            new TextInputBuilder()
                                .setCustomId(
                                    'niche'
                                )
                                .setLabel(
                                    'Content Type / Niche'
                                )
                                .setPlaceholder(
                                    'Gaming, Roblox, edits, memes, etc.'
                                )
                                .setStyle(
                                    TextInputStyle.Short
                                )
                                .setRequired(true)
                                .setMaxLength(
                                    100
                                );

                        const why =
                            new TextInputBuilder()
                                .setCustomId(
                                    'why'
                                )
                                .setLabel(
                                    'Why do you want the Media role?'
                                )
                                .setPlaceholder(
                                    'Tell us about yourself and why you would be a good fit...'
                                )
                                .setStyle(
                                    TextInputStyle.Paragraph
                                )
                                .setRequired(true)
                                .setMaxLength(
                                    1000
                                );

                        modal.addComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    channelLink
                                ),

                            new ActionRowBuilder()
                                .addComponents(
                                    platform
                                ),

                            new ActionRowBuilder()
                                .addComponents(
                                    followers
                                ),

                            new ActionRowBuilder()
                                .addComponents(
                                    niche
                                ),

                            new ActionRowBuilder()
                                .addComponents(
                                    why
                                )
                        );

                        await interaction.showModal(
                            modal
                        );

                        return;
                    }

                    // ---------- STAFF ----------
                    if (role === 'staff') {
                        const modal = new ModalBuilder()
                            .setCustomId('staff_application_modal')
                            .setTitle('Staff Application');

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('age')
                                    .setLabel('Age')
                                    .setPlaceholder('e.g. 17')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(10)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('timezone')
                                    .setLabel('Timezone')
                                    .setPlaceholder('e.g. EST, GMT+1, PST')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(30)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('experience')
                                    .setLabel('Previous staff / moderation experience')
                                    .setPlaceholder('Describe any past moderation or staff experience...')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                                    .setMaxLength(1000)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('why')
                                    .setLabel('Why do you want to be Staff?')
                                    .setPlaceholder('Explain your motivation and what you can bring...')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                                    .setMaxLength(1000)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('extra')
                                    .setLabel('Anything else we should know?')
                                    .setPlaceholder('Optional extra information')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(false)
                                    .setMaxLength(800)
                            )
                        );

                        await interaction.showModal(modal);
                        return;
                    }

                    // ---------- HELPER ----------
                    if (role === 'helper') {
                        const modal = new ModalBuilder()
                            .setCustomId('helper_application_modal')
                            .setTitle('Helper Application');

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('age')
                                    .setLabel('Age')
                                    .setPlaceholder('e.g. 16')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(10)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('timezone')
                                    .setLabel('Timezone')
                                    .setPlaceholder('e.g. EST, GMT+1')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(30)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('availability')
                                    .setLabel('How often can you help?')
                                    .setPlaceholder('Daily, a few hours a day, weekends only, etc.')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                                    .setMaxLength(100)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('why')
                                    .setLabel('Why do you want to be a Helper?')
                                    .setPlaceholder('Tell us why you want to help the community...')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(true)
                                    .setMaxLength(1000)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('extra')
                                    .setLabel('Anything else?')
                                    .setPlaceholder('Optional extra information')
                                    .setStyle(TextInputStyle.Paragraph)
                                    .setRequired(false)
                                    .setMaxLength(800)
                            )
                        );

                        await interaction.showModal(modal);
                        return;
                    }
                }


                // ---------------------------------------------
                // /toggleapps
                // ---------------------------------------------

                if (
                    interaction.commandName ===
                    'toggleapps'
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

                    const type =
                        interaction.options.getString(
                            'type',
                            true
                        );
                    const state =
                        interaction.options.getString(
                            'state',
                            true
                        );
                    const isOpen = state === 'open';

                    const newStatus = setAppStatus(
                        interaction.guildId,
                        type,
                        isOpen
                    );

                    // Re-read to confirm what was actually saved
                    const confirmed = getAppStatus(interaction.guildId);

                    const format = (key) =>
                        `**${key.charAt(0).toUpperCase() + key.slice(1)}**: ${confirmed[key] ? '🟢 Open' : '🔴 Closed'}`;

                    await interaction.reply({
                        content:
                            `✅ Application status updated.\n\n` +
                            `${format('media')}\n` +
                            `${format('staff')}\n` +
                            `${format('helper')}`,
                        ephemeral: true
                    });

                    return;
                }
            }


            // =================================================
            // BUTTONS
            // =================================================

            if (
                interaction.isButton()
            ) {

                // Panel button access control (all polo_* buttons)
                if (
                    typeof interaction.customId === 'string' &&
                    interaction.customId.startsWith('polo_')
                ) {
                    const access = canUsePanelButton(
                        interaction,
                        interaction.customId
                    );

                    if (!access.allowed) {
                        await interaction.reply({
                            content: access.reason,
                            ephemeral: true
                        });
                        return;
                    }
                }

                // ---------------------------------------------
                // Redeem
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
                // RESET HWID / ROBLOX
                // ---------------------------------------------

                if (
                    interaction.customId ===
                    'polo_reset'
                ) {
                    if (
                        typeof useReset !==
                        'function' ||
                        typeof getRemaining !==
                        'function'
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

                    const resetsLeft =
                        getRemaining(
                            interaction.guildId,
                            interaction.user.id,
                            maxResets
                        );

                    if (
                        resetsLeft <= 0
                    ) {
                        await interaction.reply({
                            content:
                                `❌ You've used all **${maxResets}** resets.`,
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.deferReply({
                        ephemeral: true
                    });

                    try {

                        const licenseInfo =
                            await cloudflareRequest(
                                '/status',
                                {
                                    discordId:
                                        interaction.user.id
                                }
                            );

                        if (
                            !licenseInfo.license
                        ) {
                            await interaction.editReply({
                                content:
                                    '❌ You do not have a redeemed license linked to this Discord account.'
                            });

                            return;
                        }

                        const license =
                            licenseInfo.license;

                        await cloudflareRequest(
                            '/reset-roblox',
                            {
                                key:
                                    license.key,
                                discordId:
                                    interaction.user.id
                            }
                        );

                        const consumed =
                            useReset(
                                interaction.guildId,
                                interaction.user.id,
                                maxResets
                            );

                        if (
                            !consumed.success
                        ) {
                            await interaction.editReply({
                                content:
                                    '⚠️ Roblox binding was reset, but your local reset counter could not be updated. Please contact an administrator.'
                            });

                            return;
                        }

                        await interaction.editReply({
                            content:
                                `🔄 **Roblox account reset successfully!**\n\n` +
                                `Your key can now be activated on another Roblox account.\n\n` +
                                `🔄 Resets remaining: **${consumed.remaining}/${maxResets}**`
                        });

                        await sendDiscordLog({
                            title:
                                '🔄 Roblox HWID Reset',

                            description:
                                'A user successfully reset their Roblox account binding.',

                            color:
                                0x00aaff,

                            fields: [
                                {
                                    name:
                                        'Discord User',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Key',
                                    value:
                                        `\`${license.key}\``,
                                    inline: false
                                },
                                {
                                    name:
                                        'Resets Remaining',
                                    value:
                                        `\`${consumed.remaining}/${maxResets}\``,
                                    inline: true
                                }
                            ]
                        });

                    } catch (error) {

                        console.error(
                            'Roblox reset error:',
                            error
                        );

                        await sendDiscordLog({
                            title:
                                '❌ Roblox Reset Failed',

                            description:
                                'A Roblox HWID reset attempt failed.',

                            color:
                                0xff3333,

                            fields: [
                                {
                                    name:
                                        'Discord User',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'HTTP Status',
                                    value:
                                        `\`${error.status || 'Unknown'}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Error',
                                    value:
                                        `\`${String(
                                            error.message ||
                                            'Unknown error'
                                        ).slice(0, 900)}\``,
                                    inline: false
                                }
                            ]
                        });

                        if (
                            error.status ===
                            404
                        ) {
                            await interaction.editReply({
                                content:
                                    '❌ No license was found for your Discord account.'
                            });

                            return;
                        }

                        if (
                            error.status ===
                            403
                        ) {
                            await interaction.editReply({
                                content:
                                    `❌ ${
                                        error.message ||
                                        'You are not authorized to reset this license.'
                                    }`
                            });

                            return;
                        }

                        await interaction.editReply({
                            content:
                                '❌ Could not reset your Roblox account. Your reset was **not consumed**. Please try again later.'
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
                    await interaction.deferReply({
                        ephemeral: true
                    });

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
                        typeof getRemaining ===
                        'function'
                    ) {
                        resetsLeft =
                            getRemaining(
                                interaction.guildId,
                                interaction.user.id,
                                maxResets
                            );
                    }

                    try {

                        const status =
                            await cloudflareRequest(
                                '/status',
                                {
                                    discordId:
                                        interaction.user.id
                                }
                            );

                        if (
                            !status.license
                        ) {
                            await interaction.editReply({
                                content:
                                    `📊 **Polo Account Status**\n\n` +
                                    `🔑 License: **Not linked**\n` +
                                    `🔄 Resets: **${resetsLeft}/${maxResets}**`
                            });

                            return;
                        }

                        const license =
                            status.license;

                        const discordLinked =
                            license.discordId
                                ? '✅ Linked'
                                : '❌ Not linked';

                        const robloxLinked =
                            license.robloxUserId
                                ? `✅ Linked (\`${license.robloxUserId}\`)`
                                : '⚪ Not linked';

                        const createdAt =
                            license.createdAt
                                ? `<t:${Math.floor(new Date(license.createdAt).getTime() / 1000)}:R>`
                                : 'Unknown';

                        const redeemedAt =
                            license.redeemedAt
                                ? `<t:${Math.floor(new Date(license.redeemedAt).getTime() / 1000)}:R>`
                                : 'Unknown';

                        const activatedAt =
                            license.activatedAt
                                ? `<t:${Math.floor(new Date(license.activatedAt).getTime() / 1000)}:R>`
                                : 'Not activated';

                        let statusEmoji = '📌';

                        if (
                            license.status ===
                            'activated'
                        ) {
                            statusEmoji = '🟢';
                        } else if (
                            license.status ===
                            'discord_redeemed'
                        ) {
                            statusEmoji = '🟡';
                        } else if (
                            license.status ===
                            'disabled'
                        ) {
                            statusEmoji = '🔴';
                        } else if (
                            license.status ===
                            'blacklisted'
                        ) {
                            statusEmoji = '🚫';
                        } else if (
                            license.status ===
                            'active'
                        ) {
                            statusEmoji = '⚪';
                        }

                        const embed =
                            new EmbedBuilder()
                                .setColor(
                                    license.status ===
                                    'activated'
                                        ? 0x00ff88
                                        : license.status ===
                                          'blacklisted'
                                            ? 0xff0000
                                            : license.status ===
                                              'disabled'
                                                ? 0xffaa00
                                                : 0xab0000
                                )
                                .setTitle(
                                    '📊 Polo Account Status'
                                )
                                .addFields(
                                    {
                                        name:
                                            '🔑 License',
                                        value:
                                            `\`${license.key}\``,
                                        inline: false
                                    },
                                    {
                                        name:
                                            `${statusEmoji} Status`,
                                        value:
                                            license.status ||
                                            'Unknown',
                                        inline: true
                                    },
                                    {
                                        name:
                                            '💎 Discord',
                                        value:
                                            discordLinked,
                                        inline: true
                                    },
                                    {
                                        name:
                                            '🎮 Roblox',
                                        value:
                                            robloxLinked,
                                        inline: true
                                    },
                                    {
                                        name:
                                            '🔄 Resets',
                                        value:
                                            `**${resetsLeft}/${maxResets}**`,
                                        inline: true
                                    },
                                    {
                                        name:
                                            '📅 Created',
                                        value:
                                            createdAt,
                                        inline: true
                                    },
                                    {
                                        name:
                                            '🔑 Redeemed',
                                        value:
                                            redeemedAt,
                                        inline: true
                                    },
                                    {
                                        name:
                                            '🎮 Activated',
                                        value:
                                            activatedAt,
                                        inline: true
                                    }
                                )
                                .setFooter({
                                    text:
                                        'Polo License System'
                                })
                                .setTimestamp();

                        if (
                            license.blacklistReason
                        ) {
                            embed.addFields({
                                name:
                                    '🚫 Blacklist Reason',
                                value:
                                    String(
                                        license.blacklistReason
                                    ).slice(
                                        0,
                                        1024
                                    ),
                                inline: false
                            });
                        }

                        await interaction.editReply({
                            embeds: [
                                embed
                            ]
                        });

                    } catch (error) {

                        console.error(
                            'Status error:',
                            error
                        );

                        await interaction.editReply({
                            content:
                                '❌ Could not retrieve your license status. Please try again later.'
                        });
                    }

                    return;
                }


                // ---------------------------------------------
                // APPLICATION ACCEPT / DECLINE / RESEND
                // ---------------------------------------------

                if (
                    interaction.customId.startsWith(
                        'app_accept_'
                    ) ||
                    interaction.customId.startsWith(
                        'app_decline_'
                    ) ||
                    interaction.customId.startsWith(
                        'app_resend_'
                    )
                ) {
                    // Only staff / admins / owners can review
                    if (
                        !interaction.memberPermissions?.has(
                            'ManageGuild'
                        ) &&
                        !interaction.memberPermissions?.has(
                            'Administrator'
                        ) &&
                        !getOwnerIds().includes(
                            interaction.user.id
                        )
                    ) {
                        await interaction.reply({
                            content:
                                '❌ You do not have permission to review applications.',
                            ephemeral: true
                        });

                        return;
                    }

                    const parts = interaction.customId.split('_');
                    // customId formats:
                    // app_accept_<userId>_<type>
                    // app_decline_<userId>_<type>
                    // app_resend_<userId>_<type>
                    // (legacy without type still works → defaults to media)
                    const action = parts[1]; // accept | decline | resend
                    const applicantId = parts[2];
                    const appType = parts[3] || 'media'; // media | staff | helper

                    const typeLabel =
                        appType.charAt(0).toUpperCase() +
                        appType.slice(1);

                    // ---------- RESEND ----------
                    if (action === 'resend') {
                        try {
                            const applicant =
                                await interaction.client.users.fetch(
                                    applicantId
                                );

                            await applicant.send({
                                content:
                                    `📝 **Please resubmit your ${typeLabel} application**\n\n` +
                                    `Your previous application needs more detail or a clearer format.\n\n` +
                                    `Please use \`/apply role:${appType}\` again and make sure to:\n` +
                                    `• Write a more proper / professional response\n` +
                                    `• Give a more in-depth explanation of your experience and motivation\n` +
                                    `• Fill every field carefully\n\n` +
                                    `Thank you!`
                            });

                            await interaction.reply({
                                content:
                                    `✅ Sent a “please resubmit” message to <@${applicantId}>.`,
                                ephemeral: true
                            });
                        } catch {
                            await interaction.reply({
                                content:
                                    `⚠️ Could not DM <@${applicantId}> (they may have DMs closed).`,
                                ephemeral: true
                            });
                        }

                        return;
                    }

                    // ---------- ACCEPT / DECLINE ----------
                    const isAccept = action === 'accept';

                    // Role IDs (set these in Railway / .env)
                    const ROLE_IDS = {
                        media: process.env.MEDIA_ROLE_ID || '',
                        staff: process.env.STAFF_ROLE_ID || '',
                        helper: process.env.HELPER_ROLE_ID || ''
                    };

                    let roleNote = '';

                    if (isAccept && ROLE_IDS[appType]) {
                        try {
                            const member =
                                await interaction.guild.members
                                    .fetch(applicantId)
                                    .catch(() => null);

                            if (member) {
                                await member.roles.add(
                                    ROLE_IDS[appType]
                                );

                                roleNote =
                                    `\nRole <@&${ROLE_IDS[appType]}> has been given.`;
                            } else {
                                roleNote =
                                    '\n⚠️ Could not find the user in this server to give the role.';
                            }
                        } catch (err) {
                            console.error(
                                `Failed to give ${typeLabel} role:`,
                                err
                            );

                            roleNote =
                                `\n⚠️ Failed to give the ${typeLabel} role (check bot permissions / role hierarchy).`;
                        }
                    }

                    // Update the original embed
                    const originalEmbed =
                        interaction.message.embeds[0];

                    const updatedEmbed =
                        EmbedBuilder.from(originalEmbed)
                            .setColor(
                                isAccept
                                    ? 0x57f287
                                    : 0xed4245
                            )
                            .setTitle(
                                isAccept
                                    ? `✅ ${typeLabel} Application — Accepted`
                                    : `❌ ${typeLabel} Application — Declined`
                            )
                            .addFields({
                                name: 'Reviewed by',
                                value: `${interaction.user} (\`${interaction.user.id}\`)`,
                                inline: false
                            });

                    // Disable the buttons
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    'app_accept_done'
                                )
                                .setLabel(
                                    'Accept'
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                )
                                .setEmoji('✅')
                                .setDisabled(
                                    true
                                ),
                            new ButtonBuilder()
                                .setCustomId(
                                    'app_decline_done'
                                )
                                .setLabel(
                                    'Decline'
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                                .setEmoji('❌')
                                .setDisabled(
                                    true
                                ),
                            new ButtonBuilder()
                                .setCustomId(
                                    'app_resend_done'
                                )
                                .setLabel(
                                    'Ask to Resubmit'
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                                .setEmoji('📝')
                                .setDisabled(
                                    true
                                )
                        );

                    await interaction.update({
                        embeds: [updatedEmbed],
                        components: [disabledRow]
                    });

                    // Try to DM the applicant
                    try {
                        const applicant =
                            await interaction.client.users.fetch(
                                applicantId
                            );

                        await applicant.send({
                            content: isAccept
                                ? `🎉 Your **${typeLabel}** application has been **accepted**!${roleNote}`
                                : `❌ Your **${typeLabel}** application has been **declined**.`
                        });
                    } catch {
                        // User has DMs closed — ignore
                    }

                    return;
                }


                // ---------------------------------------------
                // GET SCRIPT / GET XP SCRIPT
                // ---------------------------------------------

                if (
                    interaction.customId === 'polo_get' ||
                    interaction.customId === 'polo_xp'
                ) {
                    const isXp = interaction.customId === 'polo_xp';
                    const config = getGuildConfig(interaction.guildId) || {};
                    const script =
                        (isXp ? config.xpScript : config.getScript) ||
                        '';

                    const label = isXp ? 'Get XP Script' : 'Get Script';

                    if (!script || !String(script).trim()) {
                        await interaction.reply({
                            content:
                                `📄 No script has been set for **${label}** yet.\n` +
                                `An admin can set it with \`/setscript\`.`,
                            ephemeral: true
                        });
                        return;
                    }

                    const body = String(script).trim();

                    // Discord message limit is 2000 chars — send as file if longer
                    if (body.length <= 1900) {
                        await interaction.reply({
                            content:
                                `📄 **${label}**\n\`\`\`lua\n${body}\n\`\`\``,
                            ephemeral: true
                        });
                    } else {
                        const buf = Buffer.from(body, 'utf8');
                        const file = new AttachmentBuilder(buf, {
                            name: isXp ? 'xp-script.lua' : 'script.lua'
                        });

                        await interaction.reply({
                            content: `📄 **${label}** (file attached — only you can see this)`,
                            files: [file],
                            ephemeral: true
                        });
                    }

                    return;
                }

                // ---------------------------------------------
                // OTHER BUTTONS
                // ---------------------------------------------

                if (interaction.customId === 'polo_premium') {
                    const config = getGuildConfig(interaction.guildId) || {};
                    const link = config.premiumLink;

                    if (link) {
                        await interaction.reply({
                            content: `💎 **Get Premium Key**\n${link}`,
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({
                            content: '💎 No link has been set for **Get Premium Key** yet.',
                            ephemeral: true
                        });
                    }
                    return;
                }

                const replies = {
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
            // MEDIA APPLICATION MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'media_application_modal'
            ) {

                const channelLink =
                    interaction.fields
                        .getTextInputValue(
                            'channel_link'
                        )
                        .trim();

                const platform =
                    interaction.fields
                        .getTextInputValue(
                            'platform'
                        )
                        .trim();

                const followers =
                    interaction.fields
                        .getTextInputValue(
                            'followers'
                        )
                        .trim();

                const niche =
                    interaction.fields
                        .getTextInputValue(
                            'niche'
                        )
                        .trim();

                const why =
                    interaction.fields
                        .getTextInputValue(
                            'why'
                        )
                        .trim();

                const appsChannelId =
                    process.env.APPLICATIONS_CHANNEL_ID ||
                    '1545903366213869651';

                const appsChannel =
                    await interaction.client.channels
                        .fetch(
                            appsChannelId
                        )
                        .catch(
                            () => null
                        );

                if (!appsChannel) {
                    await interaction.reply({
                        content:
                            '❌ Could not find the applications channel. Please contact an admin.',
                        ephemeral: true
                    });

                    return;
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📺 New Media Application'
                        )
                        .setColor(
                            0x5865f2
                        )
                        .setAuthor({
                            name:
                                interaction.user.tag,
                            iconURL:
                                interaction.user.displayAvatarURL({
                                    dynamic: true
                                })
                        })
                        .addFields(
                            {
                                name:
                                    'Applicant',
                                value:
                                    `${interaction.user} (\`${interaction.user.id}\`)`,
                                inline: false
                            },
                            {
                                name:
                                    'Channel / Link',
                                value:
                                    channelLink,
                                inline: false
                            },
                            {
                                name:
                                    'Platform',
                                value:
                                    platform,
                                inline: true
                            },
                            {
                                name:
                                    'Followers',
                                value:
                                    followers,
                                inline: true
                            },
                            {
                                name:
                                    'Niche',
                                value:
                                    niche,
                                inline: true
                            },
                            {
                                name:
                                    'Why they want Media',
                                value:
                                    why,
                                inline: false
                            }
                        )
                        .setTimestamp()
                        .setFooter({
                            text:
                                `User ID: ${interaction.user.id}`
                        });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `app_accept_${interaction.user.id}_media`
                        )
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_decline_${interaction.user.id}_media`
                        )
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_resend_${interaction.user.id}_media`
                        )
                        .setLabel('Ask to Resubmit')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

                await appsChannel.send({
                    embeds: [
                        embed
                    ],
                    components: [
                        row
                    ]
                });

                await interaction.reply({
                    content:
                        '✅ Your **Media** application has been submitted! Staff will review it soon.',
                    ephemeral: true
                });

                return;
            }


            
            // =================================================
            // STAFF APPLICATION MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'staff_application_modal'
            ) {
                const age =
                    interaction.fields
                        .getTextInputValue('age')
                        .trim();
                const timezone =
                    interaction.fields
                        .getTextInputValue('timezone')
                        .trim();
                const experience =
                    interaction.fields
                        .getTextInputValue('experience')
                        .trim();
                const why =
                    interaction.fields
                        .getTextInputValue('why')
                        .trim();
                const extra =
                    interaction.fields
                        .getTextInputValue('extra')
                        ?.trim() || 'None';

                const appsChannelId =
                    process.env.APPLICATIONS_CHANNEL_ID ||
                    '1545903366213869651';

                const appsChannel =
                    await interaction.client.channels
                        .fetch(appsChannelId)
                        .catch(() => null);

                if (!appsChannel) {
                    await interaction.reply({
                        content:
                            '❌ Could not find the applications channel. Please contact an admin.',
                        ephemeral: true
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ New Staff Application')
                    .setColor(0xed4245)
                    .setAuthor({
                        name: interaction.user.tag,
                        iconURL:
                            interaction.user.displayAvatarURL({
                                dynamic: true
                            })
                    })
                    .addFields(
                        {
                            name: 'Applicant',
                            value: `${interaction.user} (\`${interaction.user.id}\`)`,
                            inline: false
                        },
                        {
                            name: 'Age',
                            value: age,
                            inline: true
                        },
                        {
                            name: 'Timezone',
                            value: timezone,
                            inline: true
                        },
                        {
                            name: 'Experience',
                            value: experience,
                            inline: false
                        },
                        {
                            name: 'Why Staff?',
                            value: why,
                            inline: false
                        },
                        {
                            name: 'Extra',
                            value: extra,
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: `User ID: ${interaction.user.id}`
                    });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `app_accept_${interaction.user.id}_staff`
                        )
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_decline_${interaction.user.id}_staff`
                        )
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_resend_${interaction.user.id}_staff`
                        )
                        .setLabel('Ask to Resubmit')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

                await appsChannel.send({
                    embeds: [embed],
                    components: [row]
                });

                await interaction.reply({
                    content:
                        '✅ Your **Staff** application has been submitted! Staff will review it soon.',
                    ephemeral: true
                });

                return;
            }


            // =================================================
            // HELPER APPLICATION MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'helper_application_modal'
            ) {
                const age =
                    interaction.fields
                        .getTextInputValue('age')
                        .trim();
                const timezone =
                    interaction.fields
                        .getTextInputValue('timezone')
                        .trim();
                const availability =
                    interaction.fields
                        .getTextInputValue('availability')
                        .trim();
                const why =
                    interaction.fields
                        .getTextInputValue('why')
                        .trim();
                const extra =
                    interaction.fields
                        .getTextInputValue('extra')
                        ?.trim() || 'None';

                const appsChannelId =
                    process.env.APPLICATIONS_CHANNEL_ID ||
                    '1545903366213869651';

                const appsChannel =
                    await interaction.client.channels
                        .fetch(appsChannelId)
                        .catch(() => null);

                if (!appsChannel) {
                    await interaction.reply({
                        content:
                            '❌ Could not find the applications channel. Please contact an admin.',
                        ephemeral: true
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('🤝 New Helper Application')
                    .setColor(0x57f287)
                    .setAuthor({
                        name: interaction.user.tag,
                        iconURL:
                            interaction.user.displayAvatarURL({
                                dynamic: true
                            })
                    })
                    .addFields(
                        {
                            name: 'Applicant',
                            value: `${interaction.user} (\`${interaction.user.id}\`)`,
                            inline: false
                        },
                        {
                            name: 'Age',
                            value: age,
                            inline: true
                        },
                        {
                            name: 'Timezone',
                            value: timezone,
                            inline: true
                        },
                        {
                            name: 'Availability',
                            value: availability,
                            inline: false
                        },
                        {
                            name: 'Why Helper?',
                            value: why,
                            inline: false
                        },
                        {
                            name: 'Extra',
                            value: extra,
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: `User ID: ${interaction.user.id}`
                    });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `app_accept_${interaction.user.id}_helper`
                        )
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_decline_${interaction.user.id}_helper`
                        )
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌'),
                    new ButtonBuilder()
                        .setCustomId(
                            `app_resend_${interaction.user.id}_helper`
                        )
                        .setLabel('Ask to Resubmit')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝')
                );

                await appsChannel.send({
                    embeds: [embed],
                    components: [row]
                });

                await interaction.reply({
                    content:
                        '✅ Your **Helper** application has been submitted! Staff will review it soon.',
                    ephemeral: true
                });

                return;
            }


// =================================================
            // REDEEM MODAL
            // =================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'polo_redeem_modal'
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

                    const result =
                        await cloudflareRequest(
                            '/redeem',
                            {
                                key:
                                    inputKey,
                                discordId:
                                    interaction.user.id
                            }
                        );

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

                        await sendDiscordLog({
                            title:
                                'ℹ️ Key Already Redeemed',

                            description:
                                'A user attempted to redeem a key already linked to their Discord account.',

                            color:
                                0xffcc00,

                            fields: [
                                {
                                    name:
                                        'Discord User',
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        'Discord ID',
                                    value:
                                        `\`${interaction.user.id}\``,
                                    inline: true
                                },
                                {
                                    name:
                                        'Key',
                                    value:
                                        `\`${inputKey}\``,
                                    inline: false
                                },
                                {
                                    name:
                                        'Guild',
                                    value:
                                        `\`${interaction.guildId || 'DM'}\``,
                                    inline: false
                                }
                            ]
                        });

                        return;
                    }


                    const roleId =
                        process.env.PREMIUM_ROLE_ID ||
                        getGuildConfig(
                            interaction.guildId
                        )?.premiumRoleId ||
                        '1409762874754203742';

                    let roleGiven =
                        false;

                    try {

                        await interaction.member.roles.add(
                            roleId
                        );

                        roleGiven =
                            true;

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

                    await sendDiscordLog({
                        title:
                            '🔑 License Redeemed',

                        description:
                            'A license key has been successfully redeemed through Discord.',

                        color:
                            0x00ff88,

                        fields: [
                            {
                                name:
                                    'Discord User',
                                value:
                                    `<@${interaction.user.id}>`,
                                inline: true
                            },
                            {
                                name:
                                    'Discord ID',
                                value:
                                    `\`${interaction.user.id}\``,
                                inline: true
                            },
                            {
                                name:
                                    'Key',
                                value:
                                    `\`${inputKey}\``,
                                inline: false
                            },
                            {
                                name:
                                    'Premium Role',
                                value:
                                    `<@&${roleId}>`,
                                inline: true
                            },
                            {
                                name:
                                    'Role Given',
                                value:
                                    roleGiven
                                        ? '✅ Yes'
                                        : '❌ No',
                                inline: true
                            },
                            {
                                name:
                                    'Guild',
                                value:
                                    `\`${interaction.guildId || 'DM'}\``,
                                inline: false
                            }
                        ]
                    });

                } catch (error) {

                    console.error(
                        'Key redemption error:',
                        error
                    );

                    await sendDiscordLog({
                        title:
                            '❌ License Redemption Failed',

                        description:
                            'A license redemption attempt failed.',

                        color:
                            0xff3333,

                        fields: [
                            {
                                name:
                                    'Discord User',
                                value:
                                    `<@${interaction.user.id}>`,
                                inline: true
                            },
                            {
                                name:
                                    'Discord ID',
                                value:
                                    `\`${interaction.user.id}\``,
                                inline: true
                            },
                            {
                                name:
                                    'Key',
                                value:
                                    `\`${inputKey}\``,
                                inline: false
                            },
                            {
                                name:
                                    'HTTP Status',
                                value:
                                    `\`${error.status || 'Unknown'}\``,
                                inline: true
                            },
                            {
                                name:
                                    'Error',
                                value:
                                    `\`${String(
                                        error.message ||
                                        'Unknown error'
                                    ).slice(0, 900)}\``,
                                inline: false
                            }
                        ]
                    });

                    if (
                        error.status ===
                        409
                    ) {
                        await interaction.editReply({
                            content:
                                '❌ That key has already been redeemed by another Discord account.'
                        });

                        return;
                    }

                    if (
                        error.status ===
                        403
                    ) {
                        await interaction.editReply({
                            content:
                                `❌ ${
                                    error.message ||
                                    'That key is invalid or disabled.'
                                }`
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

                    body:
                        JSON.stringify({
                            source,
                            tier:
                                preset,
                            banner:
                                false
                        })
                }
            );

        if (!apiRes.ok) {

            const errText =
                await apiRes
                    .text()
                    .catch(
                        () =>
                            'Unknown error'
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
            typeof obfuscated !==
                'string'
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
            !fs.existsSync(
                tempDir
            )
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
                    name:
                        outName
                }
            );

        const embed =
            new EmbedBuilder()
                .setColor(
                    0x00ff88
                )
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
            embeds: [
                embed
            ],
            files: [
                file
            ]
        });

        setTimeout(
            () => {
                try {
                    if (
                        fs.existsSync(
                            outPath
                        )
                    ) {
                        fs.unlinkSync(
                            outPath
                        );
                    }
                } catch {}
            },
            15000
        );

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
).catch(
    err => {
        console.error(
            'Failed to log in to Discord:',
            err
        );

        process.exit(1);
    }
);
