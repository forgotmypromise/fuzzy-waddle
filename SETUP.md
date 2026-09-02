# Setup Guide

Follow these steps in order to get Polo Panel running from scratch.

## 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name (e.g. "Polo Panel"), and create it.
3. On the **General Information** page, copy the **Application ID** —
   this is your `CLIENT_ID`.

## 2. Create the bot user

1. In the left sidebar, click **Bot**.
2. Click **Reset Token** (or **Add Bot** if this is the first time), then
   copy the token that appears. This is your `DISCORD_TOKEN`.
   - Treat this like a password. Anyone with it can control your bot.
   - If you ever accidentally expose it (e.g. commit it to GitHub), come
     back here and reset it immediately.
3. Scroll down to **Privileged Gateway Intents**. This bot doesn't need
   any of them (Presence, Server Members, Message Content) — leave them off.

## 3. Invite the bot to your server

1. In the left sidebar, click **OAuth2 → URL Generator**.
2. Under **Scopes**, check `bot` and `applications.commands`.
3. Under **Bot Permissions**, check:
   - `Send Messages`
   - `Embed Links`
   - `Use Slash Commands` (usually auto-enabled by `applications.commands`)
4. Copy the generated URL at the bottom, open it in your browser, and
   invite the bot to your server.

## 4. Get your test server's ID

1. In Discord, go to **User Settings → Advanced** and enable **Developer Mode**.
2. Right-click your server's icon in the sidebar → **Copy Server ID**.
   This is your `GUILD_ID`.

## 5. Configure the project

1. In the project folder, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
2. Open `.env` and fill in the three values from steps 1, 2, and 4:
   ```
   DISCORD_TOKEN=...
   CLIENT_ID=...
   GUILD_ID=...
   ```

## 6. Install dependencies

```
npm install
```

## 7. Start the bot

```
npm start
```

You should see `Logged in as <YourBot#1234>` followed by
`Guild slash commands registered.` in the console — commands register
automatically every time the bot starts, so there's no separate step needed.

(If you ever want to register commands without starting the whole bot, e.g.
for scripting purposes, `node deploy-commands.js` still works standalone.)

## 8. Post the panel

In your Discord server, run:

```
/panel
```

This posts the embed with all the action buttons.

## 9. Configure links, premium role, and keys

- `/setlink button:Get url:<link>` — set where **Get** points
- `/setlink button:Get XP url:<link>` — set where **Get XP** points
- `/setlink button:Get Premium Key url:<link>` — set where **Get Premium Key** points
- `/setpremiumrole role:<role>` — set which role counts as premium for **View Status**
- Edit `keys.txt` and add your real redeemable keys, one per line

See `README.md` for details on how each feature behaves.

## Troubleshooting

- **Bot won't start / exits immediately with "Missing required environment
  variable(s)"** — `DISCORD_TOKEN` and/or `CLIENT_ID` aren't set. On
  Railway, check the **Variables** tab; locally, check `.env`.
- **"Failed to log in to Discord"** — almost always means `DISCORD_TOKEN` is
  wrong or was reset in the Developer Portal since you copied it. Reset it
  again in the Portal and update the variable.
- **Commands don't show up in Discord** — make sure `.env`/environment
  variables are set correctly and the bot has started successfully at least
  once (it auto-registers commands on every startup — check the console/logs
  for "Guild slash commands registered."). Guild commands usually appear
  instantly; if not, try leaving and rejoining the server or restarting
  Discord.
- **"Missing Access" or similar errors on `/panel`** — re-check the bot's
  permissions in step 3, and make sure it has permission to post in the
  channel you're using.
- **Keys/links/reset counts reset after every Railway redeploy** — you
  haven't attached a Volume, or `DATA_DIR` doesn't match its mount path. See
  the Railway section below — this is the #1 thing to get right on Railway.

---

## Deploying to Railway (from GitHub)

The bot auto-registers its slash commands on every startup, so you don't
need shell/CLI access after deploying — just set the environment variables
and it works.

### 1. Push the project to GitHub

Create a repo and push this project to it (the `.gitignore` already excludes
`node_modules`, `.env`, and local runtime data files).

### 2. Create a new Railway project

1. In [Railway](https://railway.com), click **New Project → Deploy from GitHub repo**.
2. Select your repository. Railway will detect it as a Node project via
   Nixpacks and use `railway.json` for the start command automatically.

### 3. Set environment variables

In your Railway service, go to **Variables** and add:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | your bot token |
| `CLIENT_ID` | your application ID |
| `GUILD_ID` | your server ID (optional — omit for global commands, see note below) |
| `DATA_DIR` | `/data` (see step 4) |

> **Global vs. guild commands:** if you omit `GUILD_ID`, commands register
> globally (works in any server the bot is in, but can take up to ~1 hour to
> appear after each command change). With `GUILD_ID` set, commands register
> instantly but only in that one server.

### 4. Add a Volume for persistent data (important)

Railway's filesystem is **ephemeral** — files written while the bot is
running (`config.json`, `resets.json`, `keys.txt`) are lost on every redeploy
or restart unless they live on a Volume.

1. In your Railway service, go to **Settings → Volumes → New Volume**.
2. Set the **mount path** to `/data`.
3. Make sure the `DATA_DIR` variable from step 3 matches this path (`/data`).

The bot creates `config.json`, `resets.json`, and a template `keys.txt`
inside `DATA_DIR` automatically on first run if they don't already exist.

### 5. Deploy and verify

Railway deploys automatically after you connect the repo (and again on every
push to your default branch). Check the **Deployments → Logs** tab for:

```
Logged in as <YourBot#1234>
Guild slash commands registered.
```

### 6. Edit keys.txt on Railway

Since the filesystem is remote, you can't just open `keys.txt` in a text
editor like you would locally. Options:

- Use the **Railway CLI** to shell into the running container:
  ```
  railway ssh
  nano /data/keys.txt
  ```
- Or open Railway's **Volume file browser** (Settings → Volumes → your
  volume) if your plan supports it, to view/edit files directly.

Every time you deploy an update, Railway rebuilds the app but the Volume
(and everything in `DATA_DIR`) stays intact — that's the whole point of
using it.
