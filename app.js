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

        // Bind Events
        this.bindKeyboard();
        this.bindRemote();
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
     * Draggable remote control for desktop pairing
     */
    makeRemoteDraggable() {
        const header = document.getElementById('remote-header');
        const remote = this.remoteControl;
        if (!header || !remote) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'btn-minimize-remote') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = remote.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            remote.style.right = 'auto';
            remote.style.bottom = 'auto';
            remote.style.left = `${initialLeft}px`;
            remote.style.top = `${initialTop}px`;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            remote.style.left = `${Math.max(10, Math.min(window.innerWidth - remote.offsetWidth - 10, initialLeft + dx))}px`;
            remote.style.top = `${Math.max(10, Math.min(window.innerHeight - remote.offsetHeight - 10, initialTop + dy))}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
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
        const ch = this.channels[this.currentChannelIndex];

        // Sound effect
        if (playAudio) {
            window.retroAudio.playChannelSwitch();
        }

        // Check if custom video or canvas feed
        if (this.customVideo && this.customVideo.src && ch.type === 'custom') {
            this.tvCanvas.style.display = 'none';
            this.customVideo.style.display = 'block';
            this.customVideo.play().catch(() => {});
        } else {
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
        document.getElementById('banner-ch-num').innerText = ch.id;
        document.getElementById('banner-ch-code').innerText = ch.code;
        document.getElementById('banner-prog-title').innerText = ch.title;
        document.getElementById('banner-lang').innerText = ch.language;
        document.getElementById('banner-timeslot').innerText = ch.timeSlot;
        document.getElementById('banner-rating').innerText = ch.rating;

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
        if (this.bannerTimeout) {
            clearTimeout(this.bannerTimeout);
            this.bannerTimeout = null;
        }
    }

    toggleBanner() {
        if (this.isBannerVisible) {
            this.hideBanner();
            window.retroAudio.playBeep('back');
        } else {
            this.showBanner(5000);
            window.retroAudio.playBeep('select');
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
        window.retroAudio.playBeep('back');
        this.epgGuide.classList.add('hidden');
        this.isGuideOpen = false;
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
        this.guideSelectedChannelIndex += delta;
        if (this.guideSelectedChannelIndex < 0) this.guideSelectedChannelIndex = this.channels.length - 1;
        if (this.guideSelectedChannelIndex >= this.channels.length) this.guideSelectedChannelIndex = 0;
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
        this.showVolumeOSD();
        window.retroAudio.playBeep('nav');
    }

    toggleMute() {
        if (!this.isPowerOn) return;
        this.isMuted = !this.isMuted;
        window.retroAudio.setMute(this.isMuted);
        this.showVolumeOSD();
        window.retroAudio.playBeep('select');
    }

    showVolumeOSD() {
        const pct = Math.round(this.volume * 100);
        this.volBarFill.style.width = `${pct}%`;
        
        const volIcon = document.getElementById('vol-icon');
        if (this.isMuted || pct === 0) {
            this.volText.innerText = "MUTE";
            if (volIcon) volIcon.src = "icons/volume-zero.png";
            this.volBarFill.style.width = '0%';
        } else {
            this.volText.innerText = `VOL ${pct}%`;
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
     * Power Toggle (Ligar / Desligar TV)
     */
    togglePower() {
        this.isPowerOn = !this.isPowerOn;
        const led = document.getElementById('rc-led');

        if (this.isPowerOn) {
            if (led) led.style.backgroundColor = '#00ff66';
            if (led) led.style.boxShadow = '0 0 10px #00ff66';
            this.tvCanvas.style.filter = 'none';
            this.tuneChannelByIndex(this.currentChannelIndex, true);
            this.showBanner(4000);
        } else {
            if (led) led.style.backgroundColor = '#ff2a2a';
            if (led) led.style.boxShadow = '0 0 8px #ff2a2a';
            window.retroAudio.stopStaticNoise();
            window.retroAudio.playBeep('exit');
            this.hideBanner();
            this.closeGuide();
            this.closeMiniGuide();
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
            // Numbers 0-9
            if (e.key >= '0' && e.key <= '9') {
                this.dialDigit(e.key);
                return;
            }

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveVertical(-1);
                    else this.channelUp();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveVertical(1);
                    else this.channelDown();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveHorizontal(-1);
                    else this.adjustVolume(-0.05);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.isGuideOpen) this.guideMoveHorizontal(1);
                    else this.adjustVolume(0.05);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.dialDigits.length > 0) {
                        this.confirmDial();
                    } else if (this.isGuideOpen) {
                        this.guideSelectCurrent();
                    } else {
                        this.toggleBanner();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (this.isGuideOpen) this.closeGuide();
                    else if (this.isMiniGuideOpen) this.closeMiniGuide();
                    else this.hideBanner();
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
                    this.toggleCRT();
                    break;
                case 'x':
                case 'X':
                    this.triggerSemSinal();
                    break;
            }
        });
    }

    /**
     * Bind 2000s Satellite Remote Control Panel
     */
    bindRemote() {
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
            if (this.isGuideOpen) this.guideMoveVertical(-1);
            else this.channelUp();
        });
        document.getElementById('rc-down').addEventListener('click', () => {
            if (this.isGuideOpen) this.guideMoveVertical(1);
            else this.channelDown();
        });
        document.getElementById('rc-left').addEventListener('click', () => {
            if (this.isGuideOpen) this.guideMoveHorizontal(-1);
            else this.adjustVolume(-0.05);
        });
        document.getElementById('rc-right').addEventListener('click', () => {
            if (this.isGuideOpen) this.guideMoveHorizontal(1);
            else this.adjustVolume(0.05);
        });
        document.getElementById('rc-ok').addEventListener('click', () => {
            if (this.dialDigits.length > 0) this.confirmDial();
            else if (this.isGuideOpen) this.guideSelectCurrent();
            else this.toggleBanner();
        });

        // Rockers
        document.getElementById('rc-vol-up').addEventListener('click', () => this.adjustVolume(0.05));
        document.getElementById('rc-vol-down').addEventListener('click', () => this.adjustVolume(-0.05));
        document.getElementById('rc-ch-up').addEventListener('click', () => this.channelUp());
        document.getElementById('rc-ch-down').addEventListener('click', () => this.channelDown());

        // 4 Color Buttons
        document.getElementById('rc-red').addEventListener('click', () => this.triggerSemSinal());
        document.getElementById('rc-green').addEventListener('click', () => this.toggleCRT());
        document.getElementById('rc-yellow').addEventListener('click', () => this.openCustomStreamModal());
        document.getElementById('rc-blue').addEventListener('click', () => this.toggleMiniGuide());

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
        document.getElementById('btn-minimize-remote').addEventListener('click', () => {
            this.remoteControl.style.display = 'none';
            this.floatingRemoteBtn.style.display = 'flex';
        });

        // Floating button to reopen remote
        this.floatingRemoteBtn.addEventListener('click', () => {
            this.remoteControl.style.display = 'flex';
            this.floatingRemoteBtn.style.display = 'none';
        });
    }

    /**
     * OSD Interactive elements & Header hints
     */
    bindOSDInteractions() {
        // Banner hints
        document.getElementById('hint-red-signal').addEventListener('click', () => this.triggerSemSinal());
        document.getElementById('hint-green-crt').addEventListener('click', () => this.toggleCRT());
        document.getElementById('hint-options').addEventListener('click', () => this.openCustomStreamModal());
        document.getElementById('hint-mini-guide').addEventListener('click', () => this.toggleMiniGuide());
        document.getElementById('btn-banner-settings').addEventListener('click', () => this.openCustomStreamModal());

        // EPG Guide Hints
        document.getElementById('epg-hint-red').addEventListener('click', () => {
            window.retroAudio.playBeep('nav');
            this.guideMoveHorizontal(-1);
        });
        document.getElementById('epg-hint-green').addEventListener('click', () => {
            window.retroAudio.playBeep('nav');
            this.guideMoveHorizontal(1);
        });
        document.getElementById('epg-hint-yellow').addEventListener('click', () => this.openCustomStreamModal());
        document.getElementById('epg-hint-blue').addEventListener('click', () => this.closeGuide());

        // Custom Stream Modal actions
        document.getElementById('btn-cancel-stream').addEventListener('click', () => {
            this.modalStream.classList.remove('active');
        });

        document.getElementById('btn-load-stream').addEventListener('click', () => {
            const input = document.getElementById('stream-url-input');
            const url = input.value.trim();
            if (url) {
                this.loadCustomStream(url);
            }
            this.modalStream.classList.remove('active');
        });
    }

    /**
     * Open custom IPTV / Video modal
     */
    openCustomStreamModal() {
        window.retroAudio.playBeep('select');
        this.modalStream.classList.add('active');
    }

    loadCustomStream(url) {
        if (!this.customVideo) return;
        this.customVideo.src = url;
        this.customVideo.style.display = 'block';
        this.tvCanvas.style.display = 'none';
        this.customVideo.play().catch(e => {
            alert('Não foi possível carregar a URL fornecida: ' + e.message);
        });

        // Add to channel list or set banner
        document.getElementById('banner-prog-title').innerText = "Transmissão Personalizada IPTV";
        document.getElementById('banner-ch-code').innerText = "IPTV-STREAM";
        this.showBanner(5000);
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
                if (diffY > 0) this.channelUp();
                else this.channelDown();
            } else if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) this.adjustVolume(0.05);
                else this.adjustVolume(-0.05);
            } else if (Math.abs(diffY) < 15 && Math.abs(diffX) < 15) {
                // Short tap -> Toggle Info Banner
                this.toggleBanner();
            }
        });
    }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.tvApp = new RetroTVController();
});
