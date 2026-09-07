const fs = require('fs');
const path = require('path');
const DATA_DIR = require('./data-dir');

const RESETS_PATH = path.join(DATA_DIR, 'resets.json');
const MAX_RESETS = 3;

function loadAll() {
    if (!fs.existsSync(RESETS_PATH)) {
        return {};
    }

    try {
        return JSON.parse(
            fs.readFileSync(
                RESETS_PATH,
                'utf8'
            )
        );
    } catch {
        return {};
    }
}

function saveAll(data) {
    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );

    fs.writeFileSync(
        RESETS_PATH,
        JSON.stringify(
            data,
            null,
            2
        )
    );
}

function getUsed(
    guildId,
    userId
) {
    const all = loadAll();

    return (
        all[guildId]?.[userId] ??
        0
    );
}

function getRemaining(
    guildId,
    userId,
    maxResets = MAX_RESETS
) {
    return Math.max(
        0,
        maxResets -
        getUsed(
            guildId,
            userId
        )
    );
}

function useReset(
    guildId,
    userId,
    maxResets = MAX_RESETS
) {
    const all = loadAll();

    if (!all[guildId]) {
        all[guildId] = {};
    }

    const used =
        all[guildId][userId] ??
        0;

    if (
        used >=
        maxResets
    ) {
        return {
            success: false,
            remaining: 0
        };
    }

    all[guildId][userId] =
        used + 1;

    saveAll(all);

    return {
        success: true,
        remaining:
            maxResets -
            (used + 1)
    };
}

function resetUser(
    guildId,
    userId
) {
    const all = loadAll();

    if (!all[guildId]) {
        all[guildId] = {};
    }

    delete all[guildId][userId];

    saveAll(all);
}

module.exports = {
    getUsed,
    getRemaining,
    useReset,
    resetUser,
    MAX_RESETS,
    DEFAULT_MAX_RESETS: MAX_RESETS
};
