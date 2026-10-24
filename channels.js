/**
 * Channel Lineup and Procedural Video Feeds
 * Recreating the authentic 2000s TV aesthetic with interactive Frutiger Aero visuals
 */

const CHANNELS_DATA = [
    {
        id: "001",
        number: 1,
        code: "ARP-TV",
        name: "ARP-TV HD",
        title: "Aexion - Velvet",
        timeSlot: "1:00p - 2:00p",
        language: "English",
        rating: "TV-PG",
        category: "Aero Lifestyle",
        description: "Ambient electronic visual showcase featuring tranquil minimalist living, aquatic visuals, and pristine Frutiger Aero modernism.",
        schedule: [
            { time: "12:00p", title: "Aero Horizons - Blue Sky", length: 60 },
            { time: "1:00p", title: "Aexion - Velvet", length: 60, current: true },
            { time: "2:00p", title: "Gloss & Glass Lounge", length: 60 },
            { time: "3:00p", title: "Y2K Chillout Session", length: 60 }
        ],
        type: "aero_velvet"
    },
    {
        id: "294",
        number: 294,
        code: "KIDS",
        name: "Toon Universe HD",
        title: "Galaxy Explorers 3D",
        timeSlot: "5:30a - 6:00a",
        language: "English (Stereo)",
        rating: "TV-Y7",
        category: "Kids / Animation",
        description: "Saturday morning animated adventures featuring bold retro sci-fi heroes navigating dynamic cyberspace realms.",
        schedule: [
            { time: "5:00a", title: "Robo Pals", length: 30 },
            { time: "5:30a", title: "Galaxy Explorers 3D", length: 30, current: true },
            { time: "6:00a", title: "Pocket Monsters DX", length: 30 },
            { time: "6:30a", title: "Cyber Chaser Z", length: 30 }
        ],
        type: "retro_kids"
    },
    {
        id: "295",
        number: 295,
        code: "SPRT",
        name: "Sports Direct HD",
        title: "World Cup Classics '06",
        timeSlot: "5:00a - 7:00a",
        language: "English / PT",
        rating: "TV-G",
        category: "Sports",
        description: "International football highlights, live telemetry, and championship coverage with 2000s broadcast motion graphics.",
        schedule: [
            { time: "4:00a", title: "Morning Highlights", length: 60 },
            { time: "5:00a", title: "World Cup Classics '06", length: 120, current: true },
            { time: "7:00a", title: "Extreme Motors GP", length: 60 }
        ],
        type: "sports"
    },
    {
        id: "296",
        number: 296,
        code: "CNeHD",
        name: "Cinema One HD",
        title: "Solaris Station: 2007",
        timeSlot: "4:30a - 6:30a",
        language: "English 5.1",
        rating: "TV-14",
        category: "Cinema",
        description: "A deep-space expedition encounters mysterious holographic phenomena near the rings of Saturn. Letterbox widescreen presentation.",
        schedule: [
            { time: "2:30a", title: "Midnight Thriller", length: 120 },
            { time: "4:30a", title: "Solaris Station: 2007", length: 120, current: true },
            { time: "6:30a", title: "Behind The Scenes", length: 30 }
        ],
        type: "cinema"
    },
    {
        id: "297",
        number: 297,
        code: "CNw",
        name: "Cartoon Network West",
        title: "Toonami: Absolution Orbit",
        timeSlot: "5:00a - 6:00a",
        language: "English",
        rating: "TV-PG",
        category: "Animation",
        description: "Iconic celestial anime block hosted by TOM aboard the ghost ship Absolution. High octane robotic action.",
        schedule: [
            { time: "4:30a", title: "Megas XLR", length: 30 },
            { time: "5:00a", title: "Toonami: Absolution Orbit", length: 60, current: true },
            { time: "6:00a", title: "Samurai Jack", length: 30 },
            { time: "6:30a", title: "Teen Titans", length: 30 }
        ],
        type: "toonami"
    },
    {
        id: "298",
        number: 298,
        code: "BOOM",
        name: "Boomerang Classics",
        title: "Hanna-Barbera Golden Hour",
        timeSlot: "5:30a - 6:00a",
        language: "English",
        rating: "TV-G",
        category: "Retro Animation",
        description: "It's all coming back to you! Beloved retro animated shorts with nostalgic 2000s bumpers and promos.",
        schedule: [
            { time: "5:00a", title: "Top Cat", length: 30 },
            { time: "5:30a", title: "Hanna-Barbera Golden Hour", length: 30, current: true },
            { time: "6:00a", title: "The Jetsons", length: 30 },
            { time: "6:30a", title: "Wacky Races", length: 30 }
        ],
        type: "boomerang"
    },
    {
        id: "299",
        number: 299,
        code: "NIKeHD",
        name: "Nickelodeon East HD",
        title: "Slime Time Live Rewind",
        timeSlot: "5:30a - 6:30a",
        language: "English",
        rating: "TV-Y7",
        category: "Kids / Variety",
        description: "Bright orange splats, interactive phone-in games, and high-energy sketch comedy straight from Orlando studios.",
        schedule: [
            { time: "5:00a", title: "Hey Arnold!", length: 30 },
            { time: "5:30a", title: "Slime Time Live Rewind", length: 60, current: true },
            { time: "6:30a", title: "SpongeBob SquarePants", length: 30 }
        ],
        type: "nickelodeon"
    },
    {
        id: "340",
        number: 340,
        code: "WEATHR",
        name: "Weatherscan 24/7",
        title: "Local On The 8s Live Radar",
        timeSlot: "24 Hours Live",
        language: "Portuguese / En",
        rating: "TV-G",
        category: "News / Weather",
        description: "Continuous computerized local satellite doppler radar, 5-day regional outlook, barometric pressure, and smooth jazz.",
        schedule: [
            { time: "5:00a", title: "Morning Satellite Radar", length: 60 },
            { time: "5:30a", title: "Local On The 8s Live Radar", length: 60, current: true },
            { time: "6:30a", title: "National Doppler Scan", length: 60 }
        ],
        type: "weather"
    },
    {
        id: "777",
        number: 777,
        code: "AQUA",
        name: "Aero Aquarium HD",
        title: "Coral Reef Paradise",
        timeSlot: "Continuous",
        language: "Underwater Audio",
        rating: "TV-G",
        category: "Ambient Nature",
        description: "High-definition tropical marine life with glossy crystal waters, sunbeams refracting through corals, and peaceful bubbles.",
        schedule: [
            { time: "0:00a", title: "Coral Reef Paradise", length: 360, current: true },
            { time: "6:00a", title: "Deep Blue Trench", length: 360 }
        ],
        type: "aquarium"
    },
    {
        id: "404",
        number: 404,
        code: "NO-SIG",
        name: "SEM SINAL / NO SIGNAL",
        title: "Sinal do Satélite Interrompido",
        timeSlot: "--:-- - --:--",
        language: "NONE",
        rating: "NONE",
        category: "Signal Loss",
        description: "Unable to retrieve television lineup. Check for anything obstructing your satellite dish such as tree branches, severe rain, or snow build-up. If safe to do so, remove the obstruction or wait for it to pass.",
        schedule: [
            { time: "0:00a", title: "Busca de Transponder...", length: 720, current: true }
        ],
        type: "static"
    }
];

/**
 * Procedural TV Content Canvas Renderer
 * Generates dynamic 2000s broadcast animations for all channels
 */
class TVFeedGenerator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.currentType = null;
        this.animationFrameId = null;
        this.frame = 0;
        
        // Static noise precalculated buffer for high-fps snow
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCanvas.width = 320;
        this.noiseCanvas.height = 240;
        this.noiseCtx = this.noiseCanvas.getContext('2d');
        this.noiseImgData = this.noiseCtx.createImageData(320, 240);
        this.noise32 = new Uint32Array(this.noiseImgData.data.buffer);

        // Bouncing box for No Signal
        this.bounceBox = {
            x: 100, y: 100,
            vx: 1.8, vy: 1.4,
            w: 360, h: 140
        };

        // Aquarium fishes
        this.fishes = Array.from({ length: 8 }, (_, i) => ({
            x: Math.random() * 800,
            y: 100 + Math.random() * 400,
            speed: 0.8 + Math.random() * 1.5,
            size: 14 + Math.random() * 18,
            color: ['#ff8800', '#00e5ff', '#ff00aa', '#ffff00'][i % 4],
            tailAngle: 0
        }));

        this.bubbles = Array.from({ length: 25 }, () => ({
            x: Math.random() * 800,
            y: Math.random() * 600,
            r: 2 + Math.random() * 5,
            speed: 0.5 + Math.random() * 1.2
        }));

        // Resize observer
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width && rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
    }

    setChannelType(type) {
        this.currentType = type;
        if (!this.animationFrameId) {
            this.loop();
        }
    }

    loop() {
        this.frame++;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        switch (this.currentType) {
            case 'aero_velvet':
                this.renderAeroVelvet(ctx, width, height);
                break;
            case 'static':
                this.renderStatic(ctx, width, height);
                break;
            case 'retro_kids':
                this.renderRetroKids(ctx, width, height);
                break;
            case 'sports':
                this.renderSports(ctx, width, height);
                break;
            case 'cinema':
                this.renderCinema(ctx, width, height);
                break;
            case 'toonami':
                this.renderToonami(ctx, width, height);
                break;
            case 'boomerang':
                this.renderBoomerang(ctx, width, height);
                break;
            case 'nickelodeon':
                this.renderNickelodeon(ctx, width, height);
                break;
            case 'weather':
                this.renderWeather(ctx, width, height);
                break;
            case 'aquarium':
                this.renderAquarium(ctx, width, height);
                break;
            default:
                this.renderStatic(ctx, width, height);
        }

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    /**
     * Channel 001: Frutiger Aero Velvet (Inspired directly by user's screenshot)
     */
    renderAeroVelvet(ctx, w, h) {
        // Sky blue to soft cyan clean horizon gradient
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#5993de');
        grad.addColorStop(0.35, '#8cb8ea');
        grad.addColorStop(0.5, '#c5def5');
        grad.addColorStop(0.51, '#e3effb');
        grad.addColorStop(0.7, '#d3e2d6');
        grad.addColorStop(1, '#685c49');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Architecture room perspective lines (fireplace & room aesthetic from screenshot)
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;

        // Baseboard moulding & wall panels
        const wallY = h * 0.52;
        ctx.beginPath();
        ctx.moveTo(0, wallY);
        ctx.lineTo(w, wallY);
        ctx.stroke();

        // Elegant wood floor perspective planks
        ctx.fillStyle = 'rgba(110, 92, 72, 0.6)';
        ctx.fillRect(0, wallY, w, h - wallY);
        ctx.strokeStyle = 'rgba(70, 55, 40, 0.35)';
        for (let i = -w; i < w * 2; i += 70) {
            ctx.beginPath();
            ctx.moveTo(w * 0.5 + (i - w * 0.5) * 0.3, wallY);
            ctx.lineTo(i, h);
            ctx.stroke();
        }

        // Neo-classical fireplace mantle in the center
        const fpW = Math.min(260, w * 0.35);
        const fpH = 140;
        const fpX = w * 0.32 - fpW / 2;
        const fpY = wallY - fpH + 25;
        
        ctx.fillStyle = '#f4f8fd';
        ctx.fillRect(fpX, fpY, fpW, fpH);
        ctx.strokeStyle = '#bdd4ea';
        ctx.strokeRect(fpX, fpY, fpW, fpH);

        // Fireplace inner hearth
        ctx.fillStyle = '#e2ecf7';
        ctx.fillRect(fpX + 35, fpY + 30, fpW - 70, fpH - 30);

        // Tall windows with soft light bloom on the right
        const winX = w * 0.72;
        const winW = Math.min(140, w * 0.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillRect(winX, wallY - 180, winW, 180);
        ctx.strokeStyle = '#c0d7ee';
        ctx.strokeRect(winX, wallY - 180, winW, 180);

        // Translucent floating Frutiger Aero glass orbs
        const t = this.frame * 0.02;
        for (let i = 0; i < 3; i++) {
            const orbX = (w * 0.25) + Math.sin(t + i * 2) * 40 + i * 120;
            const orbY = (h * 0.35) + Math.cos(t * 0.8 + i) * 25;
            const r = 26 + i * 10;

            const orbGrad = ctx.createRadialGradient(orbX - r * 0.3, orbY - r * 0.3, r * 0.1, orbX, orbY, r);
            orbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            orbGrad.addColorStop(0.3, 'rgba(120, 210, 255, 0.7)');
            orbGrad.addColorStop(0.7, 'rgba(30, 140, 230, 0.4)');
            orbGrad.addColorStop(1, 'rgba(0, 90, 200, 0.15)');

            ctx.fillStyle = orbGrad;
            ctx.beginPath();
            ctx.arc(orbX, orbY, r, 0, Math.PI * 2);
            ctx.fill();

            // Specular sheen
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.ellipse(orbX - r * 0.35, orbY - r * 0.35, r * 0.35, r * 0.18, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Floating Y2K / Aero text banner watermark
        ctx.font = 'italic 600 24px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = 'rgba(16, 56, 144, 0.35)';
        ctx.fillText('AEXION • VELVET AMBIENCE', 30, h - 30);

        ctx.restore();
    }

    /**
     * Sem Sinal (TV Static Snow Noise + Bouncing Box)
     */
    renderStatic(ctx, w, h) {
        // Generate fast random noise into 32-bit pixel buffer
        const len = this.noise32.length;
        for (let i = 0; i < len; i++) {
            // Analog TV noise with random grain and occasional horizontal scan tears
            const val = (Math.random() * 255) | 0;
            // 0xAABBGGRR in little endian
            this.noise32[i] = (0xFF000000 | (val << 16) | (val << 8) | val) >>> 0;
        }
        this.noiseCtx.putImageData(this.noiseImgData, 0, 0);

        // Blit stretched to screen for realistic thick CRT grain
        ctx.drawImage(this.noiseCanvas, 0, 0, w, h);

        // Occasional horizontal flicker bar
        if (Math.random() > 0.8) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, Math.random() * h, w, Math.random() * 20 + 5);
        }

        // Bouncing "SEM SINAL / BUSCANDO SINAL" OSD Dialog Box
        const bb = this.bounceBox;
        bb.x += bb.vx;
        bb.y += bb.vy;

        if (bb.x <= 15) { bb.x = 15; bb.vx = Math.abs(bb.vx); }
        if (bb.x + bb.w >= w - 15) { bb.x = w - 15 - bb.w; bb.vx = -Math.abs(bb.vx); }
        if (bb.y <= 15) { bb.y = 15; bb.vy = Math.abs(bb.vy); }
        if (bb.y + bb.h >= h - 15) { bb.y = h - 15 - bb.h; bb.vy = -Math.abs(bb.vy); }

        ctx.save();
        // Box drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 6;

        // Frutiger Aero Glossy Navy/Steel box
        const boxGrad = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
        boxGrad.addColorStop(0, '#0f3885');
        boxGrad.addColorStop(0.48, '#0b265c');
        boxGrad.addColorStop(0.5, '#05183e');
        boxGrad.addColorStop(1, '#072460');
        ctx.fillStyle = boxGrad;
        
        // Rounded rectangle with fallback
        const r = 10;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bb.x, bb.y, bb.w, bb.h, r);
        } else {
            ctx.rect(bb.x, bb.y, bb.w, bb.h);
        }
        ctx.fill();

        // Chrome/glass border
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Top glossy specular highlight
        const glossGrad = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h * 0.45);
        glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
        ctx.fillStyle = glossGrad;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bb.x + 2, bb.y + 2, bb.w - 4, bb.h * 0.45, [8, 8, 0, 0]);
        } else {
            ctx.rect(bb.x + 2, bb.y + 2, bb.w - 4, bb.h * 0.45);
        }
        ctx.fill();

        // Satellite Dish Icon in box
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
        ctx.fillText('📡  SEM SINAL DO SATÉLITE (771)', bb.x + 20, bb.y + 36);

        // Warning text
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Buscando sinal no transponder 01...', bb.x + 20, bb.y + 65);
        ctx.fillStyle = '#b7d4f8';
        ctx.fillText('Verifique se há obstáculos (chuva, galhos)', bb.x + 20, bb.y + 88);
        ctx.fillText('ou aguarde a normalização da transmissão.', bb.x + 20, bb.y + 108);

        // Subtle flashing red dot
        if ((this.frame % 40) < 20) {
            ctx.fillStyle = '#ff3b30';
            ctx.beginPath();
            ctx.arc(bb.x + bb.w - 25, bb.y + 30, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Kids Channel: Vibrant bouncing 2000s geometric graphics
     */
    renderRetroKids(ctx, w, h) {
        ctx.fillStyle = '#11052c';
        ctx.fillRect(0, 0, w, h);

        const t = this.frame * 0.03;
        // Colorful retro stripes
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = `hsl(${(this.frame + i * 40) % 360}, 90%, 55%)`;
            const y = Math.sin(t + i * 0.6) * 70 + (h * (i + 1)) / 8;
            ctx.fillRect(0, y - 15, w, 30);
        }

        // Bouncing 3D cartoon star
        const cx = w * 0.5 + Math.sin(t * 1.5) * (w * 0.3);
        const cy = h * 0.5 + Math.cos(t * 2) * (h * 0.25);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 2);
        
        ctx.fillStyle = '#ffe600';
        ctx.shadowColor = '#ff5500';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 55, -Math.sin((18 + i * 72) * Math.PI / 180) * 55);
            ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 24, -Math.sin((54 + i * 72) * Math.PI / 180) * 24);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // OSD Bug
        ctx.font = 'bold 28px "Arial Black", Impact, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('TOON 294 HD', 40, h - 40);
    }

    /**
     * Sports HD: Dynamic stadium pitch and telemetry
     */
    renderSports(ctx, w, h) {
        // Deep stadium green gradient
        const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 40, w * 0.5, h * 0.5, w * 0.7);
        grad.addColorStop(0, '#009245');
        grad.addColorStop(1, '#00471b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Perspective pitch lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.6, w * 0.35, h * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.1);
        ctx.lineTo(w * 0.5, h * 0.9);
        ctx.stroke();

        // High speed ball motion streak
        const ballT = (this.frame * 0.04) % (Math.PI * 2);
        const bx = w * 0.5 + Math.cos(ballT) * (w * 0.35);
        const by = h * 0.6 + Math.sin(ballT) * (h * 0.18);

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(bx, by, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Broadcast Scorebug (top left)
        const sbW = 240, sbH = 38;
        ctx.fillStyle = 'rgba(10, 25, 45, 0.85)';
        ctx.fillRect(40, 40, sbW, sbH);
        ctx.strokeStyle = '#f5a623';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 40, sbW, sbH);

        ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('BRA  2 - 1  ITA', 55, 65);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText("78:42", 210, 65);
    }

    /**
     * Cinema HD: Letterbox 16:9 widescreen space cinematic
     */
    renderCinema(ctx, w, h) {
        ctx.fillStyle = '#020409';
        ctx.fillRect(0, 0, w, h);

        const t = this.frame * 0.01;
        // Moving starfield
        for (let i = 0; i < 90; i++) {
            const sx = (Math.sin(i * 123 + t) * 0.5 + 0.5) * w;
            const sy = (Math.cos(i * 456 + t * 0.5) * 0.5 + 0.5) * h;
            const sz = ((i % 3) + 1);
            ctx.fillStyle = i % 5 === 0 ? '#64b5f6' : '#ffffff';
            ctx.fillRect(sx, sy, sz, sz);
        }

        // Giant glowing gas giant planet
        const planetX = w * 0.75;
        const planetY = h * 0.45;
        const planetR = Math.min(130, w * 0.18);

        const pGrad = ctx.createRadialGradient(planetX - planetR * 0.3, planetY - planetR * 0.3, planetR * 0.1, planetX, planetY, planetR);
        pGrad.addColorStop(0, '#ffd54f');
        pGrad.addColorStop(0.5, '#e65100');
        pGrad.addColorStop(1, '#1a0000');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(planetX, planetY, planetR, 0, Math.PI * 2);
        ctx.fill();

        // Planetary ring
        ctx.save();
        ctx.translate(planetX, planetY);
        ctx.rotate(-0.35);
        ctx.scale(1, 0.28);
        ctx.strokeStyle = 'rgba(255, 220, 160, 0.65)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(0, 0, planetR * 1.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Letterbox bars
        const barH = h * 0.12;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, barH);
        ctx.fillRect(0, h - barH, w, barH);

        // Subtitle text
        ctx.font = '16px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#fff4a3';
        ctx.textAlign = 'center';
        ctx.fillText('[Música orquestral tensa]', w * 0.5, h - barH * 0.4);
        ctx.textAlign = 'left';
    }

    /**
     * Toonami: Celestial nebula & grid warp
     */
    renderToonami(ctx, w, h) {
        // Dark purple / magenta space
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0d001a');
        grad.addColorStop(1, '#2c003e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Cyber wireframe perspective grid
        const t = (this.frame * 2) % 40;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        const horizon = h * 0.55;

        for (let x = -w; x <= w * 2; x += 60) {
            ctx.beginPath();
            ctx.moveTo(w * 0.5, horizon);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        for (let y = horizon; y <= h; y += 22) {
            const dy = y + (t * (y - horizon) / (h - horizon));
            ctx.beginPath();
            ctx.moveTo(0, dy);
            ctx.lineTo(w, dy);
            ctx.stroke();
        }

        // Retro wireframe sun
        ctx.fillStyle = '#ff007f';
        ctx.beginPath();
        ctx.arc(w * 0.5, horizon, 75, Math.PI, 0, false);
        ctx.fill();

        ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
        ctx.fillStyle = '#00ffff';
        ctx.fillText('TOONAMI // CNw 297', 40, 50);
    }

    /**
     * Boomerang Classics: Retro color stripes and vintage badge
     */
    renderBoomerang(ctx, w, h) {
        const colors = ['#00a896', '#028090', '#f0f3bd', '#eb5e28', '#252422'];
        const barW = w / colors.length;
        colors.forEach((col, idx) => {
            ctx.fillStyle = col;
            ctx.fillRect(idx * barW, 0, barW, h);
        });

        // Giant Boomerang "B"
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(1 + Math.sin(this.frame * 0.05) * 0.05, 1 + Math.sin(this.frame * 0.05) * 0.05);

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 80, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#028090';
        ctx.font = 'bold 90px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B', 0, 5);
        ctx.restore();
        ctx.textAlign = 'left';
    }

    /**
     * Nickelodeon: Bright orange splat & slime
     */
    renderNickelodeon(ctx, w, h) {
        ctx.fillStyle = '#0052cc';
        ctx.fillRect(0, 0, w, h);

        // Huge orange splat
        const t = this.frame * 0.03;
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#cc4400';
        ctx.shadowBlur = 18;

        ctx.beginPath();
        const numPoints = 12;
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const r = 110 + Math.sin(angle * 3 + t) * 35;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NICK', 0, 0);
        ctx.restore();
        ctx.textAlign = 'left';
    }

    /**
     * Weather Channel: Real-time 2000s weather radar map and local ticker
     */
    renderWeather(ctx, w, h) {
        // Dark blue navy map background
        ctx.fillStyle = '#03193a';
        ctx.fillRect(0, 0, w, h);

        // Simulated Doppler radar sweep
        const sweepAngle = (this.frame * 0.03) % (Math.PI * 2);
        const rcx = w * 0.45;
        const rcy = h * 0.45;
        const maxR = Math.min(w, h) * 0.38;

        // Radar rings
        ctx.strokeStyle = 'rgba(70, 160, 240, 0.35)';
        ctx.lineWidth = 1.5;
        for (let r = 50; r <= maxR; r += 50) {
            ctx.beginPath();
            ctx.arc(rcx, rcy, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Radar sweep line
        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rcx, rcy);
        ctx.lineTo(rcx + Math.cos(sweepAngle) * maxR, rcy + Math.sin(sweepAngle) * maxR);
        ctx.stroke();

        // Doppler storm blobs
        const blobGrad = ctx.createRadialGradient(rcx + 80, rcy - 40, 10, rcx + 80, rcy - 40, 65);
        blobGrad.addColorStop(0, 'rgba(255, 0, 0, 0.7)');
        blobGrad.addColorStop(0.5, 'rgba(255, 230, 0, 0.5)');
        blobGrad.addColorStop(1, 'rgba(0, 200, 50, 0)');
        ctx.fillStyle = blobGrad;
        ctx.beginPath();
        ctx.arc(rcx + 80, rcy - 40, 65, 0, Math.PI * 2);
        ctx.fill();

        // Weather text info header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        ctx.fillText('LOCAL RADAR • SÃO PAULO / BRASIL', 35, 45);

        // Live forecast panel (bottom)
        const panH = 75;
        ctx.fillStyle = 'rgba(10, 40, 80, 0.85)';
        ctx.fillRect(0, h - panH, w, panH);
        ctx.strokeStyle = '#29b6f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, h - panH, w, panH);

        const cities = [
            { name: "São Paulo", temp: "23°C", cond: "Ensolarado" },
            { name: "Rio de Janeiro", temp: "29°C", cond: "Parc. Nublado" },
            { name: "Curitiba", temp: "18°C", cond: "Chuva Leve" },
            { name: "Belo Horizonte", temp: "25°C", cond: "Céu Limpo" }
        ];

        const colW = w / cities.length;
        cities.forEach((c, i) => {
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.fillStyle = '#ffcc00';
            ctx.fillText(c.name, i * colW + 15, h - panH + 28);
            ctx.font = '13px "Segoe UI", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${c.temp}  ${c.cond}`, i * colW + 15, h - panH + 52);
        });
    }

    /**
     * Aquarium: Frutiger Aero deep tropical sea with swimming fishes and bubbles
     */
    renderAquarium(ctx, w, h) {
        // Deep crystal ocean gradient
        const seaGrad = ctx.createLinearGradient(0, 0, 0, h);
        seaGrad.addColorStop(0, '#00b4d8');
        seaGrad.addColorStop(0.5, '#0077b6');
        seaGrad.addColorStop(1, '#03045e');
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, 0, w, h);

        // Sunlight caustics rays
        const t = this.frame * 0.02;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        for (let i = 0; i < 6; i++) {
            const rx = (i * w / 5) + Math.sin(t + i) * 30;
            ctx.beginPath();
            ctx.moveTo(rx, 0);
            ctx.lineTo(rx + 80, 0);
            ctx.lineTo(rx + 220, h);
            ctx.lineTo(rx + 100, h);
            ctx.closePath();
            ctx.fill();
        }

        // Bubbles
        this.bubbles.forEach(b => {
            b.y -= b.speed;
            if (b.y < -10) {
                b.y = h + 10;
                b.x = Math.random() * w;
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // Swimming fishes
        this.fishes.forEach(f => {
            f.x += f.speed;
            if (f.x > w + 60) {
                f.x = -60;
                f.y = 80 + Math.random() * (h - 160);
            }
            f.tailAngle = Math.sin(this.frame * 0.2 + f.x) * 0.4;

            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 8;

            // Fish body
            ctx.beginPath();
            ctx.ellipse(0, 0, f.size, f.size * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();

            // Fish tail
            ctx.beginPath();
            ctx.moveTo(-f.size * 0.7, 0);
            ctx.lineTo(-f.size * 1.4, -f.size * 0.6 + f.tailAngle * 10);
            ctx.lineTo(-f.size * 1.4, f.size * 0.6 + f.tailAngle * 10);
            ctx.closePath();
            ctx.fill();

            // Fish eye
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(f.size * 0.45, -f.size * 0.15, f.size * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(f.size * 0.5, -f.size * 0.15, f.size * 0.08, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

        // Coral & seabed silhouette
        ctx.fillStyle = '#011936';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 40) {
            const cy = h - 45 + Math.sin(x * 0.02) * 15;
            ctx.lineTo(x, cy);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

window.CHANNELS_DATA = CHANNELS_DATA;
window.TVFeedGenerator = TVFeedGenerator;
