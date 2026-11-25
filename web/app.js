/**
 * Aquanet TV - Controlador principal
 * TV Box / IPTV player no estilo Frutiger Aero (sem áudio, sem emojis).
 */
(function () {
    'use strict';

    const GUIDE_WINDOW_SIZE = 40;
    const MINI_WINDOW_SIZE = 60;

    const REMOTE_ACTIONS = [
        { id: 'up', label: 'D-Pad Cima' },
        { id: 'down', label: 'D-Pad Baixo' },
        { id: 'left', label: 'D-Pad Esquerda' },
        { id: 'right', label: 'D-Pad Direita' },
        { id: 'ok', label: 'OK / Enter' },
        { id: 'back', label: 'Voltar / Exit' },
        { id: 'ch_up', label: 'Canal +' },
        { id: 'ch_down', label: 'Canal -' },
        { id: 'vol_up', label: 'Volume +' },
        { id: 'vol_down', label: 'Volume -' },
        { id: 'mute', label: 'Mudo' },
        { id: 'info', label: 'INFO' },
        { id: 'guide', label: 'GUIDE / EPG' },
        { id: 'play_pause', label: 'Play / Pause' },
        { id: 'red', label: 'Botão Vermelho' },
        { id: 'green', label: 'Botão Verde' },
        { id: 'yellow', label: 'Botão Amarelo' },
        { id: 'blue', label: 'Botão Azul' },
        { id: 'settings', label: 'Configurações' }
    ];

    function asset(name) {
        if (window.__AQUANET_ICONS && window.__AQUANET_ICONS[name]) {
            return window.__AQUANET_ICONS[name];
        }
        return 'icons/' + name;
    }

    // Fallback minúsculo para logos de canal que falham (evita repetir PNGs grandes no guia).
    const CHANNEL_LOGO_FALLBACK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="12" fill="#0e2340"/>' +
        '<rect x="10" y="15" width="44" height="31" rx="5" fill="#16385f" stroke="#3d7cc0" stroke-width="2"/>' +
        '<path d="M32 46v9M22 55h20" stroke="#3d7cc0" stroke-width="3" stroke-linecap="round"/>' +
        '</svg>'
    );

    const CHANNEL_LOGO_ATTR = CHANNEL_LOGO_FALLBACK.replace(/'/g, '%27');

    function padChannel(num) {
        return String(num).padStart(3, '0');
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatUnixDate(value) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return 'Ilimitado';
        const d = new Date(n * 1000);
        return d.toLocaleDateString('pt-BR');
    }

    function formatDateFull(value) {
        const d = new Date(value);
        if (isNaN(d.getTime())) return '--/--';
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    class RetroTVController {
        constructor() {
            this.store = window.AquanetStore;

            // Elementos principais
            this.tvCanvas = document.getElementById('tv-canvas');
            this.pipCanvas = document.getElementById('pip-canvas');
            this.customVideo = document.getElementById('custom-video');
            this.crtLayer = document.getElementById('crt-layer');
            this.channelBanner = document.getElementById('channel-banner');
            this.epgGuide = document.getElementById('epg-guide');
            this.miniGuide = document.getElementById('mini-guide');
            this.osdDial = document.getElementById('osd-channel-entry');
            this.osdDialDigits = document.getElementById('osd-input-digits');
            this.osdVolumeBox = document.getElementById('osd-volume-box');
            this.volBarFill = document.getElementById('vol-bar-fill');
            this.volText = document.getElementById('vol-text');
            this.volIcon = document.getElementById('vol-icon');
            this.channelLoadingSpinner = document.getElementById('channel-loading-spinner');
            this.modalLogin = document.getElementById('modal-login');
            this.modalPlaylist = document.getElementById('modal-playlist');
            this.modalVod = document.getElementById('modal-vod');
            this.modalSettings = document.getElementById('modal-settings');
            this.reminderPopup = document.getElementById('reminder-popup');

            // Estado de canais
            this.channels = [];
            this.providerData = null;
            this.currentChannelIndex = 0;
            this.prevChannelIndex = 0;

            // Playlists
            this.playlists = [];
            this.playlistId = 'all';

            // Banner
            this.isBannerVisible = false;
            this.bannerTimeout = null;
            this.bannerChannelKey = null;

            // Dial
            this.dialDigits = '';
            this.dialTimeout = null;

            // Guia
            this.isGuideOpen = false;
            this.guideList = [];
            this.guideSelectedIndex = 0;
            this.guideSelectedSlotIndex = 0;
            this.guideWindowStart = 0;
            this.guideWindowStartMs = 0;
            this.guideWindowEndMs = 0;
            this.epgFetched = new Set();

            // Mini guia
            this.isMiniGuideOpen = false;
            this.miniGuideSelectedIndex = 0;
            this.miniWindowStart = 0;

            // Mídia
            this.currentMediaMode = 'canvas';
            this.hls = null;
            this.channelLoadTimeout = null;
            this.currentTuneToken = 0;
            this.isChannelInNoSignalState = false;
            this.mediaOSDTimeout = null;

            // VOD
            this.isVodOpen = false;
            this.vodTab = 'movie';
            this.vodLoaded = false;
            this.vodLoading = false;
            this.vodError = '';
            this.vod = { movieCats: [], movies: [], seriesCats: [], series: [] };
            this.vodCategoryId = 'all';
            this.vodView = 'list';
            this.vodSeries = null;
            this.vodEpisodes = [];
            this.vodEpisodesLoading = false;
            this.vodFocusArea = 'categories';
            this.vodFocusIndex = 0;
            this.vodPlaying = false;
            this.vodReturnIndex = 0;

            // Configurações
            this.isSettingsOpen = false;
            this.settingsTab = 'account';
            this.settingsFocusIndex = 0;
            this.remoteTestMode = false;
            this.remapAction = null;

            // Lembretes
            this.isReminderOpen = false;
            this.activeReminder = null;
            this.reminderLoop = null;

            // Playlist modal
            this.isPlaylistModalOpen = false;
            this.modalSelectedPlaylist = 'all';

            // Login
            this.activeLoginTab = 'xtream';
            this.loginFocusIndex = 0;

            // Power
            this.isPowerOn = true;

            // Feed generators
            this.tvFeed = new window.TVFeedGenerator(this.tvCanvas);
            this.pipFeed = new window.TVFeedGenerator(this.pipCanvas);

            // Configurações persistidas
            const settings = this.store.getSettings();
            this.volume = Number.isFinite(settings.volume) ? settings.volume : 0.7;
            this.isMuted = Boolean(settings.muted);
            this.isCRTActive = Boolean(settings.crt);
            this.playlistId = settings.activePlaylistId || 'all';
            this.savedChannelKey = settings.lastChannelKey || null;
            this.initialChannelKey = settings.lastChannelKey || null;
            this.providerReady = false;

            // Mapa do controle remoto
            this.remoteMap = this.store.getRemoteMap();

            // Canais demo iniciais (a TV já liga sintonizada)
            this.loadDemoChannels();

            this.applyVolumeToMedia();
            this.init();
        }

        /* =================================================================
         * INICIALIZAÇÃO
         * ================================================================= */

        async init() {
            this.applyCRTState();
            this.buildEPGGrid();
            this.buildMiniGuide();

            const initialIndex = this.channels.length > 1 ? 1 : 0;
            this.tuneChannelByIndex(initialIndex, false);

            this.bindKeyboard();
            this.bindOSDInteractions();
            this.bindPlaylistModal();
            this.bindVodModal();
            this.bindChannelLogoFallback();
            this.bindSettingsModal();
            this.bindReminderPopup();
            this.bindLoginModal();
            this.bindTouchControls();
            this.bindRealRemoteListener();

            this.updateClock();
            setInterval(() => this.updateClock(), 1000);

            this.startReminderLoop();

            this.showBanner(6000);

            this.notifyNativeReady();

            await this.initGenericIPTV();
        }

        notifyNativeReady() {
            try {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'APP_READY' }));
                }
            } catch (e) {}
        }

        requestExit() {
            try {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'EXIT_APP' }));
                }
            } catch (e) {}
        }

        loadDemoChannels() {
            const staticCh = this.normalizeStaticChannel();
            const raw = (window.DEMO_CHANNELS || []).map((ch, idx) => ({
                key: `demo:${idx + 1}`,
                name: ch.name,
                categoryId: `demo:${ch.category || 'Geral'}`,
                category: ch.category || 'Geral',
                logo: ch.logo,
                streamUrl: ch.streamUrl,
                tvgId: ch.epgId || ''
            }));
            const demo = raw.map((ch, idx) => window.transformGenericChannel(ch, idx + 1, 'demo'));
            this.channels = [staticCh, ...demo];
            window.CHANNELS_DATA = this.channels;
            this.rebuildPlaylists();
        }

        normalizeStaticChannel() {
            const base = window.CHANNEL_000_STATIC || {
                id: '000',
                number: 0,
                code: '000',
                name: 'SEM SINAL',
                title: 'Sinal do Satélite Interrompido',
                schedule: [],
                type: 'static'
            };
            const ch = Object.assign({}, base);
            ch.key = 'static:000';
            ch.categoryId = 'static';
            ch.category = 'Sem Sinal';
            ch.type = 'static';
            ch.epg = { hasEpg: false };
            return ch;
        }

        setProviderData(data) {
            this.providerData = data;
            const staticCh = this.normalizeStaticChannel();
            const channels = (data.channels || []).slice(0, 12000).map((ch, idx) => {
                if (!ch.key) ch.key = `ch:${ch.number || idx + 1}`;
                return ch;
            });
            this.channels = [staticCh, ...channels];
            window.CHANNELS_DATA = this.channels;
            this.rebuildPlaylists();
        }

        rebuildPlaylists() {
            const cats = (this.providerData && Array.isArray(this.providerData.categories))
                ? this.providerData.categories
                : this.deriveCategories();

            const favorites = this.store.getFavorites();
            const favoriteCount = this.channels.filter(ch => ch.number !== 0 && favorites.indexOf(ch.key) !== -1).length;

            this.playlists = [
                { id: 'all', name: 'Todos os Canais', count: Math.max(0, this.channels.length - 1) },
                { id: 'favorites', name: 'Favoritos', count: favoriteCount }
            ];

            cats.forEach(cat => {
                if (!cat || !cat.id) return;
                this.playlists.push({ id: String(cat.id), name: cat.name || 'Categoria', count: cat.count || 0 });
            });

            if (!this.playlists.some(p => p.id === this.playlistId)) {
                this.playlistId = 'all';
                this.store.saveSettings({ activePlaylistId: 'all' });
            }

            this.renderPlaylistChips();
            this.updatePlaylistFilterLabel();
        }

        deriveCategories() {
            const map = new Map();
            this.channels.forEach(ch => {
                if (!ch || ch.number === 0) return;
                const id = ch.categoryId || `group:${ch.category || 'Geral'}`;
                if (!map.has(id)) map.set(id, { id, name: ch.category || 'Geral', count: 0 });
                map.get(id).count += 1;
            });
            return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        }

        getVisibleChannels() {
            if (this.playlistId === 'favorites') {
                const favorites = this.store.getFavorites();
                return this.channels.filter(ch => ch.number !== 0 && favorites.indexOf(ch.key) !== -1);
            }
            if (this.playlistId === 'all') {
                return this.channels;
            }
            return this.channels.filter(ch => ch.categoryId === this.playlistId);
        }

        getPlaylistName(id) {
            const playlist = this.playlists.find(p => p.id === (id === undefined ? this.playlistId : id));
            return playlist ? playlist.name : 'Todos os Canais';
        }

        updatePlaylistFilterLabel() {
            const el = document.getElementById('epg-channels-filter');
            if (el) el.innerText = `Playlist: ${this.getPlaylistName()}`;
        }

        renderPlaylistChips() {
            const bar = document.getElementById('epg-playlist-bar');
            if (!bar) return;
            bar.innerHTML = this.playlists.map(p => {
                const active = p.id === this.playlistId ? ' active' : '';
                const count = p.id === 'favorites' ? ` (${p.count})` : ` (${p.count})`;
                return `<button type="button" class="epg-playlist-chip${active}" data-playlist="${escapeHtml(p.id)}">${escapeHtml(String(p.name).toUpperCase())}${count}</button>`;
            }).join('');
        }

        /* =================================================================
         * PERSISTÊNCIA / CRT / VOLUME
         * ================================================================= */

        applyStoredSettings() {
            const settings = this.store.getSettings();
            this.volume = Number.isFinite(settings.volume) ? settings.volume : 0.7;
            this.isMuted = Boolean(settings.muted);
            this.isCRTActive = Boolean(settings.crt);
        }

        applyCRTState() {
            if (!this.crtLayer) return;
            this.crtLayer.classList.toggle('disabled', !this.isCRTActive);
        }

        toggleCRT() {
            this.isCRTActive = !this.isCRTActive;
            this.applyCRTState();
            this.store.saveSettings({ crt: this.isCRTActive });
            const checkbox = document.getElementById('settings-crt');
            if (checkbox) checkbox.checked = this.isCRTActive;
            this.showMediaOSD('CRT', this.isCRTActive ? 'Filtro CRT ativado' : 'Filtro CRT desativado');
        }

        applyVolumeToMedia() {
            if (this.customVideo) {
                this.customVideo.volume = this.volume;
                this.customVideo.muted = this.isMuted;
            }
            this.showVolumeIcon();
        }

        showVolumeIcon() {
            if (!this.volIcon) return;
            const pct = Math.round(this.volume * 100);
            let name = 'volume-max.png';
            if (this.isMuted || pct === 0) name = 'volume-zero.png';
            else if (pct <= 33) name = 'volume-min.png';
            else if (pct <= 66) name = 'volume-med.png';
            this.volIcon.src = asset(name);
        }

        adjustVolume(delta) {
            if (!this.isPowerOn) return;
            this.isMuted = false;
            this.volume = Math.max(0, Math.min(1, this.volume + delta));
            this.applyVolumeToMedia();
            this.store.saveSettings({ volume: this.volume, muted: this.isMuted });
            this.showVolumeOSD();
        }

        volumeUp() {
            this.adjustVolume(0.05);
        }

        volumeDown() {
            this.adjustVolume(-0.05);
        }

        toggleMute() {
            if (!this.isPowerOn) return;
            this.isMuted = !this.isMuted;
            this.applyVolumeToMedia();
            this.store.saveSettings({ muted: this.isMuted });
            this.showVolumeOSD();
        }

        showVolumeOSD() {
            if (!this.osdVolumeBox) return;
            const pct = Math.round(this.volume * 100);
            if (this.volBarFill) this.volBarFill.style.height = (this.isMuted || pct === 0) ? '0%' : `${pct}%`;
            if (this.volText) {
                this.volText.innerText = (this.isMuted || pct === 0) ? 'MUTE' : `VOL ${pct}%`;
                this.volText.classList.toggle('muted', this.isMuted || pct === 0);
            }
            this.showVolumeIcon();

            this.osdVolumeBox.classList.remove('hidden');
            if (this.volumeTimeout) clearTimeout(this.volumeTimeout);
            this.volumeTimeout = setTimeout(() => {
                this.osdVolumeBox.classList.add('hidden');
            }, 2200);
        }

        saveLastChannel() {
            if (!this.providerReady) return;
            const ch = this.channels[this.currentChannelIndex];
            if (!ch || ch.number === 0) return;
            this.store.saveSettings({
                lastChannelKey: ch.key,
                lastChannelName: ch.name
            });
        }

        /* =================================================================
         * SINTONIA / PLAYER
         * ================================================================= */

        tuneChannelByIndex(index, play = true) {
            if (!this.isPowerOn) return;
            if (!this.channels.length) return;

            if (index < 0) index = this.channels.length - 1;
            if (index >= this.channels.length) index = 0;

            this.prevChannelIndex = this.currentChannelIndex;
            this.currentChannelIndex = index;
            this.bannerChannelKey = this.channels[index] ? this.channels[index].key : null;

            const ch = this.channels[index];
            if (!ch) return;

            this.currentTuneToken = (this.currentTuneToken || 0) + 1;
            if (this.channelLoadTimeout) {
                clearTimeout(this.channelLoadTimeout);
                this.channelLoadTimeout = null;
            }
            this.isChannelInNoSignalState = false;

            if (ch.type === 'static' || ch.number === 0) {
                this.hideLoadingSpinner();
                this.stopVideoElement();
                this.currentMediaMode = 'canvas';
                this.tvCanvas.style.display = 'block';
                this.tvFeed.setChannelType('static');
                if (this.pipFeed) {
                    this.pipFeed.setChannelType('static');
                    this.pipFeed.setVideoSource(null);
                }
            } else if (ch.streamUrl || ch.liveUrl) {
                this.currentMediaMode = 'tv';
                this.tvCanvas.style.display = 'none';
                this.playIPTVChannel(ch);
                if (this.pipFeed) {
                    this.pipFeed.setChannelType('iptv');
                    this.pipFeed.setVideoSource(this.customVideo);
                }
            } else {
                this.hideLoadingSpinner();
                this.displayNoSignalContent();
            }

            this.saveLastChannel();
            this.updateBannerForChannel(ch);

            if (!this.isGuideOpen) {
                this.showBanner(4500);
            }

            if (this.isMiniGuideOpen) {
                const idx = this.getVisibleChannels().indexOf(ch);
                if (idx !== -1) this.miniGuideSelectedIndex = idx;
                this.updateMiniGuideHighlight();
            }

            if (this.isGuideOpen) {
                const visible = this.getVisibleChannels();
                const idx = visible.indexOf(ch);
                if (idx !== -1) {
                    this.guideSelectedIndex = idx;
                    this.guideSelectedSlotIndex = 0;
                }
                this.updateEPGSelection();
            }
        }

        tuneByNumber(num) {
            const parsed = Number(num);
            if (!Number.isFinite(parsed)) return;

            let targetIndex = this.channels.findIndex(ch => ch.number === parsed || parseInt(ch.id, 10) === parsed);
            if (targetIndex !== -1) {
                this.tuneChannelByIndex(targetIndex, true);
                return;
            }

            if (parsed === 0) {
                const staticIdx = this.channels.findIndex(ch => ch.type === 'static' || ch.number === 0);
                if (staticIdx !== -1) {
                    this.tuneChannelByIndex(staticIdx, true);
                    return;
                }
            }

            const nonExistent = {
                id: padChannel(parsed),
                number: parsed,
                key: `temp:${parsed}`,
                code: 'SEM SINAL',
                name: `CANAL ${padChannel(parsed)}`,
                title: 'Sinal do Satélite Interrompido',
                timeSlot: window.formatTimeSlot ? window.formatTimeSlot(null, null) : '--:--',
                language: 'Português',
                rating: 'LIVRE',
                category: 'Sem Sinal',
                categoryId: 'static',
                description: 'Canal sem sinal de transmissão ou fora da área de cobertura.',
                schedule: [],
                epg: { hasEpg: false },
                type: 'static'
            };
            this.channels.push(nonExistent);
            this.tuneChannelByIndex(this.channels.length - 1, true);
        }

        getVisibleIndex(channel) {
            return this.getVisibleChannels().indexOf(channel);
        }

        channelUp() {
            const visible = this.getVisibleChannels();
            if (!visible.length) return;
            const current = this.channels[this.currentChannelIndex];
            let idx = visible.indexOf(current);
            idx = idx === -1 ? 0 : (idx + 1) % visible.length;
            const target = visible[idx];
            const allIdx = this.channels.indexOf(target);
            if (allIdx !== -1) this.tuneChannelByIndex(allIdx, true);
        }

        channelDown() {
            const visible = this.getVisibleChannels();
            if (!visible.length) return;
            const current = this.channels[this.currentChannelIndex];
            let idx = visible.indexOf(current);
            idx = idx === -1 ? 0 : (idx - 1 + visible.length) % visible.length;
            const target = visible[idx];
            const allIdx = this.channels.indexOf(target);
            if (allIdx !== -1) this.tuneChannelByIndex(allIdx, true);
        }

        showLoadingSpinner() {
            if (this.channelLoadingSpinner && this.isPowerOn) {
                this.channelLoadingSpinner.classList.remove('hidden');
            }
        }

        hideLoadingSpinner() {
            if (this.channelLoadingSpinner) {
                this.channelLoadingSpinner.classList.add('hidden');
            }
        }

        stopHls() {
            if (this.hls) {
                try { this.hls.destroy(); } catch (e) {}
                this.hls = null;
            }
        }

        stopVideoElement() {
            this.stopHls();
            if (!this.customVideo) return;
            this.customVideo.onplaying = null;
            this.customVideo.onerror = null;
            this.customVideo.onwaiting = null;
            this.customVideo.onended = null;
            try {
                this.customVideo.pause();
                this.customVideo.removeAttribute('src');
                this.customVideo.load();
            } catch (e) {}
            this.customVideo.style.display = 'none';
        }

        displayNoSignalContent() {
            if (!this.isPowerOn) return;
            if (this.channelLoadTimeout) {
                clearTimeout(this.channelLoadTimeout);
                this.channelLoadTimeout = null;
            }
            this.hideLoadingSpinner();
            this.stopVideoElement();
            this.currentMediaMode = 'canvas';
            this.tvCanvas.style.display = 'block';
            this.tvFeed.setChannelType('static');
            if (this.pipFeed) {
                this.pipFeed.setChannelType('static');
                this.pipFeed.setVideoSource(null);
            }
            this.isChannelInNoSignalState = true;
        }

        playIPTVChannel(ch) {
            if (!this.customVideo) return;
            const streamUrl = ch.liveUrl || ch.streamUrl;
            if (!streamUrl) {
                this.displayNoSignalContent();
                return;
            }

            const token = this.currentTuneToken;
            this.showLoadingSpinner();
            this.stopHls();

            this.customVideo.volume = this.volume;
            this.customVideo.muted = this.isMuted;

            if (this.channelLoadTimeout) clearTimeout(this.channelLoadTimeout);
            this.channelLoadTimeout = setTimeout(() => {
                if (this.currentTuneToken !== token) return;
                this.displayNoSignalContent();
            }, 45000);

            const onPlaying = () => {
                if (this.currentTuneToken !== token) return;
                if (this.channelLoadTimeout) {
                    clearTimeout(this.channelLoadTimeout);
                    this.channelLoadTimeout = null;
                }
                this.hideLoadingSpinner();
                this.isChannelInNoSignalState = false;
                this.tvCanvas.style.display = 'none';
                this.customVideo.style.display = 'block';
                if (this.pipFeed) {
                    this.pipFeed.setChannelType('iptv');
                    this.pipFeed.setVideoSource(this.customVideo);
                }
            };

            this.customVideo.onplaying = onPlaying;
            this.customVideo.onwaiting = () => {
                if (this.currentTuneToken === token && !this.isChannelInNoSignalState) {
                    this.showLoadingSpinner();
                }
            };
            this.customVideo.onerror = () => {
                if (this.currentTuneToken !== token) return;
                this.displayNoSignalContent();
            };

            if (window.Hls && window.Hls.isSupported()) {
                this.hls = new window.Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 60,
                    manifestLoadingTimeOut: 9000,
                    levelLoadingTimeOut: 9000,
                    fragLoadingTimeOut: 12000
                });
                this.hls.loadSource(streamUrl);
                this.hls.attachMedia(this.customVideo);
                this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    if (this.currentTuneToken !== token) return;
                    this.customVideo.play().catch(() => {});
                });
                this.hls.on(window.Hls.Events.ERROR, (event, data) => {
                    if (this.currentTuneToken !== token) return;
                    if (!data || !data.fatal) return;
                    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                        try { this.hls.recoverMediaError(); } catch (e) { this.displayNoSignalContent(); }
                    } else {
                        this.displayNoSignalContent();
                    }
                });
            } else {
                this.customVideo.src = streamUrl;
                this.customVideo.play().catch(() => {
                    if (this.currentTuneToken === token) this.displayNoSignalContent();
                });
            }
        }

        playVodVideo(url, title) {
            if (!this.customVideo || !url) return;
            this.currentTuneToken = (this.currentTuneToken || 0) + 1;
            if (this.channelLoadTimeout) {
                clearTimeout(this.channelLoadTimeout);
                this.channelLoadTimeout = null;
            }
            this.vodPlaying = true;
            this.vodReturnIndex = this.currentChannelIndex;
            this.currentMediaMode = 'vod';
            this.hideLoadingSpinner();
            this.stopHls();
            this.tvCanvas.style.display = 'none';
            this.customVideo.style.display = 'block';
            this.customVideo.volume = this.volume;
            this.customVideo.muted = this.isMuted;

            this.customVideo.onplaying = () => {
                this.hideLoadingSpinner();
            };
            this.customVideo.onerror = () => {
                this.vodPlaying = false;
                this.showMediaOSD('VOD', 'Não foi possível reproduzir este título');
                this.stopVod(true);
            };
            this.customVideo.onended = () => {
                this.stopVod(false);
            };

            if (url.indexOf('.m3u8') !== -1 && window.Hls && window.Hls.isSupported()) {
                this.hls = new window.Hls({ enableWorker: true });
                this.hls.loadSource(url);
                this.hls.attachMedia(this.customVideo);
                this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    this.customVideo.play().catch(() => {});
                });
                this.hls.on(window.Hls.Events.ERROR, (event, data) => {
                    if (data && data.fatal) {
                        this.vodPlaying = false;
                        this.stopVod(true);
                    }
                });
            } else {
                this.customVideo.src = url;
                this.customVideo.play().catch(() => {});
            }

            this.showMediaOSD('VOD', title || 'Reproduzindo');
        }

        stopVod(silent) {
            this.vodPlaying = false;
            this.stopVideoElement();
            this.currentMediaMode = 'tv';
            this.tvCanvas.style.display = 'none';
            const ch = this.channels[this.vodReturnIndex] || this.channels[this.currentChannelIndex];
            const idx = this.channels.indexOf(ch);
            this.tuneChannelByIndex(idx === -1 ? 0 : idx, true);
            if (!silent) this.showMediaOSD('TV', 'Retornando à transmissão');
        }

        togglePlayback() {
            if (this.vodPlaying && this.customVideo) {
                if (this.customVideo.paused) {
                    this.customVideo.play().catch(() => {});
                    this.showMediaOSD('PLAY', 'Reproduzindo');
                } else {
                    this.customVideo.pause();
                    this.showMediaOSD('PAUSE', 'Pausado');
                }
                return;
            }
            this.toggleBanner();
        }

        /* =================================================================
         * BANNER OSD
         * ================================================================= */

        showBanner(duration) {
            if (!this.isPowerOn || !this.channelBanner) return;
            this.channelBanner.classList.remove('hidden');
            this.isBannerVisible = true;
            if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
            if (duration > 0) {
                this.bannerTimeout = setTimeout(() => this.hideBanner(), duration);
            }
        }

        hideBanner() {
            if (!this.channelBanner) return;
            this.channelBanner.classList.add('hidden');
            this.isBannerVisible = false;
            this.bannerChannelKey = this.channels[this.currentChannelIndex] ? this.channels[this.currentChannelIndex].key : null;
            const ch = this.channels[this.currentChannelIndex];
            if (ch) this.updateBannerForChannel(ch);
            if (this.bannerTimeout) {
                clearTimeout(this.bannerTimeout);
                this.bannerTimeout = null;
            }
        }

        toggleBanner() {
            if (this.isBannerVisible) {
                this.hideBanner();
            } else {
                const ch = this.channels[this.currentChannelIndex];
                this.bannerChannelKey = ch ? ch.key : null;
                if (ch) this.updateBannerForChannel(ch);
                this.showBanner(5000);
            }
        }

        updateBannerForChannel(channel) {
            if (!channel) {
                const fallback = this.channels[this.currentChannelIndex];
                if (!fallback) return;
                channel = fallback;
            }

            const elNum = document.getElementById('banner-ch-num');
            const elCode = document.getElementById('banner-ch-code');
            const elTitle = document.getElementById('banner-prog-title');
            const elLang = document.getElementById('banner-lang');
            const elTimeslot = document.getElementById('banner-timeslot');
            const elRating = document.getElementById('banner-rating');
            const elFavTag = document.getElementById('banner-favorites-tag');

            if (elNum) elNum.innerText = channel.id || padChannel(channel.number || 0);
            if (elCode) elCode.innerText = channel.name || channel.code || '';
            if (elTitle) elTitle.innerText = channel.title || '';
            if (elLang) elLang.innerText = channel.language || 'Português';
            if (elTimeslot) elTimeslot.innerText = channel.timeSlot || '';
            if (elRating) elRating.innerText = channel.rating || 'LIVRE';

            const logoOrb = document.querySelector('.banner-channel-badge .logo-orb');
            if (logoOrb) {
                const fallbackSvg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#111827"/><path d="M 50 2 A 48 48 0 0 1 50 98 A 24 24 0 0 1 50 50 A 24 24 0 0 0 50 2" fill="#ffffff"/><circle cx="50" cy="26" r="6" fill="#111827"/><circle cx="50" cy="74" r="6" fill="#ffffff"/></svg>';
                if (channel.logo) {
                    logoOrb.innerHTML = `<img src="${escapeHtml(channel.logo)}" alt="">`;
                    const logoImg = logoOrb.querySelector('img');
                    if (logoImg) {
                        logoImg.onerror = () => { logoOrb.innerHTML = fallbackSvg; };
                    }
                } else {
                    logoOrb.innerHTML = fallbackSvg;
                }
            }

            if (elFavTag) {
                const playlistName = this.getPlaylistName();
                const favorite = channel.number !== 0 && this.store.isFavorite(channel.key);
                const viewingOther = channel !== this.channels[this.currentChannelIndex];
                let text = `Playlist: ${playlistName}${favorite ? ' • Favorito' : ''}`;
                if (viewingOther) text += ' • Pressione OK para assistir';
                elFavTag.innerHTML = `<span>${escapeHtml(text)}</span>`;
            }
        }

        bannerBrowse(delta) {
            if (!this.isPowerOn) return;
            const visible = this.getVisibleChannels();
            if (!visible.length) return;

            let idx = visible.findIndex(ch => ch.key === this.bannerChannelKey);
            if (idx === -1) {
                const current = this.channels[this.currentChannelIndex];
                idx = visible.indexOf(current);
            }
            idx = (idx + delta + visible.length) % visible.length;
            const ch = visible[idx];
            this.bannerChannelKey = ch.key;
            this.updateBannerForChannel(ch);
            this.showBanner(5000);
        }

        confirmBannerTune() {
            const visible = this.getVisibleChannels();
            const ch = visible.find(item => item.key === this.bannerChannelKey);
            if (!ch) {
                this.hideBanner();
                return;
            }
            const idx = this.channels.indexOf(ch);
            if (idx !== -1) this.tuneChannelByIndex(idx, true);
        }

        /* =================================================================
         * GUIA EPG (com virtualização)
         * ================================================================= */

        openGuide() {
            if (!this.isPowerOn) return;
            this.hideBanner();
            this.closeMiniGuide();
            this.closePlaylistModal();

            this.guideList = this.getVisibleChannels();
            const current = this.channels[this.currentChannelIndex];
            const idx = this.guideList.indexOf(current);
            if (idx !== -1) this.guideSelectedIndex = idx;
            if (this.guideSelectedIndex >= this.guideList.length) this.guideSelectedIndex = 0;
            this.guideSelectedSlotIndex = 0;

            this.updatePlaylistFilterLabel();
            this.epgGuide.classList.remove('hidden');
            this.isGuideOpen = true;
            this.buildEPGGrid();
            this.updateEPGSelection();

            if (this.pipFeed) {
                this.pipFeed.resize();
                this.pipFeed.setChannelType(current ? current.type : 'static');
            }
        }

        closeGuide() {
            if (!this.isGuideOpen) return;
            if (this.isPlaylistModalOpen) this.closePlaylistModal();
            this.epgGuide.classList.add('hidden');
            this.isGuideOpen = false;
            const ch = this.channels[this.currentChannelIndex];
            this.bannerChannelKey = ch ? ch.key : null;
            if (ch) this.updateBannerForChannel(ch);
            this.showBanner(3500);
        }

        toggleGuide() {
            if (this.isGuideOpen) this.closeGuide();
            else this.openGuide();
        }

        buildEPGGrid() {
            const rowsContainer = document.getElementById('epg-rows-list');
            if (!rowsContainer) return;

            this.guideList = this.getVisibleChannels();
            this.renderTimelineHeader();

            rowsContainer.innerHTML = '';

            if (!this.guideList.length) {
                rowsContainer.innerHTML = '<div class="epg-empty-state">Nenhum canal nesta playlist.</div>';
                return;
            }

            if (this.guideSelectedIndex < 0) this.guideSelectedIndex = 0;
            if (this.guideSelectedIndex >= this.guideList.length) this.guideSelectedIndex = this.guideList.length - 1;

            this.guideWindowStart = this.computeWindowStart(this.guideSelectedIndex, this.guideList.length, GUIDE_WINDOW_SIZE);
            const end = Math.min(this.guideList.length, this.guideWindowStart + GUIDE_WINDOW_SIZE);

            for (let i = this.guideWindowStart; i < end; i++) {
                const row = this.createEPGRow(this.guideList[i], i);
                if (row) rowsContainer.appendChild(row);
            }
        }

        computeWindowStart(selected, total, size) {
            let start = Math.max(0, selected - Math.floor(size / 2));
            if (start + size > total) start = Math.max(0, total - size);
            return start;
        }

        renderTimelineHeader() {
            const now = new Date();
            const baseMin = now.getMinutes() < 30 ? 0 : 30;
            const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), baseMin, 0, 0);
            this.guideWindowStartMs = windowStart.getTime();
            this.guideWindowEndMs = this.guideWindowStartMs + 3 * 60 * 60 * 1000;

            const dateHeader = document.getElementById('epg-date-label');
            if (dateHeader) {
                const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                dateHeader.innerText = `${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
            }

            const headerContainer = document.getElementById('epg-timeline-header-track');
            if (!headerContainer) return;
            headerContainer.innerHTML = '';
            for (let i = 0; i < 6; i++) {
                const slotTime = new Date(this.guideWindowStartMs + i * 30 * 60 * 1000);
                const slotDiv = document.createElement('div');
                slotDiv.className = 'epg-time-slot-header';
                slotDiv.id = `epg-time-slot-${i}`;
                slotDiv.innerText = window.formatTime12 ? window.formatTime12(slotTime) : '';
                headerContainer.appendChild(slotDiv);
            }
        }

        createEPGRow(ch, chIdx) {
            const row = document.createElement('div');
            row.className = 'epg-row';
            row.id = `epg-row-${chIdx}`;

            const chCell = document.createElement('div');
            chCell.className = 'epg-channel-cell';
            const logoHtml = ch.logo
                ? `<div class="epg-cell-logo-slot"><img src="${escapeHtml(ch.logo)}" alt="" class="epg-cell-logo" data-logo-fallback="1"></div>`
                : `<div class="epg-cell-logo-slot"><img src="${CHANNEL_LOGO_ATTR}" alt="" class="epg-cell-logo-fallback"></div>`;
            const favorite = ch.number !== 0 && this.store.isFavorite(ch.key);
            chCell.innerHTML = `
                <span class="cell-ch-num">${escapeHtml(ch.id)}</span>
                ${logoHtml}
                <span class="cell-ch-name" title="${escapeHtml(ch.name)}">${escapeHtml(ch.name)}</span>
                ${favorite ? '<svg class="epg-fav-star"><use href="#icon-star"></use></svg>' : ''}
            `;
            chCell.addEventListener('click', () => {
                const visible = this.getVisibleChannels();
                const target = visible[chIdx];
                const allIdx = this.channels.indexOf(target);
                this.guideSelectedIndex = chIdx;
                this.guideSelectedSlotIndex = 0;
                if (allIdx !== -1) this.tuneChannelByIndex(allIdx, true);
                this.closeGuide();
            });
            row.appendChild(chCell);

            const progTrack = document.createElement('div');
            progTrack.className = 'epg-programs-track';

            const hasRealEpg = Boolean(ch.epg && ch.epg.hasEpg && ch.schedule && ch.schedule.length > 0);

            if (!hasRealEpg) {
                const noInfoBlock = document.createElement('div');
                noInfoBlock.className = 'epg-program-block epg-no-info';
                noInfoBlock.id = `epg-block-${chIdx}-0`;
                noInfoBlock.innerHTML = '<span class="epg-no-info-text">sem informações de programação...</span>';
                noInfoBlock.addEventListener('click', () => {
                    this.guideSelectedIndex = chIdx;
                    this.guideSelectedSlotIndex = 0;
                    this.updateEPGSelection();
                });
                progTrack.appendChild(noInfoBlock);
            } else {
                const windowStartMs = this.guideWindowStartMs;
                const windowEndMs = this.guideWindowEndMs;

                let visiblePrograms = ch.schedule.filter(p => {
                    const pStart = new Date(p.start).getTime();
                    const pStop = new Date(p.stop).getTime();
                    return pStop > windowStartMs && pStart < windowEndMs;
                });
                if (!visiblePrograms.length) visiblePrograms = ch.schedule.slice(0, 4);

                const totalDurMs = windowEndMs - windowStartMs;

                visiblePrograms.forEach((item, slotIdx) => {
                    const block = document.createElement('div');
                    block.className = 'epg-program-block';
                    block.id = `epg-block-${chIdx}-${slotIdx}`;

                    const reminderSet = this.store.isReminderSet({
                        channelKey: ch.key,
                        start: item.start,
                        title: item.title
                    });
                    if (reminderSet) block.classList.add('reminder-set');

                    const pStartMs = new Date(item.start).getTime();
                    const pStopMs = new Date(item.stop).getTime();
                    const effectiveStart = Math.max(windowStartMs, pStartMs);
                    const effectiveStop = Math.min(windowEndMs, pStopMs);
                    const dur = Math.max(10 * 60 * 1000, effectiveStop - effectiveStart);
                    const pct = Math.max(8, (dur / totalDurMs) * 100);

                    block.style.flex = `${pct} 0 auto`;
                    block.style.minWidth = '70px';

                    const timeStr = item.timeBadge || item.time || '';
                    const timeTag = timeStr && timeStr !== '--:--' ? `<span class="epg-block-time">${escapeHtml(timeStr)}</span>` : '';
                    const star = reminderSet ? '<svg class="epg-reminder-star"><use href="#icon-star"></use></svg>' : '';

                    block.innerHTML = `
                        ${star}
                        ${timeTag}
                        <span class="epg-block-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                    `;

                    block.addEventListener('click', () => {
                        const alreadySelected = this.guideSelectedIndex === chIdx && this.guideSelectedSlotIndex === slotIdx;
                        this.guideSelectedIndex = chIdx;
                        this.guideSelectedSlotIndex = slotIdx;
                        this.updateEPGSelection();
                        if (alreadySelected) {
                            const allIdx = this.channels.indexOf(ch);
                            if (allIdx !== -1) this.tuneChannelByIndex(allIdx, true);
                            this.closeGuide();
                        }
                    });

                    progTrack.appendChild(block);
                });
            }

            row.appendChild(progTrack);
            if (chIdx === this.guideSelectedIndex) row.classList.add('selected');
            if (chIdx === this.getVisibleIndex(this.channels[this.currentChannelIndex])) row.classList.add('now-playing');
            return row;
        }

        async maybeFetchEpg(ch) {
            if (!this.providerData || this.providerData.providerType !== 'xtream') return;
            if (!ch || !ch.slug || ch.epg && ch.epg.hasEpg) return;
            if (this.epgFetched.has(ch.key)) return;
            this.epgFetched.add(ch.key);

            const cfg = this.providerData.config;
            if (!cfg) return;

            try {
                const programs = await window.XtreamCodesClient.getShortEpg(cfg.server, cfg.username, cfg.password, ch.slug);
                if (!programs || !programs.length) return;
                ch.schedule = programs.map(p => ({
                    time: window.formatTime12(p.start),
                    timeBadge: window.formatTimeBadge(p.start),
                    timeSlot: window.formatTimeSlot(p.start, p.stop),
                    title: window.stripEmoji(p.title || 'Programa ao Vivo'),
                    description: window.stripEmoji(p.description || ''),
                    rating: 'LIVRE',
                    current: Date.now() >= new Date(p.start).getTime() && Date.now() < new Date(p.stop).getTime(),
                    start: p.start,
                    stop: p.stop
                }));
                ch.epg = { hasEpg: true };
                const currentProg = ch.schedule.find(p => p.current) || ch.schedule[0];
                if (currentProg) {
                    ch.title = currentProg.title;
                    ch.timeSlot = currentProg.timeSlot;
                }
                if (this.isGuideOpen) {
                    this.buildEPGGrid();
                    this.updateEPGSelection();
                }
            } catch (e) {
                console.warn('[EPG] Falha ao carregar programação:', e);
            }
        }

        ensureGuideWindow() {
            if (this.guideSelectedIndex < this.guideWindowStart ||
                this.guideSelectedIndex >= this.guideWindowStart + GUIDE_WINDOW_SIZE) {
                this.buildEPGGrid();
                return true;
            }
            return false;
        }

        updateEPGSelection() {
            document.querySelectorAll('.epg-row.selected').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.epg-program-block.selected').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.epg-row.now-playing').forEach(el => el.classList.remove('now-playing'));

            if (!this.guideList.length) return;
            if (this.guideSelectedIndex < 0) this.guideSelectedIndex = 0;
            if (this.guideSelectedIndex >= this.guideList.length) this.guideSelectedIndex = this.guideList.length - 1;

            this.ensureGuideWindow();

            const current = this.channels[this.currentChannelIndex];
            const nowPlayingIndex = this.guideList.indexOf(current);
            const playingRow = nowPlayingIndex !== -1 ? document.getElementById(`epg-row-${nowPlayingIndex}`) : null;
            if (playingRow) playingRow.classList.add('now-playing');

            const row = document.getElementById(`epg-row-${this.guideSelectedIndex}`);
            const block = document.getElementById(`epg-block-${this.guideSelectedIndex}-${this.guideSelectedSlotIndex}`) ||
                document.getElementById(`epg-block-${this.guideSelectedIndex}-0`);

            if (row) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            if (block) block.classList.add('selected');

            const ch = this.guideList[this.guideSelectedIndex];
            if (!ch) return;

            if (!ch.epg || !ch.epg.hasEpg) this.maybeFetchEpg(ch);

            const headlineEl = document.getElementById('epg-headline-text');
            const synopsisEl = document.getElementById('epg-synopsis-text');
            const timeslotEl = document.getElementById('epg-timeslot');
            const ratingEl = document.getElementById('epg-rating');

            const hasRealEpg = Boolean(ch.epg && ch.epg.hasEpg && ch.schedule && ch.schedule.length > 0);
            let currentSlot = null;

            if (hasRealEpg) {
                const blocks = row ? row.querySelectorAll('.epg-program-block') : [];
                const visiblePrograms = ch.schedule.filter(p => {
                    const pStop = new Date(p.stop).getTime();
                    const pStart = new Date(p.start).getTime();
                    return pStop > this.guideWindowStartMs && pStart < this.guideWindowEndMs;
                });
                const list = visiblePrograms.length ? visiblePrograms : ch.schedule;
                currentSlot = list[this.guideSelectedSlotIndex] || list[0] || null;
            }

            if (headlineEl) headlineEl.innerText = `${ch.id} - ${(ch.name || '').toUpperCase()}`;
            if (currentSlot) {
                if (synopsisEl) synopsisEl.innerText = currentSlot.description || `Transmissão ao vivo do canal ${ch.name}.`;
                if (timeslotEl) timeslotEl.innerText = currentSlot.timeSlot || '--:-- - --:--';
                if (ratingEl) ratingEl.innerText = currentSlot.rating || 'LIVRE';
            } else {
                if (synopsisEl) synopsisEl.innerText = 'Sem informações de programação disponíveis para este canal no momento.';
                if (timeslotEl) timeslotEl.innerText = ch.timeSlot || '--:-- - --:--';
                if (ratingEl) ratingEl.innerText = 'LIVRE';
            }

            const playingCh = this.channels[this.currentChannelIndex] || ch;
            if (this.pipFeed) {
                this.pipFeed.setChannelType(playingCh.type);
                if (playingCh.type === 'iptv' && this.customVideo) {
                    this.pipFeed.setVideoSource(this.customVideo);
                } else {
                    this.pipFeed.setVideoSource(null);
                }
            }
        }

        getSelectedProgram() {
            const ch = this.guideList[this.guideSelectedIndex];
            if (!ch || !ch.epg || !ch.epg.hasEpg || !ch.schedule || !ch.schedule.length) return null;

            const visiblePrograms = ch.schedule.filter(p => {
                const pStop = new Date(p.stop).getTime();
                const pStart = new Date(p.start).getTime();
                return pStop > this.guideWindowStartMs && pStart < this.guideWindowEndMs;
            });
            const list = visiblePrograms.length ? visiblePrograms : ch.schedule;
            const program = list[this.guideSelectedSlotIndex] || list[0] || null;
            if (!program) return null;
            return { channel: ch, program };
        }

        guideMoveVertical(delta) {
            if (!this.guideList.length) return;
            this.guideSelectedIndex = (this.guideSelectedIndex + delta + this.guideList.length) % this.guideList.length;
            this.guideSelectedSlotIndex = 0;
            this.ensureGuideWindow();
            this.updateEPGSelection();
        }

        guideMoveHorizontal(delta) {
            const ch = this.guideList[this.guideSelectedIndex];
            if (!ch) return;
            const row = document.getElementById(`epg-row-${this.guideSelectedIndex}`);
            const blocks = row ? row.querySelectorAll('.epg-program-block') : [];
            const maxSlot = Math.max(0, blocks.length - 1);
            this.guideSelectedSlotIndex = Math.max(0, Math.min(maxSlot, this.guideSelectedSlotIndex + delta));
            this.updateEPGSelection();
        }

        guideSelectCurrent() {
            const ch = this.guideList[this.guideSelectedIndex];
            if (!ch) return;
            const idx = this.channels.indexOf(ch);
            if (idx !== -1) this.tuneChannelByIndex(idx, true);
            this.closeGuide();
        }

        /* =================================================================
         * MINI GUIA (com virtualização)
         * ================================================================= */

        buildMiniGuide() {
            const list = document.getElementById('mini-guide-items');
            if (!list) return;

            const visible = this.getVisibleChannels();
            list.innerHTML = '';

            if (!visible.length) {
                list.innerHTML = '<div class="mini-guide-empty">Nenhum canal nesta playlist.</div>';
                return;
            }

            if (this.miniGuideSelectedIndex < 0) this.miniGuideSelectedIndex = 0;
            if (this.miniGuideSelectedIndex >= visible.length) this.miniGuideSelectedIndex = visible.length - 1;

            this.miniWindowStart = this.computeWindowStart(this.miniGuideSelectedIndex, visible.length, MINI_WINDOW_SIZE);
            const end = Math.min(visible.length, this.miniWindowStart + MINI_WINDOW_SIZE);

            for (let i = this.miniWindowStart; i < end; i++) {
                const ch = visible[i];
                const item = document.createElement('div');
                item.className = 'mini-guide-item';
                item.id = `mini-guide-item-${i}`;

                const favorite = ch.number !== 0 && this.store.isFavorite(ch.key);
                const logoHtml = ch.logo
                    ? `<div class="mini-guide-logo-slot"><img src="${escapeHtml(ch.logo)}" alt="" class="mini-guide-logo" data-logo-fallback="1"></div>`
                    : `<div class="mini-guide-logo-slot"><img src="${CHANNEL_LOGO_ATTR}" alt="" class="mini-guide-logo-fallback"></div>`;

                item.innerHTML = `
                    <div class="mini-guide-ch-left">
                        <span class="mini-guide-num">${escapeHtml(ch.id)}</span>
                        ${logoHtml}
                        <span class="mini-guide-title" title="${escapeHtml(ch.name)}">${escapeHtml(ch.name)}</span>
                        ${favorite ? '<svg class="mini-guide-fav"><use href="#icon-star"></use></svg>' : ''}
                    </div>
                    <div class="mini-guide-prog" title="${escapeHtml(ch.title || '')}">
                        <span class="mini-guide-prog-text">${escapeHtml(ch.title || '')}</span>
                        <span class="mini-guide-status-badge">NO AR</span>
                    </div>
                `;

                item.addEventListener('click', () => {
                    this.miniGuideSelectedIndex = i;
                    this.miniGuideSelectCurrent();
                });
                item.addEventListener('mouseenter', () => {
                    this.miniGuideSelectedIndex = i;
                    this.updateMiniGuideHighlight();
                });

                list.appendChild(item);
            }

            this.updateMiniGuideHighlight();
        }

        updateMiniGuideHighlight() {
            document.querySelectorAll('.mini-guide-item').forEach(el => {
                el.classList.remove('selected', 'focused', 'now-playing', 'active');
            });

            const visible = this.getVisibleChannels();
            const playingIndex = visible.indexOf(this.channels[this.currentChannelIndex]);
            if (playingIndex !== -1) {
                const playingItem = document.getElementById(`mini-guide-item-${playingIndex}`);
                if (playingItem) playingItem.classList.add('now-playing');
            }

            const selectedItem = document.getElementById(`mini-guide-item-${this.miniGuideSelectedIndex}`);
            if (selectedItem) {
                selectedItem.classList.add('selected');
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        miniGuideMoveVertical(delta) {
            const visible = this.getVisibleChannels();
            if (!visible.length) return;
            this.miniGuideSelectedIndex = (this.miniGuideSelectedIndex + delta + visible.length) % visible.length;
            if (this.miniGuideSelectedIndex < this.miniWindowStart ||
                this.miniGuideSelectedIndex >= this.miniWindowStart + MINI_WINDOW_SIZE) {
                this.buildMiniGuide();
            } else {
                this.updateMiniGuideHighlight();
            }
        }

        miniGuideSelectCurrent() {
            const visible = this.getVisibleChannels();
            const ch = visible[this.miniGuideSelectedIndex];
            if (!ch) return;
            const allIdx = this.channels.indexOf(ch);
            if (allIdx !== -1) this.tuneChannelByIndex(allIdx, true);
            this.closeMiniGuide();
        }

        toggleMiniGuide() {
            if (this.isMiniGuideOpen) this.closeMiniGuide();
            else this.openMiniGuide();
        }

        openMiniGuide() {
            this.closeGuide();
            const visible = this.getVisibleChannels();
            const idx = visible.indexOf(this.channels[this.currentChannelIndex]);
            this.miniGuideSelectedIndex = idx === -1 ? 0 : idx;
            this.buildMiniGuide();
            if (this.miniGuide) this.miniGuide.classList.remove('hidden');
            this.isMiniGuideOpen = true;
        }

        closeMiniGuide() {
            if (!this.isMiniGuideOpen) return;
            if (this.miniGuide) this.miniGuide.classList.add('hidden');
            this.isMiniGuideOpen = false;
        }

        /* =================================================================
         * DISCAGEM NUMÉRICA
         * ================================================================= */

        dialDigit(digit) {
            if (!this.isPowerOn) return;
            if (this.dialDigits.length >= 4) this.dialDigits = '';
            this.dialDigits += String(digit);

            if (this.osdDialDigits) this.osdDialDigits.innerText = this.dialDigits;
            if (this.osdDial) this.osdDial.classList.remove('hidden');

            if (this.dialTimeout) clearTimeout(this.dialTimeout);
            this.dialTimeout = setTimeout(() => this.confirmDial(), 1800);
        }

        confirmDial() {
            if (this.dialTimeout) clearTimeout(this.dialTimeout);
            this.dialTimeout = null;

            if (this.dialDigits.length > 0) {
                const num = parseInt(this.dialDigits, 10);
                this.dialDigits = '';
                this.tuneByNumber(num);
            }
            if (this.osdDial) this.osdDial.classList.add('hidden');
        }

        /* =================================================================
         * FAVORITOS E PLAYLISTS
         * ================================================================= */

        toggleFavoriteCurrent() {
            const ch = this.channels[this.currentChannelIndex];
            if (!ch || ch.number === 0 || ch.type === 'static') {
                this.showMediaOSD('FAVORITOS', 'Sintonize um canal para favoritar');
                return;
            }

            const added = this.store.toggleFavorite(ch.key);
            this.rebuildPlaylists();

            if (this.isGuideOpen) {
                this.buildEPGGrid();
                this.updateEPGSelection();
            }
            if (this.isMiniGuideOpen) this.buildMiniGuide();

            this.updateBannerForChannel(ch);
            this.showMediaOSD('FAVORITOS', added ? 'Canal adicionado aos Favoritos' : 'Canal removido dos Favoritos');
        }

        setPlaylist(id, options) {
            const opts = options || {};
            if (!this.playlists.some(p => p.id === id)) return;

            this.playlistId = id;
            this.store.saveSettings({ activePlaylistId: id });
            this.updatePlaylistFilterLabel();
            this.renderPlaylistChips();

            const visible = this.getVisibleChannels();
            let target = null;

            if (visible.length) {
                if (id === 'all' && visible.length > 1) {
                    target = visible[1];
                } else {
                    target = visible[0];
                }
            }

            if (!opts.keepCurrent && target) {
                const idx = this.channels.indexOf(target);
                if (idx !== -1) this.tuneChannelByIndex(idx, true);
            }

            if (this.isGuideOpen) {
                this.guideSelectedIndex = 0;
                this.guideSelectedSlotIndex = 0;
                this.buildEPGGrid();
                this.updateEPGSelection();
            }
            if (this.isMiniGuideOpen) this.buildMiniGuide();

            this.showMediaOSD('PLAYLIST', `${this.getPlaylistName()} (${visible.length} canais)`);
        }

        openPlaylistModal() {
            if (!this.isPowerOn || !this.modalPlaylist) return;
            this.closeSettings();
            this.isPlaylistModalOpen = true;
            this.modalSelectedPlaylist = this.playlistId;
            this.renderPlaylistOptions();
            this.modalPlaylist.classList.add('active');
        }

        closePlaylistModal() {
            if (!this.modalPlaylist) return;
            this.isPlaylistModalOpen = false;
            this.modalPlaylist.classList.remove('active');
        }

        renderPlaylistOptions() {
            const list = document.getElementById('playlist-options-list');
            if (!list) return;

            list.innerHTML = this.playlists.map(p => {
                const isCurrent = p.id === this.playlistId;
                return `
                    <div class="playlist-card${isCurrent ? ' is-current' : ''}" data-playlist-card="${escapeHtml(p.id)}" tabindex="0">
                        <div class="playlist-flag-bubble">
                            <span class="playlist-flag-icon">${p.id === 'all' ? 'ALL' : (p.id === 'favorites' ? 'FAV' : escapeHtml(String(p.name).slice(0, 3).toUpperCase()))}</span>
                        </div>
                        <div class="playlist-card-content">
                            <div class="playlist-card-title-row">
                                <span class="playlist-title">${escapeHtml(p.name)}</span>
                                <div class="playlist-card-badges">
                                    ${isCurrent ? '<span class="playlist-current-tag">NO AR</span>' : ''}
                                    <span class="playlist-action-badge">${p.count} CANAIS</span>
                                </div>
                            </div>
                            <span class="playlist-desc">${p.id === 'all' ? 'Todos os canais do provedor' : (p.id === 'favorites' ? 'Canais marcados com o botão Amarelo' : 'Categoria fornecida pelo provedor')}</span>
                        </div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('[data-playlist-card]').forEach(card => {
                card.addEventListener('click', () => {
                    this.modalSelectedPlaylist = card.getAttribute('data-playlist-card');
                    this.updatePlaylistModalUI();
                });
                card.addEventListener('dblclick', () => {
                    this.modalSelectedPlaylist = card.getAttribute('data-playlist-card');
                    this.confirmPlaylistSelection();
                });
            });

            this.updatePlaylistModalUI();
        }

        updatePlaylistModalUI() {
            document.querySelectorAll('[data-playlist-card]').forEach(card => {
                const id = card.getAttribute('data-playlist-card');
                card.classList.toggle('focused', id === this.modalSelectedPlaylist);
            });

            const btn = document.getElementById('btn-confirm-playlist');
            if (btn) {
                const name = this.getPlaylistName(this.modalSelectedPlaylist);
                btn.innerText = this.modalSelectedPlaylist === this.playlistId
                    ? `Permanecer em ${name}`
                    : `Aplicar ${name}`;
            }

            const focused = document.querySelector('[data-playlist-card].focused');
            if (focused) focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        movePlaylistModalSelection(delta) {
            const ids = this.playlists.map(p => p.id);
            let idx = ids.indexOf(this.modalSelectedPlaylist);
            if (idx === -1) idx = 0;
            idx = (idx + delta + ids.length) % ids.length;
            this.modalSelectedPlaylist = ids[idx];
            this.updatePlaylistModalUI();
        }

        confirmPlaylistSelection() {
            this.closePlaylistModal();
            this.setPlaylist(this.modalSelectedPlaylist);
        }

        /* =================================================================
         * LEMBRETES DE PROGRAMAÇÃO
         * ================================================================= */

        startReminderLoop() {
            this.store.pruneReminders(Date.now());
            if (this.reminderLoop) clearInterval(this.reminderLoop);
            this.reminderLoop = setInterval(() => this.checkReminders(), 10000);
            this.checkReminders();
        }

        checkReminders() {
            if (this.isReminderOpen) return;
            const now = Date.now();
            const reminders = this.store.getReminders();
            let updated = false;

            for (const reminder of reminders) {
                const start = new Date(reminder.start).getTime();
                if (!Number.isFinite(start)) continue;
                if (reminder.notified) continue;
                if (now >= start && now <= start + 5 * 60 * 1000) {
                    reminder.notified = true;
                    updated = true;
                    this.store.saveReminders(reminders);
                    this.showReminderPopup(reminder);
                    break;
                }
            }

            if (updated) this.renderRemindersList();
        }

        toggleReminderForSelected() {
            const selected = this.getSelectedProgram();
            if (!selected) {
                this.showMediaOSD('LEMBRETE', 'Programa sem grade de horários disponível');
                return;
            }

            const { channel, program } = selected;
            const startMs = new Date(program.start).getTime();
            if (!Number.isFinite(startMs) || startMs < Date.now() - 60 * 1000) {
                this.showMediaOSD('LEMBRETE', 'Este programa já começou ou não tem horário válido');
                return;
            }

            const reminder = {
                channelKey: channel.key,
                channelName: channel.name,
                channelNumber: channel.id,
                title: program.title,
                start: program.start,
                stop: program.stop
            };

            const added = this.store.toggleReminder(reminder);
            this.buildEPGGrid();
            this.updateEPGSelection();
            this.renderRemindersList();
            this.showMediaOSD('LEMBRETE', added ? 'Programa agendado' : 'Lembrete removido');
        }

        showReminderPopup(reminder) {
            if (!this.reminderPopup) return;
            this.activeReminder = reminder;
            this.isReminderOpen = true;

            const title = document.getElementById('reminder-title');
            const channel = document.getElementById('reminder-channel');
            const time = document.getElementById('reminder-time');

            if (title) title.innerText = reminder.title || 'Programa';
            if (channel) channel.innerText = `${reminder.channelNumber || ''} ${reminder.channelName || ''}`.trim();
            if (time) time.innerText = formatDateFull(reminder.start);

            this.reminderPopup.classList.remove('hidden');

            const watch = document.getElementById('reminder-watch');
            if (watch) setTimeout(() => watch.focus(), 30);
        }

        hideReminderPopup() {
            if (!this.reminderPopup) return;
            this.reminderPopup.classList.add('hidden');
            this.isReminderOpen = false;
            this.activeReminder = null;
        }

        watchReminder() {
            const reminder = this.activeReminder;
            this.hideReminderPopup();
            if (!reminder) return;
            this.tuneChannelByKey(reminder.channelKey, true);
        }

        tuneChannelByKey(key, play) {
            if (!key) return;
            let ch = this.channels.find(item => item.key === key);
            if (!ch) {
                ch = this.channels.find(item => item.number !== 0 && item.key && item.key.indexOf(key) !== -1);
            }
            if (!ch) {
                this.showMediaOSD('LEMBRETE', 'Canal não está mais disponível');
                return;
            }
            const idx = this.channels.indexOf(ch);
            if (idx !== -1) this.tuneChannelByIndex(idx, play !== false);
        }

        /* =================================================================
         * VOD - FILMES E SÉRIES
         * ================================================================= */

        bindChannelLogoFallback() {
            if (this.logoFallbackBound) return;
            this.logoFallbackBound = true;
            document.addEventListener('error', (e) => {
                const img = e.target;
                if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-logo-fallback')) return;
                img.removeAttribute('data-logo-fallback');
                img.src = CHANNEL_LOGO_ATTR;
            }, true);
        }

        bindVodModal() {
            if (!this.modalVod) return;

            const closeBtn = document.getElementById('btn-close-vod');
            if (closeBtn) closeBtn.addEventListener('click', () => this.closeVod());

            document.querySelectorAll('.vod-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.setVodTab(btn.getAttribute('data-vod-tab')));
            });

            const grid = document.getElementById('vod-grid');
            if (grid) {
                grid.addEventListener('error', (e) => {
                    const img = e.target;
                    if (img && img.tagName === 'IMG' && img.classList.contains('vod-poster')) {
                        const fallback = document.createElement('div');
                        fallback.className = 'vod-poster-fallback';
                        fallback.innerText = 'SEM POSTER';
                        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
                    }
                }, true);

                grid.addEventListener('click', (e) => {
                    const card = e.target.closest('[data-vod-movie]');
                    if (card) {
                        this.openVodItem('movie', Number(card.getAttribute('data-vod-movie')));
                        return;
                    }
                    const series = e.target.closest('[data-vod-series]');
                    if (series) {
                        this.openVodItem('series', Number(series.getAttribute('data-vod-series')));
                        return;
                    }
                    const episode = e.target.closest('[data-vod-episode]');
                    if (episode) {
                        this.openVodItem('episode', Number(episode.getAttribute('data-vod-episode')));
                    }
                });
            }

            const cats = document.getElementById('vod-categories');
            if (cats) {
                cats.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-vod-category]');
                    if (!btn) return;
                    this.vodCategoryId = btn.getAttribute('data-vod-category');
                    this.vodView = 'list';
                    this.vodFocusArea = 'grid';
                    this.vodFocusIndex = 0;
                    this.renderVod();
                });
            }
        }

        openVod() {
            if (!this.isPowerOn || !this.modalVod) return;
            this.closeGuide();
            this.closeMiniGuide();
            this.closeSettings();
            this.hideBanner();

            this.isVodOpen = true;
            this.vodView = 'list';
            this.vodFocusArea = 'categories';
            this.vodFocusIndex = 0;
            this.modalVod.classList.add('active');
            this.setVodTab(this.vodTab);

            const providerType = this.providerData ? this.providerData.providerType : null;
            if (providerType === 'xtream' && !this.vodLoaded && !this.vodLoading) {
                this.loadVodCatalog();
            } else {
                this.renderVod();
            }
        }

        closeVod() {
            if (!this.modalVod) return;
            this.modalVod.classList.remove('active');
            this.isVodOpen = false;
            this.vodView = 'list';
            this.vodSeries = null;
            this.vodEpisodes = [];
        }

        setVodTab(tab) {
            this.vodTab = tab === 'series' ? 'series' : 'movie';
            this.vodCategoryId = 'all';
            this.vodView = 'list';
            this.vodFocusArea = 'categories';
            this.vodFocusIndex = 0;
            document.querySelectorAll('.vod-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-vod-tab') === this.vodTab);
            });
            this.renderVod();
        }

        async loadVodCatalog() {
            const cfg = this.providerData ? this.providerData.config : null;
            if (!cfg) return;

            this.vodLoading = true;
            this.vodError = '';
            this.renderVod();

            try {
                const [movieCats, movies, seriesCats, series] = await Promise.all([
                    window.XtreamCodesClient.getVodCategories(cfg.server, cfg.username, cfg.password),
                    window.XtreamCodesClient.getVodStreams(cfg.server, cfg.username, cfg.password),
                    window.XtreamCodesClient.getSeriesCategories(cfg.server, cfg.username, cfg.password),
                    window.XtreamCodesClient.getSeries(cfg.server, cfg.username, cfg.password)
                ]);
                this.vod = { movieCats, movies, seriesCats, series };
                this.vodLoaded = true;
            } catch (e) {
                this.vodError = e.message || 'Falha ao carregar o catálogo.';
            }

            this.vodLoading = false;
            this.renderVod();
        }

        getVodCategories() {
            const cats = this.vodTab === 'movie' ? (this.vod.movieCats || []) : (this.vod.seriesCats || []);
            const total = this.vodTab === 'movie' ? (this.vod.movies || []).length : (this.vod.series || []).length;
            return [{ category_id: 'all', category_name: `Todos (${total})` }].concat(cats);
        }

        getVodItems() {
            const source = this.vodTab === 'movie' ? (this.vod.movies || []) : (this.vod.series || []);
            if (this.vodCategoryId === 'all') return source;
            return source.filter(item => String(item.category_id) === String(this.vodCategoryId));
        }

        renderVod() {
            const status = document.getElementById('vod-status');
            const grid = document.getElementById('vod-grid');
            const catsEl = document.getElementById('vod-categories');
            if (!status || !grid || !catsEl) return;

            document.querySelectorAll('.vod-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-vod-tab') === this.vodTab);
            });

            if (this.vodView === 'episodes') {
                this.renderVodEpisodes(status, grid);
                return;
            }

            const providerType = this.providerData ? this.providerData.providerType : null;

            if (providerType !== 'xtream') {
                catsEl.innerHTML = '';
                grid.innerHTML = '';
                status.innerText = 'O provedor atual não informa catálogo de filmes e séries. Use uma conta Xtream Codes para ver o catálogo VOD.';
                return;
            }

            if (this.vodLoading) {
                catsEl.innerHTML = '';
                grid.innerHTML = '';
                status.innerText = 'Carregando catálogo do provedor...';
                return;
            }

            if (this.vodError) {
                catsEl.innerHTML = '';
                grid.innerHTML = '';
                status.innerText = `Erro ao carregar catálogo: ${this.vodError}`;
                return;
            }

            const categories = this.getVodCategories();
            if (!categories.some(c => String(c.category_id) === String(this.vodCategoryId))) {
                this.vodCategoryId = 'all';
            }

            catsEl.innerHTML = categories.map((cat, idx) => {
                const id = String(cat.category_id);
                const active = id === String(this.vodCategoryId) ? ' active' : '';
                const focused = this.vodFocusArea === 'categories' && idx === this.vodFocusIndex ? ' focused' : '';
                return `<button type="button" class="vod-category-btn${active}${focused}" data-vod-category="${escapeHtml(id)}">${escapeHtml(window.stripEmoji(cat.category_name))}</button>`;
            }).join('');

            const items = this.getVodItems();
            const isMovie = this.vodTab === 'movie';

            if (!items.length) {
                grid.innerHTML = '';
                status.innerText = isMovie ? 'Nenhum filme nesta categoria.' : 'Nenhuma série nesta categoria.';
                return;
            }

            status.innerText = `${items.length} ${isMovie ? 'filmes' : 'séries'} nesta categoria`;

            grid.innerHTML = items.map((item, idx) => {
                const focused = this.vodFocusArea === 'grid' && idx === this.vodFocusIndex ? ' focused' : '';
                const title = window.stripEmoji(item.name || item.title || 'Sem título');
                const poster = isMovie ? (item.stream_icon || '') : (item.cover || '');
                const posterHtml = poster
                    ? `<img src="${escapeHtml(poster)}" alt="" class="vod-poster">`
                    : '<div class="vod-poster-fallback">SEM POSTER</div>';
                const meta = isMovie
                    ? (item.rating ? `Nota ${item.rating}` : '')
                    : (item.releaseDate ? String(item.releaseDate).slice(0, 4) : '');
                return `
                    <button type="button" class="vod-card${focused}" ${isMovie ? `data-vod-movie="${idx}"` : `data-vod-series="${idx}"`}>
                        ${posterHtml}
                        <div class="vod-card-title">${escapeHtml(title)}</div>
                        ${meta ? `<div class="vod-card-meta">${escapeHtml(meta)}</div>` : ''}
                    </button>
                `;
            }).join('');

            this.updateVodFocus();
        }

        renderVodEpisodes(status, grid) {
            const catsEl = document.getElementById('vod-categories');
            if (catsEl) {
                catsEl.innerHTML = '<button type="button" class="vod-category-btn active" data-vod-series-back="1">Voltar às séries</button>';
                const back = catsEl.querySelector('[data-vod-series-back]');
                if (back) {
                    back.addEventListener('click', () => {
                        this.vodView = 'list';
                        this.renderVod();
                    });
                }
            }

            const series = this.vodSeries;
            status.innerText = series ? `${window.stripEmoji(series.name || 'Série')} - selecione um episódio` : 'Série';

            if (this.vodEpisodesLoading) {
                grid.innerHTML = '';
                status.innerText = 'Carregando episódios...';
                return;
            }

            if (!this.vodEpisodes.length) {
                grid.innerHTML = '';
                status.innerText = 'Nenhum episódio disponível para esta série.';
                return;
            }

            grid.innerHTML = this.vodEpisodes.map((ep, idx) => {
                const focused = this.vodFocusArea === 'grid' && idx === this.vodFocusIndex ? ' focused' : '';
                return `
                    <button type="button" class="vod-episode-btn${focused}" data-vod-episode="${idx}">
                        <span class="vod-episode-num">T${ep.season}E${ep.number}</span>
                        <span>${escapeHtml(window.stripEmoji(ep.title || 'Episódio'))}</span>
                    </button>
                `;
            }).join('');

            this.updateVodFocus();
        }

        updateVodFocus() {
            if (!this.isVodOpen) return;

            if (this.vodView === 'episodes') {
                const buttons = Array.from(document.querySelectorAll('[data-vod-episode]'));
                buttons.forEach((btn, idx) => btn.classList.toggle('focused', this.vodFocusArea === 'grid' && idx === this.vodFocusIndex));
                const target = buttons[this.vodFocusIndex];
                if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                return;
            }

            const cats = Array.from(document.querySelectorAll('[data-vod-category]'));
            cats.forEach((btn, idx) => btn.classList.toggle('focused', this.vodFocusArea === 'categories' && idx === this.vodFocusIndex));
            if (this.vodFocusArea === 'categories' && cats[this.vodFocusIndex]) {
                cats[this.vodFocusIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }

            const cards = Array.from(document.querySelectorAll('.vod-card'));
            cards.forEach((btn, idx) => btn.classList.toggle('focused', this.vodFocusArea === 'grid' && idx === this.vodFocusIndex));
            if (this.vodFocusArea === 'grid' && cards[this.vodFocusIndex]) {
                cards[this.vodFocusIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        handleVodAction(action) {
            if (this.vodView === 'episodes') {
                if (action === 'back' || action === 'blue' || action === 'red') {
                    this.vodView = 'list';
                    this.vodFocusArea = 'grid';
                    this.renderVod();
                    return;
                }
                if (action === 'up') {
                    this.vodFocusIndex = Math.max(0, this.vodFocusIndex - 1);
                    this.updateVodFocus();
                    return;
                }
                if (action === 'down') {
                    this.vodFocusIndex = Math.min(this.vodEpisodes.length - 1, this.vodFocusIndex + 1);
                    this.updateVodFocus();
                    return;
                }
                if (action === 'ok' || action === 'play_pause') {
                    this.openVodItem('episode', this.vodFocusIndex);
                    return;
                }
                return;
            }

            if (action === 'back' || action === 'blue') {
                this.closeVod();
                return;
            }
            if (action === 'red') {
                this.setVodTab(this.vodTab === 'movie' ? 'series' : 'movie');
                return;
            }

            if (action === 'up') {
                const max = this.vodFocusArea === 'categories'
                    ? this.getVodCategories().length - 1
                    : this.getVodItems().length - 1;
                this.vodFocusIndex = Math.max(0, this.vodFocusIndex - 1);
                this.updateVodFocus();
                return;
            }
            if (action === 'down') {
                const max = this.vodFocusArea === 'categories'
                    ? this.getVodCategories().length - 1
                    : this.getVodItems().length - 1;
                this.vodFocusIndex = Math.min(max, this.vodFocusIndex + 1);
                this.updateVodFocus();
                return;
            }
            if (action === 'left') {
                if (this.vodFocusArea === 'grid') {
                    this.vodFocusArea = 'categories';
                    this.vodFocusIndex = 0;
                    this.updateVodFocus();
                }
                return;
            }
            if (action === 'right') {
                if (this.vodFocusArea === 'categories') {
                    this.vodFocusArea = 'grid';
                    this.vodFocusIndex = 0;
                    this.updateVodFocus();
                }
                return;
            }
            if (action === 'ok' || action === 'play_pause') {
                if (this.vodFocusArea === 'categories') {
                    const cats = this.getVodCategories();
                    const cat = cats[this.vodFocusIndex];
                    if (cat) {
                        this.vodCategoryId = String(cat.category_id);
                        this.vodFocusArea = 'grid';
                        this.vodFocusIndex = 0;
                        this.renderVod();
                    }
                } else {
                    this.openVodItem(this.vodTab, this.vodFocusIndex);
                }
            }
        }

        openVodItem(type, index) {
            if (type === 'movie') {
                const movie = this.getVodItems()[index];
                if (!movie) return;
                const cfg = this.providerData ? this.providerData.config : null;
                if (!cfg) return;
                const url = window.XtreamCodesClient.buildVodUrl(
                    cfg.server, cfg.username, cfg.password,
                    movie.stream_id, movie.container_extension || 'mp4'
                );
                this.closeVod();
                this.playVodVideo(url, window.stripEmoji(movie.name || 'Filme'));
                this.store.saveVodResume(`movie:${movie.stream_id}`, 0);
                return;
            }

            if (type === 'series') {
                const series = this.getVodItems()[index];
                if (!series) return;
                this.openSeries(series);
                return;
            }

            if (type === 'episode') {
                const ep = this.vodEpisodes[index];
                if (!ep) return;
                const cfg = this.providerData ? this.providerData.config : null;
                if (!cfg) return;
                const url = window.XtreamCodesClient.buildSeriesUrl(
                    cfg.server, cfg.username, cfg.password,
                    ep.id, ep.container || 'mp4'
                );
                const title = `${this.vodSeries ? this.vodSeries.name : 'Série'} - T${ep.season}E${ep.number}`;
                this.closeVod();
                this.playVodVideo(url, title);
            }
        }

        async openSeries(series) {
            this.vodSeries = series;
            this.vodView = 'episodes';
            this.vodEpisodes = [];
            this.vodEpisodesLoading = true;
            this.vodFocusArea = 'grid';
            this.vodFocusIndex = 0;
            this.renderVod();

            const cfg = this.providerData ? this.providerData.config : null;
            if (!cfg) return;

            try {
                const info = await window.XtreamCodesClient.getSeriesInfo(cfg.server, cfg.username, cfg.password, series.series_id);
                const episodes = [];
                if (info && Array.isArray(info.seasons) && info.seasons.length) {
                    info.seasons.forEach(season => {
                        (season.episodes || []).forEach(ep => {
                            episodes.push({
                                id: ep.id,
                                title: ep.title || `Episódio ${ep.episode_num || ''}`,
                                number: ep.episode_num || episodes.length + 1,
                                season: season.season_number || 1,
                                container: ep.container_extension || 'mp4'
                            });
                        });
                    });
                } else if (info && info.episodes && typeof info.episodes === 'object') {
                    Object.keys(info.episodes).forEach(key => {
                        (info.episodes[key] || []).forEach(ep => {
                            episodes.push({
                                id: ep.id,
                                title: ep.title || `Episódio ${ep.episode_num || ''}`,
                                number: ep.episode_num || episodes.length + 1,
                                season: Number(ep.season) || Number(key) || 1,
                                container: ep.container_extension || 'mp4'
                            });
                        });
                    });
                }
                this.vodEpisodes = episodes;
            } catch (e) {
                console.warn('[VOD] Falha ao carregar episódios:', e);
            }

            this.vodEpisodesLoading = false;
            this.renderVod();
        }

        /* =================================================================
         * CONFIGURAÇÕES
         * ================================================================= */

        bindSettingsModal() {
            if (!this.modalSettings) return;

            const closeBtn = document.getElementById('btn-close-settings');
            if (closeBtn) closeBtn.addEventListener('click', () => this.closeSettings());

            document.querySelectorAll('.settings-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.setSettingsTab(btn.getAttribute('data-settings-tab')));
            });

            const change = document.getElementById('btn-settings-change-provider');
            if (change) {
                change.addEventListener('click', () => {
                    this.closeSettings();
                    this.openLoginModal();
                });
            }

            const logout = document.getElementById('btn-settings-logout');
            if (logout) logout.addEventListener('click', () => this.handleLogout());

            const crt = document.getElementById('settings-crt');
            if (crt) {
                crt.addEventListener('change', () => {
                    if (crt.checked !== this.isCRTActive) this.toggleCRT();
                });
            }

            const test = document.getElementById('btn-remote-test');
            if (test) test.addEventListener('click', () => this.startRemoteTest());

            const reset = document.getElementById('btn-remote-reset');
            if (reset) reset.addEventListener('click', () => this.resetRemoteMap());

            const clear = document.getElementById('btn-clear-reminders');
            if (clear) {
                clear.addEventListener('click', () => {
                    this.store.saveReminders([]);
                    this.renderRemindersList();
                    if (this.isGuideOpen) {
                        this.buildEPGGrid();
                        this.updateEPGSelection();
                    }
                });
            }
        }

        openSettings(tab) {
            if (!this.modalSettings) return;
            this.closeGuide();
            this.closeMiniGuide();
            this.closeVod();
            this.hideBanner();
            this.isSettingsOpen = true;
            this.modalSettings.classList.add('active');
            this.renderSettingsAccount();
            this.renderRemoteList();
            this.renderRemindersList();
            const crt = document.getElementById('settings-crt');
            if (crt) crt.checked = this.isCRTActive;
            this.setSettingsTab(tab || this.settingsTab || 'account');
        }

        closeSettings() {
            if (!this.modalSettings) return;
            this.modalSettings.classList.remove('active');
            this.isSettingsOpen = false;
            this.remoteTestMode = false;
            this.remapAction = null;
        }

        setSettingsTab(tab) {
            this.settingsTab = tab || 'account';
            this.settingsFocusIndex = 0;
            document.querySelectorAll('.settings-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-settings-tab') === this.settingsTab);
            });
            document.querySelectorAll('.settings-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === `settings-panel-${this.settingsTab}`);
            });
            this.focusSettingsIndex();
        }

        getSettingsFocusables() {
            const panel = document.getElementById(`settings-panel-${this.settingsTab}`);
            if (!panel) return [];
            return Array.from(panel.querySelectorAll('button, input, [tabindex="0"]'))
                .filter(el => !el.disabled && el.offsetParent !== null);
        }

        focusSettingsIndex() {
            const list = this.getSettingsFocusables();
            if (!list.length) return;
            if (this.settingsFocusIndex < 0) this.settingsFocusIndex = 0;
            if (this.settingsFocusIndex >= list.length) this.settingsFocusIndex = list.length - 1;
            const el = list[this.settingsFocusIndex];
            if (el && typeof el.focus === 'function') el.focus();
            list.forEach((item, idx) => item.classList.toggle('remote-focused', idx === this.settingsFocusIndex));
        }

        moveSettingsFocus(delta) {
            const list = this.getSettingsFocusables();
            if (!list.length) return;
            this.settingsFocusIndex = (this.settingsFocusIndex + delta + list.length) % list.length;
            this.focusSettingsIndex();
        }

        activateSettingsFocus() {
            const list = this.getSettingsFocusables();
            const el = list[this.settingsFocusIndex];
            if (el && typeof el.click === 'function') {
                el.click();
            }
        }

        moveSettingsTab(delta) {
            const order = ['account', 'playback', 'remote', 'reminders'];
            let idx = order.indexOf(this.settingsTab);
            if (idx === -1) idx = 0;
            idx = (idx + delta + order.length) % order.length;
            this.setSettingsTab(order[idx]);
        }

        renderSettingsAccount() {
            const el = document.getElementById('settings-account-info');
            if (!el) return;

            const cfg = this.providerData ? this.providerData.config : window.GenericIPTVManager.getSavedConfig();
            if (!cfg) {
                el.innerText = 'Nenhum provedor conectado. Use "Trocar Provedor / Reconectar" para configurar sua conta.';
                return;
            }

            const typeNames = { xtream: 'Xtream Codes', ezhome: 'EzhomeTech', fasto: 'FastoCloud', m3u: 'Lista M3U', demo: 'Demonstração' };
            const lines = [];
            lines.push(`Provedor: ${typeNames[cfg.type] || cfg.type}`);

            if (cfg.server) lines.push(`Servidor: ${cfg.server}`);
            if (cfg.username) lines.push(`Usuário: ${cfg.username}`);
            if (cfg.m3uUrl) lines.push(`Lista M3U: ${cfg.m3uUrl}`);

            const meta = this.providerData ? this.providerData.meta : null;
            if (meta && meta.userInfo) {
                lines.push(`Situação da conta: ${meta.userInfo.status || 'Ativa'}`);
                if (meta.userInfo.exp_date) lines.push(`Válida até: ${formatUnixDate(meta.userInfo.exp_date)}`);
                if (meta.userInfo.max_connections) lines.push(`Conexões permitidas: ${meta.userInfo.max_connections}`);
            }

            const total = Math.max(0, this.channels.length - 1);
            lines.push(`Canais ao vivo: ${total}`);
            if (this.providerData && this.providerData.categories) {
                lines.push(`Categorias: ${this.providerData.categories.length}`);
            }
            if (this.vodLoaded) {
                lines.push(`Filmes: ${this.vod.movies.length} | Séries: ${this.vod.series.length}`);
            }

            el.innerText = lines.join('\n');
        }

        renderRemoteList() {
            const container = document.getElementById('settings-remote-list');
            if (!container) return;

            container.innerHTML = REMOTE_ACTIONS.map(action => `
                <div class="remote-map-row">
                    <span>${escapeHtml(action.label)}</span>
                    <span class="remote-map-key">${escapeHtml(this.getBindingLabel(action.id))}</span>
                    <button type="button" data-remap="${action.id}">Remapear</button>
                </div>
            `).join('');

            container.querySelectorAll('[data-remap]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.remapAction = btn.getAttribute('data-remap');
                    const status = document.getElementById('remote-test-status');
                    const label = this.getActionLabel(this.remapAction);
                    if (status) {
                        status.classList.add('active');
                        status.innerText = `Pressione a nova tecla do controle para a ação "${label}".`;
                    }
                });
            });
        }

        getActionLabel(id) {
            const action = REMOTE_ACTIONS.find(item => item.id === id);
            return action ? action.label : id;
        }

        getBindingLabel(actionId) {
            const binding = this.remoteMap[actionId];
            if (binding) {
                if (binding.key) return binding.key;
                if (binding.code) return `Código ${binding.code}`;
            }
            const def = this.defaultBindingFor(actionId);
            return def || 'Padrão';
        }

        defaultBindingFor(actionId) {
            const table = {
                up: 'ArrowUp / 19', down: 'ArrowDown / 20', left: 'ArrowLeft / 21', right: 'ArrowRight / 22',
                ok: 'Enter / 23', back: 'Escape / 4', ch_up: 'ChannelUp / 166', ch_down: 'ChannelDown / 167',
                vol_up: '+ / 24', vol_down: '- / 25', mute: 'M / 164', info: 'I / 165',
                guide: 'G / 172', play_pause: 'Space / 85', red: 'F1 / 183', green: 'F2 / 184',
                yellow: 'F3 / 185', blue: 'F4 / 186', settings: 'S'
            };
            return table[actionId] || '';
        }

        startRemoteTest() {
            this.remoteTestMode = true;
            this.remapAction = null;
            const status = document.getElementById('remote-test-status');
            if (status) {
                status.classList.add('active');
                status.innerText = 'Modo de teste ativo. Pressione qualquer tecla do controle remoto para ver o evento detectado.';
            }
        }

        resetRemoteMap() {
            this.remoteMap = {};
            this.store.saveRemoteMap({});
            this.remoteTestMode = false;
            this.remapAction = null;
            this.renderRemoteList();
            const status = document.getElementById('remote-test-status');
            if (status) {
                status.classList.remove('active');
                status.innerText = 'Mapeamento restaurado para o padrão.';
            }
        }

        handleRemoteCapture(key, code) {
            const k = String(key || '').toLowerCase();
            const cancelCapture = k === 'escape' || k === 'back' || Number(code) === 4 || Number(code) === 27;

            if (this.remapAction) {
                if (cancelCapture) {
                    this.remapAction = null;
                    const status = document.getElementById('remote-test-status');
                    if (status) {
                        status.classList.remove('active');
                        status.innerText = 'Remapeamento cancelado.';
                    }
                    return true;
                }
                const action = this.remapAction;
                this.remoteMap[action] = { key: key || '', code: Number(code) || 0 };
                this.store.saveRemoteMap(this.remoteMap);
                this.remapAction = null;
                this.renderRemoteList();

                const status = document.getElementById('remote-test-status');
                if (status) {
                    status.classList.add('active');
                    status.innerText = `Ação "${this.getActionLabel(action)}" mapeada para ${key || 'código ' + code}.`;
                }
                return true;
            }

            if (this.remoteTestMode) {
                if (cancelCapture) {
                    this.remoteTestMode = false;
                    const status = document.getElementById('remote-test-status');
                    if (status) {
                        status.classList.remove('active');
                        status.innerText = 'Modo de teste encerrado.';
                    }
                    return true;
                }
                const action = this.resolveRemoteAction(key, code);
                const status = document.getElementById('remote-test-status');
                if (status) {
                    status.classList.add('active');
                    status.innerText = `Tecla detectada: ${key || '(sem nome)'} | código ${Number(code) || 0} → ação: ${action ? this.getActionLabel(action) : 'não mapeada'}`;
                }
                return true;
            }

            return false;
        }

        /* =================================================================
         * LOGIN / PROVEDOR
         * ================================================================= */

        bindLoginModal() {
            if (!this.modalLogin) return;

            document.querySelectorAll('.login-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchLoginTab(btn.getAttribute('data-tab')));
            });

            const connect = document.getElementById('btn-login-connect');
            if (connect) connect.addEventListener('click', () => this.handleLoginConnect());

            const test = document.getElementById('btn-login-test');
            if (test) test.addEventListener('click', () => this.handleLoginTest());

            const demo = document.getElementById('btn-login-demo');
            if (demo) demo.addEventListener('click', () => this.handleLoginDemo());

            const cancel = document.getElementById('btn-login-cancel');
            if (cancel) cancel.addEventListener('click', () => this.closeLoginModal());
        }

        switchLoginTab(tab) {
            this.activeLoginTab = tab;
            document.querySelectorAll('.login-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
            });
            document.querySelectorAll('.login-tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === `tab-panel-${tab}`);
            });
        }

        showLoginStatus(message, type) {
            const box = document.getElementById('login-status-box');
            const orb = document.getElementById('login-status-orb');
            const text = document.getElementById('login-status-text');
            if (!box || !orb || !text) return;
            box.classList.remove('hidden');
            orb.className = 'status-orb ' + (type || 'info');
            text.innerText = message;
        }

        openLoginModal(error) {
            if (!this.modalLogin) return;
            this.closeSettings();
            this.modalLogin.classList.add('active');

            const saved = window.GenericIPTVManager.getSavedConfig();
            if (saved) {
                if (saved.type) this.switchLoginTab(saved.type);
                const serverEl = document.getElementById(`${saved.type}-server`);
                const userEl = document.getElementById(`${saved.type}-user`);
                if (serverEl && saved.server) serverEl.value = saved.server;
                if (userEl && saved.username) userEl.value = saved.username;
                const m3uEl = document.getElementById('m3u-url');
                const epgEl = document.getElementById('m3u-epg-url');
                if (m3uEl && saved.m3uUrl) m3uEl.value = saved.m3uUrl;
                if (epgEl && saved.epgUrl) epgEl.value = saved.epgUrl;
            }

            const cancel = document.getElementById('btn-login-cancel');
            if (cancel) cancel.classList.toggle('hidden', !saved);

            this.loginFocusIndex = 0;
            this.focusLoginIndex(0);

            if (error) {
                this.showLoginStatus(error, 'error');
            } else {
                const box = document.getElementById('login-status-box');
                if (box) box.classList.add('hidden');
            }
        }

        closeLoginModal() {
            if (this.modalLogin) this.modalLogin.classList.remove('active');
        }

        isLoginOpen() {
            return Boolean(this.modalLogin && this.modalLogin.classList.contains('active'));
        }

        getLoginFocusables() {
            if (!this.modalLogin) return [];
            return Array.from(this.modalLogin.querySelectorAll('.login-actions .btn-modal'))
                .filter(el => el.offsetParent !== null);
        }

        focusLoginIndex(index) {
            const list = this.getLoginFocusables();
            if (!list.length) return;
            this.loginFocusIndex = ((index % list.length) + list.length) % list.length;
            list.forEach((el, idx) => el.classList.toggle('remote-focused', idx === this.loginFocusIndex));
            list[this.loginFocusIndex].focus();
        }

        activateLoginFocus() {
            const list = this.getLoginFocusables();
            const el = list[this.loginFocusIndex];
            if (el && typeof el.click === 'function') {
                el.click();
                return true;
            }
            return false;
        }

        readLoginConfig() {
            const tab = this.activeLoginTab;
            const config = { type: tab };

            if (tab === 'xtream') {
                config.server = (document.getElementById('xtream-server') || {}).value || '';
                config.username = (document.getElementById('xtream-user') || {}).value || '';
                config.password = (document.getElementById('xtream-pass') || {}).value || '';
                config.server = config.server.trim();
                config.username = config.username.trim();
                config.password = config.password.trim();
                if (!config.server || !config.username || !config.password) {
                    this.showLoginStatus('Preencha servidor, usuário e senha do Xtream Codes.', 'error');
                    return null;
                }
            } else if (tab === 'ezhome') {
                config.server = ((document.getElementById('ezhome-server') || {}).value || '').trim();
                config.username = ((document.getElementById('ezhome-user') || {}).value || '').trim();
                config.password = ((document.getElementById('ezhome-pass') || {}).value || '').trim();
                if (!config.server || !config.username) {
                    this.showLoginStatus('Preencha o servidor e o usuário EzhomeTech.', 'error');
                    return null;
                }
            } else if (tab === 'fasto') {
                config.server = ((document.getElementById('fasto-server') || {}).value || '').trim();
                config.username = ((document.getElementById('fasto-user') || {}).value || '').trim();
                config.password = ((document.getElementById('fasto-pass') || {}).value || '').trim();
                if (!config.server) {
                    this.showLoginStatus('Preencha o host do servidor FastoCloud.', 'error');
                    return null;
                }
            } else if (tab === 'm3u') {
                config.m3uUrl = ((document.getElementById('m3u-url') || {}).value || '').trim();
                config.epgUrl = ((document.getElementById('m3u-epg-url') || {}).value || '').trim();
                if (!config.m3uUrl) {
                    this.showLoginStatus('Informe a URL da lista M3U.', 'error');
                    return null;
                }
            }

            return config;
        }

        async handleLoginConnect() {
            const config = this.readLoginConfig();
            if (!config) return;

            try {
                await this.loadIPTVConfig(config);
            } catch (err) {
                console.error('[IPTV] Erro ao conectar:', err);
                this.showLoginStatus(err.message || 'Erro ao sintonizar canais.', 'error');
            }
        }

        async handleLoginTest() {
            const config = this.readLoginConfig();
            if (!config) return;

            this.showLoginStatus('Testando conexão com o provedor...', 'connecting');

            try {
                if (config.type === 'xtream') {
                    const auth = await window.XtreamCodesClient.authenticate(config.server, config.username, config.password);
                    const categories = await window.XtreamCodesClient.getCategories(config.server, config.username, config.password);
                    const live = await window.XtreamCodesClient.getLiveStreams(config.server, config.username, config.password);

                    let vodCount = 0;
                    let seriesCount = 0;
                    try {
                        const vod = await window.XtreamCodesClient.getVodStreams(config.server, config.username, config.password);
                        vodCount = vod.length;
                    } catch (e) {}
                    try {
                        const series = await window.XtreamCodesClient.getSeries(config.server, config.username, config.password);
                        seriesCount = series.length;
                    } catch (e) {}

                    let epgCount = 0;
                    if (live.length) {
                        try {
                            const epg = await window.XtreamCodesClient.getShortEpg(config.server, config.username, config.password, live[0].stream_id);
                            epgCount = epg.length;
                        } catch (e) {}
                    }

                    const expiry = auth.userInfo && auth.userInfo.exp_date ? formatUnixDate(auth.userInfo.exp_date) : 'Ilimitado';
                    this.showLoginStatus(
                        `Conexão OK. Conta: ${auth.userInfo.status || 'Ativa'} | Válida até: ${expiry} | ` +
                        `Canais: ${live.length} | Categorias: ${categories.length} | Filmes: ${vodCount} | Séries: ${seriesCount} | ` +
                        `EPG do 1º canal: ${epgCount} programas.`,
                        'success'
                    );
                    return;
                }

                if (config.type === 'm3u') {
                    const text = await window.AquanetHttp.text(config.m3uUrl);
                    const channels = window.parseM3U(text);
                    let epgInfo = 'sem EPG configurado';
                    if (config.epgUrl) {
                        try {
                            const xml = await window.AquanetHttp.text(config.epgUrl);
                            const map = window.parseXMLTV(xml);
                            epgInfo = `EPG XMLTV com ${map.size} canais`;
                        } catch (e) {
                            epgInfo = 'falha ao carregar o EPG XMLTV';
                        }
                    }
                    this.showLoginStatus(`Lista M3U OK: ${channels.length} canais encontrados (${epgInfo}).`, 'success');
                    return;
                }

                if (config.type === 'ezhome') {
                    const live = await window.EzhomeTechClient.getLive(config.server, config.username, config.password);
                    this.showLoginStatus(`EzhomeTech OK: ${live.length} canais encontrados.`, 'success');
                    return;
                }

                if (config.type === 'fasto') {
                    const live = await window.FastoCloudClient.getStreams(config.server, config.username, config.password);
                    this.showLoginStatus(`FastoCloud OK: ${live.length} canais encontrados.`, 'success');
                    return;
                }

                this.showLoginStatus('Teste disponível para Xtream Codes, EzhomeTech, FastoCloud e listas M3U.', 'info');
            } catch (err) {
                this.showLoginStatus(err.message || 'Falha no teste de conexão.', 'error');
            }
        }

        async handleLoginDemo() {
            try {
                await this.loadIPTVConfig({ type: 'demo' });
            } catch (err) {
                this.showLoginStatus(err.message || 'Erro ao carregar canais demo.', 'error');
            }
        }

        async loadIPTVConfig(config) {
            this.showLoginStatus('Sintonizando satélite e baixando canais...', 'connecting');
            const data = await window.GenericIPTVManager.loadProvider(config);
            if (!data || !data.channels || !data.channels.length) {
                throw new Error('Nenhum canal ativo retornado pelo provedor.');
            }

            if (config.type !== 'demo') {
                window.GenericIPTVManager.saveConfig(config);
            }

            this.vodLoaded = false;
            this.vod = { movieCats: [], movies: [], seriesCats: [], series: [] };
            this.vodError = '';
            this.epgFetched = new Set();

            this.setProviderData(data);

            this.closeLoginModal();
            this.restoreLastChannel();
            this.renderSettingsAccount();
            this.showBanner(6000);
            this.showMediaOSD('PROVEDOR', `${data.channels.length} canais carregados`);
        }

        restoreLastChannel() {
            this.providerReady = true;
            const savedKey = this.initialChannelKey || this.store.getSettings().lastChannelKey;
            let target = null;

            if (savedKey) {
                target = this.channels.find(ch => ch.key === savedKey) || null;
            }

            if (target && !this.getVisibleChannels().includes(target)) {
                this.playlistId = 'all';
                this.store.saveSettings({ activePlaylistId: 'all' });
                this.renderPlaylistChips();
                this.updatePlaylistFilterLabel();
            }

            if (!target) {
                const visible = this.getVisibleChannels();
                target = visible.find(ch => ch.number !== 0) || this.channels[0];
            }

            const idx = this.channels.indexOf(target);
            if (idx !== -1) {
                this.tuneChannelByIndex(idx, true);
            } else if (this.channels.length > 1) {
                this.tuneChannelByIndex(1, true);
            }
        }

        handleLogout() {
            window.GenericIPTVManager.clearConfig();
            this.store.saveSettings({ lastChannelKey: null, lastChannelName: null, activePlaylistId: 'all' });
            this.providerReady = false;
            this.initialChannelKey = null;
            this.providerData = null;
            this.vodLoaded = false;
            this.vod = { movieCats: [], movies: [], seriesCats: [], series: [] };
            this.loadDemoChannels();
            this.playlistId = 'all';
            this.rebuildPlaylists();
            this.closeSettings();
            this.tuneChannelByIndex(this.channels.length > 1 ? 1 : 0, true);
            this.renderSettingsAccount();
            this.openLoginModal();
        }

        async initGenericIPTV() {
            const saved = window.GenericIPTVManager.getSavedConfig();
            if (saved) {
                try {
                    await this.loadIPTVConfig(saved);
                    return;
                } catch (err) {
                    console.warn('[IPTV] Provedor salvo falhou na inicialização:', err.message);
                    this.openLoginModal(err.message);
                    return;
                }
            }
            this.openLoginModal();
        }

        /* =================================================================
         * CONTROLE REMOTO
         * ================================================================= */

        resolveRemoteAction(key, code) {
            const k = key || '';
            const c = Number(code) || 0;

            for (const action of Object.keys(this.remoteMap)) {
                const binding = this.remoteMap[action];
                if (!binding) continue;
                if (binding.key && binding.key.toLowerCase() === String(k).toLowerCase()) return action;
                if (binding.code && Number(binding.code) === c) return action;
            }

            return this.defaultActionFor(k, c);
        }

        defaultActionFor(key, code) {
            const k = String(key || '').toLowerCase();

            if (k === 'arrowup' || k === 'up' || k === 'dpad_up' || code === 19 || code === 38) return 'up';
            if (k === 'arrowdown' || k === 'down' || k === 'dpad_down' || code === 20 || code === 40) return 'down';
            if (k === 'arrowleft' || k === 'left' || k === 'dpad_left' || code === 21 || code === 37) return 'left';
            if (k === 'arrowright' || k === 'right' || k === 'dpad_right' || code === 22 || code === 39) return 'right';
            if (k === 'enter' || k === 'select' || k === 'ok' || k === 'dpad_center' || code === 23 || code === 66 || code === 13) return 'ok';
            if (k === 'escape' || k === 'back' || code === 4 || code === 27) return 'back';
            if (k === 'channelup' || k === 'channel_up' || code === 166) return 'ch_up';
            if (k === 'channeldown' || k === 'channel_down' || code === 167) return 'ch_down';
            if (k === 'volumeup' || k === 'volume_up' || k === '+' || code === 24) return 'vol_up';
            if (k === 'volumedown' || k === 'volume_down' || k === '-' || code === 25) return 'vol_down';
            if (k === 'm' || k === 'mute' || code === 164) return 'mute';
            if (k === 'i' || k === 'info' || code === 165) return 'info';
            if (k === 'g' || k === 'guide' || k === 'epg' || code === 172) return 'guide';
            if (k === 's' || k === 'settings' || code === 82) return 'settings';
            if (k === ' ' || k === 'space' || k === 'play' || k === 'pause' || k === 'playpause' || code === 85 || code === 126 || code === 127) return 'play_pause';
            if (k === 'f1' || k === 'red' || code === 183) return 'red';
            if (k === 'f2' || k === 'green' || code === 184) return 'green';
            if (k === 'f3' || k === 'yellow' || code === 185) return 'yellow';
            if (k === 'f4' || k === 'blue' || code === 186) return 'blue';
            if (k === 'fastforward' || code === 90) return 'right';
            if (k === 'rewind' || code === 89) return 'left';
            return null;
        }

        dispatchRemoteAction(action) {
            if (!action) return;

            if (this.isReminderOpen) {
                if (action === 'ok' || action === 'play_pause') this.watchReminder();
                else if (action === 'back') this.hideReminderPopup();
                return;
            }

            if (this.isVodOpen) {
                this.handleVodAction(action);
                return;
            }

            if (this.isSettingsOpen) {
                if (action === 'back' || action === 'settings') {
                    this.closeSettings();
                    return;
                }
                if (this.remapAction || this.remoteTestMode) {
                    // As teclas são capturadas pelo modo de teste/remapeamento.
                    return;
                }
                if (action === 'left') this.moveSettingsTab(-1);
                else if (action === 'right') this.moveSettingsTab(1);
                else if (action === 'up') this.moveSettingsFocus(-1);
                else if (action === 'down') this.moveSettingsFocus(1);
                else if (action === 'ok' || action === 'play_pause') this.activateSettingsFocus();
                return;
            }

            if (this.isPlaylistModalOpen) {
                if (action === 'up') this.movePlaylistModalSelection(-1);
                else if (action === 'down') this.movePlaylistModalSelection(1);
                else if (action === 'ok' || action === 'play_pause') this.confirmPlaylistSelection();
                else if (action === 'back' || action === 'yellow') this.closePlaylistModal();
                return;
            }

            if (this.isLoginOpen()) {
                if (action === 'back') {
                    const saved = window.GenericIPTVManager.getSavedConfig();
                    if (saved) this.closeLoginModal();
                    else this.requestExit();
                } else if (action === 'up') {
                    this.focusLoginIndex(this.loginFocusIndex - 1);
                } else if (action === 'down') {
                    this.focusLoginIndex(this.loginFocusIndex + 1);
                } else if (action === 'ok') {
                    const active = document.activeElement;
                    const isButton = active && active.tagName === 'BUTTON' && this.modalLogin.contains(active);
                    if (!isButton || !this.activateLoginFocus()) this.handleLoginConnect();
                }
                return;
            }

            if (this.isGuideOpen) {
                switch (action) {
                    case 'up': this.guideMoveVertical(-1); break;
                    case 'down': this.guideMoveVertical(1); break;
                    case 'left': this.guideMoveHorizontal(-1); break;
                    case 'right': this.guideMoveHorizontal(1); break;
                    case 'ok': case 'play_pause': this.guideSelectCurrent(); break;
                    case 'back': case 'blue': case 'guide': this.closeGuide(); break;
                    case 'red': this.openVod(); break;
                    case 'green': this.toggleReminderForSelected(); break;
                    case 'yellow': this.openPlaylistModal(); break;
                    case 'info': this.toggleBanner(); break;
                    case 'ch_up': this.channelUp(); break;
                    case 'ch_down': this.channelDown(); break;
                    case 'vol_up': this.volumeUp(); break;
                    case 'vol_down': this.volumeDown(); break;
                    case 'mute': this.toggleMute(); break;
                    case 'settings': this.openSettings('account'); break;
                    default: break;
                }
                return;
            }

            if (this.isMiniGuideOpen) {
                switch (action) {
                    case 'up': this.miniGuideMoveVertical(-1); break;
                    case 'down': this.miniGuideMoveVertical(1); break;
                    case 'ok': case 'play_pause': this.miniGuideSelectCurrent(); break;
                    case 'back': case 'blue': this.closeMiniGuide(); break;
                    default: break;
                }
                return;
            }

            if (this.dialDigits && action === 'ok') {
                this.confirmDial();
                return;
            }

            switch (action) {
                case 'up':
                    if (this.isBannerVisible) this.bannerBrowse(-1);
                    else this.volumeUp();
                    break;
                case 'down':
                    if (this.isBannerVisible) this.bannerBrowse(1);
                    else this.volumeDown();
                    break;
                case 'left':
                    if (this.isBannerVisible) this.bannerBrowse(-1);
                    else this.channelDown();
                    break;
                case 'right':
                    if (this.isBannerVisible) this.bannerBrowse(1);
                    else this.channelUp();
                    break;
                case 'ok':
                    if (this.isBannerVisible && this.bannerChannelKey !== (this.channels[this.currentChannelIndex] || {}).key) {
                        this.confirmBannerTune();
                    } else {
                        this.handleOkPress();
                    }
                    break;
                case 'back':
                    this.hideBanner();
                    break;
                case 'ch_up': this.channelUp(); break;
                case 'ch_down': this.channelDown(); break;
                case 'vol_up': this.volumeUp(); break;
                case 'vol_down': this.volumeDown(); break;
                case 'mute': this.toggleMute(); break;
                case 'info': this.toggleBanner(); break;
                case 'guide': this.toggleGuide(); break;
                case 'play_pause': this.togglePlayback(); break;
                case 'red': this.openVod(); break;
                case 'green': this.toggleCRT(); break;
                case 'yellow': this.toggleFavoriteCurrent(); break;
                case 'blue': this.toggleMiniGuide(); break;
                case 'settings': this.openSettings('account'); break;
                default: break;
            }
        }

        handleOkPress() {
            if (!this.isPowerOn) return;
            if (this.isBannerVisible) {
                if (this.bannerChannelKey !== (this.channels[this.currentChannelIndex] || {}).key) {
                    this.confirmBannerTune();
                } else {
                    this.hideBanner();
                }
            } else {
                const ch = this.channels[this.currentChannelIndex];
                this.bannerChannelKey = ch ? ch.key : null;
                if (ch) this.updateBannerForChannel(ch);
                this.showBanner(5000);
            }
        }

        bindKeyboard() {
            window.addEventListener('keydown', (e) => {
                const target = e.target;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                    if (e.key === 'Escape') {
                        this.dispatchRemoteAction('back');
                    } else if (e.key === 'Enter' && target.closest && target.closest('#modal-login')) {
                        e.preventDefault();
                        this.handleLoginConnect();
                    }
                    return;
                }

                const key = e.key || '';
                const code = e.keyCode || e.which || 0;

                if (this.handleRemoteCapture(key, code)) {
                    e.preventDefault();
                    return;
                }

                if (/^[0-9]$/.test(key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    this.dialDigit(key);
                    return;
                }
                if (code >= 7 && code <= 16) {
                    e.preventDefault();
                    this.dialDigit(String(code - 7));
                    return;
                }

                if (key === 'F1' || key === 'F2' || key === 'F3' || key === 'F4') {
                    e.preventDefault();
                }

                const action = this.resolveRemoteAction(key, code);
                if (!action) return;

                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(key)) {
                    // Teclas normais não precisam de preventDefault geral
                }

                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(key)) {
                    e.preventDefault();
                }

                this.dispatchRemoteAction(action);
            });
        }

        handleRealRemoteKey(key, keyCode) {
            if (this.handleRemoteCapture(key, keyCode)) return;
            const action = this.resolveRemoteAction(key, keyCode);
            this.dispatchRemoteAction(action);
        }

        bindRealRemoteListener() {
            const onMessage = (event) => {
                try {
                    let payload = event.data;
                    if (typeof payload === 'string') payload = JSON.parse(payload);
                    if (!payload || !payload.type) return;

                    if (payload.type === 'KEY_EVENT') {
                        this.handleRealRemoteKey(payload.key, payload.keyCode);
                    } else if (payload.type === 'HTTP_RESPONSE') {
                        if (typeof window.__aquanetNativeHttpResolve === 'function') {
                            window.__aquanetNativeHttpResolve(payload);
                        }
                    }
                } catch (e) {}
            };

            window.addEventListener('message', onMessage);
            document.addEventListener('message', onMessage);
        }

        /* =================================================================
         * INTERAÇÕES / UI
         * ================================================================= */

        bindOSDInteractions() {
            const bind = (id, fn) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', fn);
            };

            bind('hint-red-vod', () => this.openVod());
            bind('hint-green-crt', () => this.toggleCRT());
            bind('hint-options', () => this.toggleFavoriteCurrent());
            bind('hint-mini-guide', () => this.toggleMiniGuide());
            bind('btn-banner-settings', () => this.openSettings('account'));

            bind('epg-hint-red', () => this.openVod());
            bind('epg-hint-green', () => this.toggleReminderForSelected());
            bind('epg-hint-yellow', () => this.openPlaylistModal());
            bind('epg-hint-blue', () => this.closeGuide());

            const bar = document.getElementById('epg-playlist-bar');
            if (bar) {
                bar.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-playlist]');
                    if (btn) this.setPlaylist(btn.getAttribute('data-playlist'));
                });
            }

            const bannerTopRow = document.querySelector('.banner-top-row');
            if (bannerTopRow) {
                bannerTopRow.addEventListener('click', (e) => {
                    if (e.target.closest('#btn-banner-settings')) return;
                    if (this.isBannerVisible && this.bannerChannelKey !== (this.channels[this.currentChannelIndex] || {}).key) {
                        this.confirmBannerTune();
                    }
                });
            }
        }

        bindPlaylistModal() {
            if (!this.modalPlaylist) return;

            const cancel = document.getElementById('btn-cancel-playlist');
            if (cancel) cancel.addEventListener('click', () => this.closePlaylistModal());

            const confirm = document.getElementById('btn-confirm-playlist');
            if (confirm) confirm.addEventListener('click', () => this.confirmPlaylistSelection());
        }

        bindReminderPopup() {
            const watch = document.getElementById('reminder-watch');
            if (watch) watch.addEventListener('click', () => this.watchReminder());

            const dismiss = document.getElementById('reminder-dismiss');
            if (dismiss) dismiss.addEventListener('click', () => this.hideReminderPopup());
        }

        togglePower() {
            this.isPowerOn = !this.isPowerOn;

            if (this.isPowerOn) {
                this.tvCanvas.style.filter = 'none';
                if (this.customVideo) this.customVideo.style.visibility = 'visible';
                this.tuneChannelByIndex(this.currentChannelIndex, true);
                this.showBanner(4000);
            } else {
                this.hideLoadingSpinner();
                if (this.channelLoadTimeout) {
                    clearTimeout(this.channelLoadTimeout);
                    this.channelLoadTimeout = null;
                }
                this.hideBanner();
                this.closeGuide();
                this.closeMiniGuide();
                this.closeVod();
                this.closeSettings();
                this.closePlaylistModal();
                this.stopVideoElement();
                const ctx = this.tvCanvas.getContext('2d');
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, this.tvCanvas.width, this.tvCanvas.height);
                this.tvCanvas.style.filter = 'brightness(0)';
            }
        }

        updateClock() {
            const now = new Date();
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayStr = days[now.getDay()];
            const month = now.getMonth() + 1;
            const date = now.getDate();

            let hours = now.getHours();
            const ampm = hours >= 12 ? 'p' : 'a';
            hours = hours % 12;
            hours = hours || 12;
            const minutes = String(now.getMinutes()).padStart(2, '0');

            const bannerTimeEl = document.getElementById('banner-current-time');
            if (bannerTimeEl) bannerTimeEl.innerText = `${dayStr} ${month}/${date} ${hours}:${minutes}${ampm}`;

            const epgTimeEl = document.getElementById('epg-current-time');
            if (epgTimeEl) epgTimeEl.innerText = `${dayStr} ${hours}:${minutes}${ampm}`;

            const epgDateEl = document.getElementById('epg-date-label');
            if (epgDateEl) {
                const ptDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                epgDateEl.innerText = `${ptDays[now.getDay()]} ${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
            }

            const loginClockEl = document.getElementById('modal-login-clock');
            if (loginClockEl) loginClockEl.innerText = `${hours}:${minutes} ${ampm.toUpperCase()}`;

            const hourHand = document.getElementById('clock-hour-hand');
            const minHand = document.getElementById('clock-minute-hand');
            if (hourHand && minHand) {
                const hDeg = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
                const mDeg = now.getMinutes() * 6;
                const hRad = (hDeg - 90) * (Math.PI / 180);
                const mRad = (mDeg - 90) * (Math.PI / 180);
                hourHand.setAttribute('x2', (20 + 7 * Math.cos(hRad)).toFixed(1));
                hourHand.setAttribute('y2', (20 + 7 * Math.sin(hRad)).toFixed(1));
                minHand.setAttribute('x2', (20 + 10 * Math.cos(mRad)).toFixed(1));
                minHand.setAttribute('y2', (20 + 10 * Math.sin(mRad)).toFixed(1));
            }
        }

        showMediaOSD(icon, text) {
            const badge = document.getElementById('osd-media-badge');
            const iconEl = document.getElementById('osd-media-icon');
            const textEl = document.getElementById('osd-media-text');
            if (!badge || !iconEl || !textEl) return;

            iconEl.innerText = icon || '';
            textEl.innerText = text || '';
            badge.classList.remove('hidden');

            if (this.mediaOSDTimeout) clearTimeout(this.mediaOSDTimeout);
            this.mediaOSDTimeout = setTimeout(() => {
                badge.classList.add('hidden');
            }, 2200);
        }

        renderRemindersList() {
            const container = document.getElementById('settings-reminders-list');
            if (!container) return;

            const reminders = this.store.getReminders()
                .slice()
                .sort((a, b) => new Date(a.start) - new Date(b.start));

            if (!reminders.length) {
                container.innerHTML = '<div class="settings-help">Nenhum programa agendado.</div>';
                return;
            }

            container.innerHTML = reminders.map(reminder => `
                <div class="reminder-row">
                    <span>${escapeHtml(reminder.title)}<br><small>${escapeHtml(reminder.channelNumber || '')} ${escapeHtml(reminder.channelName || '')} - ${escapeHtml(formatDateFull(reminder.start))}</small></span>
                    <button type="button" data-remove-reminder="${escapeHtml(reminder.id)}">Cancelar</button>
                </div>
            `).join('');

            container.querySelectorAll('[data-remove-reminder]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.store.removeReminder(btn.getAttribute('data-remove-reminder'));
                    this.renderRemindersList();
                    if (this.isGuideOpen) {
                        this.buildEPGGrid();
                        this.updateEPGSelection();
                    }
                });
            });
        }

        /* =================================================================
         * TOQUES / GESTOS
         * ================================================================= */

        bindTouchControls() {
            const target = this.tvCanvas ? this.tvCanvas.parentElement : null;
            if (!target) return;

            let startX = 0;
            let startY = 0;
            let startTime = 0;
            let isSwiping = false;
            let lastTapTime = 0;
            let longPressTimer = null;
            let isLongPress = false;
            let isTwoFinger = false;

            target.addEventListener('touchstart', (e) => {
                if (e.target.closest('#modal-login') || e.target.closest('#modal-playlist') || e.target.closest('#modal-vod') || e.target.closest('#modal-settings') || e.target.closest('#reminder-popup')) {
                    return;
                }

                if (e.touches.length === 2) {
                    isTwoFinger = true;
                    if (longPressTimer) clearTimeout(longPressTimer);
                    return;
                }

                if (e.touches.length === 1) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    startTime = Date.now();
                    isSwiping = true;
                    isLongPress = false;
                    isTwoFinger = false;

                    if (longPressTimer) clearTimeout(longPressTimer);
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        if (this.isGuideOpen) this.closeGuide();
                        else this.openGuide();
                    }, 500);
                }
            }, { passive: true });

            target.addEventListener('touchmove', (e) => {
                if (!isSwiping || e.touches.length !== 1) return;
                const deltaY = Math.abs(e.touches[0].clientY - startY);
                const deltaX = Math.abs(e.touches[0].clientX - startX);
                if (deltaY > 12 || deltaX > 12) {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                }
                if (deltaY > 10 || deltaX > 10) {
                    if (e.cancelable) e.preventDefault();
                }
            }, { passive: false });

            target.addEventListener('touchend', (e) => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }

                if (isTwoFinger) {
                    isTwoFinger = false;
                    if (Date.now() - startTime < 450) this.toggleGuide();
                    return;
                }

                if (isLongPress) {
                    isLongPress = false;
                    return;
                }

                if (!isSwiping) return;
                isSwiping = false;

                const touch = e.changedTouches[0];
                const diffX = touch.clientX - startX;
                const diffY = touch.clientY - startY;
                const absX = Math.abs(diffX);
                const absY = Math.abs(diffY);
                const duration = Date.now() - startTime;
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;

                if (startX < 50 && diffX > 55 && absX > absY) {
                    if (!this.isMiniGuideOpen && !this.isGuideOpen) this.openMiniGuide();
                    return;
                }
                if (startX > (screenW - 60) && diffX < -45 && absX > absY) {
                    if (this.isGuideOpen) this.closeGuide();
                    else this.openGuide();
                    return;
                }
                if (startY > (screenH - 75) && diffY < -40 && absY > absX) {
                    if (!this.isGuideOpen) this.openGuide();
                    return;
                }
                if (startY < 75 && diffY > 40 && absY > absX) {
                    if (this.isGuideOpen) this.closeGuide();
                    else this.openGuide();
                    return;
                }

                if (absX > 50 && absX > absY) {
                    if (diffX > 0) this.dispatchRemoteAction('right');
                    else this.dispatchRemoteAction('left');
                    return;
                }

                if (absY > 40 && absY > absX) {
                    const isLeftSide = startX < (screenW * 0.45);
                    if (isLeftSide && !this.isGuideOpen && !this.isMiniGuideOpen) {
                        if (diffY < 0) this.volumeUp();
                        else this.volumeDown();
                    } else {
                        if (diffY < 0) this.dispatchRemoteAction('up');
                        else this.dispatchRemoteAction('down');
                    }
                    return;
                }

                if (absX < 20 && absY < 20 && duration < 350) {
                    const now = Date.now();
                    if (now - lastTapTime < 320) {
                        this.toggleCRT();
                        lastTapTime = 0;
                    } else {
                        lastTapTime = now;
                        setTimeout(() => {
                            if (lastTapTime === now) {
                                if (this.isGuideOpen) this.guideSelectCurrent();
                                else if (this.isMiniGuideOpen) this.miniGuideSelectCurrent();
                                else this.toggleBanner();
                            }
                        }, 250);
                    }
                }
            }, { passive: true });
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        window.tvApp = new RetroTVController();
    });
})();
