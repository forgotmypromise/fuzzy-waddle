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

const { getGuildConfig, setGuildLink, setPremiumRole } = require('./lib/storage');
const { redeemKey } = require('./lib/keys');
const { useReset, getRemaining, MAX_RESETS } = require('./lib/resets');
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
    ? new ButtonBuilder().setLabel('Get').setEmoji('📄').setStyle(ButtonStyle.Link).setURL(config.getLink)
    : new ButtonBuilder().setCustomId('polo_get').setLabel('Get').setEmoji('📄').setStyle(ButtonStyle.Danger);

  const xpButton = config.xpLink
    ? new ButtonBuilder().setLabel('Get XP').setEmoji('⚡').setStyle(ButtonStyle.Link).setURL(config.xpLink)
    : new ButtonBuilder().setCustomId('polo_xp').setLabel('Get XP').setEmoji('⚡').setStyle(ButtonStyle.Danger);

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
    new ButtonBuilder().setCustomId('polo_hub').setLabel('Hub').setEmoji('🎯').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('polo_help').setLabel('Help').setEmoji('❓').setStyle(ButtonStyle.Danger),
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
      const labels = { getLink: 'Get', xpLink: 'Get XP', premiumLink: 'Get Premium Key' };
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
      const { success, remaining } = useReset(interaction.guildId, interaction.user.id);

      // TODO: put your actual reset logic here (whatever "reset" does for
      // your system) once success is true.

      if (success) {
        await interaction.reply({
          content: `🔄 Reset complete. You have **${remaining}/${MAX_RESETS}** resets left.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ You've used all **${MAX_RESETS}** of your resets. Please contact staff for further help.`,
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.customId === 'polo_status') {
      const config = getGuildConfig(interaction.guildId);

      if (!config.premiumRoleId) {
        await interaction.reply({
          content: '📊 No premium role has been configured yet. An admin can run `/setpremiumrole role:<role>`.',
          ephemeral: true,
        });
        return;
      }

      const member = interaction.member;
      const isPremium = member?.roles?.cache?.has(config.premiumRoleId) ?? false;
      const resetsLeft = getRemaining(interaction.guildId, interaction.user.id);

      await interaction.reply({
        content: isPremium
          ? `📊 **Status:** 💎 Premium\n🔄 Resets remaining: **${resetsLeft}/${MAX_RESETS}**`
          : `📊 **Status:** Not Premium\n🔄 Resets remaining: **${resetsLeft}/${MAX_RESETS}**`,
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
      polo_hub: '🎯 **Hub** — link to or open your script/asset hub.',
      polo_help: '❓ **Help** — post your support info or a link to your docs/support server.',
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

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error(
    'Failed to log in to Discord. This almost always means DISCORD_TOKEN is ' +
    'missing, incorrect, or was reset in the Developer Portal.\n' +
    `Error: ${err.message}`
  );
  process.exit(1);
});
