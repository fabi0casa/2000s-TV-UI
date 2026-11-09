/**
 * Frutiger Aero IPTV Controller & UI Engine
 * Implements authentic 2000s set-top box behavior, animations, and sound integration
 */

class RetroTVController {
    constructor() {
        this.channels = window.CHANNELS_DATA || [];
        this.currentChannelIndex = 0;
        this.prevChannelIndex = 0;
        
        // EPG Guide Navigation State
        this.isGuideOpen = false;
        this.guideSelectedChannelIndex = 0;
        this.guideSelectedSlotIndex = 1; // Default to current slot

        // Mini Guide State
        this.isMiniGuideOpen = false;
        this.miniGuideSelectedIndex = 0;

        // Banner State
        this.isBannerVisible = false;
        this.bannerTimeout = null;
        this.bannerBrowsingIndex = 0;

        // Dialing State
        this.dialDigits = "";
        this.dialTimeout = null;

        // Volume State
        this.volume = 0.7;
        this.isMuted = false;
        this.volumeTimeout = null;

        // CRT Filter State
        this.isCRTActive = true;

        // Power State
        this.isPowerOn = true;

        // Elements
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
        this.remoteControl = document.getElementById('remote-control');
        this.floatingRemoteBtn = document.getElementById('floating-remote-btn');
        this.modalStream = document.getElementById('modal-stream');
        this.rcLed = document.getElementById('rc-led');
        this.youtubeContainer = document.getElementById('youtube-container');
        this.osdMediaBadge = document.getElementById('osd-media-badge');
        this.osdMediaIcon = document.getElementById('osd-media-icon');
        this.osdMediaText = document.getElementById('osd-media-text');

        // Playlist Lineup State ('br' | 'us')
        this.currentPlaylist = 'br';
        this.playlistCache = {};
        this.isPlaylistModalOpen = false;
        this.modalSelectedPlaylist = 'us';

        // Playlist Modal Elements
        this.modalPlaylist = document.getElementById('modal-playlist');
        this.cardPlaylistBr = document.getElementById('playlist-opt-br');
        this.cardPlaylistUs = document.getElementById('playlist-opt-us');
        this.btnCancelPlaylist = document.getElementById('btn-cancel-playlist');
        this.btnConfirmPlaylist = document.getElementById('btn-confirm-playlist');
        this.epgChannelsFilter = document.getElementById('epg-channels-filter');
        this.epgHintYellowText = document.getElementById('epg-hint-yellow-text');

        // Media & YouTube Player State
        this.currentMediaMode = 'canvas'; // 'canvas' | 'video' | 'youtube'
        this.ytPlayer = null;
        this.isYTReady = false;
        this.activeYouTubeId = null;
        this.pendingYouTubeId = null;
        this.mediaOSDTimeout = null;
        this.hls = null;
        this.channelLoadingSpinner = document.getElementById('channel-loading-spinner');
        this.channelLoadTimeout = null;
        this.currentTuneToken = 0;
        this.isChannelInNoSignalState = false;
        this.apiBaseUrl = (typeof window !== 'undefined' && window.location && window.location.hostname)
            ? `http://${window.location.hostname}:1414`
            : 'http://localhost:1414';
        this.epgProgramsCache = new Map();

        // Remote LED Blinking State
        this.isLedBlinking = false;
        this.ledBlinkInterval = null;

        // Floating Remote Launcher State
        this.isRemoteMinimized = false;
        this.floatingBtnTimeout = null;
        this.isMouseOverFloatingBtn = false;

        // Feed Generators
        this.tvFeed = new window.TVFeedGenerator(this.tvCanvas);
        this.pipFeed = new window.TVFeedGenerator(this.pipCanvas);

        this.init();
    }

    async init() {
        // Build initial EPG Grid & Mini Guide
        this.buildEPGGrid();
        this.buildMiniGuide();

        // Tune to initial channel (001 if available, otherwise 000 Sem Sinal)
        const initialChannelIdx = this.channels.length > 1 ? 1 : 0;
        this.tuneChannelByIndex(initialChannelIdx, false);
        this.updateLedState();

        // Bind Events
        this.bindKeyboard();
        this.bindRemote();
        this.bindFloatingRemoteLauncher();
        this.bindOSDInteractions();
        this.bindTouchControls();
        this.makeRemoteDraggable();

        // Unlock audio on first interaction
        const unlockAudio = () => {
            window.retroAudio.init();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });

        // Start Clock updates
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        // Auto show banner at start
        this.showBanner(6000);

        // Connect to API to fetch dynamic real-time channels and EPG exclusively from @/api
        await this.syncWithApi();
        setInterval(() => this.refreshEPG(), 60000);
    }

    /**
     * Smooth 1:1 Draggable remote control pinned accurately under the cursor
     */
    makeRemoteDraggable() {
        const header = document.getElementById('remote-header');
        const remote = this.remoteControl;
        if (!header || !remote) return;

        let isDragging = false;
        let grabOffsetX = 0;
        let grabOffsetY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'btn-minimize-remote') return;
            isDragging = true;
            if (this.youtubeContainer) {
                this.youtubeContainer.style.pointerEvents = 'none';
            }
            const rect = remote.getBoundingClientRect();
            grabOffsetX = e.clientX - rect.left;
            grabOffsetY = e.clientY - rect.top;

            remote.style.right = 'auto';
            remote.style.bottom = 'auto';
            remote.style.left = `${rect.left}px`;
            remote.style.top = `${rect.top}px`;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = e.clientX - grabOffsetX;
            const newTop = e.clientY - grabOffsetY;
            const maxLeft = Math.max(0, window.innerWidth - remote.offsetWidth - 10);
            const maxTop = Math.max(0, window.innerHeight - remote.offsetHeight - 10);

            remote.style.left = `${Math.max(10, Math.min(maxLeft, newLeft))}px`;
            remote.style.top = `${Math.max(10, Math.min(maxTop, newTop))}px`;
        });

        const stopDragging = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
                if (this.youtubeContainer) {
                    this.youtubeContainer.style.pointerEvents = 'auto';
                }
            }
        };

        window.addEventListener('mouseup', stopDragging);
        window.addEventListener('mouseleave', stopDragging);

        window.addEventListener('resize', () => {
            if (remote.style.left && remote.style.left !== 'auto') {
                const maxLeft = Math.max(10, window.innerWidth - remote.offsetWidth - 10);
                const maxTop = Math.max(10, window.innerHeight - remote.offsetHeight - 10);
                const currentLeft = parseFloat(remote.style.left) || 0;
                const currentTop = parseFloat(remote.style.top) || 0;
                if (currentLeft > maxLeft || currentTop > maxTop) {
                    remote.style.left = `${Math.min(currentLeft, maxLeft)}px`;
                    remote.style.top = `${Math.min(currentTop, maxTop)}px`;
                }
            }
        });
    }

    /**
     * Real-time Clock synchronization and analog hand movement
     */
    updateClock() {
        const now = new Date();
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayStr = days[now.getDay()];
        const month = now.getMonth() + 1;
        const date = now.getDate();
        
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'p' : 'a';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minutes = now.getMinutes().toString().padStart(2, '0');

        const formattedTime = `${dayStr} ${month}/${date} ${hours}:${minutes}${ampm}`;
        const shortTime = `${dayStr} ${hours}:${minutes}${ampm}`;

        const bannerTimeEl = document.getElementById('banner-current-time');
        if (bannerTimeEl) bannerTimeEl.innerText = formattedTime;

        const epgTimeEl = document.getElementById('epg-current-time');
        if (epgTimeEl) epgTimeEl.innerText = shortTime;

        const epgDateEl = document.getElementById('epg-date-label');
        if (epgDateEl) epgDateEl.innerText = `${dayStr} ${month}/${date}`;

        // Analog Clock hands in OSD 3D icon
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

    /**
     * Exibe o conteúdo de Sem Sinal do Canal 000 no canal atualmente sintonizado.
     * NÃO redireciona o usuário para o canal 000 e NÃO exibe nenhum popup de erro.
     */
    displayNoSignalContent() {
        if (!this.isPowerOn) return;

        if (this.channelLoadTimeout) {
            clearTimeout(this.channelLoadTimeout);
            this.channelLoadTimeout = null;
        }

        this.hideLoadingSpinner();

        if (this.hls) {
            try { this.hls.destroy(); } catch(e) {}
            this.hls = null;
        }

        if (this.customVideo) {
            this.customVideo.onplaying = null;
            this.customVideo.onerror = null;
            this.customVideo.onwaiting = null;
            try {
                this.customVideo.pause();
                this.customVideo.removeAttribute('src');
                this.customVideo.load();
            } catch(e) {}
            this.customVideo.style.display = 'none';
        }

        if (this.youtubeContainer) {
            this.youtubeContainer.style.display = 'none';
        }

        // Exibe o canvas de Sem Sinal (chiado de TV + logo Aquanet saltitante do canal 000)
        this.tvCanvas.style.display = 'block';
        this.tvFeed.setChannelType('static');
        this.pipFeed.setChannelType('static');
        this.pipFeed.setVideoSource(null);

        // Áudio analógico de chiado de TV idêntico ao canal 000
        if (window.retroAudio) {
            window.retroAudio.startStaticNoise();
        }

        this.isChannelInNoSignalState = true;
    }

    /**
     * Tune channel by index in CHANNELS_DATA
     */
    tuneChannelByIndex(index, playAudio = true) {
        if (!this.isPowerOn) return;

        if (index < 0) index = this.channels.length - 1;
        if (index >= this.channels.length) index = 0;

        this.prevChannelIndex = this.currentChannelIndex;
        this.currentChannelIndex = index;
        this.bannerBrowsingIndex = index;
        const ch = this.channels[this.currentChannelIndex];
        if (!ch) return;

        // Limpa estado anterior de carregamento e timers
        this.currentTuneToken = (this.currentTuneToken || 0) + 1;
        if (this.channelLoadTimeout) {
            clearTimeout(this.channelLoadTimeout);
            this.channelLoadTimeout = null;
        }
        this.isChannelInNoSignalState = false;

        // Sound effect
        if (playAudio && window.retroAudio) {
            window.retroAudio.playChannelSwitch();
        }

        // Check if Canal 000 (Sem Sinal), IPTV stream, YouTube, or Custom video
        if (ch.type === 'static' || ch.number === 0 || ch.number === 404) {
            this.hideLoadingSpinner();
            this.currentMediaMode = 'canvas';
            this.pauseYouTube();
            if (this.youtubeContainer) this.youtubeContainer.style.display = 'none';
            if (this.hls) {
                this.hls.destroy();
                this.hls = null;
            }
            if (this.customVideo) {
                this.customVideo.onplaying = null;
                this.customVideo.onerror = null;
                this.customVideo.onwaiting = null;
                this.customVideo.pause();
                this.customVideo.removeAttribute('src');
                this.customVideo.load();
                this.customVideo.style.display = 'none';
            }
            this.tvCanvas.style.display = 'block';
            this.tvFeed.setChannelType('static');
            this.pipFeed.setChannelType('static');
            this.pipFeed.setVideoSource(null);
            if (window.retroAudio) window.retroAudio.startStaticNoise();
        } else if (ch.type === 'iptv' || ch.liveUrl || ch.streamUrl) {
            this.currentMediaMode = 'tv';
            if (window.retroAudio) window.retroAudio.stopStaticNoise();
            this.pauseYouTube();
            if (this.youtubeContainer) this.youtubeContainer.style.display = 'none';
            this.tvCanvas.style.display = 'none';
            if (this.customVideo) {
                this.customVideo.pause();
                this.customVideo.style.display = 'none';
            }
            this.showLoadingSpinner();
            this.playIPTVChannel(ch);
            this.pipFeed.setChannelType('iptv');
            this.pipFeed.setVideoSource(this.customVideo);
        } else if (ch.type === 'youtube') {
            this.currentMediaMode = 'youtube';
            if (window.retroAudio) window.retroAudio.stopStaticNoise();
            if (this.hls) {
                this.hls.destroy();
                this.hls = null;
            }
            if (this.customVideo) {
                this.customVideo.onplaying = null;
                this.customVideo.onerror = null;
                this.customVideo.onwaiting = null;
                this.customVideo.pause();
                this.customVideo.removeAttribute('src');
                this.customVideo.load();
                this.customVideo.style.display = 'none';
            }
            this.tvCanvas.style.display = 'none';
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'block';
            }
            this.showLoadingSpinner();
            this.playYouTube();
            this.pipFeed.setChannelType('youtube');
            this.pipFeed.setVideoSource(null);
        } else if (ch.type === 'custom' && this.customVideo && this.customVideo.src) {
            this.currentMediaMode = 'tv';
            if (window.retroAudio) window.retroAudio.stopStaticNoise();
            this.pauseYouTube();
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'none';
            }
            this.tvCanvas.style.display = 'none';
            this.showLoadingSpinner();
            this.customVideo.style.display = 'block';
            this.customVideo.play().then(() => {
                this.hideLoadingSpinner();
            }).catch(() => {
                this.displayNoSignalContent();
            });
            this.pipFeed.setChannelType('custom');
            this.pipFeed.setVideoSource(this.customVideo);
        } else {
            this.hideLoadingSpinner();
            this.currentMediaMode = 'canvas';
            if (window.retroAudio) window.retroAudio.stopStaticNoise();
            this.pauseYouTube();
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'none';
            }
            if (this.customVideo) {
                this.customVideo.onplaying = null;
                this.customVideo.onerror = null;
                this.customVideo.onwaiting = null;
                this.customVideo.pause();
                this.customVideo.style.display = 'none';
            }
            this.tvCanvas.style.display = 'block';
            this.tvFeed.setChannelType(ch.type);
            this.pipFeed.setChannelType(ch.type);
            this.pipFeed.setVideoSource(null);
        }

        // Update Top Banner Elements
        this.updateBannerForChannel(this.currentChannelIndex);

        // Show Info Banner if Guide is not open
        if (!this.isGuideOpen) {
            this.showBanner(4500);
        }

        // Update active class in Mini Guide
        if (this.isMiniGuideOpen) {
            this.miniGuideSelectedIndex = this.currentChannelIndex;
        }
        this.updateMiniGuideHighlight();

        // Update active class and selection in EPG Guide if open
        if (this.isGuideOpen) {
            this.guideSelectedChannelIndex = this.currentChannelIndex;
            this.guideSelectedSlotIndex = 0;
            this.updateEPGSelection();
        }
    }

    /**
     * Play live IPTV HLS stream (.m3u8) using local proxy or direct stream
     */
    playIPTVChannel(ch) {
        if (!this.customVideo) return;

        const streamUrl = ch.liveUrl || ch.streamUrl;
        if (!streamUrl) {
            console.warn('[IPTV] Canal sem URL:', ch);
            this.displayNoSignalContent();
            return;
        }

        const token = this.currentTuneToken;

        if (this.channelLoadTimeout) {
            clearTimeout(this.channelLoadTimeout);
            this.channelLoadTimeout = null;
        }

        this.showLoadingSpinner();

        // Se após 1 minuto o sinal do canal não iniciar a reprodução, exibe Sem Sinal no canal atual
        this.channelLoadTimeout = setTimeout(() => {
            if (this.currentTuneToken !== token) return;
            console.warn('[IPTV] Timeout ao sintonizar canal:', ch.name);
            this.displayNoSignalContent();
        }, 60000);

        this.customVideo.volume = this.volume;
        this.customVideo.muted = this.isMuted;

        this.customVideo.onplaying = () => {
            if (this.currentTuneToken !== token) return;
            if (this.channelLoadTimeout) {
                clearTimeout(this.channelLoadTimeout);
                this.channelLoadTimeout = null;
            }
            this.hideLoadingSpinner();
            this.isChannelInNoSignalState = false;
            this.tvCanvas.style.display = 'none';
            this.customVideo.style.display = 'block';
            if (window.retroAudio) {
                window.retroAudio.stopStaticNoise();
            }
            this.pipFeed.setChannelType('iptv');
            this.pipFeed.setVideoSource(this.customVideo);
        };

        this.customVideo.onwaiting = () => {
            if (this.currentTuneToken !== token) return;
            if (!this.isChannelInNoSignalState) {
                this.showLoadingSpinner();
            }
        };

        this.customVideo.onerror = (e) => {
            if (this.currentTuneToken !== token) return;
            console.warn('[IPTV Video Error]', e);
            this.displayNoSignalContent();
        };

        if (this.hls) {
            try { this.hls.destroy(); } catch(e) {}
            this.hls = null;
        }

        let hasAttemptedFallback = false;

        if (window.Hls && Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 60,
                manifestLoadingTimeOut: 7000,
                levelLoadingTimeOut: 7000,
                fragLoadingTimeOut: 7000
            });

            this.hls.loadSource(streamUrl);
            this.hls.attachMedia(this.customVideo);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (this.currentTuneToken !== token) return;
                this.customVideo.play().catch(e => {
                    console.warn('[IPTV] Autoplay blocked or delayed:', e);
                });
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (this.currentTuneToken !== token) return;
                if (data.fatal) {
                    console.warn('[HLS Fatal Error]', data.type, data.details);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            if (!hasAttemptedFallback && ch.streamUrl && streamUrl !== ch.streamUrl) {
                                hasAttemptedFallback = true;
                                console.log('[IPTV] Fallback para stream original:', ch.streamUrl);
                                this.hls.loadSource(ch.streamUrl);
                                this.hls.startLoad();
                            } else {
                                this.displayNoSignalContent();
                            }
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            try {
                                this.hls.recoverMediaError();
                            } catch(err) {
                                this.displayNoSignalContent();
                            }
                            break;
                        default:
                            this.displayNoSignalContent();
                            break;
                    }
                }
            });
        } else if (this.customVideo.canPlayType('application/vnd.apple.mpegurl')) {
            this.customVideo.src = streamUrl;
            this.customVideo.play().catch(() => {});
        } else {
            this.customVideo.src = streamUrl;
            this.customVideo.play().catch(() => {});
        }
    }

    /**
     * Tune directly by channel numeric code (e.g. 1, 294, 0, etc.)
     */
    tuneByNumber(num) {
        if (num === 0) {
            const staticIdx = this.channels.findIndex(c => c.type === 'static' || c.number === 0 || c.id === "000");
            if (staticIdx !== -1) {
                this.tuneChannelByIndex(staticIdx, true);
                return;
            }
        }

        let targetIndex = this.channels.findIndex(c => c.number === num || parseInt(c.id, 10) === num);
        if (targetIndex !== -1) {
            this.tuneChannelByIndex(targetIndex, true);
        } else {
            // Canal inexistente -> criar entrada sem sinal sem redirecionar para 000 e sem popup
            const nonExistentCh = {
                id: String(num).padStart(3, '0'),
                number: num,
                code: "SEM SINAL",
                name: `CANAL ${String(num).padStart(3, '0')}`,
                title: "Sinal do Satélite Interrompido",
                timeSlot: window.formatTimeSlot ? window.formatTimeSlot(null, null) : "00:00 - 12:00",
                language: "Português",
                rating: "LIVRE",
                category: "Sem Sinal",
                description: "Canal sem sinal de transmissão ou fora da área de cobertura do satélite.",
                schedule: [],
                type: "static"
            };
            this.channels.push(nonExistentCh);
            targetIndex = this.channels.length - 1;
            this.tuneChannelByIndex(targetIndex, true);
        }
    }

    /**
     * Channel Up / Down
     * Os botões CH sempre trocam de canal normalmente, mesmo com o Guia ou Mini Guia abertos.
     * A navegação interna dos menus é feita exclusivamente pelas setinhas (D-Pad).
     */
    channelUp() {
        this.tuneChannelByIndex(this.currentChannelIndex + 1);
    }

    channelDown() {
        this.tuneChannelByIndex(this.currentChannelIndex - 1);
    }

    /**
     * Show / Hide Top Channel Info Banner
     */
    showBanner(duration = 4500) {
        if (!this.isPowerOn) return;
        this.channelBanner.classList.remove('hidden');
        this.isBannerVisible = true;

        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
        if (duration > 0) {
            this.bannerTimeout = setTimeout(() => {
                this.hideBanner();
            }, duration);
        }
    }

    hideBanner() {
        this.channelBanner.classList.add('hidden');
        this.isBannerVisible = false;
        // Reset inspected channel on the banner back to the active channel
        this.bannerBrowsingIndex = this.currentChannelIndex;
        this.updateBannerForChannel(this.currentChannelIndex);
        if (this.bannerTimeout) {
            clearTimeout(this.bannerTimeout);
            this.bannerTimeout = null;
        }
    }

    toggleBanner() {
        if (this.isBannerVisible) {
            this.hideBanner();
            if (window.retroAudio) {
                window.retroAudio.playBeep('back');
            }
        } else {
            this.bannerBrowsingIndex = this.currentChannelIndex;
            this.updateBannerForChannel(this.bannerBrowsingIndex);
            this.showBanner(5000);
            if (window.retroAudio) {
                window.retroAudio.playBeep('select');
            }
        }
    }

    /**
     * Update banner text and metadata for a specific channel
     */
    updateBannerForChannel(index) {
        if (!this.channels || this.channels.length === 0) return;
        if (index < 0) index = this.channels.length - 1;
        if (index >= this.channels.length) index = 0;

        const ch = this.channels[index];
        if (!ch) return;

        const elNum = document.getElementById('banner-ch-num');
        const elCode = document.getElementById('banner-ch-code');
        const elTitle = document.getElementById('banner-prog-title');
        const elLang = document.getElementById('banner-lang');
        const elTimeslot = document.getElementById('banner-timeslot');
        const elRating = document.getElementById('banner-rating');
        const elFavTag = document.getElementById('banner-favorites-tag') || document.querySelector('.banner-favorites-tag');

        if (elNum) elNum.innerText = ch.id;
        if (elCode) elCode.innerText = ch.name || ch.code;
        if (elTitle) elTitle.innerText = ch.title;
        if (elLang) elLang.innerText = ch.language || 'Português';
        if (elTimeslot) elTimeslot.innerText = ch.timeSlot || '';
        if (elRating) elRating.innerText = ch.rating || 'LIVRE';

        const logoOrb = document.querySelector('.banner-channel-badge .logo-orb');
        if (logoOrb) {
            if (ch.logo) {
                logoOrb.innerHTML = `<img src="${ch.logo}" alt="${ch.name}" onerror="this.outerHTML='<svg viewBox=\\'0 0 100 100\\'><circle cx=\\'50\\' cy=\\'50\\' r=\\'48\\' fill=\\'#111827\\'/><path d=\\'M 50 2 A 48 48 0 0 1 50 98 A 24 24 0 0 1 50 50 A 24 24 0 0 0 50 2\\' fill=\\'#ffffff\\'/><circle cx=\\'50\\' cy=\\'26\\' r=\\'6\\' fill=\\'#111827\\'/><circle cx=\\'50\\' cy=\\'74\\' r=\\'6\\' fill=\\'#ffffff\\'/></svg>'">`;
            } else {
                logoOrb.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#111827"/><path d="M 50 2 A 48 48 0 0 1 50 98 A 24 24 0 0 1 50 50 A 24 24 0 0 0 50 2" fill="#ffffff"/><circle cx="50" cy="26" r="6" fill="#111827"/><circle cx="50" cy="74" r="6" fill="#ffffff"/></svg>`;
            }
        }

        if (elFavTag) {
            const playlistTitle = this.getPlaylistDisplayName();
            if (index !== this.currentChannelIndex) {
                elFavTag.innerHTML = `<span>${playlistTitle}</span> <span class="banner-tune-hint">• Pressione OK para assistir</span>`;
            } else {
                elFavTag.innerHTML = `<span>${playlistTitle}</span>`;
            }
        }
    }

    /**
     * Browse next/previous channel info on the banner without changing the TV channel
     */
    bannerBrowse(delta) {
        if (!this.isPowerOn || !this.channels || this.channels.length === 0) return;

        if (window.retroAudio) {
            window.retroAudio.playBeep('nav');
        }

        this.bannerBrowsingIndex += delta;
        if (this.bannerBrowsingIndex < 0) {
            this.bannerBrowsingIndex = this.channels.length - 1;
        } else if (this.bannerBrowsingIndex >= this.channels.length) {
            this.bannerBrowsingIndex = 0;
        }

        this.updateBannerForChannel(this.bannerBrowsingIndex);
        this.showBanner(5000);
    }

    /**
     * Handle Up navigation (D-pad & keyboard arrow)
     */
    handleUpPress() {
        if (this.isPlaylistModalOpen) {
            this.movePlaylistModalSelection(-1);
        } else if (this.isGuideOpen) {
            this.guideMoveVertical(-1);
        } else if (this.isMiniGuideOpen) {
            this.miniGuideMoveVertical(-1);
        } else {
            this.adjustVolume(0.05);
        }
    }

    /**
     * Handle Down navigation (D-pad & keyboard arrow)
     */
    handleDownPress() {
        if (this.isPlaylistModalOpen) {
            this.movePlaylistModalSelection(1);
        } else if (this.isGuideOpen) {
            this.guideMoveVertical(1);
        } else if (this.isMiniGuideOpen) {
            this.miniGuideMoveVertical(1);
        } else {
            this.adjustVolume(-0.05);
        }
    }

    /**
     * Handle Left / Right navigation (D-pad & keyboard arrows)
     */
    handleLeftPress() {
        if (this.isGuideOpen) {
            this.guideMoveHorizontal(-1);
        } else if (this.isMiniGuideOpen) {
            this.adjustVolume(-0.05);
        } else if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
            this.bannerBrowse(-1);
        } else if (this.currentMediaMode === 'youtube') {
            this.seekYouTube(-10);
        } else if (this.isBannerVisible) {
            this.bannerBrowse(-1);
        } else {
            this.channelDown();
        }
    }

    handleRightPress() {
        if (this.isGuideOpen) {
            this.guideMoveHorizontal(1);
        } else if (this.isMiniGuideOpen) {
            this.adjustVolume(0.05);
        } else if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
            this.bannerBrowse(1);
        } else if (this.currentMediaMode === 'youtube') {
            this.seekYouTube(10);
        } else if (this.isBannerVisible) {
            this.bannerBrowse(1);
        } else {
            this.channelUp();
        }
    }

    /**
     * Handle OK button press (Remote OK & Enter key)
     */
    handleOkPress() {
        if (!this.isPowerOn) return;

        if (this.isPlaylistModalOpen) {
            this.confirmPlaylistSelection();
            return;
        }

        if (this.isGuideOpen) {
            this.guideSelectCurrent();
            return;
        }

        if (this.isMiniGuideOpen) {
            this.miniGuideSelectCurrent();
            return;
        }

        // Apenas na implementação do YouTube, o OK pausa/reproduz
        if (this.currentMediaMode === 'youtube') {
            if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
                this.tuneChannelByIndex(this.bannerBrowsingIndex, true);
                return;
            }
            this.toggleYouTubePlayPause();
            return;
        }

        // Comportamento normal da TV (Canal 000 e todos os canais reais de transmissão):
        if (!this.isBannerVisible) {
            this.bannerBrowsingIndex = this.currentChannelIndex;
            this.updateBannerForChannel(this.bannerBrowsingIndex);
            this.showBanner(5000);
            if (window.retroAudio) {
                window.retroAudio.playBeep('select');
            }
        } else {
            if (this.bannerBrowsingIndex !== this.currentChannelIndex) {
                this.tuneChannelByIndex(this.bannerBrowsingIndex, true);
            } else {
                this.hideBanner();
                if (window.retroAudio) {
                    window.retroAudio.playBeep('back');
                }
            }
        }
    }

    /**
     * Full EPG Guide Screen (Screenshot 2)
     */
    openGuide() {
        if (!this.isPowerOn) return;
        window.retroAudio.playBeep('select');
        this.hideBanner();
        this.closeMiniGuide();

        this.guideSelectedChannelIndex = this.currentChannelIndex;
        this.guideSelectedSlotIndex = 0;
        this.updateEPGSelection();

        if (this.epgChannelsFilter) {
            this.epgChannelsFilter.innerText = this.getPlaylistDisplayName();
        }

        this.epgGuide.classList.remove('hidden');
        this.isGuideOpen = true;

        // Ensure PIP feed runs
        const ch = this.channels[this.currentChannelIndex];
        this.pipFeed.resize();
        this.pipFeed.setChannelType(ch.type);
    }

    closeGuide() {
        if (!this.isGuideOpen) return;
        if (this.isPlaylistModalOpen) {
            this.closePlaylistModal();
        }
        if (window.retroAudio) {
            window.retroAudio.playBeep('back');
        }
        this.epgGuide.classList.add('hidden');
        this.isGuideOpen = false;
        this.bannerBrowsingIndex = this.currentChannelIndex;
        this.updateBannerForChannel(this.currentChannelIndex);
        this.showBanner(3500);
    }

    toggleGuide() {
        if (this.isGuideOpen) this.closeGuide();
        else this.openGuide();
    }

    /**
     * Build EPG Grid Rows dynamically
     */
    buildEPGGrid() {
        const rowsContainer = document.getElementById('epg-rows-list');
        if (!rowsContainer) return;
        rowsContainer.innerHTML = '';

        // Calcula a janela da linha do tempo: 3 horas a partir da meia hora atual
        const now = new Date();
        const baseMin = now.getMinutes() < 30 ? 0 : 30;
        const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), baseMin, 0, 0);
        const windowStartMs = windowStart.getTime();
        const windowDurationMs = 3 * 60 * 60 * 1000; // 3 horas de janela
        const windowEndMs = windowStartMs + windowDurationMs;

        this.guideWindowStartMs = windowStartMs;
        this.guideWindowEndMs = windowEndMs;

        // Atualiza cabeçalho com a data (ex: "Dom 08/11")
        const dateHeader = document.getElementById('epg-date-label');
        if (dateHeader) {
            const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const dayName = days[now.getDay()];
            const dayNum = String(now.getDate()).padStart(2, '0');
            const monthNum = String(now.getMonth() + 1).padStart(2, '0');
            dateHeader.innerText = `${dayName} ${dayNum}/${monthNum}`;
        }

        // Gera 6 colunas de meia hora no cabeçalho da linha do tempo (ex: 13:00, 13:30, 14:00, 14:30...)
        const headerContainer = document.getElementById('epg-timeline-header-track');
        if (headerContainer) {
            headerContainer.innerHTML = '';
            for (let i = 0; i < 6; i++) {
                const slotTime = new Date(windowStartMs + i * 30 * 60 * 1000);
                const slotDiv = document.createElement('div');
                slotDiv.className = 'epg-time-slot-header';
                slotDiv.id = `epg-time-slot-${i}`;
                slotDiv.innerText = window.formatTime12 ? window.formatTime12(slotTime) : slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                headerContainer.appendChild(slotDiv);
            }
        }

        this.channels.forEach((ch, chIdx) => {
            const row = document.createElement('div');
            row.className = 'epg-row';
            row.id = `epg-row-${chIdx}`;

            // Coluna do Canal (esquerda)
            const chCell = document.createElement('div');
            chCell.className = 'epg-channel-cell';
            const logoHtml = ch.logo
                ? `<div class="epg-cell-logo-slot"><img src="${ch.logo}" alt="" class="epg-cell-logo" onerror="this.parentElement.innerHTML='<img src=\\'icons/tv.png\\' alt=\\'\\' class=\\'epg-cell-logo-fallback\\'>'"></div>`
                : `<div class="epg-cell-logo-slot"><img src="icons/tv.png" alt="" class="epg-cell-logo-fallback"></div>`;

            chCell.innerHTML = `
                <span class="cell-ch-num">${ch.id}</span>
                ${logoHtml}
                <span class="cell-ch-name" title="${ch.name}">${ch.name || ch.code}</span>
            `;
            chCell.addEventListener('click', () => {
                this.guideSelectedChannelIndex = chIdx;
                this.guideSelectedSlotIndex = 0;
                this.tuneChannelByIndex(chIdx);
                this.closeGuide();
            });
            row.appendChild(chCell);

            // Grade de Programas (direita)
            const progTrack = document.createElement('div');
            progTrack.className = 'epg-programs-track';

            const hasRealEpg = Boolean(ch.epg && ch.epg.hasEpg && ch.schedule && ch.schedule.length > 0);

            if (!hasRealEpg) {
                // CANAL SEM EPG: Barra única contínua com texto exato do print do usuário
                const noInfoBlock = document.createElement('div');
                noInfoBlock.className = 'epg-program-block epg-no-info';
                noInfoBlock.id = `epg-block-${chIdx}-0`;
                noInfoBlock.innerHTML = `<span class="epg-no-info-text">sem informações de programação...</span>`;

                noInfoBlock.addEventListener('click', () => {
                    this.guideSelectedChannelIndex = chIdx;
                    this.guideSelectedSlotIndex = 0;
                    this.updateEPGSelection();
                    this.tuneChannelByIndex(chIdx);
                    this.closeGuide();
                });

                progTrack.appendChild(noInfoBlock);
            } else {
                // CANAL COM EPG: Filtra os programas que intersectam com a janela de tempo
                let visiblePrograms = ch.schedule.filter(p => {
                    const pStart = new Date(p.start).getTime();
                    const pStop = new Date(p.stop).getTime();
                    return pStop > windowStartMs && pStart < windowEndMs;
                });

                if (visiblePrograms.length === 0) {
                    visiblePrograms = ch.schedule.slice(0, 3);
                }

                const totalDurMs = windowDurationMs;

                visiblePrograms.forEach((item, slotIdx) => {
                    const block = document.createElement('div');
                    block.className = 'epg-program-block';
                    block.id = `epg-block-${chIdx}-${slotIdx}`;

                    const pStartMs = new Date(item.start).getTime();
                    const pStopMs = new Date(item.stop).getTime();

                    const effectiveStart = Math.max(windowStartMs, pStartMs);
                    const effectiveStop = Math.min(windowEndMs, pStopMs);
                    const dur = Math.max(10 * 60 * 1000, effectiveStop - effectiveStart);
                    const pct = Math.max(8, (dur / totalDurMs) * 100);

                    block.style.flex = `${pct} 0 auto`;
                    block.style.minWidth = '70px';

                    const timeStr = item.timeBadge || item.time || (window.formatTimeBadge ? window.formatTimeBadge(item.start) : '');
                    const timeTag = timeStr && timeStr !== '--:--' ? `<span class="epg-block-time">${timeStr}</span>` : '';

                    block.innerHTML = `
                        ${timeTag}
                        <span class="epg-block-title" title="${item.title}">${item.title}</span>
                    `;

                    block.addEventListener('click', () => {
                        this.guideSelectedChannelIndex = chIdx;
                        this.guideSelectedSlotIndex = slotIdx;
                        this.updateEPGSelection();
                        this.tuneChannelByIndex(chIdx);
                        this.closeGuide();
                    });

                    progTrack.appendChild(block);
                });
            }

            row.appendChild(progTrack);
            rowsContainer.appendChild(row);
        });
    }

    /**
     * Update Guide Highlight Cursor and Details Header
     */
    updateEPGSelection() {
        // Limpa seleções anteriores
        document.querySelectorAll('.epg-row.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.epg-program-block.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.epg-row.now-playing').forEach(el => el.classList.remove('now-playing'));

        // Marca a linha do canal atualmente sintonizado na TV
        const playingRow = document.getElementById(`epg-row-${this.currentChannelIndex}`);
        if (playingRow) {
            playingRow.classList.add('now-playing');
        }

        const row = document.getElementById(`epg-row-${this.guideSelectedChannelIndex}`);
        const block = document.getElementById(`epg-block-${this.guideSelectedChannelIndex}-${this.guideSelectedSlotIndex}`) ||
                      document.getElementById(`epg-block-${this.guideSelectedChannelIndex}-0`);

        if (row) {
            row.classList.add('selected');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        if (block) {
            block.classList.add('selected');
        }

        const ch = this.channels[this.guideSelectedChannelIndex];
        if (ch) {
            const headlineEl = document.getElementById('epg-headline-text');
            const synopsisEl = document.getElementById('epg-synopsis-text');
            const timeslotEl = document.getElementById('epg-timeslot');
            const ratingEl = document.getElementById('epg-rating');

            const hasRealEpg = Boolean(ch.epg && ch.epg.hasEpg && ch.schedule && ch.schedule.length > 0);
            const currentSlot = hasRealEpg && ch.schedule[this.guideSelectedSlotIndex] ? ch.schedule[this.guideSelectedSlotIndex] : null;

            if (currentSlot) {
                if (headlineEl) headlineEl.innerText = `${ch.id} - ${ch.name ? ch.name.toUpperCase() : ch.code}`;
                if (synopsisEl) synopsisEl.innerText = currentSlot.description || `Transmissão ao vivo do canal ${ch.name}.`;
                if (timeslotEl) timeslotEl.innerText = currentSlot.timeSlot || '--:-- - --:--';
                if (ratingEl) ratingEl.innerText = currentSlot.rating || 'LIVRE';
            } else {
                if (headlineEl) headlineEl.innerText = `${ch.id} - ${ch.name ? ch.name.toUpperCase() : ch.code}`;
                if (synopsisEl) synopsisEl.innerText = `Sem informações de programação disponíveis para este canal no momento. Transmissão contínua da emissora.`;
                if (timeslotEl) timeslotEl.innerText = ch.timeSlot || '--:-- - --:--';
                if (ratingEl) ratingEl.innerText = 'LIVRE';
            }

            // O PIP do Guia exibe continuamente a transmissão do canal atualmente sintonizado na TV
            const currentPlayingCh = this.channels[this.currentChannelIndex] || ch;
            this.pipFeed.setChannelType(currentPlayingCh.type);
            if (currentPlayingCh.type === 'iptv' && this.customVideo) {
                this.pipFeed.setVideoSource(this.customVideo);
            } else {
                this.pipFeed.setVideoSource(null);
            }

            // Lazy fetch full daily schedule if channel has EPG
            if (ch.slug && ch.epg && ch.epg.hasEpg && !this.epgProgramsCache.has(ch.slug)) {
                this.fetchFullChannelGuide(ch);
            }
        }
    }

    /**
     * Lazy fetch daily schedule for detailed EPG synopsis
     */
    async fetchFullChannelGuide(ch) {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/epg/${ch.slug}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && Array.isArray(data.programs) && data.programs.length > 0) {
                this.epgProgramsCache.set(ch.slug, data.programs);

                ch.schedule = data.programs.map(p => ({
                    time: window.formatTime12 ? window.formatTime12(p.start) : '--:--',
                    timeBadge: window.formatTimeBadge ? window.formatTimeBadge(p.start) : '',
                    timeSlot: window.formatTimeSlot ? window.formatTimeSlot(p.start, p.stop) : '--:--',
                    title: p.title,
                    description: p.description || '',
                    category: p.category || ch.category || '',
                    rating: "LIVRE",
                    current: Boolean(p.isLive),
                    start: p.start,
                    stop: p.stop
                }));

                const chIdx = this.channels.indexOf(ch);
                if (chIdx !== -1) {
                    const row = document.getElementById(`epg-row-${chIdx}`);
                    if (row) {
                        const progTrack = row.querySelector('.epg-programs-track');
                        if (progTrack) {
                            progTrack.innerHTML = '';
                            const windowStartMs = this.guideWindowStartMs || Date.now();
                            const windowDurationMs = 3 * 60 * 60 * 1000;
                            const windowEndMs = windowStartMs + windowDurationMs;

                            let visiblePrograms = ch.schedule.filter(p => {
                                const pStart = new Date(p.start).getTime();
                                const pStop = new Date(p.stop).getTime();
                                return pStop > windowStartMs && pStart < windowEndMs;
                            });

                            if (visiblePrograms.length === 0) {
                                visiblePrograms = ch.schedule.slice(0, 3);
                            }

                            visiblePrograms.forEach((item, slotIdx) => {
                                const block = document.createElement('div');
                                block.className = 'epg-program-block';
                                block.id = `epg-block-${chIdx}-${slotIdx}`;

                                const pStartMs = new Date(item.start).getTime();
                                const pStopMs = new Date(item.stop).getTime();
                                const effectiveStart = Math.max(windowStartMs, pStartMs);
                                const effectiveStop = Math.min(windowEndMs, pStopMs);
                                const dur = Math.max(10 * 60 * 1000, effectiveStop - effectiveStart);
                                const pct = Math.max(8, (dur / windowDurationMs) * 100);

                                block.style.flex = `${pct} 0 auto`;
                                block.style.minWidth = '70px';

                                const timeStr = item.timeBadge || item.time || (window.formatTimeBadge ? window.formatTimeBadge(item.start) : '');
                                const timeTag = timeStr && timeStr !== '--:--' ? `<span class="epg-block-time">${timeStr}</span>` : '';

                                block.innerHTML = `
                                    ${timeTag}
                                    <span class="epg-block-title" title="${item.title}">${item.title}</span>
                                `;

                                block.addEventListener('click', () => {
                                    this.guideSelectedChannelIndex = chIdx;
                                    this.guideSelectedSlotIndex = slotIdx;
                                    this.updateEPGSelection();
                                    this.tuneChannelByIndex(chIdx);
                                    this.closeGuide();
                                });

                                progTrack.appendChild(block);
                            });
                        }
                    }
                }

                if (this.isGuideOpen && this.guideSelectedChannelIndex === chIdx) {
                    this.updateEPGSelection();
                }
            }
        } catch (e) {
            // Silencioso se offline
        }
    }

    guideMoveVertical(delta) {
        window.retroAudio.playBeep('nav');
        if (delta < -1) {
            // Page up (e.g. -4 channels)
            if (this.guideSelectedChannelIndex === 0) {
                this.guideSelectedChannelIndex = this.channels.length - 1;
            } else {
                this.guideSelectedChannelIndex = Math.max(0, this.guideSelectedChannelIndex + delta);
            }
        } else if (delta > 1) {
            // Page down (e.g. +4 channels)
            if (this.guideSelectedChannelIndex >= this.channels.length - 1) {
                this.guideSelectedChannelIndex = 0;
            } else {
                this.guideSelectedChannelIndex = Math.min(this.channels.length - 1, this.guideSelectedChannelIndex + delta);
            }
        } else {
            // Passo único
            this.guideSelectedChannelIndex += delta;
            if (this.guideSelectedChannelIndex < 0) this.guideSelectedChannelIndex = this.channels.length - 1;
            if (this.guideSelectedChannelIndex >= this.channels.length) this.guideSelectedChannelIndex = 0;
        }

        const row = document.getElementById(`epg-row-${this.guideSelectedChannelIndex}`);
        const blocks = row ? row.querySelectorAll('.epg-program-block') : [];
        const maxSlot = Math.max(0, blocks.length - 1);
        if (this.guideSelectedSlotIndex > maxSlot) {
            this.guideSelectedSlotIndex = maxSlot;
        }

        this.updateEPGSelection();
    }

    guideMoveHorizontal(delta) {
        window.retroAudio.playBeep('nav');
        const row = document.getElementById(`epg-row-${this.guideSelectedChannelIndex}`);
        const blocks = row ? row.querySelectorAll('.epg-program-block') : [];
        const maxSlot = Math.max(0, blocks.length - 1);

        this.guideSelectedSlotIndex += delta;
        if (this.guideSelectedSlotIndex < 0) this.guideSelectedSlotIndex = 0;
        if (this.guideSelectedSlotIndex > maxSlot) this.guideSelectedSlotIndex = maxSlot;
        this.updateEPGSelection();
    }

    guideSelectCurrent() {
        window.retroAudio.playBeep('select');
        this.tuneChannelByIndex(this.guideSelectedChannelIndex);
        this.closeGuide();
    }

    /**
     * Mini Guide (Side panel channel list)
     */
    buildMiniGuide() {
        const list = document.getElementById('mini-guide-items');
        if (!list) return;
        list.innerHTML = '';

        this.channels.forEach((ch, idx) => {
            const item = document.createElement('div');
            item.className = 'mini-guide-item';
            item.id = `mini-guide-item-${idx}`;

            const logoHtml = ch.logo
                ? `<div class="mini-guide-logo-slot"><img src="${ch.logo}" alt="" class="mini-guide-logo" onerror="this.parentElement.innerHTML='<img src=\\'icons/tv.png\\' alt=\\'\\' class=\\'mini-guide-logo-fallback\\'>'"></div>`
                : `<div class="mini-guide-logo-slot"><img src="icons/tv.png" alt="" class="mini-guide-logo-fallback"></div>`;

            item.innerHTML = `
                <div class="mini-guide-ch-left">
                    <span class="mini-guide-num">${ch.id}</span>
                    ${logoHtml}
                    <span class="mini-guide-title" title="${ch.name}">${ch.name || ch.code}</span>
                </div>
                <div class="mini-guide-prog" title="${ch.title}">
                    <span class="mini-guide-prog-text">${ch.title}</span>
                    <span class="mini-guide-status-badge">NO AR</span>
                </div>
            `;

            item.addEventListener('click', () => {
                this.miniGuideSelectedIndex = idx;
                this.miniGuideSelectCurrent();
            });

            item.addEventListener('mouseenter', () => {
                this.miniGuideSelectedIndex = idx;
                this.updateMiniGuideHighlight();
            });

            list.appendChild(item);
        });

        this.updateMiniGuideHighlight();
    }

    updateMiniGuideHighlight() {
        document.querySelectorAll('.mini-guide-item').forEach(el => {
            el.classList.remove('selected', 'focused', 'now-playing', 'active');
        });

        // Marca o canal atualmente em reprodução na TV
        const playingItem = document.getElementById(`mini-guide-item-${this.currentChannelIndex}`);
        if (playingItem) {
            playingItem.classList.add('now-playing');
        }

        // Marca o canal atualmente selecionado/focado pelo cursor
        const targetIdx = (this.miniGuideSelectedIndex !== undefined && this.miniGuideSelectedIndex >= 0)
            ? this.miniGuideSelectedIndex
            : this.currentChannelIndex;

        const selectedItem = document.getElementById(`mini-guide-item-${targetIdx}`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    miniGuideMoveVertical(delta) {
        if (!this.channels || this.channels.length === 0) return;
        if (window.retroAudio) {
            window.retroAudio.playBeep('nav');
        }
        if (this.miniGuideSelectedIndex === undefined || this.miniGuideSelectedIndex < 0) {
            this.miniGuideSelectedIndex = this.currentChannelIndex;
        }
        this.miniGuideSelectedIndex += delta;
        if (this.miniGuideSelectedIndex < 0) {
            this.miniGuideSelectedIndex = this.channels.length - 1;
        } else if (this.miniGuideSelectedIndex >= this.channels.length) {
            this.miniGuideSelectedIndex = 0;
        }
        this.updateMiniGuideHighlight();
    }

    miniGuideSelectCurrent() {
        if (!this.isPowerOn) return;
        if (this.miniGuideSelectedIndex === undefined || this.miniGuideSelectedIndex < 0) {
            this.miniGuideSelectedIndex = this.currentChannelIndex;
        }
        window.retroAudio.playBeep('select');
        this.tuneChannelByIndex(this.miniGuideSelectedIndex, true);
        this.closeMiniGuide();
    }

    toggleMiniGuide() {
        if (!this.isPowerOn) return;
        if (this.isMiniGuideOpen) {
            this.closeMiniGuide();
        } else {
            this.openMiniGuide();
        }
    }

    openMiniGuide() {
        window.retroAudio.playBeep('select');
        this.closeGuide();
        this.miniGuideSelectedIndex = this.currentChannelIndex;
        this.updateMiniGuideHighlight();
        this.miniGuide.classList.remove('hidden');
        this.isMiniGuideOpen = true;
    }

    closeMiniGuide() {
        if (!this.isMiniGuideOpen) return;
        window.retroAudio.playBeep('back');
        this.miniGuide.classList.add('hidden');
        this.isMiniGuideOpen = false;
    }

    /**
     * Numeric Keypad Direct Tuning (e.g. typing "2", "9", "4")
     */
    dialDigit(digit) {
        if (!this.isPowerOn) return;
        window.retroAudio.playBeep('nav');

        if (this.dialDigits.length >= 3) {
            this.dialDigits = "";
        }

        this.dialDigits += digit;
        this.osdDialDigits.innerText = this.dialDigits;
        this.osdDial.classList.remove('hidden');

        if (this.dialTimeout) clearTimeout(this.dialTimeout);
        this.dialTimeout = setTimeout(() => {
            this.confirmDial();
        }, 1600);
    }

    confirmDial() {
        if (this.dialTimeout) clearTimeout(this.dialTimeout);
        this.dialTimeout = null;

        if (this.dialDigits.length > 0) {
            const num = parseInt(this.dialDigits, 10);
            this.tuneByNumber(num);
            this.dialDigits = "";
        }

        this.osdDial.classList.add('hidden');
    }

    /**
     * Volume Control (+ / - / Mute)
     */
    adjustVolume(delta) {
        if (!this.isPowerOn) return;
        this.isMuted = false;
        this.volume = Math.max(0, Math.min(1, this.volume + delta));
        window.retroAudio.setVolume(this.volume);
        window.retroAudio.setMute(false);

        // Sync to custom video
        if (this.customVideo) {
            this.customVideo.volume = this.volume;
            this.customVideo.muted = false;
        }

        // Sync to YouTube player
        if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
            try {
                this.ytPlayer.setVolume(Math.round(this.volume * 100));
                if (typeof this.ytPlayer.unMute === 'function') {
                    this.ytPlayer.unMute();
                }
            } catch (e) {}
        }

        this.showVolumeOSD();
        window.retroAudio.playBeep('nav');
    }

    toggleMute() {
        if (!this.isPowerOn) return;
        this.isMuted = !this.isMuted;
        window.retroAudio.setMute(this.isMuted);

        // Sync to custom video
        if (this.customVideo) {
            this.customVideo.muted = this.isMuted;
        }

        // Sync to YouTube player
        if (this.ytPlayer) {
            try {
                if (this.isMuted && typeof this.ytPlayer.mute === 'function') {
                    this.ytPlayer.mute();
                } else if (!this.isMuted && typeof this.ytPlayer.unMute === 'function') {
                    this.ytPlayer.unMute();
                    if (typeof this.ytPlayer.setVolume === 'function') {
                        this.ytPlayer.setVolume(Math.round(this.volume * 100));
                    }
                }
            } catch (e) {}
        }

        this.showVolumeOSD();
        window.retroAudio.playBeep('select');
    }

    showVolumeOSD() {
        const pct = Math.round(this.volume * 100);
        this.volBarFill.style.height = `${pct}%`;
        
        const volIcon = document.getElementById('vol-icon');
        if (this.isMuted || pct === 0) {
            this.volText.innerText = "MUTE";
            this.volText.classList.add('muted');
            if (volIcon) volIcon.src = "icons/volume-zero.png";
            this.volBarFill.style.height = '0%';
        } else {
            this.volText.innerText = `VOL ${pct}%`;
            this.volText.classList.remove('muted');
            if (volIcon) {
                if (pct <= 33) {
                    volIcon.src = "icons/volume-min.png";
                } else if (pct <= 66) {
                    volIcon.src = "icons/volume-med.png";
                } else {
                    volIcon.src = "icons/volume-max.png";
                }
            }
        }

        this.osdVolumeBox.classList.remove('hidden');
        if (this.volumeTimeout) clearTimeout(this.volumeTimeout);
        this.volumeTimeout = setTimeout(() => {
            this.osdVolumeBox.classList.add('hidden');
        }, 2200);
    }

    /**
     * Toggle CRT Shader Layer
     */
    toggleCRT() {
        window.retroAudio.playBeep('select');
        this.isCRTActive = !this.isCRTActive;
        if (this.isCRTActive) {
            this.crtLayer.classList.remove('disabled');
        } else {
            this.crtLayer.classList.add('disabled');
        }
    }

    /**
     * Trigger "Sem Sinal" (No Signal / Chiado) immediately
     */
    triggerSemSinal() {
        window.retroAudio.playBeep('select');
        const staticIdx = this.channels.findIndex(c => c.type === 'static' || c.number === 0 || c.id === '000' || c.number === 404);
        if (staticIdx !== -1) {
            this.tuneChannelByIndex(staticIdx, true);
        }
    }

    /**
     * Alternar Mudo dos Efeitos Sonoros da Interface (SFX)
     */
    toggleSFXMute() {
        const isMuted = window.retroAudio.toggleSFXMute();
        const hintText = document.getElementById('hint-sfx-text');
        if (hintText) {
            hintText.innerText = isMuted ? "SFX: Mudo" : "Mutar SFX";
        }
        if (!isMuted) {
            window.retroAudio.playBeep('select');
        }
    }

    /**
     * Sintonizar canal de número aleatório (Botão Azul)
     */
    tuneRandomChannel() {
        if (!this.isPowerOn || !this.channels || this.channels.length === 0) return;
        let randomIndex = this.currentChannelIndex;
        if (this.channels.length > 1) {
            while (randomIndex === this.currentChannelIndex) {
                randomIndex = Math.floor(Math.random() * this.channels.length);
            }
        }
        window.retroAudio.playBeep('select');
        this.tuneChannelByIndex(randomIndex, true);
    }

    /**
     * Remote Control LED Visual & Blinking Management
     */
    updateLedState() {
        const led = this.rcLed || document.getElementById('rc-led');
        if (!led || this.isLedBlinking) return;

        led.style.transition = 'all 0.2s';
        if (this.isPowerOn) {
            led.style.backgroundColor = '#265bec';
            led.style.boxShadow = '0 0 10px #265bec';
        } else {
            led.style.backgroundColor = '#191921';
            led.style.boxShadow = 'none';
        }
    }

    startLedBlink() {
        const led = this.rcLed || document.getElementById('rc-led');
        if (!led) return;

        this.isLedBlinking = true;
        if (this.ledBlinkInterval) {
            clearInterval(this.ledBlinkInterval);
            this.ledBlinkInterval = null;
        }

        const setBlue = () => {
            led.style.transition = 'none';
            led.style.backgroundColor = '#265bec';
            led.style.boxShadow = '0 0 10px #265bec';
        };

        const setOff = () => {
            led.style.transition = 'none';
            led.style.backgroundColor = '#191921';
            led.style.boxShadow = 'none';
        };

        let isBlue = false;
        if (this.isPowerOn) {
            setOff();
            isBlue = false;
        } else {
            setBlue();
            isBlue = true;
        }

        this.ledBlinkInterval = setInterval(() => {
            if (!this.isLedBlinking) return;
            isBlue = !isBlue;
            if (isBlue) {
                setBlue();
            } else {
                setOff();
            }
        }, 80);
    }

    stopLedBlink() {
        if (this.ledBlinkInterval) {
            clearInterval(this.ledBlinkInterval);
            this.ledBlinkInterval = null;
        }
        this.isLedBlinking = false;

        setTimeout(() => {
            if (!this.isLedBlinking) {
                this.updateLedState();
            }
        }, 0);
    }

    /**
     * Power Toggle (Ligar / Desligar TV)
     */
    togglePower() {
        this.isPowerOn = !this.isPowerOn;
        this.updateLedState();

        if (this.isPowerOn) {
            this.tvCanvas.style.filter = 'none';
            if (this.youtubeContainer) this.youtubeContainer.style.visibility = 'visible';
            if (this.customVideo) this.customVideo.style.visibility = 'visible';
            this.tuneChannelByIndex(this.currentChannelIndex, true);
            this.showBanner(4000);
        } else {
            this.hideLoadingSpinner();
            if (this.channelLoadTimeout) {
                clearTimeout(this.channelLoadTimeout);
                this.channelLoadTimeout = null;
            }
            window.retroAudio.stopStaticNoise();
            window.retroAudio.playBeep('exit');
            this.hideBanner();
            this.closeGuide();
            this.closeMiniGuide();
            this.modalStream.classList.remove('active');

            // Pause media and hide video surfaces
            this.pauseYouTube();
            if (this.customVideo) this.customVideo.pause();
            if (this.youtubeContainer) this.youtubeContainer.style.visibility = 'hidden';
            if (this.customVideo) this.customVideo.style.visibility = 'hidden';

            // Black out canvas
            const ctx = this.tvCanvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, this.tvCanvas.width, this.tvCanvas.height);
            this.tvCanvas.style.filter = 'brightness(0)';
        }
    }

    /**
     * Keyboard Controller
     */
    bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Ignore keybindings if user is typing in input or textarea
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                if (e.key === 'Escape') {
                    this.modalStream.classList.remove('active');
                }
                return;
            }

            // Spacebar: Play / Pause in media mode
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                this.handleOkPress();
                return;
            }

            // Numbers 0-9
            if (e.key >= '0' && e.key <= '9') {
                this.dialDigit(e.key);
                return;
            }

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.handleUpPress();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.handleDownPress();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.handleLeftPress();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.handleRightPress();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.dialDigits.length > 0) {
                        this.confirmDial();
                    } else if (this.isPlaylistModalOpen) {
                        this.confirmPlaylistSelection();
                    } else if (this.isGuideOpen) {
                        this.guideSelectCurrent();
                    } else if (this.isMiniGuideOpen) {
                        this.miniGuideSelectCurrent();
                    } else {
                        this.handleOkPress();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (this.isPlaylistModalOpen) {
                        this.closePlaylistModal();
                    } else if (this.modalStream.classList.contains('active')) {
                        this.modalStream.classList.remove('active');
                    } else if (this.isGuideOpen) {
                        this.closeGuide();
                    } else if (this.isMiniGuideOpen) {
                        this.closeMiniGuide();
                    } else {
                        this.hideBanner();
                    }
                    break;
                case 'k':
                case 'K':
                    if (this.currentMediaMode === 'youtube') {
                        e.preventDefault();
                        this.handleOkPress();
                    }
                    break;
                case 'j':
                case 'J':
                    if (this.currentMediaMode === 'youtube') {
                        e.preventDefault();
                        this.handleLeftPress();
                    }
                    break;
                case 'l':
                case 'L':
                    if (this.currentMediaMode === 'youtube') {
                        e.preventDefault();
                        this.handleRightPress();
                    }
                    break;
                case 'g':
                case 'G':
                    this.toggleGuide();
                    break;
                case 'i':
                case 'I':
                    this.toggleBanner();
                    break;
                case 'm':
                case 'M':
                    this.toggleMiniGuide();
                    break;
                case 'c':
                case 'C':
                    if (this.isGuideOpen) {
                        this.guideMoveVertical(4);
                    } else {
                        this.toggleCRT();
                    }
                    break;
                case 'x':
                case 'X':
                    if (this.isGuideOpen) {
                        this.guideMoveVertical(-4);
                    } else {
                        this.toggleSFXMute();
                    }
                    break;
                case 'r':
                case 'R':
                    if (this.isGuideOpen) {
                        this.closeGuide();
                    } else {
                        this.tuneRandomChannel();
                    }
                    break;
                case 'y':
                case 'Y':
                    if (this.isGuideOpen) {
                        this.handleGuideYellowAction();
                    } else {
                        this.openCustomStreamModal();
                    }
                    break;
                case 'ChannelUp':
                case 'MediaChannelUp':
                    e.preventDefault();
                    this.channelUp();
                    break;
                case 'ChannelDown':
                case 'MediaChannelDown':
                    e.preventDefault();
                    this.channelDown();
                    break;
                case 'PageUp':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveVertical(-4);
                    break;
                case 'PageDown':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveVertical(4);
                    break;
            }
        });
    }

    /**
     * Bind 2000s Satellite Remote Control Panel
     */
    bindRemote() {
        // Remote LED blinking while pressing any remote button
        if (this.remoteControl) {
            this.remoteControl.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                const btn = e.target.closest('button');
                if (!btn || btn.id === 'btn-minimize-remote') return;
                this.startLedBlink();
            });

            const stopRemoteBlink = () => {
                if (this.isLedBlinking) {
                    this.stopLedBlink();
                }
            };

            window.addEventListener('pointerup', stopRemoteBlink);
            window.addEventListener('pointercancel', stopRemoteBlink);
            window.addEventListener('mouseup', stopRemoteBlink);
            window.addEventListener('mouseleave', stopRemoteBlink);
        }

        // Preload power-pressed image
        const preloadPowerPressed = new Image();
        preloadPowerPressed.src = 'icons/power-pressed.png';

        // Power & Mute
        const rcPowerBtn = document.getElementById('rc-power');
        const rcPowerImg = document.getElementById('rc-power-img');

        const setPowerPressed = () => {
            if (rcPowerImg) rcPowerImg.src = 'icons/power-pressed.png';
        };
        const setPowerUnpressed = () => {
            if (rcPowerImg) rcPowerImg.src = 'icons/power-unpressed.png';
        };

        rcPowerBtn.addEventListener('pointerdown', setPowerPressed);
        rcPowerBtn.addEventListener('pointerup', setPowerUnpressed);
        rcPowerBtn.addEventListener('pointercancel', setPowerUnpressed);
        rcPowerBtn.addEventListener('pointerleave', setPowerUnpressed);

        rcPowerBtn.addEventListener('click', () => {
            this.togglePower();
        });
        document.getElementById('rc-mute').addEventListener('click', () => this.toggleMute());

        // Function Row
        document.getElementById('rc-guide').addEventListener('click', () => this.toggleGuide());
        document.getElementById('rc-info').addEventListener('click', () => this.toggleBanner());
        document.getElementById('rc-menu').addEventListener('click', () => this.toggleMiniGuide());
        document.getElementById('rc-exit').addEventListener('click', () => {
            if (this.isPlaylistModalOpen) {
                this.closePlaylistModal();
                return;
            }
            this.closeGuide();
            this.closeMiniGuide();
            this.hideBanner();
        });

        // D-Pad
        document.getElementById('rc-up').addEventListener('click', () => {
            this.handleUpPress();
        });
        document.getElementById('rc-down').addEventListener('click', () => {
            this.handleDownPress();
        });
        document.getElementById('rc-left').addEventListener('click', () => {
            this.handleLeftPress();
        });
        document.getElementById('rc-right').addEventListener('click', () => {
            this.handleRightPress();
        });
        document.getElementById('rc-ok').addEventListener('click', () => {
            if (this.dialDigits.length > 0) this.confirmDial();
            else if (this.isPlaylistModalOpen) this.confirmPlaylistSelection();
            else if (this.isGuideOpen) this.guideSelectCurrent();
            else if (this.isMiniGuideOpen) this.miniGuideSelectCurrent();
            else this.handleOkPress();
        });

        // Rockers
        document.getElementById('rc-vol-up').addEventListener('click', () => this.adjustVolume(0.05));
        document.getElementById('rc-vol-down').addEventListener('click', () => this.adjustVolume(-0.05));
        document.getElementById('rc-ch-up').addEventListener('click', () => this.channelUp());
        document.getElementById('rc-ch-down').addEventListener('click', () => this.channelDown());

        // 4 Color Buttons
        document.getElementById('rc-red').addEventListener('click', () => {
            if (this.isGuideOpen) {
                this.guideMoveVertical(-4);
            } else {
                this.toggleSFXMute();
            }
        });
        document.getElementById('rc-green').addEventListener('click', () => {
            if (this.isGuideOpen) {
                this.guideMoveVertical(4);
            } else {
                this.toggleCRT();
            }
        });
        document.getElementById('rc-yellow').addEventListener('click', () => {
            if (this.isGuideOpen) {
                this.handleGuideYellowAction();
            } else {
                this.openCustomStreamModal();
            }
        });
        document.getElementById('rc-blue').addEventListener('click', () => {
            if (this.isGuideOpen) {
                this.closeGuide();
            } else {
                this.tuneRandomChannel();
            }
        });

        // Numeric Keypad
        document.querySelectorAll('.btn-num[data-num]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.dialDigit(btn.getAttribute('data-num'));
            });
        });

        // FLASH (return to previous channel)
        document.getElementById('rc-prev').addEventListener('click', () => {
            window.retroAudio.playBeep('select');
            this.tuneChannelByIndex(this.prevChannelIndex);
        });

        // ENTER
        document.getElementById('rc-enter').addEventListener('click', () => {
            this.confirmDial();
        });

        // Minimize / Close Remote Button
        const btnMinimize = document.getElementById('btn-minimize-remote');
        if (btnMinimize) {
            btnMinimize.addEventListener('click', () => {
                this.minimizeRemote();
            });
        }
    }

    /**
     * Floating Remote Launcher interactions (auto-hide when idle or mouse leaves screen)
     */
    bindFloatingRemoteLauncher() {
        if (!this.floatingRemoteBtn) return;

        // Hover events: keep launcher visible while hovered
        this.floatingRemoteBtn.addEventListener('mouseenter', () => {
            this.isMouseOverFloatingBtn = true;
            if (this.floatingBtnTimeout) {
                clearTimeout(this.floatingBtnTimeout);
                this.floatingBtnTimeout = null;
            }
            this.showFloatingButton();
        });

        this.floatingRemoteBtn.addEventListener('mouseleave', () => {
            this.isMouseOverFloatingBtn = false;
            this.resetFloatingButtonTimeout();
        });

        // Click launcher button to restore remote
        this.floatingRemoteBtn.addEventListener('click', () => {
            this.restoreRemote();
        });

        // Global activity triggers: mouse movement, pointer move, keydown, touch
        const onUserActivity = () => {
            if (!this.isRemoteMinimized) return;
            this.showFloatingButton();
            this.resetFloatingButtonTimeout();
        };

        window.addEventListener('mousemove', onUserActivity, { passive: true });
        window.addEventListener('pointermove', onUserActivity, { passive: true });
        window.addEventListener('keydown', onUserActivity, { passive: true });
        window.addEventListener('touchstart', onUserActivity, { passive: true });

        // When mouse re-enters the window
        document.addEventListener('mouseenter', () => {
            if (!this.isRemoteMinimized) return;
            this.showFloatingButton();
            this.resetFloatingButtonTimeout();
        });

        // When mouse leaves the window or viewport -> hide immediately unless hovering the button
        document.addEventListener('mouseleave', () => {
            if (!this.isRemoteMinimized || this.isMouseOverFloatingBtn) return;
            if (this.floatingBtnTimeout) {
                clearTimeout(this.floatingBtnTimeout);
                this.floatingBtnTimeout = null;
            }
            this.hideFloatingButton();
        });

        window.addEventListener('mouseout', (e) => {
            if (!this.isRemoteMinimized || this.isMouseOverFloatingBtn) return;
            if (!e.relatedTarget && !e.toElement) {
                if (this.floatingBtnTimeout) {
                    clearTimeout(this.floatingBtnTimeout);
                    this.floatingBtnTimeout = null;
                }
                this.hideFloatingButton();
            }
        });
    }

    minimizeRemote() {
        this.isRemoteMinimized = true;
        this.remoteControl.style.display = 'none';
        this.floatingRemoteBtn.style.display = 'flex';
        requestAnimationFrame(() => {
            this.showFloatingButton();
            this.resetFloatingButtonTimeout();
        });
        if (window.retroAudio) {
            window.retroAudio.playBeep('nav');
        }
    }

    restoreRemote() {
        this.isRemoteMinimized = false;
        if (this.floatingBtnTimeout) {
            clearTimeout(this.floatingBtnTimeout);
            this.floatingBtnTimeout = null;
        }
        this.hideFloatingButton();
        this.floatingRemoteBtn.style.display = 'none';
        this.remoteControl.style.display = 'flex';
        if (window.retroAudio) {
            window.retroAudio.playBeep('select');
        }
    }

    showFloatingButton() {
        if (!this.floatingRemoteBtn) return;
        this.floatingRemoteBtn.classList.remove('hidden');
    }

    hideFloatingButton() {
        if (!this.floatingRemoteBtn) return;
        this.floatingRemoteBtn.classList.add('hidden');
    }

    resetFloatingButtonTimeout() {
        if (this.floatingBtnTimeout) {
            clearTimeout(this.floatingBtnTimeout);
            this.floatingBtnTimeout = null;
        }
        if (!this.isRemoteMinimized || this.isMouseOverFloatingBtn) return;

        // Auto-hide after 3 seconds of inactivity
        this.floatingBtnTimeout = setTimeout(() => {
            if (this.isRemoteMinimized && !this.isMouseOverFloatingBtn) {
                this.hideFloatingButton();
            }
        }, 3000);
    }

    /**
     * OSD Interactive elements & Header hints
     */
    bindOSDInteractions() {
        // Banner hints
        document.getElementById('hint-red-signal').addEventListener('click', () => this.toggleSFXMute());
        document.getElementById('hint-green-crt').addEventListener('click', () => this.toggleCRT());
        document.getElementById('hint-options').addEventListener('click', () => this.openCustomStreamModal());
        document.getElementById('hint-mini-guide').addEventListener('click', () => this.tuneRandomChannel());
        document.getElementById('btn-banner-settings').addEventListener('click', () => this.openCustomStreamModal());

        // Banner click interaction: tune to previewed channel when clicking banner
        const bannerTopRow = document.querySelector('.banner-top-row');
        if (bannerTopRow) {
            bannerTopRow.addEventListener('click', (e) => {
                if (e.target.closest('#btn-banner-settings')) return;
                if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
                    this.handleOkPress();
                }
            });
        }

        // EPG Guide Hints (Page Up, Page Down, Options, Exit)
        document.getElementById('epg-hint-red').addEventListener('click', () => {
            this.guideMoveVertical(-4);
        });
        document.getElementById('epg-hint-green').addEventListener('click', () => {
            this.guideMoveVertical(4);
        });
        document.getElementById('epg-hint-yellow').addEventListener('click', () => {
            this.handleGuideYellowAction();
        });
        document.getElementById('epg-hint-blue').addEventListener('click', () => this.closeGuide());

        // Playlist Modal actions
        if (this.cardPlaylistBr) {
            this.cardPlaylistBr.addEventListener('click', () => {
                this.switchPlaylist('br');
            });
            this.cardPlaylistBr.addEventListener('mouseenter', () => {
                this.setModalSelectedPlaylist('br', false);
            });
        }
        if (this.cardPlaylistUs) {
            this.cardPlaylistUs.addEventListener('click', () => {
                this.switchPlaylist('us');
            });
            this.cardPlaylistUs.addEventListener('mouseenter', () => {
                this.setModalSelectedPlaylist('us', false);
            });
        }
        if (this.btnCancelPlaylist) {
            this.btnCancelPlaylist.addEventListener('click', () => {
                this.closePlaylistModal();
            });
        }
        if (this.btnConfirmPlaylist) {
            this.btnConfirmPlaylist.addEventListener('click', () => {
                this.confirmPlaylistSelection();
            });
        }

        // Custom Stream Modal actions
        const btnCancel = document.getElementById('btn-cancel-stream');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this.modalStream.classList.remove('active');
            });
        }

        const btnClear = document.getElementById('btn-clear-stream');
        const inputUrl = document.getElementById('stream-url-input');
        if (btnClear && inputUrl) {
            btnClear.addEventListener('click', () => {
                inputUrl.value = '';
                inputUrl.focus();
            });
        }

        const handleConfirmLoad = () => {
            if (!inputUrl) return;
            const url = inputUrl.value.trim();
            if (url) {
                this.loadCustomStream(url);
                this.modalStream.classList.remove('active');
            }
        };

        const btnLoad = document.getElementById('btn-load-stream');
        if (btnLoad) {
            btnLoad.addEventListener('click', handleConfirmLoad);
        }

        if (inputUrl) {
            inputUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmLoad();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.modalStream.classList.remove('active');
                }
            });
        }

        // Quick suggestions in modal
        document.querySelectorAll('.btn-quick-tag').forEach(tagBtn => {
            tagBtn.addEventListener('click', () => {
                const url = tagBtn.getAttribute('data-url');
                if (url) {
                    if (inputUrl) inputUrl.value = url;
                    this.loadCustomStream(url);
                    this.modalStream.classList.remove('active');
                }
            });
        });
    }

    /**
     * Retorna o nome da playlist ativa formatado para exibição
     */
    getPlaylistDisplayName() {
        return this.currentPlaylist === 'us' ? 'Playlist: American Channels' : 'Playlist: Canais Brasileiros';
    }

    /**
     * Ação do botão amarelo quando acionado DENTRO da aba Guide
     */
    handleGuideYellowAction() {
        if (!this.isPowerOn) return;
        if (this.isPlaylistModalOpen) {
            // Se o modal já estiver aberto, alterna a seleção
            const next = (this.modalSelectedPlaylist === 'br') ? 'us' : 'br';
            this.setModalSelectedPlaylist(next, true);
        } else {
            this.openPlaylistModal();
        }
    }

    /**
     * Abre o modal Frutiger Aero de seleção de Playlist
     */
    openPlaylistModal() {
        if (!this.isPowerOn || !this.modalPlaylist) return;
        this.isPlaylistModalOpen = true;

        if (window.retroAudio) {
            window.retroAudio.playBeep('select');
        }

        // Sugere a outra playlist para facilitar a troca imediata
        const targetPlaylist = (this.currentPlaylist === 'br') ? 'us' : 'br';
        this.modalSelectedPlaylist = targetPlaylist;

        this.updatePlaylistModalUI();
        this.modalPlaylist.classList.add('active');
    }

    /**
     * Fecha o modal de seleção de Playlist
     */
    closePlaylistModal() {
        if (!this.isPlaylistModalOpen || !this.modalPlaylist) return;
        this.isPlaylistModalOpen = false;

        if (window.retroAudio) {
            window.retroAudio.playBeep('back');
        }

        this.modalPlaylist.classList.remove('active');
    }

    /**
     * Atualiza o estado visual das opções do modal de playlist
     */
    updatePlaylistModalUI() {
        const updateCard = (card, playlistKey) => {
            if (!card) return;
            const isCurrent = (this.currentPlaylist === playlistKey);
            const isFocused = (this.modalSelectedPlaylist === playlistKey);

            card.classList.toggle('is-current', isCurrent);
            card.classList.toggle('focused', isFocused);

            const currentTag = card.querySelector('.playlist-current-tag');
            if (currentTag) {
                currentTag.style.display = isCurrent ? 'inline-flex' : 'none';
            }

            const badge = card.querySelector('.playlist-action-badge');
            if (badge) {
                if (isCurrent) {
                    badge.innerText = isFocused ? 'ATUAL ✓' : 'SINTONIZADO';
                    badge.className = 'playlist-action-badge badge-current';
                } else {
                    badge.innerText = isFocused ? 'SINTONIZAR ▶' : 'SELECIONAR';
                    badge.className = isFocused ? 'playlist-action-badge badge-select-active' : 'playlist-action-badge badge-select-idle';
                }
            }
        };

        updateCard(this.cardPlaylistBr, 'br');
        updateCard(this.cardPlaylistUs, 'us');

        if (this.btnConfirmPlaylist) {
            const targetName = (this.modalSelectedPlaylist === 'us') ? 'American Channels (EUA)' : 'Canais Brasileiros (BR)';
            if (this.modalSelectedPlaylist === this.currentPlaylist) {
                this.btnConfirmPlaylist.innerText = `Permanecer em ${this.modalSelectedPlaylist === 'us' ? 'American Channels' : 'Canais Brasileiros'}`;
            } else {
                this.btnConfirmPlaylist.innerText = `Sintonizar ${targetName}`;
            }
        }
    }

    /**
     * Altera o item focado no modal de playlist
     */
    setModalSelectedPlaylist(playlistId, playSound = true) {
        if (playlistId !== 'br' && playlistId !== 'us') return;
        this.modalSelectedPlaylist = playlistId;
        this.updatePlaylistModalUI();
        if (playSound && window.retroAudio) {
            window.retroAudio.playBeep('nav');
        }
    }

    /**
     * Navegação com D-pad / teclado dentro do modal de playlist
     */
    movePlaylistModalSelection(delta) {
        const next = (this.modalSelectedPlaylist === 'br') ? 'us' : 'br';
        this.setModalSelectedPlaylist(next, true);
    }

    /**
     * Confirmação da seleção do modal de playlist (botão OK / Enter)
     */
    confirmPlaylistSelection() {
        if (!this.modalSelectedPlaylist) return;
        this.switchPlaylist(this.modalSelectedPlaylist);
    }

    /**
     * Troca a playlist de canais (Brasil ou EUA) e atualiza todo o sistema
     */
    async switchPlaylist(newPlaylist) {
        if (newPlaylist !== 'br' && newPlaylist !== 'us') return;

        // Se já está na mesma playlist e tem canais carregados, apenas fecha
        if (this.currentPlaylist === newPlaylist && this.channels.length > 1) {
            this.closePlaylistModal();
            return;
        }

        this.currentPlaylist = newPlaylist;
        this.closePlaylistModal();

        if (window.retroAudio) {
            window.retroAudio.playBeep('select');
        }

        const displayName = this.getPlaylistDisplayName();

        // OSD Feedback
        this.showMediaOSD(newPlaylist === 'us' ? '🇺🇸' : '🇧🇷', displayName.toUpperCase());

        // Atualiza tag no Guia EPG
        if (this.epgChannelsFilter) {
            this.epgChannelsFilter.innerText = displayName;
        }

        // Troca instantânea se tiver em cache
        if (this.playlistCache && this.playlistCache[newPlaylist]) {
            const staticCh = window.CHANNEL_000_STATIC || this.channels[0];
            this.channels = [staticCh, ...this.playlistCache[newPlaylist]];
            window.CHANNELS_DATA = this.channels;
            this.buildEPGGrid();
            this.buildMiniGuide();
            this.tuneChannelByIndex(1, true);
            this.updateBannerForChannel(this.currentChannelIndex);
            if (this.isGuideOpen) {
                this.guideSelectedChannelIndex = 1;
                this.updateEPGSelection();
            }
            this.showBanner(4500);
        }

        // Sincroniza via API
        await this.syncWithApi(newPlaylist, true);
        this.updateBannerForChannel(this.currentChannelIndex);
        this.showBanner(4500);
    }

    /**
     * Open custom IPTV / Video / YouTube modal
     */
    openCustomStreamModal() {
        window.retroAudio.playBeep('select');
        this.modalStream.classList.add('active');
        const inputUrl = document.getElementById('stream-url-input');
        if (inputUrl) {
            setTimeout(() => {
                inputUrl.focus();
                inputUrl.select();
            }, 50);
        }
    }

    /**
     * Extract 11-char YouTube Video ID from any YouTube URL
     */
    extractYouTubeVideoId(url) {
        if (!url) return null;
        url = url.trim();

        // Direct 11-char ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }

        // Standard YouTube URL formats
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Called when YouTube IFrame API is loaded
     */
    onYouTubeAPIReady() {
        this.isYTReady = true;
        if (this.pendingYouTubeId) {
            const vid = this.pendingYouTubeId;
            this.pendingYouTubeId = null;
            this.loadYouTube(vid);
        }
    }

    /**
     * Initialize YouTube Player IFrame instance
     */
    initYouTubePlayer(videoId) {
        if (!window.YT || !window.YT.Player) {
            this.pendingYouTubeId = videoId;
            return;
        }

        if (this.youtubeContainer) {
            this.youtubeContainer.style.display = 'block';
        }

        this.ytPlayer = new YT.Player('youtube-player', {
            width: '100%',
            height: '100%',
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 1,
                enablejsapi: 1,
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                iv_load_policy: 3
            },
            events: {
                onReady: (e) => {
                    this.isYTReady = true;
                    this.syncYouTubeVolume();
                    e.target.playVideo();
                    this.updateYouTubeMetadata();
                },
                onStateChange: (e) => {
                    this.onYouTubeStateChange(e);
                },
                onError: (e) => {
                    this.onYouTubeError(e);
                }
            }
        });
    }

    /**
     * Load and embed a YouTube Video
     */
    loadYouTube(videoId) {
        this.currentMediaMode = 'youtube';
        this.activeYouTubeId = videoId;

        // Hide canvas and pause custom video
        this.tvCanvas.style.display = 'none';
        window.retroAudio.stopStaticNoise();
        if (this.customVideo) {
            this.customVideo.pause();
            this.customVideo.style.display = 'none';
        }

        if (this.youtubeContainer) {
            this.youtubeContainer.style.display = 'block';
        }

        if (this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
            this.ytPlayer.loadVideoById(videoId);
            this.ytPlayer.playVideo();
            this.syncYouTubeVolume();
            this.updateYouTubeMetadata();
        } else {
            this.initYouTubePlayer(videoId);
        }

        // Register or update Channel 999 for YouTube
        this.registerOrUpdateChannel({
            id: "999",
            number: 999,
            code: "YOUTUBE",
            name: "YouTube HD",
            title: "Carregando YouTube...",
            timeSlot: "Vídeo On-Demand",
            language: "Stereo HD",
            rating: "TV-PG",
            category: "Vídeo Online",
            description: "Transmissão reproduzida via YouTube Embed. Use o controle remoto (OK: Play/Pause, ◀/▶: -/+10s, VOL: Volume, EXIT: Voltar).",
            type: "youtube",
            youtubeId: videoId
        });

        const chIdx = this.channels.findIndex(c => c.id === "999" || c.number === 999);
        if (chIdx !== -1) {
            this.currentChannelIndex = chIdx;
            this.bannerBrowsingIndex = chIdx;
            this.updateMiniGuideHighlight();
        }

        // Fetch oEmbed title & author for immediate banner display
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.title) {
                    this.updateYouTubeMetadata(data.title, data.author_name);
                }
            })
            .catch(() => {});

        this.updateBannerForChannel(this.currentChannelIndex);
        this.showBanner(5000);
        this.showMediaOSD('▶', 'YOUTUBE CONECTADO');
    }

    onYouTubeStateChange(e) {
        if (e.data === 1) { // PLAYING
            this.hideLoadingSpinner();
            if (!this.isPowerOn) {
                this.pauseYouTube();
                return;
            }
            this.updateYouTubeMetadata();
        } else if (e.data === 3) { // BUFFERING
            if (this.currentMediaMode === 'youtube') {
                this.showLoadingSpinner();
            }
        } else if (e.data === 0) { // ENDED
            this.showMediaOSD('⏹', 'VÍDEO CONCLUÍDO');
        }
    }

    onYouTubeError(e) {
        console.warn('YouTube Player error code:', e.data);
        this.displayNoSignalContent();
    }

    updateYouTubeMetadata(customTitle, customAuthor) {
        let title = customTitle;
        let author = customAuthor;

        if (this.ytPlayer && typeof this.ytPlayer.getVideoData === 'function') {
            try {
                const data = this.ytPlayer.getVideoData();
                if (data) {
                    if (!title && data.title) title = data.title;
                    if (!author && data.author) author = data.author;
                }
            } catch (e) {}
        }

        if (!title && this.activeYouTubeId) {
            title = `YouTube: ${this.activeYouTubeId}`;
        }

        let durStr = "Vídeo On-Demand";
        if (this.ytPlayer && typeof this.ytPlayer.getDuration === 'function') {
            try {
                const dur = this.ytPlayer.getDuration();
                const cur = this.ytPlayer.getCurrentTime();
                if (dur > 0) {
                    durStr = `${this.formatDuration(cur)} / ${this.formatDuration(dur)}`;
                }
            } catch (e) {}
        }

        // Update in channels list
        const ch = this.channels.find(c => c.type === 'youtube' || c.id === '999');
        if (ch) {
            if (title) ch.title = title;
            if (author) ch.language = author;
            if (durStr) ch.timeSlot = durStr;
            this.buildMiniGuide();
        }

        if (this.currentMediaMode === 'youtube' && this.channels[this.currentChannelIndex]?.type === 'youtube') {
            const elTitle = document.getElementById('banner-prog-title');
            const elCode = document.getElementById('banner-ch-code');
            const elLang = document.getElementById('banner-lang');
            const elTimeslot = document.getElementById('banner-timeslot');
            const elFavTag = document.getElementById('banner-favorites-tag');

            if (elTitle && title) elTitle.innerText = title;
            if (elCode) elCode.innerText = "YOUTUBE";
            if (elLang && author) elLang.innerText = author;
            if (elTimeslot && durStr) elTimeslot.innerText = durStr;
            if (elFavTag) {
                elFavTag.innerHTML = `<span>YouTube • [OK] Play/Pause • [◀/▶] -/+10s • [VOL] Volume</span>`;
            }
        }
    }

    formatDuration(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s}`;
        }
        return `${m}:${s}`;
    }

    registerOrUpdateChannel(newChannel) {
        const existingIdx = this.channels.findIndex(c => c.id === newChannel.id || c.number === newChannel.number);
        if (existingIdx !== -1) {
            this.channels[existingIdx] = Object.assign(this.channels[existingIdx], newChannel);
        } else {
            this.channels.push(newChannel);
        }
        this.buildEPGGrid();
        this.buildMiniGuide();
    }

    showMediaOSD(icon, text) {
        const badge = this.osdMediaBadge || document.getElementById('osd-media-badge');
        const iconEl = this.osdMediaIcon || document.getElementById('osd-media-icon');
        const textEl = this.osdMediaText || document.getElementById('osd-media-text');
        if (!badge || !iconEl || !textEl) return;

        iconEl.innerText = icon;
        textEl.innerText = text;
        badge.classList.remove('hidden');

        if (this.mediaOSDTimeout) clearTimeout(this.mediaOSDTimeout);
        this.mediaOSDTimeout = setTimeout(() => {
            badge.classList.add('hidden');
        }, 1800);
    }

    toggleYouTubePlayPause() {
        if (!this.ytPlayer || typeof this.ytPlayer.getPlayerState !== 'function') return;
        const state = this.ytPlayer.getPlayerState();
        if (state === 1) { // PLAYING
            this.ytPlayer.pauseVideo();
            this.showMediaOSD('❚❚', 'PAUSADO');
            if (window.retroAudio) window.retroAudio.playBeep('nav');
        } else {
            this.ytPlayer.playVideo();
            this.showMediaOSD('▶', 'REPRODUZINDO');
            if (window.retroAudio) window.retroAudio.playBeep('select');
        }
        this.updateYouTubeMetadata();
    }

    toggleCustomVideoPlayPause() {
        if (!this.customVideo) return;
        if (this.customVideo.paused) {
            this.customVideo.play().catch(() => {});
            this.showMediaOSD('▶', 'REPRODUZINDO');
            if (window.retroAudio) window.retroAudio.playBeep('select');
        } else {
            this.customVideo.pause();
            this.showMediaOSD('❚❚', 'PAUSADO');
            if (window.retroAudio) window.retroAudio.playBeep('nav');
        }
    }

    seekYouTube(deltaSeconds) {
        if (!this.ytPlayer || typeof this.ytPlayer.getCurrentTime !== 'function') return;
        const cur = this.ytPlayer.getCurrentTime() || 0;
        const dur = this.ytPlayer.getDuration() || 0;
        const target = Math.max(0, Math.min(dur || Infinity, cur + deltaSeconds));
        this.ytPlayer.seekTo(target, true);

        const sign = deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`;
        const icon = deltaSeconds > 0 ? '⏩' : '⏪';
        const timeStr = this.formatDuration(target);
        this.showMediaOSD(icon, `${sign} (${timeStr})`);
        if (window.retroAudio) window.retroAudio.playBeep('nav');
        this.updateYouTubeMetadata();
    }

    seekCustomVideo(deltaSeconds) {
        if (!this.customVideo) return;
        const cur = this.customVideo.currentTime || 0;
        const dur = this.customVideo.duration || 0;
        const target = Math.max(0, Math.min(dur || Infinity, cur + deltaSeconds));
        this.customVideo.currentTime = target;

        const sign = deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`;
        const icon = deltaSeconds > 0 ? '⏩' : '⏪';
        const timeStr = this.formatDuration(target);
        this.showMediaOSD(icon, `${sign} (${timeStr})`);
        if (window.retroAudio) window.retroAudio.playBeep('nav');
    }

    pauseYouTube() {
        if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
            try { this.ytPlayer.pauseVideo(); } catch (e) {}
        }
    }

    playYouTube() {
        if (this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
            try {
                this.ytPlayer.playVideo();
                this.syncYouTubeVolume();
            } catch (e) {}
        }
    }

    syncYouTubeVolume() {
        if (!this.ytPlayer) return;
        try {
            if (this.isMuted) {
                if (typeof this.ytPlayer.mute === 'function') this.ytPlayer.mute();
            } else {
                if (typeof this.ytPlayer.unMute === 'function') this.ytPlayer.unMute();
                if (typeof this.ytPlayer.setVolume === 'function') {
                    this.ytPlayer.setVolume(Math.round(this.volume * 100));
                }
            }
        } catch (e) {}
    }

    /**
     * Unified custom stream loader (.mp4, .m3u8, or YouTube)
     */
    loadCustomStream(url) {
        if (!url) return;
        url = url.trim();

        // 1. Check if YouTube link
        const ytId = this.extractYouTubeVideoId(url);
        if (ytId) {
            this.loadYouTube(ytId);
            return;
        }

        // 2. Otherwise load as video (.mp4, .m3u8, .webm)
        if (!this.customVideo) return;

        this.currentMediaMode = 'tv';
        this.pauseYouTube();
        if (this.youtubeContainer) {
            this.youtubeContainer.style.display = 'none';
        }

        this.tvCanvas.style.display = 'none';
        window.retroAudio.stopStaticNoise();

        this.showLoadingSpinner();
        this.customVideo.onplaying = () => {
            this.hideLoadingSpinner();
        };
        this.customVideo.onerror = () => {
            this.displayNoSignalContent();
        };

        // Check if HLS stream (.m3u8)
        if (url.includes('.m3u8')) {
            if (window.Hls && Hls.isSupported()) {
                if (this.hls) {
                    this.hls.destroy();
                    this.hls = null;
                }
                this.hls = new Hls();
                this.hls.loadSource(url);
                this.hls.attachMedia(this.customVideo);
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.customVideo.play().catch(() => {});
                });
                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.displayNoSignalContent();
                    }
                });
            } else if (this.customVideo.canPlayType('application/vnd.apple.mpegurl')) {
                this.customVideo.src = url;
                this.customVideo.play().catch(() => {});
            } else {
                this.customVideo.src = url;
                this.customVideo.play().catch(() => {});
            }
        } else {
            if (this.hls) {
                this.hls.destroy();
                this.hls = null;
            }
            this.customVideo.src = url;
            this.customVideo.play().catch(e => {
                console.warn('[Custom Video Error]', e);
                this.displayNoSignalContent();
            });
        }

        this.customVideo.style.display = 'block';
        this.customVideo.volume = this.volume;
        this.customVideo.muted = this.isMuted;

        // Register Channel 998 for custom stream
        this.registerOrUpdateChannel({
            id: "998",
            number: 998,
            code: "IPTV-STREAM",
            name: "Custom Stream",
            title: "Transmissão Personalizada IPTV",
            timeSlot: "Live Stream",
            language: "Digital Audio",
            rating: "TV-PG",
            category: "IPTV / Stream",
            description: "Stream externo carregado via URL direta. Use o controle remoto (OK: Play/Pause, ◀/▶: -/+10s, VOL: Volume, EXIT: Voltar).",
            type: "custom",
            streamUrl: url
        });

        const chIdx = this.channels.findIndex(c => c.id === "998" || c.number === 998);
        if (chIdx !== -1) {
            this.currentChannelIndex = chIdx;
            this.bannerBrowsingIndex = chIdx;
            this.updateMiniGuideHighlight();
        }

        this.updateBannerForChannel(this.currentChannelIndex);
        this.showBanner(5000);
        this.showMediaOSD('▶', 'STREAM SINTONIZADO');
    }

    /**
     * Mobile & Touch gestures
     */
    bindTouchControls() {
        let touchStartY = 0;
        let touchStartX = 0;

        this.tvCanvas.parentElement.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        this.tvCanvas.parentElement.addEventListener('touchend', (e) => {
            const diffY = touchStartY - e.changedTouches[0].clientY;
            const diffX = touchStartX - e.changedTouches[0].clientX;

            if (Math.abs(diffY) > 50 && Math.abs(diffY) > Math.abs(diffX)) {
                if (diffY > 0) this.handleUpPress();
                else this.handleDownPress();
            } else if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) this.handleRightPress();
                else this.handleLeftPress();
            } else if (Math.abs(diffY) < 15 && Math.abs(diffX) < 15) {
                // Short tap -> OK action (open banner, tune or hide)
                this.handleOkPress();
            }
        });
    }

    /**
     * Sincronização em tempo real com a API de IPTV na porta 1414
     * Todos os canais de transmissão são servidos EXCLUSIVAMENTE via API.
     */
    async syncWithApi(playlistOverride = null, forceTuneFirst = false) {
        if (playlistOverride) {
            this.currentPlaylist = playlistOverride;
        }
        const country = this.currentPlaylist; // 'br' or 'us'
        const endpoint = (country === 'us') ? '/api/channels/us' : '/api/channels/br';

        try {
            const res = await fetch(`${this.apiBaseUrl}${endpoint}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && Array.isArray(data.channels) && data.channels.length > 0) {
                console.log(`[API] ${data.channels.length} canais (${country.toUpperCase()}) carregados com sucesso da API!`);
                const staticCh = window.CHANNEL_000_STATIC || this.channels[0];
                const transformed = data.channels.map((ch, idx) => {
                    return window.transformApiChannel ? window.transformApiChannel(ch, idx + 1) : ch;
                });

                if (!this.playlistCache) this.playlistCache = {};
                this.playlistCache[country] = transformed;

                const wasOnStatic = (this.currentChannelIndex === 0);
                this.channels = [staticCh, ...transformed];
                window.CHANNELS_DATA = this.channels;

                // Reconstroi o Guia EPG e o Mini Guia com os canais e EPG em tempo real da API
                this.buildEPGGrid();
                this.buildMiniGuide();

                // Atualiza tag da playlist no Guia EPG
                if (this.epgChannelsFilter) {
                    this.epgChannelsFilter.innerText = this.getPlaylistDisplayName();
                }

                // Sintoniza ou atualiza
                if (forceTuneFirst || (wasOnStatic && this.channels.length > 1)) {
                    this.tuneChannelByIndex(1, forceTuneFirst);
                } else {
                    if (this.currentChannelIndex >= this.channels.length) {
                        this.currentChannelIndex = 1;
                    }
                    this.updateBannerForChannel(this.currentChannelIndex);
                }

                if (this.isGuideOpen) {
                    this.guideSelectedChannelIndex = Math.min(this.guideSelectedChannelIndex, this.channels.length - 1);
                    if (this.guideSelectedChannelIndex <= 0 && this.channels.length > 1) {
                        this.guideSelectedChannelIndex = 1;
                    }
                    this.updateEPGSelection();
                }

                if (this._syncRetryTimeout) {
                    clearTimeout(this._syncRetryTimeout);
                    this._syncRetryTimeout = null;
                }
            }
        } catch (err) {
            console.warn(`[API] Conexão com a API na porta 1414 (${endpoint}) pendente ou offline. Aguardando servidor API:`, err.message);
            if (this.playlistCache && this.playlistCache[country]) {
                const staticCh = window.CHANNEL_000_STATIC || this.channels[0];
                this.channels = [staticCh, ...this.playlistCache[country]];
                window.CHANNELS_DATA = this.channels;
                this.buildEPGGrid();
                this.buildMiniGuide();
                if (forceTuneFirst) this.tuneChannelByIndex(1, true);
                else this.updateBannerForChannel(this.currentChannelIndex);
            }
            if (this._syncRetryTimeout) clearTimeout(this._syncRetryTimeout);
            this._syncRetryTimeout = setTimeout(() => this.syncWithApi(), 3000);
        }
    }

    /**
     * Atualização periódica da grade EPG em tempo real
     */
    async refreshEPG() {
        try {
            const res = await fetch(`${this.apiBaseUrl}/api/epg/live`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && Array.isArray(data.live)) {
                let changed = false;
                data.live.forEach(liveItem => {
                    const ch = this.channels.find(c => c.slug === liveItem.channelId);
                    if (ch && liveItem.now) {
                        ch.title = liveItem.now.title || ch.title;
                        ch.description = liveItem.now.description || ch.description;
                        if (liveItem.now.start && liveItem.now.stop && window.formatTimeSlot) {
                            ch.timeSlot = window.formatTimeSlot(liveItem.now.start, liveItem.now.stop);
                        }
                        if (ch.schedule && ch.schedule[0]) {
                            ch.schedule[0].title = liveItem.now.title;
                            ch.schedule[0].description = liveItem.now.description || ch.description;
                            if (liveItem.now.start && window.formatTime12) {
                                ch.schedule[0].time = window.formatTime12(liveItem.now.start);
                            }
                        }
                        if (liveItem.next && ch.schedule && ch.schedule[1]) {
                            ch.schedule[1].title = liveItem.next.title;
                            ch.schedule[1].description = liveItem.next.description || '';
                        }
                        changed = true;
                    }
                });

                if (changed) {
                    this.updateBannerForChannel(this.currentChannelIndex);
                    if (this.isGuideOpen) {
                        this.updateEPGSelection();
                    }
                }
            }
        } catch (e) {
            // Silencioso se API offline ou ocupada
        }
    }
}

// Global YouTube IFrame API Ready Callback
window.onYouTubeIframeAPIReady = function() {
    window.isYouTubeIframeAPIReady = true;
    if (window.tvApp && typeof window.tvApp.onYouTubeAPIReady === 'function') {
        window.tvApp.onYouTubeAPIReady();
    }
};

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.tvApp = new RetroTVController();
});
