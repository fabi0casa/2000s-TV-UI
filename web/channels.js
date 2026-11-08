/**
 * Aquanet TV - Brazilian IPTV Lineup & Procedural Canvas Feeds
 * Recreating the authentic 2000s TV aesthetic with interactive Frutiger Aero visuals
 */

/**
 * Canal 000: Sem Sinal / No Signal
 * Canal padrão e fallback para qualquer canal não sintonizado, fora do ar ou inexistente.
 */
const CHANNEL_000_STATIC = {
    id: "000",
    number: 0,
    code: "000",
    name: "SEM SINAL / NO SIGNAL",
    title: "Sinal do Satélite Interrompido",
    timeSlot: "00:00 - 12:00",
    language: "Português",
    rating: "LIVRE",
    category: "Sem Sinal",
    description: "Canal não encontrado ou sem sinal de transmissão. Verifique o número digitado ou selecione outro canal na grade de programação.",
    schedule: [
        { time: "00:00", title: "Busca de Transponder...", timeSlot: "00:00 - 12:00", length: 720, current: true, description: "Buscando transponders do satélite Aquanet." },
        { time: "12:00", title: "Varredura de Frequência", timeSlot: "12:00 - 00:00", length: 720, current: false, description: "Sintonizador aguardando sinal de portadora." },
        { time: "00:00", title: "Aguardando Sinal...", timeSlot: "00:00 - 12:00", length: 720, current: false, description: "Canal fora do ar ou sem transmissão ativa." }
    ],
    type: "static"
};

/**
 * Helper: Formata horários para o formato DirecTV/2000s (ex: 2:30p ou 14:30)
 */
function formatTime12(date) {
    if (!date) return '--:--';
    const d = (typeof date === 'string') ? new Date(date) : date;
    if (isNaN(d.getTime())) return '--:--';
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'p' : 'a';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m}${ampm}`;
}

/**
 * Helper: Formata horários para tags compactas de grade EPG (ex: 11pm, 11pm30, 18pm/6pm, 2am)
 */
function formatTimeBadge(date) {
    if (!date) return '--:--';
    const d = (typeof date === 'string') ? new Date(date) : date;
    if (isNaN(d.getTime())) return '--:--';
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    if (m === 0) {
        return `${h12}${ampm}`;
    }
    return `${h12}${ampm}${m.toString().padStart(2, '0')}`;
}

function formatTimeSlot(start, stop) {
    if (!start || !stop) {
        const now = new Date();
        const baseH = now.getHours();
        const startH = baseH % 12 || 12;
        const endH = (baseH + 1) % 12 || 12;
        const ampm1 = baseH >= 12 ? 'p' : 'a';
        const ampm2 = (baseH + 1) >= 12 ? 'p' : 'a';
        return `${startH}:00${ampm1} - ${endH}:00${ampm2}`;
    }
    return `${formatTime12(start)} - ${formatTime12(stop)}`;
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#xE1;/gi, 'á')
        .replace(/&#xE9;/gi, 'é')
        .replace(/&#xED;/gi, 'í')
        .replace(/&#xF3;/gi, 'ó')
        .replace(/&#xFA;/gi, 'ú')
        .replace(/&#xE3;/gi, 'ã')
        .replace(/&#xF5;/gi, 'õ')
        .replace(/&#xE7;/gi, 'ç');
}

function cleanChannelName(rawName) {
    if (!rawName) return 'CANAL';
    return decodeHtmlEntities(rawName)
        .replace(/CANAIS:\s*/gi, '')
        .replace(/[✨⚽🔴🟢]/g, '')
        .trim();
}

/**
 * Transforma um item bruto retornado pela API em objeto do canal frontend
 */
function transformApiChannel(rawCh, index) {
    const channelNum = index; // 1, 2, 3, ... 300
    const channelIdStr = String(channelNum).padStart(3, '0'); // "001", "002", ... "300"
    const cleanName = cleanChannelName(rawCh.name);

    const hasEpgFlag = Boolean(rawCh.epg && rawCh.epg.hasEpg);
    const rawPrograms = (hasEpgFlag && Array.isArray(rawCh.epg.programs)) ? rawCh.epg.programs : [];

    let schedule = [];

    if (rawPrograms.length > 0) {
        schedule = rawPrograms.map(p => ({
            time: formatTime12(p.start),
            timeBadge: formatTimeBadge(p.start),
            timeSlot: formatTimeSlot(p.start, p.stop),
            title: p.title || `${cleanName} - Atração`,
            description: p.description || '',
            category: p.category || rawCh.category || '',
            rating: "LIVRE",
            current: Boolean(p.isLive),
            start: typeof p.start === 'string' ? p.start : new Date(p.start).toISOString(),
            stop: typeof p.stop === 'string' ? p.stop : new Date(p.stop).toISOString()
        }));
    } else if (hasEpgFlag && rawCh.epg.now) {
        schedule.push({
            time: formatTime12(rawCh.epg.now.start),
            timeBadge: formatTimeBadge(rawCh.epg.now.start),
            timeSlot: formatTimeSlot(rawCh.epg.now.start, rawCh.epg.now.stop),
            title: rawCh.epg.now.title || `${cleanName} - Ao Vivo`,
            description: rawCh.epg.now.description || '',
            rating: "LIVRE",
            current: true,
            start: typeof rawCh.epg.now.start === 'string' ? rawCh.epg.now.start : new Date(rawCh.epg.now.start).toISOString(),
            stop: typeof rawCh.epg.now.stop === 'string' ? rawCh.epg.now.stop : new Date(rawCh.epg.now.stop).toISOString()
        });
        if (rawCh.epg.next) {
            schedule.push({
                time: formatTime12(rawCh.epg.next.start),
                timeBadge: formatTimeBadge(rawCh.epg.next.start),
                timeSlot: formatTimeSlot(rawCh.epg.next.start, rawCh.epg.next.stop),
                title: rawCh.epg.next.title || `Próxima Atração`,
                description: rawCh.epg.next.description || '',
                rating: "LIVRE",
                current: false,
                start: typeof rawCh.epg.next.start === 'string' ? rawCh.epg.next.start : new Date(rawCh.epg.next.start).toISOString(),
                stop: typeof rawCh.epg.next.stop === 'string' ? rawCh.epg.next.stop : new Date(rawCh.epg.next.stop).toISOString()
            });
        }
    }

    // Se o canal não possui EPG oficial da API, NÃO inventar programas falsos!
    // A grade permanece vazia ([]) e a interface exibe: "sem informações de programação..."
    const hasRealEpg = schedule.length > 0;
    const currentLiveProg = schedule.find(p => p.current) || schedule[0];
    const progTitle = currentLiveProg ? currentLiveProg.title : `${cleanName} - Ao Vivo`;
    const progDesc = currentLiveProg
        ? (currentLiveProg.description || `Transmissão ao vivo do canal ${cleanName}.`)
        : `Transmissão ao vivo do canal ${cleanName}. Programação contínua da emissora. Categoria: ${rawCh.category || 'Geral'}.`;

    const timeSlotStr = currentLiveProg ? currentLiveProg.timeSlot : formatTimeSlot(null, null);
    const shortCode = cleanName.toUpperCase().slice(0, 14);

    return {
        id: channelIdStr,
        number: channelNum,
        slug: rawCh.id,
        code: shortCode,
        name: cleanName,
        title: progTitle,
        timeSlot: timeSlotStr,
        language: "Português",
        rating: "LIVRE",
        category: rawCh.category || "Geral",
        description: progDesc,
        logo: rawCh.logo || "",
        streamUrl: rawCh.streamUrl,
        liveUrl: rawCh.liveUrl || `http://localhost:1414/live/${rawCh.id}.m3u8`,
        proxyUrl: rawCh.proxyUrl || `http://localhost:1414/proxy?url=${encodeURIComponent(rawCh.streamUrl)}`,
        type: "iptv",
        epg: {
            ...rawCh.epg,
            hasEpg: hasRealEpg
        },
        schedule: schedule
    };
}

/**
 * Procedural TV Content Canvas Renderer
 */
class TVFeedGenerator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.currentType = null;
        this.animationFrameId = null;
        this.frame = 0;
        this.videoSource = null;
        
        // Static noise precalculated buffer for high-fps snow
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCanvas.width = 320;
        this.noiseCanvas.height = 240;
        this.noiseCtx = this.noiseCanvas.getContext('2d');
        this.noiseImgData = this.noiseCtx.createImageData(320, 240);
        this.noise32 = new Uint32Array(this.noiseImgData.data.buffer);

        // No Signal alternating images
        this.noSignalImg1 = new Image();
        this.noSignalImg1.src = 'icons/aquanet-nosignal-1.png';
        this.noSignalImg2 = new Image();
        this.noSignalImg2.src = 'icons/aquanet-nosignal-2.png';

        // Bouncing state for No Signal
        this.bounceBox = {
            x: 80, y: 60,
            vx: 1.8, vy: 1.4,
            w: 360, h: 266
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
        if (typeof ResizeObserver !== 'undefined') {
            try {
                new ResizeObserver(() => this.resize()).observe(this.canvas);
            } catch(e) {}
        }
    }

    setVideoSource(video) {
        this.videoSource = video;
    }

    resize() {
        if (!this.canvas) return;
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
        const width = this.canvas.width || 640;
        const height = this.canvas.height || 480;
        const ctx = this.ctx;

        switch (this.currentType) {
            case 'youtube':
                this.renderYouTubePIP(ctx, width, height);
                break;
            case 'custom':
            case 'stream':
            case 'hls':
            case 'iptv':
                if (this.videoSource && this.videoSource.readyState >= 2 && !this.videoSource.paused) {
                    try {
                        ctx.drawImage(this.videoSource, 0, 0, width, height);
                    } catch(e) {
                        this.renderStreamPIP(ctx, width, height);
                    }
                } else {
                    this.renderStreamPIP(ctx, width, height);
                }
                break;
            case 'static':
            default:
                this.renderStatic(ctx, width, height);
        }

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    renderYouTubePIP(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#091c36');
        grad.addColorStop(1, '#020914');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2 - 8;
        const rw = Math.min(w * 0.45, 60);
        const rh = rw * 0.65;

        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, 8);
        } else {
            ctx.rect(cx - rw / 2, cy - rh / 2, rw, rh);
        }
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const tri = rh * 0.35;
        ctx.moveTo(cx - tri * 0.5, cy - tri);
        ctx.lineTo(cx + tri * 0.7, cy);
        ctx.lineTo(cx - tri * 0.5, cy + tri);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#90caf9';
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('YOUTUBE FEED', cx, cy + rh / 2 + 20);
    }

    renderStreamPIP(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#0a2342');
        grad.addColorStop(1, '#020b18');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2 - 8;

        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0.2 * Math.PI, 0.8 * Math.PI, false);
        ctx.stroke();

        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(cx, cy - 8, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#bad7f5';
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('IPTV AO VIVO', cx, cy + 28);
    }

    renderStatic(ctx, w, h) {
        const len = this.noise32.length;
        for (let i = 0; i < len; i++) {
            const val = (Math.random() * 255) | 0;
            this.noise32[i] = (0xFF000000 | (val << 16) | (val << 8) | val) >>> 0;
        }
        this.noiseCtx.putImageData(this.noiseImgData, 0, 0);
        ctx.drawImage(this.noiseCanvas, 0, 0, w, h);

        if (Math.random() > 0.8) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, Math.random() * h, w, Math.random() * 20 + 5);
        }

        const isFrame1 = (Math.floor(Date.now() / 1000) % 2 === 0);
        const currentImg = isFrame1 ? this.noSignalImg1 : this.noSignalImg2;

        if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
            const aspect = currentImg.naturalHeight / currentImg.naturalWidth;
            let targetW = Math.min(360, w * 0.55);
            let targetH = targetW * aspect;

            if (targetH > h * 0.6) {
                targetH = h * 0.6;
                targetW = targetH / aspect;
            }

            this.bounceBox.w = targetW;
            this.bounceBox.h = targetH;
            this.bounceBox.x += this.bounceBox.vx;
            this.bounceBox.y += this.bounceBox.vy;

            if (this.bounceBox.x <= 15) {
                this.bounceBox.x = 15;
                this.bounceBox.vx = Math.abs(this.bounceBox.vx);
            } else if (this.bounceBox.x + this.bounceBox.w >= w - 15) {
                this.bounceBox.x = w - 15 - this.bounceBox.w;
                this.bounceBox.vx = -Math.abs(this.bounceBox.vx);
            }

            if (this.bounceBox.y <= 15) {
                this.bounceBox.y = 15;
                this.bounceBox.vy = Math.abs(this.bounceBox.vy);
            } else if (this.bounceBox.y + this.bounceBox.h >= h - 15) {
                this.bounceBox.y = h - 15 - this.bounceBox.h;
                this.bounceBox.vy = -Math.abs(this.bounceBox.vy);
            }

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 16;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 6;
            ctx.drawImage(currentImg, this.bounceBox.x, this.bounceBox.y, this.bounceBox.w, this.bounceBox.h);
            ctx.restore();
        }
    }
}


// Inicializa apenas com o Canal 000 (Sem Sinal). Todos os canais de transmissao
// sao servidos EXCLUSIVAMENTE pela API (http://localhost:1414/api/channels/br).
const CHANNELS_DATA = [
    CHANNEL_000_STATIC
];

window.CHANNEL_000_STATIC = CHANNEL_000_STATIC;
window.CHANNELS_DATA = CHANNELS_DATA;
window.TVFeedGenerator = TVFeedGenerator;
window.transformApiChannel = transformApiChannel;
window.formatTime12 = formatTime12;
window.formatTimeBadge = formatTimeBadge;
window.formatTimeSlot = formatTimeSlot;
