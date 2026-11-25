/**
 * Aquanet TV - Persistência local
 * Centraliza configurações do usuário, favoritos, lembretes e mapa do controle remoto.
 */
(function () {
    'use strict';

    const KEYS = {
        settings: 'aquanet_settings_v1',
        favorites: 'aquanet_favorites_v1',
        reminders: 'aquanet_reminders_v1',
        remote: 'aquanet_remote_map_v1',
        provider: 'aquanet_iptv_provider_config',
        vodResume: 'aquanet_vod_resume_v1'
    };

    const DEFAULT_SETTINGS = {
        volume: 0.7,
        muted: false,
        crt: false,
        lastChannelKey: null,
        lastChannelName: null,
        activePlaylistId: 'all',
        lastGuideTab: 'all',
        notificationsEnabled: true,
        firstRunDone: false
    };

    function safeParse(raw, fallback) {
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    function read(key, fallback) {
        try {
            return safeParse(window.localStorage.getItem(key), fallback);
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('[Storage] Falha ao salvar', key, e);
        }
    }

    function remove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {}
    }

    const AquanetStore = {
        KEYS,
        DEFAULT_SETTINGS,

        getSettings() {
            const saved = read(KEYS.settings, {});
            return Object.assign({}, DEFAULT_SETTINGS, saved);
        },

        saveSettings(patch) {
            const next = Object.assign({}, this.getSettings(), patch || {});
            write(KEYS.settings, next);
            return next;
        },

        resetSettings() {
            remove(KEYS.settings);
            return Object.assign({}, DEFAULT_SETTINGS);
        },

        getFavorites() {
            const list = read(KEYS.favorites, []);
            return Array.isArray(list) ? list : [];
        },

        saveFavorites(list) {
            const unique = Array.from(new Set((list || []).filter(Boolean)));
            write(KEYS.favorites, unique);
            return unique;
        },

        isFavorite(key) {
            return Boolean(key) && this.getFavorites().indexOf(key) !== -1;
        },

        toggleFavorite(key) {
            if (!key) return false;
            const favorites = this.getFavorites();
            const idx = favorites.indexOf(key);
            if (idx === -1) favorites.push(key);
            else favorites.splice(idx, 1);
            this.saveFavorites(favorites);
            return idx === -1;
        },

        getReminders() {
            const list = read(KEYS.reminders, []);
            return Array.isArray(list) ? list : [];
        },

        saveReminders(list) {
            write(KEYS.reminders, Array.isArray(list) ? list : []);
            return this.getReminders();
        },

        getReminderKey(reminder) {
            if (!reminder) return '';
            return [reminder.channelKey || '', reminder.start || '', reminder.title || ''].join('|');
        },

        isReminderSet(reminder) {
            const key = this.getReminderKey(reminder);
            return this.getReminders().some(item => this.getReminderKey(item) === key);
        },

        toggleReminder(reminder) {
            if (!reminder || !reminder.channelKey || !reminder.start) return false;
            const key = this.getReminderKey(reminder);
            const list = this.getReminders();
            const idx = list.findIndex(item => this.getReminderKey(item) === key);
            if (idx === -1) {
                list.push(Object.assign({}, reminder, { id: key, notified: false }));
                this.saveReminders(list);
                return true;
            }
            list.splice(idx, 1);
            this.saveReminders(list);
            return false;
        },

        removeReminder(id) {
            const list = this.getReminders().filter(item => item.id !== id && this.getReminderKey(item) !== id);
            this.saveReminders(list);
            return list;
        },

        pruneReminders(nowMs) {
            const now = Number(nowMs) || Date.now();
            const list = this.getReminders().filter(item => {
                const stop = new Date(item.stop || item.start).getTime();
                return Number.isFinite(stop) ? stop > now - 5 * 60 * 1000 : true;
            });
            this.saveReminders(list);
            return list;
        },

        getRemoteMap() {
            const saved = read(KEYS.remote, null);
            return saved && typeof saved === 'object' ? saved : {};
        },

        saveRemoteMap(map) {
            write(KEYS.remote, map && typeof map === 'object' ? map : {});
            return this.getRemoteMap();
        },

        getProviderConfig() {
            return read(KEYS.provider, null);
        },

        saveProviderConfig(config) {
            write(KEYS.provider, config || null);
        },

        clearProviderConfig() {
            remove(KEYS.provider);
        },

        getVodResume() {
            return read(KEYS.vodResume, {});
        },

        saveVodResume(key, seconds) {
            const data = this.getVodResume();
            if (key) data[key] = Math.max(0, Number(seconds) || 0);
            write(KEYS.vodResume, data);
        }
    };

    window.AquanetStore = AquanetStore;
})();
