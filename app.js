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

        // Media & YouTube Player State
        this.currentMediaMode = 'canvas'; // 'canvas' | 'video' | 'youtube'
        this.ytPlayer = null;
        this.isYTReady = false;
        this.activeYouTubeId = null;
        this.pendingYouTubeId = null;
        this.mediaOSDTimeout = null;
        this.hls = null;

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

    init() {
        // Build initial EPG Grid & Mini Guide
        this.buildEPGGrid();
        this.buildMiniGuide();

        // Tune to first channel (001 ARP-TV)
        this.tuneChannelByIndex(0, false);
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

        // Sound effect
        if (playAudio) {
            window.retroAudio.playChannelSwitch();
        }

        // Check if youtube, custom video, or procedural canvas feed
        if (ch.type === 'youtube') {
            this.currentMediaMode = 'youtube';
            this.tvCanvas.style.display = 'none';
            if (this.customVideo) {
                this.customVideo.pause();
                this.customVideo.style.display = 'none';
            }
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'block';
            }
            this.playYouTube();
        } else if (ch.type === 'custom' && this.customVideo && this.customVideo.src) {
            this.currentMediaMode = 'video';
            this.pauseYouTube();
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'none';
            }
            this.tvCanvas.style.display = 'none';
            this.customVideo.style.display = 'block';
            this.customVideo.play().catch(() => {});
        } else {
            this.currentMediaMode = 'canvas';
            this.pauseYouTube();
            if (this.youtubeContainer) {
                this.youtubeContainer.style.display = 'none';
            }
            if (this.customVideo) {
                this.customVideo.pause();
                this.customVideo.style.display = 'none';
            }
            this.tvCanvas.style.display = 'block';
            this.tvFeed.setChannelType(ch.type);
            this.pipFeed.setChannelType(ch.type);
        }

        // Handle "Sem Sinal" (Static) Audio
        if (ch.type === 'static' || ch.number === 404) {
            window.retroAudio.startStaticNoise();
        } else {
            window.retroAudio.stopStaticNoise();
        }

        // Update Top Banner Elements
        this.updateBannerForChannel(this.currentChannelIndex);

        // Show Info Banner
        this.showBanner(4500);

        // Update active class in Mini Guide
        this.updateMiniGuideHighlight();

        // Update EPG PIP feed
        this.pipFeed.setChannelType(ch.type);
    }

    /**
     * Tune directly by channel numeric code (e.g. 294)
     */
    tuneByNumber(num) {
        const targetIndex = this.channels.findIndex(c => c.number === num || parseInt(c.id, 10) === num);
        if (targetIndex !== -1) {
            this.tuneChannelByIndex(targetIndex, true);
        } else {
            // Channel not found -> Tune to Static / Sem Sinal
            const staticIdx = this.channels.findIndex(c => c.type === 'static');
            if (staticIdx !== -1) {
                this.tuneChannelByIndex(staticIdx, true);
            }
        }
    }

    /**
     * Channel Up / Down
     */
    channelUp() {
        if (this.isGuideOpen) {
            this.guideMoveVertical(-1);
        } else {
            this.tuneChannelByIndex(this.currentChannelIndex + 1);
        }
    }

    channelDown() {
        if (this.isGuideOpen) {
            this.guideMoveVertical(1);
        } else {
            this.tuneChannelByIndex(this.currentChannelIndex - 1);
        }
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
        if (elCode) elCode.innerText = ch.code;
        if (elTitle) elTitle.innerText = ch.title;
        if (elLang) elLang.innerText = ch.language || 'English';
        if (elTimeslot) elTimeslot.innerText = ch.timeSlot || '';
        if (elRating) elRating.innerText = ch.rating || 'NONE';

        if (elFavTag) {
            if (index !== this.currentChannelIndex) {
                elFavTag.innerHTML = `<span>Favorites List: Channels</span> <span class="banner-tune-hint">• Pressione OK para assistir</span>`;
            } else {
                elFavTag.innerHTML = `<span>Favorites List: Channels</span>`;
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
        if (this.isGuideOpen) {
            this.guideMoveVertical(-1);
        } else if (this.isMiniGuideOpen) {
            this.channelDown(); // Visualmente sobe na lista do Mini Guide (índice anterior)
        } else {
            this.adjustVolume(0.05);
        }
    }

    /**
     * Handle Down navigation (D-pad & keyboard arrow)
     */
    handleDownPress() {
        if (this.isGuideOpen) {
            this.guideMoveVertical(1);
        } else if (this.isMiniGuideOpen) {
            this.channelUp(); // Visualmente desce na lista do Mini Guide (próximo índice)
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
        } else if (this.currentMediaMode === 'video') {
            this.seekCustomVideo(-10);
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
        } else if (this.currentMediaMode === 'video') {
            this.seekCustomVideo(10);
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

        // In media mode (YouTube or Custom Video), OK toggles Play / Pause unless user is actively browsing another channel in the banner
        if (this.currentMediaMode === 'youtube') {
            if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
                this.tuneChannelByIndex(this.bannerBrowsingIndex, true);
                return;
            }
            this.toggleYouTubePlayPause();
            return;
        }

        if (this.currentMediaMode === 'video') {
            if (this.isBannerVisible && this.bannerBrowsingIndex !== this.currentChannelIndex) {
                this.tuneChannelByIndex(this.bannerBrowsingIndex, true);
                return;
            }
            this.toggleCustomVideoPlayPause();
            return;
        }

        // Standard TV channel behavior
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
        this.guideSelectedSlotIndex = 1;
        this.updateEPGSelection();

        this.epgGuide.classList.remove('hidden');
        this.isGuideOpen = true;

        // Ensure PIP feed runs
        const ch = this.channels[this.currentChannelIndex];
        this.pipFeed.resize();
        this.pipFeed.setChannelType(ch.type);
    }

    closeGuide() {
        if (!this.isGuideOpen) return;
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
        rowsContainer.innerHTML = '';

        this.channels.forEach((ch, chIdx) => {
            const row = document.createElement('div');
            row.className = 'epg-row';
            row.id = `epg-row-${chIdx}`;

            // Channel Label Cell (left)
            const chCell = document.createElement('div');
            chCell.className = 'epg-channel-cell';
            chCell.innerHTML = `
                <span class="cell-ch-num">${ch.id}</span>
                <span>${ch.code}</span>
            `;
            chCell.addEventListener('click', () => {
                this.guideSelectedChannelIndex = chIdx;
                this.tuneChannelByIndex(chIdx);
                this.closeGuide();
            });
            row.appendChild(chCell);

            // Programs Track (right)
            const progTrack = document.createElement('div');
            progTrack.className = 'epg-programs-track';

            // Generate 3 schedule program slots for timeline
            const schedule = ch.schedule || [
                { title: ch.title, time: "5:00a" },
                { title: ch.title, time: "5:30a" },
                { title: ch.title, time: "6:00a" }
            ];

            schedule.slice(0, 3).forEach((item, slotIdx) => {
                const block = document.createElement('div');
                block.className = 'epg-program-block';
                block.id = `epg-block-${chIdx}-${slotIdx}`;
                
                // Add retro < or > overflow markers
                const prefix = slotIdx === 0 ? '< ' : '';
                const suffix = slotIdx === 2 ? ' >' : '';
                block.innerHTML = `
                    <span>${prefix}${item.title}</span>
                    <span class="epg-program-arrow">${suffix}</span>
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

            row.appendChild(progTrack);
            rowsContainer.appendChild(row);
        });
    }

    /**
     * Update Guide Highlight Cursor and Details Header
     */
    updateEPGSelection() {
        // Clear previous selected elements
        document.querySelectorAll('.epg-row.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.epg-program-block.selected').forEach(el => el.classList.remove('selected'));

        const row = document.getElementById(`epg-row-${this.guideSelectedChannelIndex}`);
        const block = document.getElementById(`epg-block-${this.guideSelectedChannelIndex}-${this.guideSelectedSlotIndex}`);

        if (row) {
            row.classList.add('selected');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        if (block) {
            block.classList.add('selected');
        }

        // Update Guide Header Synopsis and Details based on selection
        const ch = this.channels[this.guideSelectedChannelIndex];
        if (ch) {
            const headlineEl = document.getElementById('epg-headline-text');
            const synopsisEl = document.getElementById('epg-synopsis-text');
            const timeslotEl = document.getElementById('epg-timeslot');
            const ratingEl = document.getElementById('epg-rating');

            if (headlineEl) headlineEl.innerText = ch.name ? `${ch.name.toUpperCase()} (2009)` : ch.title;
            if (synopsisEl) synopsisEl.innerText = ch.description;
            if (timeslotEl) timeslotEl.innerText = ch.timeSlot;
            if (ratingEl) ratingEl.innerText = ch.rating;

            // Live preview in PIP box
            this.pipFeed.setChannelType(ch.type);
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
            // Single step up / down
            this.guideSelectedChannelIndex += delta;
            if (this.guideSelectedChannelIndex < 0) this.guideSelectedChannelIndex = this.channels.length - 1;
            if (this.guideSelectedChannelIndex >= this.channels.length) this.guideSelectedChannelIndex = 0;
        }
        this.updateEPGSelection();
    }

    guideMoveHorizontal(delta) {
        window.retroAudio.playBeep('nav');
        this.guideSelectedSlotIndex += delta;
        if (this.guideSelectedSlotIndex < 0) this.guideSelectedSlotIndex = 0;
        if (this.guideSelectedSlotIndex > 2) this.guideSelectedSlotIndex = 2;
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
        list.innerHTML = '';

        this.channels.forEach((ch, idx) => {
            const item = document.createElement('div');
            item.className = 'mini-guide-item';
            item.id = `mini-guide-item-${idx}`;

            item.innerHTML = `
                <div class="mini-guide-ch-left">
                    <span class="mini-guide-num">${ch.id}</span>
                    <span class="mini-guide-title">${ch.code}</span>
                </div>
                <div class="mini-guide-prog">${ch.title}</div>
            `;

            item.addEventListener('click', () => {
                this.tuneChannelByIndex(idx);
                this.closeMiniGuide();
            });

            list.appendChild(item);
        });

        this.updateMiniGuideHighlight();
    }

    updateMiniGuideHighlight() {
        document.querySelectorAll('.mini-guide-item.active').forEach(el => el.classList.remove('active'));
        const activeItem = document.getElementById(`mini-guide-item-${this.currentChannelIndex}`);
        if (activeItem) {
            activeItem.classList.add('active');
            activeItem.scrollIntoView({ block: 'nearest' });
        }
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
        const staticIdx = this.channels.findIndex(c => c.type === 'static' || c.number === 404);
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
                    } else if (this.isGuideOpen) {
                        this.guideSelectCurrent();
                    } else {
                        this.handleOkPress();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (this.modalStream.classList.contains('active')) {
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
                    if (this.currentMediaMode === 'youtube' || this.currentMediaMode === 'video') {
                        e.preventDefault();
                        this.handleOkPress();
                    }
                    break;
                case 'j':
                case 'J':
                    if (this.currentMediaMode === 'youtube' || this.currentMediaMode === 'video') {
                        e.preventDefault();
                        this.handleLeftPress();
                    }
                    break;
                case 'l':
                case 'L':
                    if (this.currentMediaMode === 'youtube' || this.currentMediaMode === 'video') {
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
            else if (this.isGuideOpen) this.guideSelectCurrent();
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
            this.openCustomStreamModal();
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
        document.getElementById('epg-hint-yellow').addEventListener('click', () => this.openCustomStreamModal());
        document.getElementById('epg-hint-blue').addEventListener('click', () => this.closeGuide());

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
            if (!this.isPowerOn) {
                this.pauseYouTube();
                return;
            }
            this.updateYouTubeMetadata();
        } else if (e.data === 0) { // ENDED
            this.showMediaOSD('⏹', 'VÍDEO CONCLUÍDO');
        }
    }

    onYouTubeError(e) {
        console.warn('YouTube Player error code:', e.data);
        let msg = 'Erro ao carregar o vídeo do YouTube.';
        if (e.data === 101 || e.data === 150) {
            msg = 'O autor deste vídeo não permite reprodução incorporada em sites externos.';
        } else if (e.data === 100) {
            msg = 'Vídeo não encontrado ou privado no YouTube.';
        } else if (e.data === 2) {
            msg = 'Link ou ID de vídeo do YouTube inválido.';
        }
        alert(msg);
        this.showMediaOSD('✕', 'ERRO NO VÍDEO');
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

        this.currentMediaMode = 'video';
        this.pauseYouTube();
        if (this.youtubeContainer) {
            this.youtubeContainer.style.display = 'none';
        }

        this.tvCanvas.style.display = 'none';
        window.retroAudio.stopStaticNoise();

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
                alert('Não foi possível carregar a URL fornecida: ' + e.message);
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
