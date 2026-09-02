# Polo Panel (recreation)

A Discord.js v14 bot that recreates the **Polo Panel** embed and button layout,
with configurable links and a file-based key system.

## Setup

See [`SETUP.md`](./SETUP.md) for:
- A full local step-by-step guide (creating the Discord application, getting
  your token/IDs, inviting the bot, etc.)
- **Deploying to Railway from GitHub** — includes the required persistent
  Volume setup so your keys/config/reset data survive redeploys

Quick version if you've already got your `.env` filled in:

```
npm install
npm start
```

Slash commands register automatically every time the bot starts. Then run
`/panel` in your server to post the embed.

## Setting the "Get" / "Get XP" / "Get Premium Key" links

Use the `/setlink` command (requires Manage Server permission):

```
/setlink button:Get url:https://example.com/download
/setlink button:Get XP url:https://example.com/xp
/setlink button:Get Premium Key url:https://example.com/premium
```

Once a link is set, that button turns into a real Discord **Link button** —
clicking it opens the URL directly, no bot logic involved. If no link is set
yet, the button stays clickable but just tells the user no link has been
configured.

Links are stored per-server in `config.json` (created automatically on first
use). **Note:** posting `/panel` again generates a fresh message using the
current config — previously posted panels won't update retroactively.

## Reset limit

Each user gets **3 resets**, tracked per-server in `resets.json` (created
automatically). Clicking **Reset** past the limit tells them to contact
staff instead. To change the limit, edit `MAX_RESETS` in `lib/resets.js`.
Put your actual reset logic (whatever "reset" does for your system) where
the `TODO` is in `index.js`.

## Premium status check

Set which role counts as premium with:

```
/setpremiumrole role:@Premium
```

(requires Manage Server permission). **View Status** then checks whether the
user has that role and reports Premium / Not Premium, plus their remaining
resets.

## Key system

Drop keys into `keys.txt`, one per line:

```
# lines starting with # are ignored
MY-REAL-KEY-0001
MY-REAL-KEY-0002
```

When someone clicks **Redeem Key**, they get a popup (modal) to type in a
key. The bot checks it against `keys.txt`:

- **Match found** → the key is removed from the file (single-use) and the
  user gets a success message.
- **No match** → the user gets an "invalid or already used" message.

`keys.txt` starts with a few example placeholder keys — replace them with
real ones. To customize what happens on a successful redemption (e.g. grant
a role), edit the `polo_redeem_modal` handler in `index.js`.

## What's wired up vs. what's a placeholder

- **Get, Get XP, Get Premium Key** — real link buttons once configured via `/setlink`.
- **Redeem Key** — fully working against `keys.txt`.
- **Reset** — fully working 3-per-user limit; add your actual reset logic where marked.
- **View Status** — fully working premium role check via `/setpremiumrole`.
- **Hub, Help** — reply with an ephemeral placeholder message; connect these
  to your own links/support flow.
- **Obfuscate** — intentionally left unimplemented. Script obfuscation
  tooling in distribution-panel contexts like this is most commonly used to
  hide cheat/exploit code from moderation and anti-cheat systems, so I didn't
  build that part out.
