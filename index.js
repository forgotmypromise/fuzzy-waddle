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
  REST,
  Routes,
} = require('discord.js');

const { getGuildConfig, setGuildLink, setPremiumRole, setResetLimit } = require('./lib/storage');
const { redeemKey, addKeys } = require('./lib/keys');
const { useReset, getRemaining, resetUser, DEFAULT_MAX_RESETS } = require('./lib/resets');
const { generateKey } = require('./lib/keygen');
const { commandDefs } = require('./lib/commands');
const DATA_DIR = require('./lib/data-dir');

// ---------- Startup validation ----------
// Fail loudly and immediately with a clear message if required config is
// missing, instead of letting discord.js throw a cryptic low-level error
// partway through connecting. This matters most on hosts like Railway
// where the console/log output is your only way to diagnose a bad deploy.
function validateEnv() {
  const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
      'Set these in your .env file (local) or your Railway service\'s Variables tab (hosted), then restart.'
    );
    process.exit(1);
  }
}
validateEnv();

console.log(`Data directory: ${DATA_DIR}${process.env.DATA_DIR ? '' : ' (default — set DATA_DIR to a mounted Volume path on Railway so data survives redeploys)'}`);

// Catch anything that would otherwise crash the process silently or hang
// it in a broken state. Logging then exiting lets Railway's restart policy
// (see railway.json) cleanly restart the bot instead.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Registers slash commands automatically on every startup, so there's no
// need for shell access on hosts like Railway. Guild-scoped registration
// (near-instant) is used when GUILD_ID is set; otherwise falls back to
// global registration (can take up to ~1 hour to appear everywhere).
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandDefs }
      );
      console.log('Guild slash commands registered.');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commandDefs }
      );
      console.log('Global slash commands registered (may take up to ~1 hour to appear).');
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

// ---------- Embed ----------
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
    .setFooter({ text: 'Polo Panel • Key Manager System' })
    .setTimestamp();
}

// ---------- Buttons ----------
// "Get" and "Get XP" become real Link buttons once a URL is configured
// via /setlink. Until then they fall back to a placeholder button that
// tells whoever clicked it that no link has been set yet.
function buildPanelRows(guildId) {
  const config = getGuildConfig(guildId);

  const getButton = config.getLink
    ? new ButtonBuilder().setLabel('Get Script').setEmoji('📄').setStyle(ButtonStyle.Link).setURL(config.getLink)
    : new ButtonBuilder().setCustomId('polo_get').setLabel('Get Script').setEmoji('📄').setStyle(ButtonStyle.Danger);

  const xpButton = config.xpLink
    ? new ButtonBuilder().setLabel('Get XP Script').setEmoji('⚡').setStyle(ButtonStyle.Link).setURL(config.xpLink)
    : new ButtonBuilder().setCustomId('polo_xp').setLabel('Get XP Script').setEmoji('⚡').setStyle(ButtonStyle.Danger);

  const premiumButton = config.premiumLink
    ? new ButtonBuilder().setLabel('Get Premium Key').setEmoji('💎').setStyle(ButtonStyle.Link).setURL(config.premiumLink)
    : new ButtonBuilder().setCustomId('polo_premium').setLabel('Get Premium Key').setEmoji('💎').setStyle(ButtonStyle.Success);

  const row1 = new ActionRowBuilder().addComponents(
    getButton,
    xpButton,
    new ButtonBuilder().setCustomId('polo_redeem').setLabel('Redeem Key').setEmoji('🔑').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    premiumButton,
    new ButtonBuilder().setCustomId('polo_reset').setLabel('Reset').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('polo_status').setLabel('View Status').setEmoji('📊').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('polo_obfuscate').setLabel('Obfuscate').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
  
    config.helpLink
      ? new ButtonBuilder().setLabel('Help').setEmoji('❓').setStyle(ButtonStyle.Link).setURL(config.helpLink)
      : new ButtonBuilder().setCustomId('polo_help').setLabel('Help').setEmoji('❓').setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3];
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('error', (err) => {
  // discord.js auto-reconnects on most transient gateway errors; just log
  // rather than crash. If the connection is unrecoverable, Discord.js will
  // emit further events and the process can be restarted by Railway's
  // restart policy if it truly gets stuck.
  console.error('Discord client error:', err);
});

client.on('interactionCreate', async (interaction) => {
  // ---------- Slash commands ----------
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'panel') {
      await interaction.reply({
        embeds: [buildPanelEmbed()],
        components: buildPanelRows(interaction.guildId),
      });
      return;
    }

    if (interaction.commandName === 'setlink') {
      const button = interaction.options.getString('button', true); // 'getLink' | 'xpLink'
      const url = interaction.options.getString('url', true);

      if (!/^https?:\/\//i.test(url)) {
        await interaction.reply({ content: '❌ That doesn\'t look like a valid URL. It must start with http:// or https://', ephemeral: true });
        return;
      }

      setGuildLink(interaction.guildId, button, url);
      const labels = {
        getLink: 'Get',
        xpLink: 'Get XP',
        premiumLink: 'Get Premium Key',
        hubLink: 'Hub',
        helpLink: 'Help',
      };
      await interaction.reply({
        content: `✅ **${labels[button]}** button will now open: ${url}\n\nRun \`/panel\` again to post an updated panel — existing posted panels won't update automatically.`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'setpremiumrole') {
      const role = interaction.options.getRole('role', true);
      setPremiumRole(interaction.guildId, role.id);
      await interaction.reply({
        content: `✅ **${role.name}** is now the premium role. **View Status** will check members against it.`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'setresetlimit') {
      const amount = interaction.options.getInteger('amount', true);
      setResetLimit(interaction.guildId, amount);
      await interaction.reply({
        content: `✅ Reset limit set to **${amount}** per member.`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'resetresets') {
      const user = interaction.options.getUser('user', true);
      const maxResets = getGuildConfig(interaction.guildId).resetLimit || DEFAULT_MAX_RESETS;
      resetUser(interaction.guildId, user.id);
      await interaction.reply({
        content: `✅ Cleared resets for **${user.tag}** — they now have **${maxResets}/${maxResets}** available again.`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'genkeys') {
      const amount = interaction.options.getInteger('amount', true);
      const format = interaction.options.getString('format') || 'polo';

      const newKeys = Array.from({ length: amount }, () => generateKey(format));
      addKeys(newKeys);

      await interaction.reply({
        content: `✅ Generated **${amount}** key(s) and added them to \`keys.txt\`:\n\`\`\`\n${newKeys.join('\n')}\n\`\`\``,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'obfuscate') {
      // Intentionally not implemented — see README for why.
      await interaction.reply({
        content: '🛠️ `/obfuscate` is not implemented yet.',
        ephemeral: true,
      });
      return;
    }
  }

  // ---------- Buttons ----------
  if (interaction.isButton()) {
    if (interaction.customId === 'polo_redeem') {
      const modal = new ModalBuilder()
        .setCustomId('polo_redeem_modal')
        .setTitle('Redeem a Key');

      const keyInput = new TextInputBuilder()
        .setCustomId('key_input')
        .setLabel('Enter your key')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === 'polo_reset') {
      const maxResets = getGuildConfig(interaction.guildId).resetLimit || DEFAULT_MAX_RESETS;
      const { success, remaining } = useReset(interaction.guildId, interaction.user.id, maxResets);

      // TODO: put your actual reset logic here (whatever "reset" does for
      // your system) once success is true.

      if (success) {
        await interaction.reply({
          content: `🔄 Reset complete. You have **${remaining}/${maxResets}** resets left.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ You've used all **${maxResets}** of your resets. Please contact staff for further help.`,
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.customId === 'polo_status') {
      const config = getGuildConfig(interaction.guildId);
      const maxResets = config.resetLimit || DEFAULT_MAX_RESETS;

      if (!config.premiumRoleId) {
        await interaction.reply({
          content: '📊 No premium role has been configured yet. An admin can run `/setpremiumrole role:<role>`.',
          ephemeral: true,
        });
        return;
      }

      const member = interaction.member;
      const isPremium = member?.roles?.cache?.has(config.premiumRoleId) ?? false;
      const resetsLeft = getRemaining(interaction.guildId, interaction.user.id, maxResets);

      await interaction.reply({
        content: isPremium
          ? `📊 **Status:** 💎 Premium\n🔄 Resets remaining: **${resetsLeft}/${maxResets}**`
          : `📊 **Status:** Not Premium\n🔄 Resets remaining: **${resetsLeft}/${maxResets}**`,
        ephemeral: true,
      });
      return;
    }

    // Placeholder logic for buttons not yet wired to your backend.
    const replies = {
      polo_get: '📄 No link has been set for **Get** yet. An admin can run `/setlink button:Get url:<link>`.',
      polo_xp: '⚡ No link has been set for **Get XP** yet. An admin can run `/setlink button:Get XP url:<link>`.',
      polo_premium: '💎 No link has been set for **Get Premium Key** yet. An admin can run `/setlink button:Get Premium Key url:<link>`.',
      polo_obfuscate: '🛠️ **Obfuscate** — this action is not implemented. See the README for details.',
      polo_hub: '🎯 No link has been set for **Hub** yet. An admin can run `/setlink button:Hub url:<link>`.',
      polo_help: '❓ No link has been set for **Help** yet. An admin can run `/setlink button:Help url:<link>`.',
    };

    const content = replies[interaction.customId];
    if (content) {
      await interaction.reply({ content, ephemeral: true });
    }
    return;
  }

  // ---------- Modal submit (key redemption) ----------
  if (interaction.isModalSubmit() && interaction.customId === 'polo_redeem_modal') {
    const inputKey = interaction.fields.getTextInputValue('key_input');
    const success = redeemKey(inputKey);

    if (success) {
      await interaction.reply({
        content: `✅ Key redeemed successfully! You can now customize what happens next (grant a role, log it, etc.) in \`index.js\`.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `❌ That key is invalid or has already been used.`,
        ephemeral: true,
      });
    }
  }
});
const {
    AttachmentBuilder,
    EmbedBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function handleObfuscate(interaction) {
    const attachment = interaction.options.getAttachment('file');
    const preset = interaction.options.getString('preset') || 'medium';

    if (!attachment.name.endsWith('.lua')) {
        return interaction.reply({
            content: '❌ Please upload a `.lua` file.',
            ephemeral: true
        });
    }

    if (attachment.size > 2 * 1024 * 1024) {
        return interaction.reply({
            content: '❌ File is too large. Maximum size is 2MB.',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const jobId = `${interaction.user.id}-${Date.now()}`;

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `${jobId}-input.lua`);
    const outputPath = path.join(tempDir, `${jobId}-obfuscated.lua`);

    try {
        // Download attachment
        const response = await fetch(attachment.url);

        if (!response.ok) {
            throw new Error('Failed to download attachment');
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(inputPath, buffer);

        /*
         * Run your obfuscator here.
         *
         * Replace this with the exact CLI/API from fuzzy-waddle
         * once its command structure is confirmed.
         */

        await execFileAsync(
            'lua',
            [
                path.join(__dirname, 'obfuscator', 'obfuscate.lua'),
                inputPath,
                outputPath,
                preset
            ],
            {
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024
            }
        );

        if (!fs.existsSync(outputPath)) {
            throw new Error('Obfuscator did not generate an output file');
        }

        const outputFile = new AttachmentBuilder(outputPath, {
            name: `obfuscated-${attachment.name}`
        });

        const embed = new EmbedBuilder()
            .setTitle('🔒 Lua Obfuscated')
            .setDescription(
                `Successfully obfuscated **${attachment.name}**\n\n` +
                `Preset: **${preset}**`
            );

        await interaction.editReply({
            embeds: [embed],
            files: [outputFile]
        });

    } catch (error) {
        console.error('Obfuscation error:', error);

        await interaction.editReply({
            content: `❌ Obfuscation failed: \`${error.message}\``
        });

    } finally {
        // Cleanup after a short delay
        setTimeout(() => {
            for (const file of [inputPath, outputPath]) {
                if (fs.existsSync(file)) {
                    try {
                        fs.unlinkSync(file);
                    } catch {}
                }
            }
        }, 10000);
    }
}
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error(
    'Failed to log in to Discord. This almost always means DISCORD_TOKEN is ' +
    'missing, incorrect, or was reset in the Developer Portal.\n' +
    `Error: ${err.message}`
  );
  process.exit(1);
});
