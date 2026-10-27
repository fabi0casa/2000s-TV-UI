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
    timeSlot: "--:-- - --:--",
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

/**
 * Transforma um item bruto retornado pela API em objeto do canal frontend
 */
function transformApiChannel(rawCh, index) {
    const channelNum = index; // 1, 2, 3, ... 300
    const channelIdStr = String(channelNum).padStart(3, '0'); // "001", "002", ... "300"
    const hasEpg = Boolean(rawCh.epg && rawCh.epg.hasEpg && rawCh.epg.now);

    const nowProg = hasEpg ? rawCh.epg.now : null;
    const nextProg = (hasEpg && rawCh.epg.next) ? rawCh.epg.next : null;

    const progTitle = (nowProg && nowProg.title) ? nowProg.title : `${rawCh.name} - Ao Vivo`;
    const progDesc = (nowProg && nowProg.description)
        ? nowProg.description
        : `Transmissão ao vivo do canal ${rawCh.name}. Programação contínua da emissora. Categoria: ${rawCh.category || 'Geral'}.`;

    const timeSlotStr = (nowProg && nowProg.start && nowProg.stop)
        ? formatTimeSlot(nowProg.start, nowProg.stop)
        : formatTimeSlot(null, null);

    let schedule = [];
    if (hasEpg && nowProg) {
        schedule.push({
            time: formatTime12(nowProg.start),
            timeSlot: formatTimeSlot(nowProg.start, nowProg.stop),
            title: nowProg.title,
            description: nowProg.description || progDesc,
            rating: "LIVRE",
            current: true
        });
        if (nextProg && nextProg.title) {
            schedule.push({
                time: formatTime12(nextProg.start),
                timeSlot: formatTimeSlot(nextProg.start, nextProg.stop),
                title: nextProg.title,
                description: nextProg.description || `Próxima atração no canal ${rawCh.name}.`,
                rating: "LIVRE",
                current: false
            });
        }
    }

    while (schedule.length < 3) {
        const slotIdx = schedule.length;
        const fallbackTitles = [
            `${rawCh.name} - Ao Vivo`,
            `${rawCh.name} - Programação Sequencial`,
            `${rawCh.name} - Emissão Regular`
        ];
        schedule.push({
            time: "--:--",
            timeSlot: formatTimeSlot(null, null),
            title: fallbackTitles[slotIdx] || `${rawCh.name}`,
            description: progDesc,
            rating: "LIVRE",
            current: slotIdx === 0
        });
    }

    const shortCode = (rawCh.name || 'CANAL')
        .toUpperCase()
        .replace(/CANAIS:\s*/gi, '')
        .replace(/[✨⚽]/g, '')
        .trim()
        .slice(0, 10);

    return {
        id: channelIdStr,
        number: channelNum,
        slug: rawCh.id,
        code: shortCode,
        name: rawCh.name,
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
        epg: rawCh.epg || { hasEpg: false },
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

// Inicializa a lista com o Canal 000 estático e os 300 canais brasileiros sequenciais (1 a 300)
const RAW_BR_CHANNELS = [
  {
    "id": "br-maisum",
    "name": "+MaisUm",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://i.ibb.co/ZRDvqJcf/Logo-Mais-Um-original-sem-fundo.png",
    "streamUrl": "https://stream.ichibansys.com:3230/hybrid/play.m3u8",
    "liveUrl": "http://localhost:1414/live/br-maisum.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstream.ichibansys.com%3A3230%2Fhybrid%2Fplay.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1733,
    "verifiedAt": "2026-10-27T03:56:33.841Z",
    "epg": {
      "hasEpg": false,
      "channelId": "PlusMaisUm.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-maisum"
    }
  },
  {
    "id": "br-a-e-latin-america-brazil",
    "name": "A&E Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/A%26E_Network_logo.svg/960px-A%26E_Network_logo.svg.png",
    "streamUrl": "http://170.83.16.50/AeE/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-a-e-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.16.50%2FAeE%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 310,
    "verifiedAt": "2026-10-27T03:56:32.424Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AELatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-a-e-latin-america-brazil"
    }
  },
  {
    "id": "br-adesso-tv",
    "name": "Adesso TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/KgetM8j.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-9715/LVW9715_12B26T62tm/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-adesso-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-9715%2FLVW9715_12B26T62tm%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 735,
    "verifiedAt": "2026-10-27T03:56:32.851Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AdessoTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-adesso-tv"
    }
  },
  {
    "id": "br-adult-swim",
    "name": "Adult Swim",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06m/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-adult-swim.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06m%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 79,
    "verifiedAt": "2026-10-27T03:58:09.256Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Adult Swim HD",
      "channelName": "Adult Swim HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-adult-swim"
    }
  },
  {
    "id": "br-agrocanal",
    "name": "AgroCanal",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/5XyopHf.png",
    "streamUrl": "http://45.162.64.114/AGRO_CANAL/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-agrocanal.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FAGRO_CANAL%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 381,
    "verifiedAt": "2026-10-27T03:56:32.512Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AgroCanal.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-agrocanal"
    }
  },
  {
    "id": "br-agromais",
    "name": "AgroMais",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/sFcOZeo.png",
    "streamUrl": "http://45.162.64.114/AGROMAIS/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-agromais.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FAGROMAIS%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 377,
    "verifiedAt": "2026-10-27T03:56:32.510Z",
    "epg": {
      "hasEpg": true,
      "channelId": "AGROMAIS",
      "channelName": "AGROMAIS",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-agromais"
    }
  },
  {
    "id": "br-amazon-sat",
    "name": "Amazon Sat",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/7rjCS5i.png",
    "streamUrl": "https://amazonsat.brasilstream.com.br/hls/amazonsat/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-amazon-sat.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Famazonsat.brasilstream.com.br%2Fhls%2Famazonsat%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 726,
    "verifiedAt": "2026-10-27T03:56:32.863Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AmazonSat.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-amazon-sat"
    }
  },
  {
    "id": "br-amc",
    "name": "AMC",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06s/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-amc.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06s%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1148,
    "verifiedAt": "2026-10-27T03:58:10.225Z",
    "epg": {
      "hasEpg": true,
      "channelId": "AMC HD",
      "channelName": "AMC HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-amc"
    }
  },
  {
    "id": "br-amc-latin-america-brazil",
    "name": "AMC Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/AMC_logo_2019.svg/960px-AMC_logo_2019.svg.png",
    "streamUrl": "http://170.83.49.66:8083/AMCHD/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-amc-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.49.66%3A8083%2FAMCHD%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 385,
    "verifiedAt": "2026-10-27T03:56:32.527Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AMCLatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-amc-latin-america-brazil"
    }
  },
  {
    "id": "br-angel-tv-portuguese",
    "name": "Angel TV Portuguese",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/qKLEGU7.png",
    "streamUrl": "https://janya-digimix.akamaized.net/vglive-sk-382409/portuese/ngrp:angelportuguese_all/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-angel-tv-portuguese.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fjanya-digimix.akamaized.net%2Fvglive-sk-382409%2Fportuese%2Fngrp%3Aangelportuguese_all%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1931,
    "verifiedAt": "2026-10-27T03:56:34.074Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AngelTV.in@Portuguese",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-angel-tv-portuguese"
    }
  },
  {
    "id": "br-animal-planet",
    "name": "ANIMAL PLANET",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "http://topxz.live/logos/Documentarios/ANIMAL_PLANET.png",
    "streamUrl": "http://45.185.11.126:8000/play/a09k/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-animal-planet.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa09k%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304493.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 513,
    "verifiedAt": "2026-10-27T03:58:09.723Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ANIMAL PLANET HD",
      "channelName": "ANIMAL PLANET HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-animal-planet"
    }
  },
  {
    "id": "br-araruna-tv",
    "name": "Araruna TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/jl39ula.png",
    "streamUrl": "https://video05.logicahost.com.br/ararunatv/ararunatv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-araruna-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo05.logicahost.com.br%2Fararunatv%2Fararunatv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1039,
    "verifiedAt": "2026-10-27T03:56:33.193Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ArarunaTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-araruna-tv"
    }
  },
  {
    "id": "br-aratu-on",
    "name": "Aratu On",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/Ht4jCab.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/w/LVW-9359/LVW9359_XSyReL0QVf/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-aratu-on.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fw%2FLVW-9359%2FLVW9359_XSyReL0QVf%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 655,
    "verifiedAt": "2026-10-27T03:56:32.812Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AratuOn.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-aratu-on"
    }
  },
  {
    "id": "br-arte-1",
    "name": "Arte 1",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Culture",
    "logo": "https://i.imgur.com/Ivnk7A6.png",
    "streamUrl": "http://45.162.64.114/ARTE1/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-arte-1.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FARTE1%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/67511.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/67512.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 550,
    "verifiedAt": "2026-10-27T03:56:32.709Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Arte1.br",
      "channelName": "BR - Arte 1",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-arte-1"
    }
  },
  {
    "id": "br-awtv",
    "name": "AWTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Séries",
    "logo": "https://i.imgur.com/2tdMyef.png",
    "streamUrl": "https://awtv.nuvemplay.live/hls/stream.m3u8",
    "liveUrl": "http://localhost:1414/live/br-awtv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fawtv.nuvemplay.live%2Fhls%2Fstream.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1039,
    "verifiedAt": "2026-10-27T03:56:33.202Z",
    "epg": {
      "hasEpg": false,
      "channelId": "AWTV.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-awtv"
    }
  },
  {
    "id": "br-axn",
    "name": "AXN",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://2.bp.blogspot.com/-nBtQ5UkiBI4/XmQcIAhLVYI/AAAAAAAACSk/posGzR9eqD4zllrPY3vGIk6wsFYBJtlRQCK4BGAYYCw/s400/AXN.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0ao/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-axn.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0ao%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81600.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35229.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 597,
    "verifiedAt": "2026-10-27T03:58:09.745Z",
    "epg": {
      "hasEpg": true,
      "channelId": "AXN",
      "channelName": "AXN",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-axn"
    }
  },
  {
    "id": "br-axn-brazil",
    "name": "AXN (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/AXN_logo_%282015%29.svg/960px-AXN_logo_%282015%29.svg.png",
    "streamUrl": "http://170.83.16.50/AXN/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-axn-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.16.50%2FAXN%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 303,
    "verifiedAt": "2026-10-27T03:56:32.468Z",
    "epg": {
      "hasEpg": true,
      "channelId": "AXN.br",
      "channelName": "BR - AXN",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-axn-brazil"
    }
  },
  {
    "id": "br-band-bahia",
    "name": "BAND BAHIA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: BAND ✨",
    "logo": "http://1.bp.blogspot.com/-7wD5BCJxD9Y/Xk70MQFgPEI/AAAAAAAACDQ/BpR4PcQ1ou48cOLmC77yc1mz9xkZ0zssgCLcBGAsYHQ/s1600/band_2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/1166298.m3u8",
    "liveUrl": "http://localhost:1414/live/br-band-bahia.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F1166298.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/1166299.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 3266,
    "verifiedAt": "2026-10-27T03:57:34.213Z",
    "epg": {
      "hasEpg": false,
      "channelId": "band.bahia.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-band-bahia"
    }
  },
  {
    "id": "br-band-news",
    "name": "BAND NEWS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "http://1.bp.blogspot.com/-gKeB31JX8Xo/Xk70NkypJQI/AAAAAAAACDY/WvdRe4gJKEUygQHJTlYRheW18D3S3WGDwCLcBGAsYHQ/s1600/bandnews.png",
    "streamUrl": "http://45.185.11.126:8000/play/a076/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-band-news.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa076%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81596.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/11769.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108367.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30171.m3u8"
    ],
    "totalStreamsAvailable": 5,
    "latencyMs": 349,
    "verifiedAt": "2026-10-27T03:58:09.669Z",
    "epg": {
      "hasEpg": true,
      "channelId": "BAND NEWS",
      "channelName": "BAND NEWS",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-band-news"
    }
  },
  {
    "id": "br-band-rj",
    "name": "BAND RJ",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: BAND ✨",
    "logo": "http://1.bp.blogspot.com/-7wD5BCJxD9Y/Xk70MQFgPEI/AAAAAAAACDQ/BpR4PcQ1ou48cOLmC77yc1mz9xkZ0zssgCLcBGAsYHQ/s1600/band_2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/20524.m3u8",
    "liveUrl": "http://localhost:1414/live/br-band-rj.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F20524.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3609,
    "verifiedAt": "2026-10-27T03:57:34.662Z",
    "epg": {
      "hasEpg": true,
      "channelId": "BandRJ.br",
      "channelName": "BR - Band RJ",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-band-rj"
    }
  },
  {
    "id": "br-band-sp",
    "name": "BAND SP ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: BAND ✨",
    "logo": "http://1.bp.blogspot.com/-7wD5BCJxD9Y/Xk70MQFgPEI/AAAAAAAACDQ/BpR4PcQ1ou48cOLmC77yc1mz9xkZ0zssgCLcBGAsYHQ/s1600/band_2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31029.m3u8",
    "liveUrl": "http://localhost:1414/live/br-band-sp.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F31029.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8660.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/20525.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/43031.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 2827,
    "verifiedAt": "2026-10-27T03:57:33.632Z",
    "epg": {
      "hasEpg": true,
      "channelId": "BAND HD",
      "channelName": "BAND HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-band-sp"
    }
  },
  {
    "id": "br-band-sports",
    "name": "BAND SPORTS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "http://1.bp.blogspot.com/-w_-8bx1hzcI/XmUJ5N5F7VI/AAAAAAAACVA/xJhpJpOiCMEJfcx7tucUtNqdLs53IFp-QCK4BGAYYCw/s400/BAND%2BSPORT.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05o/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-band-sports.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05o%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8661.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/26724.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8662.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30064.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81585.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 334,
    "verifiedAt": "2026-10-27T03:58:09.674Z",
    "epg": {
      "hasEpg": true,
      "channelId": "BAND SPORTS HD",
      "channelName": "BAND SPORTS HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-band-sports"
    }
  },
  {
    "id": "br-bem-mais-tv",
    "name": "Bem Mais TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://bemmaistv.com.br/wp-content/uploads/2025/08/0LASAmOtt4-150x150.jpg",
    "streamUrl": "https://video09.logicahost.com.br/bemmaistv01/bemmaistv01/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-bem-mais-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo09.logicahost.com.br%2Fbemmaistv01%2Fbemmaistv01%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 764,
    "verifiedAt": "2026-10-27T03:56:32.940Z",
    "epg": {
      "hasEpg": false,
      "channelId": "BemMaisTV.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-bem-mais-tv"
    }
  },
  {
    "id": "br-bis",
    "name": "BIS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://4.bp.blogspot.com/-1lBy2BsVKo8/XmP52js4MKI/AAAAAAAACPM/DGdF4eWF2igS-O3RBpQ7TDZjTSCGA9anACK4BGAYYCw/s400/BIS.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07w/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-bis.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07w%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13502.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8681.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8680.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 84,
    "verifiedAt": "2026-10-27T03:58:09.340Z",
    "epg": {
      "hasEpg": true,
      "channelId": "bis",
      "channelName": "bis",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-bis"
    }
  },
  {
    "id": "br-blitstv",
    "name": "Blitstv",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/FO4QTRf.jpeg",
    "streamUrl": "https://stmv1.transmissaodigital.com/blitstv/blitstv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-blitstv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.transmissaodigital.com%2Fblitstv%2Fblitstv%2Fplaylist.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2605,
    "verifiedAt": "2026-10-27T03:56:34.787Z",
    "epg": {
      "hasEpg": false,
      "channelId": "Blitstv.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-blitstv"
    }
  },
  {
    "id": "br-bm-c",
    "name": "BM&C",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06i/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-bm-c.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06i%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 517,
    "verifiedAt": "2026-10-27T03:58:09.781Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-bm-c"
    }
  },
  {
    "id": "br-box-kids-tv",
    "name": "Box Kids TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/1/18/Boxkidstv.png",
    "streamUrl": "http://170.83.49.66:8083/BOXKIDSHD/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-box-kids-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.49.66%3A8083%2FBOXKIDSHD%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 335,
    "verifiedAt": "2026-10-27T03:56:32.530Z",
    "epg": {
      "hasEpg": false,
      "channelId": "BoxKidsTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-box-kids-tv"
    }
  },
  {
    "id": "br-canal-38",
    "name": "Canal 38",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/co7TCWC.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-8503/LVW8503_d0V5oduFlK/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-38.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-8503%2FLVW8503_d0V5oduFlK%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 726,
    "verifiedAt": "2026-10-27T03:56:32.991Z",
    "epg": {
      "hasEpg": false,
      "channelId": "Canal38.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-38"
    }
  },
  {
    "id": "br-canal-brasil",
    "name": "CANAL BRASIL ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://vignette.wikia.nocookie.net/tvpediabrasil/images/c/c0/Canalbrasil.jpg/revision/latest?cb=20171106204353&path-prefix=pt-br",
    "streamUrl": "http://45.185.11.126:8000/play/a06x/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06x%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35231.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 77,
    "verifiedAt": "2026-10-27T03:58:09.663Z",
    "epg": {
      "hasEpg": true,
      "channelId": "canal-brasil",
      "channelName": "canal-brasil",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-canal-brasil"
    }
  },
  {
    "id": "br-canal-do-boi",
    "name": "Canal do Boi",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/pVM5MhS.png",
    "streamUrl": "http://45.162.64.114/CANAL_DO_BOI/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-do-boi.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FCANAL_DO_BOI%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/89852.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 502,
    "verifiedAt": "2026-10-27T03:56:32.831Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CanaldoBoi.br",
      "channelName": "BR - Canal do Boi",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-canal-do-boi"
    }
  },
  {
    "id": "br-canal-educacao",
    "name": "Canal Educacao",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/OOB7nrS.png",
    "streamUrl": "http://45.162.64.114/CANAL_EDUCACAO/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-educacao.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FCANAL_EDUCACAO%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 442,
    "verifiedAt": "2026-10-27T03:56:32.837Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Canal Educacao",
      "channelName": "Canal Educacao",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-canal-educacao"
    }
  },
  {
    "id": "br-canal-fdr",
    "name": "Canal FDR",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/7SE4CkE.png",
    "streamUrl": "https://v-us-01.wisestream.io/memfs/e4ade538-7924-4359-81ef-b9d4dd229e91.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-fdr.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fv-us-01.wisestream.io%2Fmemfs%2Fe4ade538-7924-4359-81ef-b9d4dd229e91.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 880,
    "verifiedAt": "2026-10-27T03:56:33.309Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CanalFDR.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-fdr"
    }
  },
  {
    "id": "br-canal-futura",
    "name": "Canal Futura",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/LgynEBC.png",
    "streamUrl": "http://45.162.64.114/FUTURA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-futura.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FFUTURA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 397,
    "verifiedAt": "2026-10-27T03:56:32.865Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CanalFutura.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-futura"
    }
  },
  {
    "id": "br-canal-gov",
    "name": "Canal Gov",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Legislative",
    "logo": "https://i.imgur.com/rHPY0Yv.png",
    "streamUrl": "http://45.177.114.115/TV_BRASIL_2/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-gov.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.177.114.115%2FTV_BRASIL_2%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 349,
    "verifiedAt": "2026-10-27T03:56:32.860Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CanalGov.br",
      "channelName": "BR - Canal Gov",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-canal-gov"
    }
  },
  {
    "id": "br-canal-metropolitano-de-noticias",
    "name": "Canal Metropolitano de Noticias",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/G0x4xqa.png",
    "streamUrl": "https://stmv5.samcast.com.br/claudio8701/claudio8701/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-metropolitano-de-noticias.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv5.samcast.com.br%2Fclaudio8701%2Fclaudio8701%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 693,
    "verifiedAt": "2026-10-27T03:56:33.220Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CanalMetropolitanodeNoticias.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-metropolitano-de-noticias"
    }
  },
  {
    "id": "br-canal-rural",
    "name": "Canal Rural",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Outdoor",
    "logo": "https://i.imgur.com/w9R9IIX.png",
    "streamUrl": "http://170.83.49.66:8083/CANALRURALHD/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-rural.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.49.66%3A8083%2FCANALRURALHD%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 222,
    "verifiedAt": "2026-10-27T03:56:32.871Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CanalRural.br",
      "channelName": "BR - Canal Rural",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-canal-rural"
    }
  },
  {
    "id": "br-canal-sete",
    "name": "Canal Sete",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/0cq0BPp.png",
    "streamUrl": "http://play.canalsete.com.br:1935/canalsete/xpl-c7_source/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-sete.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fplay.canalsete.com.br%3A1935%2Fcanalsete%2Fxpl-c7_source%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 487,
    "verifiedAt": "2026-10-27T03:56:33.225Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CanalSete.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-sete"
    }
  },
  {
    "id": "br-canal-sony",
    "name": "Canal Sony",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0an/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-sony.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0an%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 167,
    "verifiedAt": "2026-10-27T03:58:09.830Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-canal-sony"
    }
  },
  {
    "id": "br-canal-uol",
    "name": "Canal UOL",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://conteudo.imguol.com.br/c/play/logo_canaluol_2024.svg",
    "streamUrl": "http://45.185.11.126:8000/play/a0a4/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-canal-uol.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0a4%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "https://video24.mais.uol.com.br/live/6146.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 147,
    "verifiedAt": "2026-10-27T03:58:09.816Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Canal UOL",
      "channelName": "Canal UOL",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-canal-uol"
    }
  },
  {
    "id": "br-cartoon-netwoork",
    "name": "CARTOON NETWOORK",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://1.bp.blogspot.com/-aondLW2i3Nw/Xk70ObLd84I/AAAAAAAACDk/UaL7ElNQW-AaFhG-9gEv2FSWp28Cci5hACLcBGAsYHQ/s1600/cartoonnetwork.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/125439.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cartoon-netwoork.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F125439.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/38015.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/38016.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 2756,
    "verifiedAt": "2026-10-27T03:57:35.843Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CartoonNetwork.br",
      "channelName": "BR - Cartoon Network",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-cartoon-netwoork"
    }
  },
  {
    "id": "br-cartoon-network",
    "name": "CARTOON NETWORK",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://1.bp.blogspot.com/-aondLW2i3Nw/Xk70ObLd84I/AAAAAAAACDk/UaL7ElNQW-AaFhG-9gEv2FSWp28Cci5hACLcBGAsYHQ/s1600/cartoonnetwork.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8698.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cartoon-network.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8698.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8699.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13504.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 2792,
    "verifiedAt": "2026-10-27T03:57:35.896Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CartoonNetwork.br",
      "channelName": "BR - Cartoon Network",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-cartoon-network"
    }
  },
  {
    "id": "br-cartoon-network-latin-america-brazil",
    "name": "Cartoon Network Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/960px-Cartoon_Network_2010_logo.svg.png",
    "streamUrl": "http://45.162.64.114/CARTOON_NETWORK/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cartoon-network-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FCARTOON_NETWORK%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 205,
    "verifiedAt": "2026-10-27T03:56:33.017Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CartoonNetworkLatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cartoon-network-latin-america-brazil"
    }
  },
  {
    "id": "br-cartoonito",
    "name": "CARTOONITO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://1.bp.blogspot.com/-n17CiRTaCyE/Xk70Nj_rjpI/AAAAAAAACDc/TsDf_fpQBlosivwrkLjoygIHYogbaV70ACLcBGAsYHQ/s1600/boomerang.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0ae/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cartoonito.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0ae%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13503.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 164,
    "verifiedAt": "2026-10-27T03:58:09.887Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CARTOONITO",
      "channelName": "CARTOONITO",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-cartoonito"
    }
  },
  {
    "id": "br-catve-fm",
    "name": "Catve FM",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/w89yw36.png",
    "streamUrl": "https://5b33b873179a2.streamlock.net:1443/radiocamera/livestream/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-catve-fm.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5b33b873179a2.streamlock.net%3A1443%2Fradiocamera%2Flivestream%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 435,
    "verifiedAt": "2026-10-27T03:56:33.272Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CatveFM.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-catve-fm"
    }
  },
  {
    "id": "br-catve-master-tv",
    "name": "Catve Master TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/4m7Iazm.png",
    "streamUrl": "https://5b33b873179a2.streamlock.net:1443/mastertv/livestream/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-catve-master-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5b33b873179a2.streamlock.net%3A1443%2Fmastertv%2Flivestream%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 392,
    "verifiedAt": "2026-10-27T03:56:33.243Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CatveMasterTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-catve-master-tv"
    }
  },
  {
    "id": "br-catve2",
    "name": "Catve2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/qiVfsfB.png",
    "streamUrl": "https://5b33b873179a2.streamlock.net:1443/catve2/catve2/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-catve2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5b33b873179a2.streamlock.net%3A1443%2Fcatve2%2Fcatve2%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 422,
    "verifiedAt": "2026-10-27T03:56:33.253Z",
    "epg": {
      "hasEpg": false,
      "channelId": "Catve2.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-catve2"
    }
  },
  {
    "id": "br-cazetv",
    "name": "CazeTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/6/64/Caz%C3%A9TV_logo.svg/1280px-Caz%C3%A9TV_logo.svg.png",
    "streamUrl": "http://138.204.86.4:8080/CAZE_TV/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cazetv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F138.204.86.4%3A8080%2FCAZE_TV%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/227520.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/245798.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/245797.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 319,
    "verifiedAt": "2026-10-27T03:56:33.179Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CazeTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cazetv"
    }
  },
  {
    "id": "br-chroma-tv",
    "name": "Chroma TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/SnaIMgj.png",
    "streamUrl": "https://5c483b9d1019c.streamlock.net/8054/8054/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-chroma-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5c483b9d1019c.streamlock.net%2F8054%2F8054%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1070,
    "verifiedAt": "2026-10-27T03:56:33.935Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ChromaTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-chroma-tv"
    }
  },
  {
    "id": "br-cine-sky-01",
    "name": "CINE SKY 01",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: CINE SKY ✨",
    "logo": "http://1.bp.blogspot.com/-hUNENZa3e1c/XmRJ79iDRvI/AAAAAAAACTc/nZdJE1gqWHE930T2lF41jaW0gazwKwfDwCK4BGAYYCw/s400/CINE%2BSKI.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13071.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cine-sky-01.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F13071.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2017,
    "verifiedAt": "2026-10-27T03:57:38.563Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cine-sky-01"
    }
  },
  {
    "id": "br-cine-sky-02",
    "name": "CINE SKY 02",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: CINE SKY ✨",
    "logo": "http://1.bp.blogspot.com/-hUNENZa3e1c/XmRJ79iDRvI/AAAAAAAACTc/nZdJE1gqWHE930T2lF41jaW0gazwKwfDwCK4BGAYYCw/s400/CINE%2BSKI.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13072.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cine-sky-02.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F13072.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2033,
    "verifiedAt": "2026-10-27T03:57:38.618Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cine-sky-02"
    }
  },
  {
    "id": "br-cine-sky-03",
    "name": "CINE SKY 03",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: CINE SKY ✨",
    "logo": "http://1.bp.blogspot.com/-hUNENZa3e1c/XmRJ79iDRvI/AAAAAAAACTc/nZdJE1gqWHE930T2lF41jaW0gazwKwfDwCK4BGAYYCw/s400/CINE%2BSKI.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13073.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cine-sky-03.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F13073.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2028,
    "verifiedAt": "2026-10-27T03:57:38.662Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cine-sky-03"
    }
  },
  {
    "id": "br-cine-sky-05",
    "name": "CINE SKY 05",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: CINE SKY ✨",
    "logo": "http://1.bp.blogspot.com/-hUNENZa3e1c/XmRJ79iDRvI/AAAAAAAACTc/nZdJE1gqWHE930T2lF41jaW0gazwKwfDwCK4BGAYYCw/s400/CINE%2BSKI.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13075.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cine-sky-05.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F13075.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1992,
    "verifiedAt": "2026-10-27T03:57:38.714Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cine-sky-05"
    }
  },
  {
    "id": "br-cinemax",
    "name": "CINEMAX",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://2.bp.blogspot.com/-Pv-Nhnad2FE/XmQd6C0TObI/AAAAAAAACS8/bIFwGCAlgyQPppDIppaHqzF4js5Z4F4aQCK4BGAYYCw/s400/CINEMAX.png",
    "streamUrl": "http://45.185.11.126:8000/play/a081/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cinemax.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa081%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8708.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/107978.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13505.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 81,
    "verifiedAt": "2026-10-27T03:58:09.813Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CINEMAX HD",
      "channelName": "CINEMAX HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-cinemax"
    }
  },
  {
    "id": "br-claro-tv",
    "name": "Claro TV+",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06f/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-claro-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06f%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 132,
    "verifiedAt": "2026-10-27T03:58:09.877Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Claro TV+ 4K",
      "channelName": "Claro TV+ 4K",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-claro-tv"
    }
  },
  {
    "id": "br-classique-tv",
    "name": "Classique TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://i.imgur.com/rHxcraT.png",
    "streamUrl": "https://stmv1.srvif.com/classique/classique/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-classique-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Fclassique%2Fclassique%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1095,
    "verifiedAt": "2026-10-27T03:56:33.990Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ClassiqueTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-classique-tv"
    }
  },
  {
    "id": "br-cnn-brasil",
    "name": "CNN Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/CNN_Brasil.svg/960px-CNN_Brasil.svg.png",
    "streamUrl": "https://d25usgadhphvwi.cloudfront.net/hls/main.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cnn-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fd25usgadhphvwi.cloudfront.net%2Fhls%2Fmain.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81597.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30166.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30167.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8712.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8711.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 558,
    "verifiedAt": "2026-10-27T03:56:33.492Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CNNBrasil.br",
      "channelName": "BR - CNN Brasil",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-cnn-brasil"
    }
  },
  {
    "id": "br-cnn-international",
    "name": "CNN International",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0ap/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cnn-international.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0ap%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 333,
    "verifiedAt": "2026-10-27T03:58:09.868Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CNN INTERNATIONAL",
      "channelName": "CNN INTERNATIONAL",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-cnn-international"
    }
  },
  {
    "id": "br-com-brasil",
    "name": "COM Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/GrjGwKM.png",
    "streamUrl": "https://dfr80qz435crc.cloudfront.net/EFGH/Amagi/NewCo/New_Brasil_BR/New_Brasil.m3u8",
    "liveUrl": "http://localhost:1414/live/br-com-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fdfr80qz435crc.cloudfront.net%2FEFGH%2FAmagi%2FNewCo%2FNew_Brasil_BR%2FNew_Brasil.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 630,
    "verifiedAt": "2026-10-27T03:56:33.570Z",
    "epg": {
      "hasEpg": false,
      "channelId": "COMBrasil.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-com-brasil"
    }
  },
  {
    "id": "br-combate",
    "name": "COMBATE",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "http://1.bp.blogspot.com/-ya115tslPUU/Xk70OyJbtYI/AAAAAAAACDs/dp5hFTRJ54cf0cv0c855d-MKSr5ov_-xgCLcBGAsYHQ/s1600/combate.png",
    "streamUrl": "http://45.185.11.126:8000/play/a073/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-combate.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa073%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30066.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30067.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8714.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13506.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81586.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 90,
    "verifiedAt": "2026-10-27T03:58:09.849Z",
    "epg": {
      "hasEpg": true,
      "channelId": "combate",
      "channelName": "combate",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-combate"
    }
  },
  {
    "id": "br-comedy-central-brasil",
    "name": "Comedy Central Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Comédia",
    "logo": "https://comcastadvertising.com/wp-content/uploads/2021/10/Comedy-Central-White.png",
    "streamUrl": "https://stmv2.srvif.com/gafeab/gafeab/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-comedy-central-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv2.srvif.com%2Fgafeab%2Fgafeab%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1033,
    "verifiedAt": "2026-10-27T03:56:34.024Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ComedyCentral.br",
      "channelName": "BR - Comedy Central",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-comedy-central-brasil"
    }
  },
  {
    "id": "br-conecta-mais-tv",
    "name": "Conecta Mais TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/qHwTWlz.png",
    "streamUrl": "https://adylnet.streampool.net/10324/live/hls/Conecta/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-conecta-mais-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fadylnet.streampool.net%2F10324%2Flive%2Fhls%2FConecta%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 224,
    "verifiedAt": "2026-10-27T03:56:33.409Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ConectaMaisTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-conecta-mais-tv"
    }
  },
  {
    "id": "br-conectv-brasil",
    "name": "ConecTV Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/XN6jjMR.png",
    "streamUrl": "https://stream01.msolutionbrasil.com.br/hls/conectv/live.m3u8",
    "liveUrl": "http://localhost:1414/live/br-conectv-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstream01.msolutionbrasil.com.br%2Fhls%2Fconectv%2Flive.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 989,
    "verifiedAt": "2026-10-27T03:56:34.182Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ConecTVBrasil.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-conectv-brasil"
    }
  },
  {
    "id": "br-cultura-fast",
    "name": "Cultura Fast",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://eitv6.cdn.broadpeak.io/account351-i1438/channel/53/quadrada_-3-_pequeno-1723832301.png",
    "streamUrl": "https://fpa-gateway.tvcultura.com.br:8181/memfs/606caef0-a290-413d-9f1f-8fcdb3a73831.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cultura-fast.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ffpa-gateway.tvcultura.com.br%3A8181%2Fmemfs%2F606caef0-a290-413d-9f1f-8fcdb3a73831.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 183,
    "verifiedAt": "2026-10-27T03:56:33.403Z",
    "epg": {
      "hasEpg": false,
      "channelId": "CulturaFast.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cultura-fast"
    }
  },
  {
    "id": "br-cultura-pa",
    "name": "CULTURA PA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ABERTOS ✨",
    "logo": "http://3.bp.blogspot.com/-qfKzrkmPnFo/XxLot0Cf8LI/AAAAAAAAGoQ/f4-TQf4RNskA_Uc79CCcrVh4LBEbTmxgACK4BGAYYCw/s1600/CULTURA.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/21022.m3u8",
    "liveUrl": "http://localhost:1414/live/br-cultura-pa.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F21022.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2020,
    "verifiedAt": "2026-10-27T03:57:39.959Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-cultura-pa"
    }
  },
  {
    "id": "br-curta",
    "name": "CURTA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://topxz.live/logos/VARIEDADES/CURTA.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/12948.m3u8",
    "liveUrl": "http://localhost:1414/live/br-curta.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F12948.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2695,
    "verifiedAt": "2026-10-27T03:57:39.228Z",
    "epg": {
      "hasEpg": true,
      "channelId": "CURTA",
      "channelName": "CURTA",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-curta"
    }
  },
  {
    "id": "br-despertar-tv",
    "name": "Despertar TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://res.cloudinary.com/dpkehkbpv/image/upload/v1721839192/logo/mixtv/despertar_tv_ieb2l3.png",
    "streamUrl": "https://br.conectmy.com.br/DespertarTV/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-despertar-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fbr.conectmy.com.br%2FDespertarTV%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1405,
    "verifiedAt": "2026-10-27T03:56:34.654Z",
    "epg": {
      "hasEpg": false,
      "channelId": "DespertarTV.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-despertar-tv"
    }
  },
  {
    "id": "br-disc-home-health",
    "name": "Disc. Home & Health",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a07y/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-disc-home-health.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07y%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 88,
    "verifiedAt": "2026-10-27T03:58:09.874Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-disc-home-health"
    }
  },
  {
    "id": "br-discovery-channel",
    "name": "DISCOVERY CHANNEL ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-gO9KQOa5_VM/Xk70PmiUxFI/AAAAAAAACD0/bActYU1lpyUhbKJQrR-parzrrGHAVIEkgCLcBGAsYHQ/s1600/discoverychannel.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0ac/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-channel.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0ac%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/43928.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30148.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 375,
    "verifiedAt": "2026-10-27T03:58:10.163Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY HD",
      "channelName": "DISCOVERY HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-channel"
    }
  },
  {
    "id": "br-discovery-home-healt",
    "name": "DISCOVERY HOME & HEALT ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-rcT1Fa94uEY/Xk70QDg9_VI/AAAAAAAACD8/dx5QGsd5jY4q9mzoovf_KlUpuD56__JwQCLcBGAsYHQ/s1600/discoveryhomehealth.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/93902.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-home-healt.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F93902.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2964,
    "verifiedAt": "2026-10-27T03:57:41.527Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DiscoveryHomeandHealth.br",
      "channelName": "BR - Discovery Home &amp; Health",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-discovery-home-healt"
    }
  },
  {
    "id": "br-discovery-home-health",
    "name": "DISCOVERY HOME & HEALTH",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-rcT1Fa94uEY/Xk70QDg9_VI/AAAAAAAACD8/dx5QGsd5jY4q9mzoovf_KlUpuD56__JwQCLcBGAsYHQ/s1600/discoveryhomehealth.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91397.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-home-health.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F91397.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/20757.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30149.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8740.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8739.m3u8"
    ],
    "totalStreamsAvailable": 5,
    "latencyMs": 2689,
    "verifiedAt": "2026-10-27T03:57:40.958Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DiscoveryHomeandHealth.br",
      "channelName": "BR - Discovery Home &amp; Health",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-discovery-home-health"
    }
  },
  {
    "id": "br-discovery-kids",
    "name": "DISCOVERY KIDS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://1.bp.blogspot.com/-2AIyN1vVYJ4/Xk70P2tZPSI/AAAAAAAACD4/dB9uQ47TzcAMEu4qJU-lYcaBoscJWYKhgCLcBGAsYHQ/s1600/discoverykids.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0ad/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-kids.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0ad%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8743.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8742.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/125440.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/38017.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/38018.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 87,
    "verifiedAt": "2026-10-27T03:58:09.900Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY KIDS HD",
      "channelName": "DISCOVERY KIDS HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-kids"
    }
  },
  {
    "id": "br-discovery-science",
    "name": "DISCOVERY SCIENCE",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-Nn1tKtDj6sY/Xk70QqLw0DI/AAAAAAAACEA/0RwNd0pPQzsv-qwLGMcUIBRCgLK-Vs50ACLcBGAsYHQ/s1600/discoveryscience.png",
    "streamUrl": "http://45.185.11.126:8000/play/a077/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-science.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa077%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8745.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8746.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/93903.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91402.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13509.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30151.m3u8"
    ],
    "totalStreamsAvailable": 7,
    "latencyMs": 127,
    "verifiedAt": "2026-10-27T03:58:09.943Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY SCIENCE HD",
      "channelName": "DISCOVERY SCIENCE HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-science"
    }
  },
  {
    "id": "br-discovery-theater",
    "name": "DISCOVERY THEATER",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-zmhzL_q8BuE/Xk70Q4GLrTI/AAAAAAAACEE/5VO8WJ7wWMAq17Ha1OP0hbtgrqoF1vFrQCLcBGAsYHQ/s1600/discoverytheater.png",
    "streamUrl": "http://45.185.11.126:8000/play/a085/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-theater.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa085%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91401.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13510.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/93904.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8748.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30153.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8751.m3u8"
    ],
    "totalStreamsAvailable": 7,
    "latencyMs": 106,
    "verifiedAt": "2026-10-27T03:58:09.936Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY THEATER HD",
      "channelName": "DISCOVERY THEATER HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-theater"
    }
  },
  {
    "id": "br-discovery-tlc",
    "name": "DISCOVERY TLC",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://2.bp.blogspot.com/-kIUVI9_YPPE/XmP60ycdyPI/AAAAAAAACPY/r6d1IMJFvDQsE-Il4Cic1BnuJN47QvI0ACK4BGAYYCw/s400/TLC.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8754.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-tlc.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8754.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13511.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91400.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8753.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 2667,
    "verifiedAt": "2026-10-27T03:57:42.994Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TLC HD",
      "channelName": "TLC HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-tlc"
    }
  },
  {
    "id": "br-discovery-turbo",
    "name": "DISCOVERY TURBO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/--Gnd1cKRE40/Xk70Rq5scQI/AAAAAAAACEI/zJ6OQb7ctNUtUrNztpfVTBOevy9BVW6fwCLcBGAsYHQ/s1600/discoveryturbo.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07z/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-turbo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07z%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91399.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13512.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8755.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8756.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30156.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30155.m3u8"
    ],
    "totalStreamsAvailable": 7,
    "latencyMs": 140,
    "verifiedAt": "2026-10-27T03:58:09.976Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY TURBO HD",
      "channelName": "DISCOVERY TURBO HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-turbo"
    }
  },
  {
    "id": "br-discovery-world",
    "name": "DISCOVERY WORLD",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-nb1EQ-vyLXg/Xk70RwCpZSI/AAAAAAAACEM/6W2YKWTTrLEyrgWbh52Q7ixjjsGSlWnhgCLcBGAsYHQ/s1600/discoveryworld.png",
    "streamUrl": "http://45.185.11.126:8000/play/a086/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-discovery-world.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa086%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8758.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13513.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/93905.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 124,
    "verifiedAt": "2026-10-27T03:58:09.973Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DISCOVERY WORLD HD",
      "channelName": "DISCOVERY WORLD HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-discovery-world"
    }
  },
  {
    "id": "br-dumdum",
    "name": "DumDum",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/c/c0/DumDum_logo.svg",
    "streamUrl": "http://45.162.64.114/ZOOMOO_KIDS/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-dumdum.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FZOOMOO_KIDS%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://45.185.11.126:8000/play/a078/index.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 86,
    "verifiedAt": "2026-10-27T03:56:33.489Z",
    "epg": {
      "hasEpg": true,
      "channelId": "DumDum",
      "channelName": "DumDum",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-dumdum"
    }
  },
  {
    "id": "br-e",
    "name": "E!",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://3.bp.blogspot.com/-p11362iIZW8/XmP736_KsGI/AAAAAAAACPk/ViHbgXo2BDkd_p85Qs4rWKx-nUei_z5tQCK4BGAYYCw/s400/E.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8782.m3u8",
    "liveUrl": "http://localhost:1414/live/br-e.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8782.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8783.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 2375,
    "verifiedAt": "2026-10-27T03:57:48.226Z",
    "epg": {
      "hasEpg": true,
      "channelId": "E!",
      "channelName": "E!",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-e"
    }
  },
  {
    "id": "br-elytv",
    "name": "ElyTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/1eHNe91.png",
    "streamUrl": "https://stmv1.srvsite.com/ely/ely/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-elytv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvsite.com%2Fely%2Fely%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1301,
    "verifiedAt": "2026-10-27T03:56:34.790Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ElyTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-elytv"
    }
  },
  {
    "id": "br-espn",
    "name": "ESPN",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ESPN ⚽",
    "logo": "http://1.bp.blogspot.com/-6WHUXIszhSo/Xk70ThUHf7I/AAAAAAAACEg/SiQTddgay9gyeGmfwBsvm57Fd4glh4wfgCLcBGAsYHQ/s1600/espn.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/598912.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F598912.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3674,
    "verifiedAt": "2026-10-27T03:57:46.220Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN",
      "channelName": "ESPN",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn"
    }
  },
  {
    "id": "br-espn-brazil",
    "name": "ESPN (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/960px-ESPN_wordmark.svg.png",
    "streamUrl": "http://181.78.197.59:8000/play/a07z/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F181.78.197.59%3A8000%2Fplay%2Fa07z%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 894,
    "verifiedAt": "2026-10-27T03:56:34.477Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN.br",
      "channelName": "BR - ESPN",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-espn-brazil"
    }
  },
  {
    "id": "br-espn-2",
    "name": "ESPN 2 ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ESPN ⚽",
    "logo": "http://4.bp.blogspot.com/-QEKZP5wwMMk/XmUOLIjM24I/AAAAAAAACVk/vYZXgfpe2V8F0hGEdRxhsJ6RACB0jei_gCK4BGAYYCw/s400/ESPN%2B2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30071.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F30071.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/131131.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30072.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 3287,
    "verifiedAt": "2026-10-27T03:57:46.729Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN 2",
      "channelName": "ESPN 2",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn-2"
    }
  },
  {
    "id": "br-espn-3",
    "name": "ESPN 3",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ESPN ⚽",
    "logo": "http://cdn.mitvstatic.com/channels/gt_espn-3_m.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8787.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-3.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8787.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/131132.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8788.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30073.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30074.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13520.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 3024,
    "verifiedAt": "2026-10-27T03:57:46.668Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN 3",
      "channelName": "ESPN 3",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn-3"
    }
  },
  {
    "id": "br-espn-4",
    "name": "ESPN 4",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ESPN ⚽",
    "logo": "http://i.postimg.cc/MZvgnrHS/espn4.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05m/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-4.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05m%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81578.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 124,
    "verifiedAt": "2026-10-27T03:58:09.982Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN 4",
      "channelName": "ESPN 4",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn-4"
    }
  },
  {
    "id": "br-espn-4-brazil",
    "name": "ESPN 4 (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/ESPN_4_logo.svg/960px-ESPN_4_logo.svg.png",
    "streamUrl": "http://181.78.197.59:8000/play/a07n/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-4-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F181.78.197.59%3A8000%2Fplay%2Fa07n%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 903,
    "verifiedAt": "2026-10-27T03:56:34.473Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN4.br",
      "channelName": "BR - ESPN 4",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-espn-4-brazil"
    }
  },
  {
    "id": "br-espn-5",
    "name": "ESPN 5",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a05n/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-5.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05n%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 144,
    "verifiedAt": "2026-10-27T03:58:10.012Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN 5",
      "channelName": "ESPN 5",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn-5"
    }
  },
  {
    "id": "br-espn-6",
    "name": "ESPN 6",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ESPN ⚽",
    "logo": "http://i.ibb.co/YN9gDMq/espn6.png",
    "streamUrl": "http://45.185.11.126:8000/play/a084/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-espn-6.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa084%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81590.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/131138.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8794.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30077.m3u8"
    ],
    "totalStreamsAvailable": 5,
    "latencyMs": 373,
    "verifiedAt": "2026-10-27T03:58:10.247Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ESPN 6",
      "channelName": "ESPN 6",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-espn-6"
    }
  },
  {
    "id": "br-eurosport",
    "name": "Eurosport",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://89.44.231.115:7000/eurosport",
    "liveUrl": "http://localhost:1414/live/br-eurosport.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F89.44.231.115%3A7000%2Feurosport",
    "corsNative": true,
    "isHls": false,
    "backupStreams": [
      "http://89.44.231.73:7000/eurosport",
      "http://89.44.231.117:7000/eurosport"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 451,
    "verifiedAt": "2026-10-27T03:58:11.561Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-eurosport"
    }
  },
  {
    "id": "br-eurosport-2",
    "name": "Eurosport 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://89.44.231.115:7000/eurosport2",
    "liveUrl": "http://localhost:1414/live/br-eurosport-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F89.44.231.115%3A7000%2Feurosport2",
    "corsNative": true,
    "isHls": false,
    "backupStreams": [
      "http://89.44.231.73:7000/eurosport2",
      "http://89.44.231.117:7000/eurosport2"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 458,
    "verifiedAt": "2026-10-27T03:58:11.525Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-eurosport-2"
    }
  },
  {
    "id": "br-eutv",
    "name": "EUTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/8PxpamC.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-8719/LVW8719_AcLVAxWy5J/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-eutv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-8719%2FLVW8719_AcLVAxWy5J%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 90,
    "verifiedAt": "2026-10-27T03:56:33.691Z",
    "epg": {
      "hasEpg": false,
      "channelId": "EUTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-eutv"
    }
  },
  {
    "id": "br-evangelizar",
    "name": "EVANGELIZAR",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "http://1.bp.blogspot.com/-U4SJ0QX3lts/XpYaGWWXXRI/AAAAAAAACxA/NZM1vivsHpM4tvgvlqrw8lfUWydFBkdlgCK4BGAYYCw/s400/tv%2Bevangeliz.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/20532.m3u8",
    "liveUrl": "http://localhost:1414/live/br-evangelizar.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F20532.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2871,
    "verifiedAt": "2026-10-27T03:57:48.628Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Boomerang.us",
      "channelName": "US - BOOMERANG",
      "source": "IPTV-Org EPG Estados Unidos",
      "xmltvUrl": "https://iptv-epg.org/files/epg-us.xml",
      "epgEndpoint": "/api/epg/br-evangelizar"
    }
  },
  {
    "id": "br-fala-litoral",
    "name": "Fala Litoral",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/NF6PL8O.png",
    "streamUrl": "https://5c483b9d1019c.streamlock.net/falalitoraltv/falalitoraltv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-fala-litoral.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5c483b9d1019c.streamlock.net%2Ffalalitoraltv%2Ffalalitoraltv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1056,
    "verifiedAt": "2026-10-27T03:56:34.799Z",
    "epg": {
      "hasEpg": false,
      "channelId": "FalaLitoral.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-fala-litoral"
    }
  },
  {
    "id": "br-fifa-portuguese",
    "name": "FIFA+ Portuguese",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_(2025).svg/960px-FIFA%2B_(2025).svg.png",
    "streamUrl": "https://e3be9ac5.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-fifa-portuguese.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fe3be9ac5.wurl.com%2Fmaster%2Ff36d25e7e52f1ba8d7e56eb859c636563214f541%2FTEctYnJfRklGQVBsdXNQb3J0dWd1ZXNlX0hMUw%2Fplaylist.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1039,
    "verifiedAt": "2026-10-27T03:56:34.880Z",
    "epg": {
      "hasEpg": false,
      "channelId": "FIFAPlus.uk@Portuguese",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-fifa-portuguese"
    }
  },
  {
    "id": "br-fish-tv",
    "name": "FISH TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://2.bp.blogspot.com/-WkDVS4pbZUI/XmBBcYkuGyI/AAAAAAAACMY/vQW_GWMw5sMLFhcqeHvGXlge8RqdwVMHwCK4BGAYYCw/s400/FISH%2BTV.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8808.m3u8",
    "liveUrl": "http://localhost:1414/live/br-fish-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8808.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8807.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 2866,
    "verifiedAt": "2026-10-27T03:57:48.886Z",
    "epg": {
      "hasEpg": true,
      "channelId": "FISH TV",
      "channelName": "FISH TV",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-fish-tv"
    }
  },
  {
    "id": "br-food-netwoork",
    "name": "FOOD NETWOORK",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://2.bp.blogspot.com/-NV7YyPJDcdE/XmP88hrWo6I/AAAAAAAACPw/lIOC5Ros_oA7HQOzAk__lJJb7Gd_aYQMwCK4BGAYYCw/s400/FOOD.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13522.m3u8",
    "liveUrl": "http://localhost:1414/live/br-food-netwoork.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F13522.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2929,
    "verifiedAt": "2026-10-27T03:57:49.003Z",
    "epg": {
      "hasEpg": true,
      "channelId": "FOOD NETWORK HD",
      "channelName": "FOOD NETWORK HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-food-netwoork"
    }
  },
  {
    "id": "br-food-network",
    "name": "FOOD NETWORK",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://2.bp.blogspot.com/-NV7YyPJDcdE/XmP88hrWo6I/AAAAAAAACPw/lIOC5Ros_oA7HQOzAk__lJJb7Gd_aYQMwCK4BGAYYCw/s400/FOOD.png",
    "streamUrl": "http://45.185.11.126:8000/play/a06j/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-food-network.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06j%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8811.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8810.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 440,
    "verifiedAt": "2026-10-27T03:58:10.317Z",
    "epg": {
      "hasEpg": true,
      "channelId": "FOOD NETWORK HD",
      "channelName": "FOOD NETWORK HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-food-network"
    }
  },
  {
    "id": "br-fora-tedio-tv",
    "name": "Fora Tedio TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Comédia",
    "logo": "https://i.imgur.com/R9ul4T1.png",
    "streamUrl": "https://stmv2.srvif.com/foratedio/foratedio/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-fora-tedio-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv2.srvif.com%2Fforatedio%2Fforatedio%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 325,
    "verifiedAt": "2026-10-27T03:56:34.332Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ForaTedioTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-fora-tedio-tv"
    }
  },
  {
    "id": "br-futura",
    "name": "Futura",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.ibb.co/Pz6Nqk7w/logo-futura-vazado.png",
    "streamUrl": "http://170.83.49.66:8083/FUTURAHD/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-futura.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.49.66%3A8083%2FFUTURAHD%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 106,
    "verifiedAt": "2026-10-27T03:56:34.130Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Futura.br",
      "channelName": "BR - Futura",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-futura"
    }
  },
  {
    "id": "br-ge-tv",
    "name": "GE TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5iHsMMu2hsV2aR_3jsX_nHLrVngc04G4_4Q&s",
    "streamUrl": "http://45.185.11.126:8000/play/a08v/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-ge-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08v%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/1139277.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 130,
    "verifiedAt": "2026-10-27T03:58:10.017Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ge-tv",
      "channelName": "ge-tv",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-ge-tv"
    }
  },
  {
    "id": "br-globonews",
    "name": "GloboNews",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/3yZyaCm.png",
    "streamUrl": "http://45.185.11.126:8000/play/a08d/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-globonews.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08d%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81598.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30168.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30169.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13523.m3u8",
      "http://79.127.238.228:14093"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 154,
    "verifiedAt": "2026-10-27T03:58:10.063Z",
    "epg": {
      "hasEpg": true,
      "channelId": "GloboNews.br",
      "channelName": "BR - GloboNews",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-globonews"
    }
  },
  {
    "id": "br-globoplay-novelas",
    "name": "Globoplay Novelas",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06w/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-globoplay-novelas.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06w%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 122,
    "verifiedAt": "2026-10-27T03:58:10.058Z",
    "epg": {
      "hasEpg": true,
      "channelId": "globoplay-novelas",
      "channelName": "globoplay-novelas",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-globoplay-novelas"
    }
  },
  {
    "id": "br-gloob",
    "name": "GLOOB",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://1.bp.blogspot.com/-_Sup4b2u1Fw/Xk70XYrRbSI/AAAAAAAACFM/dltfrlbQAWw-oxFUijzgnnskPf-06OVJACLcBGAsYHQ/s1600/gloob.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07v/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-gloob.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07v%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8888.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13526.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 117,
    "verifiedAt": "2026-10-27T03:58:10.060Z",
    "epg": {
      "hasEpg": true,
      "channelId": "gloob",
      "channelName": "gloob",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-gloob"
    }
  },
  {
    "id": "br-gloobinho",
    "name": "GLOOBINHO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: INFANTIS ✨",
    "logo": "http://im.pkweb.ca:80/images/918911a351d5b29b741b68282ba16536.png",
    "streamUrl": "http://45.185.11.126:8000/play/a071/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-gloobinho.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa071%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69037.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 138,
    "verifiedAt": "2026-10-27T03:58:10.111Z",
    "epg": {
      "hasEpg": true,
      "channelId": "gloobinho",
      "channelName": "gloobinho",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-gloobinho"
    }
  },
  {
    "id": "br-gnt",
    "name": "GNT",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://3.bp.blogspot.com/-iCbjYIDrwhE/XmP_eN3d_iI/AAAAAAAACQI/gVXF4j0G4Dwz8ZDiKaI8Qgth5DSUrcscgCK4BGAYYCw/s400/GNT.png",
    "streamUrl": "http://45.185.11.126:8000/play/a079/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-gnt.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa079%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/66902.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8891.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8890.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/66901.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13527.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/107984.m3u8"
    ],
    "totalStreamsAvailable": 7,
    "latencyMs": 368,
    "verifiedAt": "2026-10-27T03:58:10.268Z",
    "epg": {
      "hasEpg": true,
      "channelId": "gnt",
      "channelName": "gnt",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-gnt"
    }
  },
  {
    "id": "br-gospel-cartoon",
    "name": "Gospel Cartoon",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/yxjPno5.png",
    "streamUrl": "https://stmv1.srvif.com/gospelcartoon/gospelcartoon/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-gospel-cartoon.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Fgospelcartoon%2Fgospelcartoon%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 685,
    "verifiedAt": "2026-10-27T03:56:34.951Z",
    "epg": {
      "hasEpg": false,
      "channelId": "GospelCartoon.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-gospel-cartoon"
    }
  },
  {
    "id": "br-gospel-movie-tv",
    "name": "Gospel Movie TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/cQN3nWt.png",
    "streamUrl": "https://stmv1.srvif.com/gospelf/gospelf/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-gospel-movie-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Fgospelf%2Fgospelf%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 335,
    "verifiedAt": "2026-10-27T03:56:34.606Z",
    "epg": {
      "hasEpg": false,
      "channelId": "GospelMovieTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-gospel-movie-tv"
    }
  },
  {
    "id": "br-hbo",
    "name": "HBO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://1.bp.blogspot.com/-KUhkg79gvtE/Xk70Ycy0l6I/AAAAAAAACFU/FSdt9HsRs98gkzltg-oGA049omcb1KWlQCLcBGAsYHQ/s1600/hbo.png",
    "streamUrl": "http://45.185.11.126:8000/play/a08n/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08n%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://45.185.11.126:8000/play/a08p/index.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/94381.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8902.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 142,
    "verifiedAt": "2026-10-27T03:58:10.121Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO+",
      "channelName": "HBO+",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo"
    }
  },
  {
    "id": "br-hbo-2",
    "name": "HBO 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://1.bp.blogspot.com/-lDifYsJ1bkU/Xk70YgIlO9I/AAAAAAAACFY/H1zNEDSJMCwy4RC_c_8ol0eGstwkb4R7gCLcBGAsYHQ/s1600/hbo2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a08o/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08o%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/94382.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 140,
    "verifiedAt": "2026-10-27T03:58:10.203Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO2",
      "channelName": "HBO2",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-2"
    }
  },
  {
    "id": "br-hbo-family",
    "name": "HBO FAMILY",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://3.bp.blogspot.com/-aGkAuFCyafk/Xk8yLrRrrOI/AAAAAAAACJs/i7YTgH5c8WonAcJEje8dgmN1qTB7LOZKwCK4BGAYYCw/s400/HBO%2BFAMILY.png",
    "streamUrl": "http://45.185.11.126:8000/play/a08q/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-family.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08q%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13530.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 96,
    "verifiedAt": "2026-10-27T03:58:10.072Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Family",
      "channelName": "HBO Family",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-family"
    }
  },
  {
    "id": "br-hbo-mundi",
    "name": "HBO MUNDI ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://1.bp.blogspot.com/-iDOUNw5LOkk/Xk8wvRpCdNI/AAAAAAAACJU/pBSJbJCTe8QU0img-Ad3NJlUVfXGKfapQCK4BGAYYCw/s400/HBO%2BMUND.png",
    "streamUrl": "http://45.185.11.126:8000/play/a082/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-mundi.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa082%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/93900.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31864.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 184,
    "verifiedAt": "2026-10-27T03:58:10.166Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Mundi",
      "channelName": "HBO Mundi",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-mundi"
    }
  },
  {
    "id": "br-hbo-plus",
    "name": "HBO PLUS ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://1.bp.blogspot.com/-IaVubC3e0w4/Xk70YuLghmI/AAAAAAAACFc/dfLAePYpBlwPazBj_MIh10M25XiQDMIpgCLcBGAsYHQ/s1600/hboplus.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31866.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-plus.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F31866.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3263,
    "verifiedAt": "2026-10-27T03:57:55.319Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Plus HD",
      "channelName": "HBO Plus HD",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-hbo-plus"
    }
  },
  {
    "id": "br-hbo-pop",
    "name": "HBO POP",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://3.bp.blogspot.com/-cTWZC_SgeNg/Xk8w0j0Lk6I/AAAAAAAACJc/XYy3GlG6s7MGUPoSHeQ-f0ptS8qA3wmAACK4BGAYYCw/s400/HBO%2BPOP.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/94386.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-pop.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F94386.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3279,
    "verifiedAt": "2026-10-27T03:57:53.370Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Pop",
      "channelName": "HBO Pop",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-pop"
    }
  },
  {
    "id": "br-hbo-signature",
    "name": "HBO SIGNATURE",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://3.bp.blogspot.com/-PPCtBFK9aH8/Xk8zIlyv2MI/AAAAAAAACJ4/POMyrI-OG9whF3UoiOEqS431LuwZmSVGQCK4BGAYYCw/s400/HBO%2BSIGNATURE.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8912.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-signature.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8912.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8914.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31869.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31868.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 3012,
    "verifiedAt": "2026-10-27T03:57:53.986Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Signature",
      "channelName": "HBO Signature",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-signature"
    }
  },
  {
    "id": "br-hbo-xtreme",
    "name": "HBO XTREME ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: HBO ✨",
    "logo": "http://3.bp.blogspot.com/-wpkT1kBB508/XmQfxsbum-I/AAAAAAAACTI/CWh7uRsUWmsEWbF8du8SchSJrkHM3-EAwCK4BGAYYCw/s400/HBO%2BXTRE.png",
    "streamUrl": "http://45.185.11.126:8000/play/a083/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hbo-xtreme.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa083%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/31870.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8916.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13535.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 115,
    "verifiedAt": "2026-10-27T03:58:10.173Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HBO Xtreme",
      "channelName": "HBO Xtreme",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hbo-xtreme"
    }
  },
  {
    "id": "br-hgtv",
    "name": "HGTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "http://topxz.live/logos/Documentarios/HGTV.png",
    "streamUrl": "http://45.185.11.126:8000/play/a074/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-hgtv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa074%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304506.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304508.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 154,
    "verifiedAt": "2026-10-27T03:58:10.221Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HGTV HD",
      "channelName": "HGTV HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-hgtv"
    }
  },
  {
    "id": "br-history",
    "name": "HISTORY",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "http://topxz.live/logos/Documentarios/HISTORY.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0al/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-history.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0al%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304496.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304495.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 1160,
    "verifiedAt": "2026-10-27T03:58:11.232Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HISTORY",
      "channelName": "HISTORY",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-history"
    }
  },
  {
    "id": "br-history-brazil",
    "name": "History (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/History_%282021%29.svg/500px-History_%282021%29.svg.png",
    "streamUrl": "http://45.177.114.114/HISTORY/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-history-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.177.114.114%2FHISTORY%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 57,
    "verifiedAt": "2026-10-27T03:56:34.427Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HISTORY",
      "channelName": "HISTORY",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-history-brazil"
    }
  },
  {
    "id": "br-history-2",
    "name": "HISTORY 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "http://topxz.live/logos/Documentarios/H2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304499.m3u8",
    "liveUrl": "http://localhost:1414/live/br-history-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F304499.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304501.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/304498.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 2835,
    "verifiedAt": "2026-10-27T03:57:51.021Z",
    "epg": {
      "hasEpg": true,
      "channelId": "HISTORY 2",
      "channelName": "HISTORY 2",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-history-2"
    }
  },
  {
    "id": "br-history-2-latin-america-brazil",
    "name": "History 2 Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Documentários",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/History2_logo_%282022%29.svg/500px-History2_logo_%282022%29.svg.png",
    "streamUrl": "http://45.177.114.114/HISTORY_2/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-history-2-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.177.114.114%2FHISTORY_2%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 72,
    "verifiedAt": "2026-10-27T03:56:34.404Z",
    "epg": {
      "hasEpg": false,
      "channelId": "History2LatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-history-2-latin-america-brazil"
    }
  },
  {
    "id": "br-id",
    "name": "ID",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a089/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-id.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa089%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 164,
    "verifiedAt": "2026-10-27T03:58:10.244Z",
    "epg": {
      "hasEpg": true,
      "channelId": "ID HD",
      "channelName": "ID HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-id"
    }
  },
  {
    "id": "br-id-investigacao-discovery",
    "name": "ID - INVESTIGAÇÃO DISCOVERY ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: DISCOVERY ✨",
    "logo": "http://1.bp.blogspot.com/-Gecf4_UVW7Y/Xk70aNhiV0I/AAAAAAAACFs/1iczvzGT0XMxMqNaIWca9KCEgxaiuPuEgCLcBGAsYHQ/s1600/investigationdiscovery.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8934.m3u8",
    "liveUrl": "http://localhost:1414/live/br-id-investigacao-discovery.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F8934.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30172.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/91403.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8933.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 1959,
    "verifiedAt": "2026-10-27T03:57:43.589Z",
    "epg": {
      "hasEpg": true,
      "channelId": "InvestigacaoDiscovery.br",
      "channelName": "BR - Investigação Discovery",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-id-investigacao-discovery"
    }
  },
  {
    "id": "br-istv-brazil",
    "name": "ISTV (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/RUKVrOH.png",
    "streamUrl": "https://stmv1.srvstm.com/sistema7933/sistema7933/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-istv-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvstm.com%2Fsistema7933%2Fsistema7933%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1161,
    "verifiedAt": "2026-10-27T03:56:35.559Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ISTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-istv-brazil"
    }
  },
  {
    "id": "br-j3news-tv",
    "name": "J3NEWS TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/lezIQyL.png",
    "streamUrl": "https://video01.brascast.com/d92ebb4f/d92ebb4f/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-j3news-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo01.brascast.com%2Fd92ebb4f%2Fd92ebb4f%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 473,
    "verifiedAt": "2026-10-27T03:56:34.877Z",
    "epg": {
      "hasEpg": false,
      "channelId": "J3NEWSTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-j3news-tv"
    }
  },
  {
    "id": "br-jovem-pan",
    "name": "JOVEM PAN ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "http://logocanais.ddns.net/Logo/jp.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/167984.m3u8",
    "liveUrl": "http://localhost:1414/live/br-jovem-pan.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F167984.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/167985.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 1962,
    "verifiedAt": "2026-10-27T03:57:37.858Z",
    "epg": {
      "hasEpg": true,
      "channelId": "JOVEM PAN NEWS",
      "channelName": "JOVEM PAN NEWS",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-jovem-pan"
    }
  },
  {
    "id": "br-jovem-pan-news",
    "name": "Jovem Pan News",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Jovem_Pan_logo_2018.svg/960px-Jovem_Pan_logo_2018.svg.png",
    "streamUrl": "http://170.83.49.66:8083/JOVEMPANNEWSHD/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-jovem-pan-news.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.49.66%3A8083%2FJOVEMPANNEWSHD%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/107918.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108191.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 115,
    "verifiedAt": "2026-10-27T03:56:34.592Z",
    "epg": {
      "hasEpg": true,
      "channelId": "JovemPanNews.br",
      "channelName": "BR - Jovem Pan News",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-jovem-pan-news"
    }
  },
  {
    "id": "br-jp-news",
    "name": "JP News",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0a1/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-jp-news.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0a1%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 145,
    "verifiedAt": "2026-10-27T03:58:10.256Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-jp-news"
    }
  },
  {
    "id": "br-kpoptv-play",
    "name": "KpopTV Play",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Música",
    "logo": "https://i.imgur.com/Tf0vweF.png",
    "streamUrl": "https://giatv.bozztv.com/giatv/giatv-kpoptvplay/kpoptvplay/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-kpoptv-play.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fgiatv.bozztv.com%2Fgiatv%2Fgiatv-kpoptvplay%2Fkpoptvplay%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1792,
    "verifiedAt": "2026-10-27T03:56:36.348Z",
    "epg": {
      "hasEpg": false,
      "channelId": "KpopTVPlay.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-kpoptv-play"
    }
  },
  {
    "id": "br-kuriakos-kids",
    "name": "Kuriakos Kids",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://i.imgur.com/SRX6EPY.png",
    "streamUrl": "https://w2.manasat.com/kkids/smil:kkids.smil/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-kuriakos-kids.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fw2.manasat.com%2Fkkids%2Fsmil%3Akkids.smil%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1218,
    "verifiedAt": "2026-10-27T03:56:35.810Z",
    "epg": {
      "hasEpg": false,
      "channelId": "KuriakosKids.pt@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-kuriakos-kids"
    }
  },
  {
    "id": "br-l-ke",
    "name": "L!ke",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/chHsCzB.png",
    "streamUrl": "https://cnl-cl.otteravision.com/cnl/cl_h265/cl_h265.m3u8",
    "liveUrl": "http://localhost:1414/live/br-l-ke.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcnl-cl.otteravision.com%2Fcnl%2Fcl_h265%2Fcl_h265.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 282,
    "verifiedAt": "2026-10-27T03:56:34.878Z",
    "epg": {
      "hasEpg": false,
      "channelId": "Lke.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-l-ke"
    }
  },
  {
    "id": "br-lamore-rock-show-webtv",
    "name": "Lamore Rock Show WebTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Música",
    "logo": "https://www.lamorerockshowwebtv.com.br/wp-content/uploads/2024/11/logo_rockshow.avif",
    "streamUrl": "https://a.cdni.live/rodrigo2364/rodrigo2364/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-lamore-rock-show-webtv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fa.cdni.live%2Frodrigo2364%2Frodrigo2364%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 476,
    "verifiedAt": "2026-10-27T03:56:35.082Z",
    "epg": {
      "hasEpg": false,
      "channelId": "LamoreRockShowWebTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-lamore-rock-show-webtv"
    }
  },
  {
    "id": "br-lifetime",
    "name": "Lifetime",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06l/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-lifetime.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06l%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 119,
    "verifiedAt": "2026-10-27T03:58:10.240Z",
    "epg": {
      "hasEpg": true,
      "channelId": "LIFETIME",
      "channelName": "LIFETIME",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-lifetime"
    }
  },
  {
    "id": "br-lifetime-latin-america-brazil",
    "name": "Lifetime Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Logo_Lifetime_2020.svg/960px-Logo_Lifetime_2020.svg.png",
    "streamUrl": "http://170.83.16.50/LIFETIME/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-lifetime-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.16.50%2FLIFETIME%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 53,
    "verifiedAt": "2026-10-27T03:56:34.707Z",
    "epg": {
      "hasEpg": false,
      "channelId": "LifetimeLatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-lifetime-latin-america-brazil"
    }
  },
  {
    "id": "br-loading",
    "name": "Loading",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/R0aflu1.png",
    "streamUrl": "https://stmv1.srvif.com/loadingtv/loadingtv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-loading.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Floadingtv%2Floadingtv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 316,
    "verifiedAt": "2026-10-27T03:56:34.993Z",
    "epg": {
      "hasEpg": false,
      "channelId": "Loading.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-loading"
    }
  },
  {
    "id": "br-megapix",
    "name": "Megapix",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "http://1.bp.blogspot.com/-KYJNJ8ofZhQ/Xk70bsae15I/AAAAAAAACF4/bu4pFKpyK3I802HKsQJEP4f8S7_KLRUXgCLcBGAsYHQ/s1600/megapix.png",
    "streamUrl": "http://45.185.11.126:8000/play/a057/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-megapix.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa057%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35239.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8962.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35238.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 122,
    "verifiedAt": "2026-10-27T03:58:10.285Z",
    "epg": {
      "hasEpg": true,
      "channelId": "megapix",
      "channelName": "megapix",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-megapix"
    }
  },
  {
    "id": "br-multishow",
    "name": "Multishow",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "http://2.bp.blogspot.com/-YLvYyrLM0Tc/XmQENo4hcuI/AAAAAAAACQs/jKWMWXYMuvIhu7iXvLJCm-9BEONKMcqxwCK4BGAYYCw/s400/MULTICHO.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07a/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-multishow.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07a%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13540.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8975.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 118,
    "verifiedAt": "2026-10-27T03:58:10.291Z",
    "epg": {
      "hasEpg": true,
      "channelId": "multishow",
      "channelName": "multishow",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-multishow"
    }
  },
  {
    "id": "br-mytime-movie-network-brazil",
    "name": "MyTime Movie Network (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://i.imgur.com/aiGQtzI.png",
    "streamUrl": "https://appletree-mytime-samsungbrazil.amagi.tv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-mytime-movie-network-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fappletree-mytime-samsungbrazil.amagi.tv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 727,
    "verifiedAt": "2026-10-27T03:56:35.903Z",
    "epg": {
      "hasEpg": true,
      "channelId": "MyTimeMovieNetwork.us",
      "channelName": "US - MyTime Movie Network",
      "source": "IPTV-Org EPG Estados Unidos",
      "xmltvUrl": "https://iptv-epg.org/files/epg-us.xml",
      "epgEndpoint": "/api/epg/br-mytime-movie-network-brazil"
    }
  },
  {
    "id": "br-nickelodeon-brazil",
    "name": "Nickelodeon (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://i.imgur.com/E84jnP8.png",
    "streamUrl": "https://stmv2.srvif.com/nicktoons/nicktoons/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-nickelodeon-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv2.srvif.com%2Fnicktoons%2Fnicktoons%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1000,
    "verifiedAt": "2026-10-27T03:56:36.495Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Nickelodeon.us",
      "channelName": "US - NICKELODEON",
      "source": "IPTV-Org EPG Estados Unidos",
      "xmltvUrl": "https://iptv-epg.org/files/epg-us.xml",
      "epgEndpoint": "/api/epg/br-nickelodeon-brazil"
    }
  },
  {
    "id": "br-nickonline",
    "name": "NickOnline",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Infantil",
    "logo": "https://x1colegal.com/logo.png",
    "streamUrl": "https://x1colegal.com/hls/stream.m3u8",
    "liveUrl": "http://localhost:1414/live/br-nickonline.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fx1colegal.com%2Fhls%2Fstream.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 694,
    "verifiedAt": "2026-10-27T03:56:36.310Z",
    "epg": {
      "hasEpg": false,
      "channelId": "NickOnline.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-nickonline"
    }
  },
  {
    "id": "br-nova-era-tv",
    "name": "Nova Era TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/IK3F9Uq.png",
    "streamUrl": "http://wz3.dnip.com.br:1935/novaeratv/novaeratv.sdp/live.m3u8",
    "liveUrl": "http://localhost:1414/live/br-nova-era-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fwz3.dnip.com.br%3A1935%2Fnovaeratv%2Fnovaeratv.sdp%2Flive.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 896,
    "verifiedAt": "2026-10-27T03:56:36.565Z",
    "epg": {
      "hasEpg": false,
      "channelId": "NovaEraTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-nova-era-tv"
    }
  },
  {
    "id": "br-novelas-globoplay",
    "name": "NOVELAS GLOBOPLAY",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: NOVELAS GLOBOPLAY ✨",
    "logo": "https://gkpb.com.br/wp-content/uploads/2025/05/globoplay-novelas-gkpb.jpg",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/107983.m3u8",
    "liveUrl": "http://localhost:1414/live/br-novelas-globoplay.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F107983.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13496.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9216.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 2040,
    "verifiedAt": "2026-10-27T03:58:09.858Z",
    "epg": {
      "hasEpg": true,
      "channelId": "globoplay-novelas",
      "channelName": "globoplay-novelas",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-novelas-globoplay"
    }
  },
  {
    "id": "br-novo-tempo",
    "name": "Novo Tempo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "",
    "streamUrl": "http://45.162.64.114/NOVO_TEMPO/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-novo-tempo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FNOVO_TEMPO%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 75,
    "verifiedAt": "2026-10-27T03:56:35.827Z",
    "epg": {
      "hasEpg": false,
      "channelId": "NovoTempo.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-novo-tempo"
    }
  },
  {
    "id": "br-ntv-brazil",
    "name": "NTV (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/n79nkVC.png",
    "streamUrl": "https://cdn.livespanel.com/nossatv/nossatv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-ntv-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.livespanel.com%2Fnossatv%2Fnossatv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 921,
    "verifiedAt": "2026-10-27T03:56:36.731Z",
    "epg": {
      "hasEpg": false,
      "channelId": "NTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-ntv-brazil"
    }
  },
  {
    "id": "br-o-dia-tv",
    "name": "O Dia TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/1LUbAVP.png",
    "streamUrl": "https://6836041ea1117.streamlock.net/tvodia/tvodia/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-o-dia-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F6836041ea1117.streamlock.net%2Ftvodia%2Ftvodia%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1010,
    "verifiedAt": "2026-10-27T03:56:36.913Z",
    "epg": {
      "hasEpg": false,
      "channelId": "ODiaTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-o-dia-tv"
    }
  },
  {
    "id": "br-off",
    "name": "OFF",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: VARIEDADES ✨",
    "logo": "http://4.bp.blogspot.com/-ymMQqU8o9w4/XmQF4ZEEykI/AAAAAAAACRE/twbhOl3niJIoKhnYFk_-al4ULYFLKqiAgCK4BGAYYCw/s400/OFF.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07t/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-off.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07t%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8998.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/8997.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 110,
    "verifiedAt": "2026-10-27T03:58:10.313Z",
    "epg": {
      "hasEpg": true,
      "channelId": "OFF HD",
      "channelName": "OFF HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-off"
    }
  },
  {
    "id": "br-paramount-1",
    "name": "PARAMOUNT + 1",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PARAMOUNT + LIBERTADORES ⚽",
    "logo": "http://4.bp.blogspot.com/-yywnLAEjAEs/XmQVV63a0rI/AAAAAAAACR0/satlJgZrGM8POqoAFqgSvXr0mtaLccZlgCK4BGAYYCw/s400/PARAMONT.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/240737.m3u8",
    "liveUrl": "http://localhost:1414/live/br-paramount-1.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F240737.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3421,
    "verifiedAt": "2026-10-27T03:57:40.432Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Paramount+ 1",
      "channelName": "Paramount+ 1",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-paramount-1"
    }
  },
  {
    "id": "br-paramount-2",
    "name": "PARAMOUNT + 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PARAMOUNT + LIBERTADORES ⚽",
    "logo": "http://4.bp.blogspot.com/-yywnLAEjAEs/XmQVV63a0rI/AAAAAAAACR0/satlJgZrGM8POqoAFqgSvXr0mtaLccZlgCK4BGAYYCw/s400/PARAMONT.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/240739.m3u8",
    "liveUrl": "http://localhost:1414/live/br-paramount-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F240739.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3674,
    "verifiedAt": "2026-10-27T03:57:40.694Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Paramount+ 2",
      "channelName": "Paramount+ 2",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-paramount-2"
    }
  },
  {
    "id": "br-paramount-3",
    "name": "PARAMOUNT + 3",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PARAMOUNT + LIBERTADORES ⚽",
    "logo": "http://4.bp.blogspot.com/-yywnLAEjAEs/XmQVV63a0rI/AAAAAAAACR0/satlJgZrGM8POqoAFqgSvXr0mtaLccZlgCK4BGAYYCw/s400/PARAMONT.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/295698.m3u8",
    "liveUrl": "http://localhost:1414/live/br-paramount-3.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F295698.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3686,
    "verifiedAt": "2026-10-27T03:57:40.749Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Paramount+ 3",
      "channelName": "Paramount+ 3",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-paramount-3"
    }
  },
  {
    "id": "br-paramount-4",
    "name": "PARAMOUNT + 4",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PARAMOUNT + LIBERTADORES ⚽",
    "logo": "http://4.bp.blogspot.com/-yywnLAEjAEs/XmQVV63a0rI/AAAAAAAACR0/satlJgZrGM8POqoAFqgSvXr0mtaLccZlgCK4BGAYYCw/s400/PARAMONT.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0aq/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-paramount-4.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0aq%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/295699.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 115,
    "verifiedAt": "2026-10-27T03:58:10.321Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Paramount+ 4",
      "channelName": "Paramount+ 4",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-paramount-4"
    }
  },
  {
    "id": "br-petlovers-tv",
    "name": "Petlovers TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://petloverstv.com.br/storage/357/config/yqP4nOugWRxRFCmgLqXF4gRKyM9ybsAOfHgUaqPt.png",
    "streamUrl": "https://video04.logicahost.com.br/petloverstv/petloverstv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-petlovers-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo04.logicahost.com.br%2Fpetloverstv%2Fpetloverstv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 236,
    "verifiedAt": "2026-10-27T03:56:36.546Z",
    "epg": {
      "hasEpg": false,
      "channelId": "PetloversTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-petlovers-tv"
    }
  },
  {
    "id": "br-play-tv-brazil",
    "name": "Play TV (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/Ikrj3lk.png",
    "streamUrl": "http://45.162.64.114/PLAY_TV/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-play-tv-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FPLAY_TV%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 76,
    "verifiedAt": "2026-10-27T03:56:36.424Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PLAY TV",
      "channelName": "PLAY TV",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-play-tv-brazil"
    }
  },
  {
    "id": "br-playboy-tv",
    "name": "Playboy TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a09n/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-playboy-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa09n%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 129,
    "verifiedAt": "2026-10-27T03:58:10.347Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-playboy-tv"
    }
  },
  {
    "id": "br-plenitude-tv",
    "name": "Plenitude TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "",
    "streamUrl": "https://strv.painelvox.top/plenitude/plenitude/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-plenitude-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstrv.painelvox.top%2Fplenitude%2Fplenitude%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 361,
    "verifiedAt": "2026-10-27T03:56:36.770Z",
    "epg": {
      "hasEpg": false,
      "channelId": "PlenitudeTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-plenitude-tv"
    }
  },
  {
    "id": "br-premiere-2",
    "name": "PREMIERE 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a06h/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06h%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69028.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69029.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69097.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81582.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9022.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 129,
    "verifiedAt": "2026-10-27T03:58:10.350Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE 2 HD",
      "channelName": "PREMIERE 2 HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-2"
    }
  },
  {
    "id": "br-premiere-3",
    "name": "PREMIERE 3",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a0av/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-3.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0av%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69031.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81583.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30051.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9026.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13577.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 116,
    "verifiedAt": "2026-10-27T03:58:10.341Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE 3 HD",
      "channelName": "PREMIERE 3 HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-3"
    }
  },
  {
    "id": "br-premiere-4",
    "name": "PREMIERE 4 ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07b/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-4.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07b%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108296.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108298.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108295.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81616.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108297.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 125,
    "verifiedAt": "2026-10-27T03:58:10.366Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE 4 HD",
      "channelName": "PREMIERE 4 HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-4"
    }
  },
  {
    "id": "br-premiere-5",
    "name": "PREMIERE 5",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a07c/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-5.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07c%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108304.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108302.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108303.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/82751.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108305.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108306.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108301.m3u8"
    ],
    "totalStreamsAvailable": 8,
    "latencyMs": 124,
    "verifiedAt": "2026-10-27T03:58:10.368Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Premiere 5",
      "channelName": "Premiere 5",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-5"
    }
  },
  {
    "id": "br-premiere-6",
    "name": "PREMIERE 6",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05j/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-6.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05j%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/82753.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108307.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108308.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108309.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108310.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 132,
    "verifiedAt": "2026-10-27T03:58:10.379Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE 6 HD",
      "channelName": "PREMIERE 6 HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-6"
    }
  },
  {
    "id": "br-premiere-7",
    "name": "PREMIERE 7",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05k/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-7.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05k%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108315.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108317.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108314.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108316.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108313.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 128,
    "verifiedAt": "2026-10-27T03:58:10.384Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE 7 HD",
      "channelName": "PREMIERE 7 HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-7"
    }
  },
  {
    "id": "br-premiere-8",
    "name": "PREMIERE 8",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05l/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-8.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05l%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13582.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9036.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 409,
    "verifiedAt": "2026-10-27T03:58:10.677Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Premiere 8",
      "channelName": "Premiere 8",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-premiere-8"
    }
  },
  {
    "id": "br-premiere-8-mosaico",
    "name": "PREMIERE 8 MOSAICO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30063.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-8-mosaico.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F30063.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1978,
    "verifiedAt": "2026-10-27T03:57:57.775Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Premiere 8",
      "channelName": "Premiere 8",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-premiere-8-mosaico"
    }
  },
  {
    "id": "br-premiere-clubes",
    "name": "PREMIERE CLUBES",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PREMIERE ⚽",
    "logo": "http://1.bp.blogspot.com/-9NsHz_itoFc/Xk70dxuLv7I/AAAAAAAACGQ/wCExIoJZ8xgbleziCR-Guhr-AkuLgFhVQCLcBGAsYHQ/s1600/premiere_2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a06g/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-premiere-clubes.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06g%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13583.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/54902.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9037.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/125438.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/94194.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 117,
    "verifiedAt": "2026-10-27T03:58:10.402Z",
    "epg": {
      "hasEpg": true,
      "channelId": "PREMIERE CLUBES HD",
      "channelName": "PREMIERE CLUBES HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-premiere-clubes"
    }
  },
  {
    "id": "br-prime-video-05",
    "name": "PRIME VIDEO 05",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: PRIME VIDEO ⚽",
    "logo": "http://topxz.live/logos/PPV/PrimeVideo.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/246819.m3u8",
    "liveUrl": "http://localhost:1414/live/br-prime-video-05.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F246819.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3253,
    "verifiedAt": "2026-10-27T03:57:41.055Z",
    "epg": {
      "hasEpg": false,
      "channelId": "prime.video.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-prime-video-05"
    }
  },
  {
    "id": "br-primer-tv",
    "name": "Primer TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/PMptSP3.png",
    "streamUrl": "http://200.194.238.229:8383/live/primer/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-primer-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F200.194.238.229%3A8383%2Flive%2Fprimer%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 89,
    "verifiedAt": "2026-10-27T03:56:38.518Z",
    "epg": {
      "hasEpg": false,
      "channelId": "PrimerTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-primer-tv"
    }
  },
  {
    "id": "br-rbatv",
    "name": "RBATV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/ZWFxlU1.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/w/LVW-15748/LVW15748_Yed7yzLuRC/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rbatv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fw%2FLVW-15748%2FLVW15748_Yed7yzLuRC%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 41,
    "verifiedAt": "2026-10-27T03:56:38.504Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RBATV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rbatv"
    }
  },
  {
    "id": "br-record-bahia",
    "name": "RECORD BAHIA ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/291649.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-bahia.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F291649.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2973,
    "verifiedAt": "2026-10-27T03:58:00.036Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.tv.bahia.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-bahia"
    }
  },
  {
    "id": "br-record-goias",
    "name": "RECORD GOIAS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/106097.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-goias.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F106097.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/106096.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 2175,
    "verifiedAt": "2026-10-27T03:57:58.331Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RecordTVGoi&#xE1;s.br",
      "channelName": "BR - Record TV Goiás",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-record-goias"
    }
  },
  {
    "id": "br-record-minas",
    "name": "RECORD MINAS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9054.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-minas.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F9054.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9055.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 2780,
    "verifiedAt": "2026-10-27T03:57:59.172Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.tv.minas.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-minas"
    }
  },
  {
    "id": "br-record-news",
    "name": "Record News",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/HZDRG0K.png",
    "streamUrl": "http://45.162.64.114/RECORD_NEWS/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-news.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FRECORD_NEWS%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://45.185.11.126:8000/play/a0a2/index.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30170.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9058.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9057.m3u8"
    ],
    "totalStreamsAvailable": 5,
    "latencyMs": 75,
    "verifiedAt": "2026-10-27T03:56:38.579Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RecordNews.br",
      "channelName": "BR - Record News",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-record-news"
    }
  },
  {
    "id": "br-record-rj",
    "name": "RECORD RJ",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/106095.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-rj.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F106095.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/71697.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 2033,
    "verifiedAt": "2026-10-27T03:57:58.457Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.rio.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-rj"
    }
  },
  {
    "id": "br-record-rs",
    "name": "RECORD RS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9065.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-rs.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F9065.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/160052.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/160053.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 3225,
    "verifiedAt": "2026-10-27T03:58:00.587Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.rs.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-rs"
    }
  },
  {
    "id": "br-record-sp",
    "name": "RECORD SP ¹",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/38065.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-sp.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F38065.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/82755.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9068.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/12888.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 2979,
    "verifiedAt": "2026-10-27T03:57:59.012Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-sp"
    }
  },
  {
    "id": "br-record-tropical",
    "name": "RECORD TROPICAL",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/225833.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-tropical.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F225833.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3369,
    "verifiedAt": "2026-10-27T03:58:00.878Z",
    "epg": {
      "hasEpg": false,
      "channelId": "tv.tropical.hd.record.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-tropical"
    }
  },
  {
    "id": "br-record-tv-minas",
    "name": "RECORD TV MINAS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: RECORD ✨",
    "logo": "http://1.bp.blogspot.com/-XLsOZ60zFmY/Xk70eb1f_EI/AAAAAAAACGY/AxeGba7vVX0CNxveZAuNj3QzXwaN_t8FQCLcBGAsYHQ/s1600/record.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/291658.m3u8",
    "liveUrl": "http://localhost:1414/live/br-record-tv-minas.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F291658.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3578,
    "verifiedAt": "2026-10-27T03:58:01.254Z",
    "epg": {
      "hasEpg": false,
      "channelId": "record.tv.minas.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-record-tv-minas"
    }
  },
  {
    "id": "br-recordtv-interior-sp",
    "name": "RecordTV Interior SP",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/VcHy0fu.png",
    "streamUrl": "http://200.77.176.130:8000/udp/224.0.0.4:49152",
    "liveUrl": "http://localhost:1414/live/br-recordtv-interior-sp.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F200.77.176.130%3A8000%2Fudp%2F224.0.0.4%3A49152",
    "corsNative": false,
    "isHls": false,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 43,
    "verifiedAt": "2026-10-27T03:56:38.741Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RecordTVInteriorSP.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-recordtv-interior-sp"
    }
  },
  {
    "id": "br-red-bull-tv-br",
    "name": "Red Bull TV BR",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Esportes",
    "logo": "https://images.pluto.tv/channels/5e7cb84a172a0f0007da69e4/colorLogoPNG.png",
    "streamUrl": "https://d03ae6b5c6724c24867e97a3dc04934a.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-1026-WORBBRPTFAST-WHALETVPLUS/1026/hls/master/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-red-bull-tv-br.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fd03ae6b5c6724c24867e97a3dc04934a.mediatailor.us-west-2.amazonaws.com%2Fv1%2Fmaster%2Fba62fe743df0fe93366eba3a257d792884136c7f%2FLINEAR-1026-WORBBRPTFAST-WHALETVPLUS%2F1026%2Fhls%2Fmaster%2Fplaylist.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1253,
    "verifiedAt": "2026-10-27T03:56:40.017Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RedbullTV.us",
      "channelName": "US - Redbull TV",
      "source": "IPTV-Org EPG Estados Unidos",
      "xmltvUrl": "https://iptv-epg.org/files/epg-us.xml",
      "epgEndpoint": "/api/epg/br-red-bull-tv-br"
    }
  },
  {
    "id": "br-rede-brasil",
    "name": "Rede Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/TXJKwzZ.png",
    "streamUrl": "https://redebrasil.nuvemplay.live/hls/stream.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fredebrasil.nuvemplay.live%2Fhls%2Fstream.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1037,
    "verifiedAt": "2026-10-27T03:56:39.826Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RedeBrasil.br",
      "channelName": "BR - Rede Brasil",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-rede-brasil"
    }
  },
  {
    "id": "br-rede-cnt-rio-de-janeiro",
    "name": "Rede CNT Rio de Janeiro",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/jcasAmw.png",
    "streamUrl": "http://45.162.64.114/CNT/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-cnt-rio-de-janeiro.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FCNT%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 113,
    "verifiedAt": "2026-10-27T03:56:38.911Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeCNTRiodeJaneiro.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-cnt-rio-de-janeiro"
    }
  },
  {
    "id": "br-rede-gospel",
    "name": "Rede Gospel",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/mttSwgO.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/w/LVW-8719/LVW8719_AcLVAxWy5J/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-gospel.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fw%2FLVW-8719%2FLVW8719_AcLVAxWy5J%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 329,
    "verifiedAt": "2026-10-27T03:56:39.213Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RedeGospel.br",
      "channelName": "BR - Rede Gospel",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-rede-gospel"
    }
  },
  {
    "id": "br-rede-meio-norte",
    "name": "Rede Meio Norte",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/KVdTi0M.png",
    "streamUrl": "https://maystreaming.cloudecast.com/redemeio/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-meio-norte.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fmaystreaming.cloudecast.com%2Fredemeio%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 423,
    "verifiedAt": "2026-10-27T03:56:39.330Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeMeioNorte.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-meio-norte"
    }
  },
  {
    "id": "br-rede-minas",
    "name": "Rede Minas",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/MtQWAHv.png",
    "streamUrl": "https://8hzcavccys.zoeweb.tv/redeminas/ngrp:redeminas_all/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-minas.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F8hzcavccys.zoeweb.tv%2Fredeminas%2Fngrp%3Aredeminas_all%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 385,
    "verifiedAt": "2026-10-27T03:56:39.312Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeMinas.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-minas"
    }
  },
  {
    "id": "br-rede-ngt",
    "name": "Rede NGT",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/ZFN1R4B.png",
    "streamUrl": "https://isaocorp.cloudecast.com/ngt/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-ngt.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fisaocorp.cloudecast.com%2Fngt%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 350,
    "verifiedAt": "2026-10-27T03:56:39.422Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeNGT.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-ngt"
    }
  },
  {
    "id": "br-rede-seculo-21",
    "name": "Rede Seculo 21",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "",
    "streamUrl": "http://45.162.64.114/REDE_SECULO_21/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-seculo-21.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FREDE_SECULO_21%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 220,
    "verifiedAt": "2026-10-27T03:56:39.300Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Rede Século 21",
      "channelName": "Rede Século 21",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-rede-seculo-21"
    }
  },
  {
    "id": "br-rede-sptv",
    "name": "Rede SPTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/kh3LGAP.png",
    "streamUrl": "https://video01.logicahost.com.br/websptv/websptv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-sptv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo01.logicahost.com.br%2Fwebsptv%2Fwebsptv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 517,
    "verifiedAt": "2026-10-27T03:56:39.611Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeSPTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-sptv"
    }
  },
  {
    "id": "br-rede-tv",
    "name": "Rede TV!",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/ZJgD38F.png",
    "streamUrl": "http://45.162.64.114/REDE_TV/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FREDE_TV%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9073.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/29125.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 159,
    "verifiedAt": "2026-10-27T03:56:39.340Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RedeTV.br",
      "channelName": "BR - RedeTV!",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-rede-tv"
    }
  },
  {
    "id": "br-rede-tv-mais",
    "name": "Rede TV! Mais",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.ibb.co/F0Tm2WP/2103f4c07b851d64b4c96955765a9a95.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/webtv/AVJ-15235/playlist/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rede-tv-mais.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fwebtv%2FAVJ-15235%2Fplaylist%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 141,
    "verifiedAt": "2026-10-27T03:56:39.327Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeTVMais.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-rede-tv-mais"
    }
  },
  {
    "id": "br-redetv-parana",
    "name": "RedeTV! Parana",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/D8R0Af4.png",
    "streamUrl": "https://tv01.zas.media:1936/redetvparana/redetvparana/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-redetv-parana.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ftv01.zas.media%3A1936%2Fredetvparana%2Fredetvparana%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 499,
    "verifiedAt": "2026-10-27T03:56:39.697Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RedeTVParana.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-redetv-parana"
    }
  },
  {
    "id": "br-retro-cartoon",
    "name": "Retro Cartoon",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Classic",
    "logo": "https://i.imgur.com/hIlEfhl.png",
    "streamUrl": "https://stmv1.video.brstream.com.br/retrotv/retrotv/chunklist_w1069200121.m3u8",
    "liveUrl": "http://localhost:1414/live/br-retro-cartoon.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.video.brstream.com.br%2Fretrotv%2Fretrotv%2Fchunklist_w1069200121.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3464,
    "verifiedAt": "2026-10-27T03:56:42.677Z",
    "epg": {
      "hasEpg": false,
      "channelId": "RetroCartoon.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-retro-cartoon"
    }
  },
  {
    "id": "br-rit-tv",
    "name": "RIT TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/Unjs1wi.png",
    "streamUrl": "https://acesso.ecast.site:3648/live/ritlive.m3u8",
    "liveUrl": "http://localhost:1414/live/br-rit-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Facesso.ecast.site%3A3648%2Flive%2Fritlive.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 476,
    "verifiedAt": "2026-10-27T03:56:39.695Z",
    "epg": {
      "hasEpg": true,
      "channelId": "RITtv.br",
      "channelName": "BR - RIT TV",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-rit-tv"
    }
  },
  {
    "id": "br-sbt-aratu-bahia",
    "name": "SBT ARATU BAHIA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SBT ✨",
    "logo": "http://1.bp.blogspot.com/-w44XqjPTvWs/Xk70frnPuKI/AAAAAAAACGo/WLsOdZ3ANYApiYNooamMIhJAWiZwP2yLgCLcBGAsYHQ/s1600/sbt.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108770.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-aratu-bahia.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F108770.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2697,
    "verifiedAt": "2026-10-27T03:58:01.726Z",
    "epg": {
      "hasEpg": false,
      "channelId": "tv.aratu.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-aratu-bahia"
    }
  },
  {
    "id": "br-sbt-cuiaba",
    "name": "SBT Cuiaba",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/EZJWQ3i.png",
    "streamUrl": "https://video09.logicahost.com.br/sbtcuiaba/sbtcuiaba/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-cuiaba.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo09.logicahost.com.br%2Fsbtcuiaba%2Fsbtcuiaba%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 457,
    "verifiedAt": "2026-10-27T03:56:39.757Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SBTCuiaba.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-cuiaba"
    }
  },
  {
    "id": "br-sbt-interior",
    "name": "SBT Interior",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/IkZfa4j.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-interior.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-10801%2FLVW10801_Xvg4R0u57n%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 64,
    "verifiedAt": "2026-10-27T03:56:39.376Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SBTInterior.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-interior"
    }
  },
  {
    "id": "br-sbt-nacional",
    "name": "SBT Nacional",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/tc1ALuu.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/w/LVW-10801/LVW10801_Xvg4R0u57n/chunklist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-nacional.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fw%2FLVW-10801%2FLVW10801_Xvg4R0u57n%2Fchunklist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 285,
    "verifiedAt": "2026-10-27T03:56:39.608Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SBTNacional.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-nacional"
    }
  },
  {
    "id": "br-sbt-news",
    "name": "SBT News",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/4/42/SBT_News_2025.svg",
    "streamUrl": "http://45.185.11.126:8000/play/a0a7/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-news.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0a7%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "https://dai.google.com/linear/hls/event/1XSOdtQ0SH2G8OEmEfGgjQ/master.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 126,
    "verifiedAt": "2026-10-27T03:58:10.417Z",
    "epg": {
      "hasEpg": true,
      "channelId": "SBT News",
      "channelName": "SBT News",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-sbt-news"
    }
  },
  {
    "id": "br-sbt-nova-mutum",
    "name": "SBT Nova Mutum",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/pt/d/d0/Logotipo_do_SBT_Nova_Mutum.png",
    "streamUrl": "https://video09.logicahost.com.br/sbtmutum/sbtmutum/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-nova-mutum.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo09.logicahost.com.br%2Fsbtmutum%2Fsbtmutum%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 516,
    "verifiedAt": "2026-10-27T03:56:39.846Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SBTNovaMutum.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-nova-mutum"
    }
  },
  {
    "id": "br-sbt-rj",
    "name": "SBT RJ",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SBT ✨",
    "logo": "http://1.bp.blogspot.com/-w44XqjPTvWs/Xk70frnPuKI/AAAAAAAACGo/WLsOdZ3ANYApiYNooamMIhJAWiZwP2yLgCLcBGAsYHQ/s1600/sbt.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/131563.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-rj.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F131563.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2013,
    "verifiedAt": "2026-10-27T03:58:00.960Z",
    "epg": {
      "hasEpg": true,
      "channelId": "SBTRJ.br",
      "channelName": "BR - SBT RJ",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-sbt-rj"
    }
  },
  {
    "id": "br-sbt-rondonopolis",
    "name": "SBT Rondonopolis",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/pt/d/d5/Logotipo_do_SBT_Rondon%C3%B3polis.png",
    "streamUrl": "https://video09.logicahost.com.br/sbtroo/sbtroo/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sbt-rondonopolis.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo09.logicahost.com.br%2Fsbtroo%2Fsbtroo%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 516,
    "verifiedAt": "2026-10-27T03:56:39.850Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SBTRondonopolis.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sbt-rondonopolis"
    }
  },
  {
    "id": "br-sic-tv",
    "name": "SIC TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/mHxQyB2.png",
    "streamUrl": "https://parecisfmlive.brasilstream.com.br/hls/parecisfmlive/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sic-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fparecisfmlive.brasilstream.com.br%2Fhls%2Fparecisfmlive%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 584,
    "verifiedAt": "2026-10-27T03:56:40.006Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SICTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sic-tv"
    }
  },
  {
    "id": "br-sony-channel-brazil",
    "name": "Sony Channel (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Sony_Channel_Logo.png/960px-Sony_Channel_Logo.png",
    "streamUrl": "http://170.83.16.50/SONY_CHANNEL/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sony-channel-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F170.83.16.50%2FSONY_CHANNEL%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 268,
    "verifiedAt": "2026-10-27T03:56:39.750Z",
    "epg": {
      "hasEpg": true,
      "channelId": "SonyChannel.br",
      "channelName": "BR - Sony",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-sony-channel-brazil"
    }
  },
  {
    "id": "br-sony-movies",
    "name": "Sony Movies",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Sony_Movies_Logo.svg/500px-Sony_Movies_Logo.svg.png",
    "streamUrl": "http://45.162.64.114/SONY_MOVIES/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sony-movies.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FSONY_MOVIES%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 218,
    "verifiedAt": "2026-10-27T03:56:39.710Z",
    "epg": {
      "hasEpg": true,
      "channelId": "SONY Movies",
      "channelName": "SONY Movies",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-sony-movies"
    }
  },
  {
    "id": "br-sou-tv",
    "name": "SOU TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.ibb.co/8cKmCNm/ezgif-com-gif-maker.png",
    "streamUrl": "https://video10.logicahost.com.br/soutv/soutv/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sou-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo10.logicahost.com.br%2Fsoutv%2Fsoutv%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 494,
    "verifiedAt": "2026-10-27T03:56:40.014Z",
    "epg": {
      "hasEpg": false,
      "channelId": "SOUTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sou-tv"
    }
  },
  {
    "id": "br-space",
    "name": "SPACE ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://1.bp.blogspot.com/-YBl9_nxYYEg/Xk70g8w-e4I/AAAAAAAACGw/Dka4nvxveQomHzF23ECe1TTjbLrHmV7HQCLcBGAsYHQ/s1600/space.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35245.m3u8",
    "liveUrl": "http://localhost:1414/live/br-space.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F35245.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3319,
    "verifiedAt": "2026-10-27T03:58:03.087Z",
    "epg": {
      "hasEpg": true,
      "channelId": "SPACE HD",
      "channelName": "SPACE HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-space"
    }
  },
  {
    "id": "br-sportv",
    "name": "SPORTV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SPORTV ⚽",
    "logo": "http://1.bp.blogspot.com/-3oX39I3AE5Q/Xk70hb83MHI/AAAAAAAACG0/xPBRbtnyn_oqMBPSH10X7XlVE_EEFGMbwCLcBGAsYHQ/s1600/sportv.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05g/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sportv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05g%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9111.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30126.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30127.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81591.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9107.m3u8"
    ],
    "totalStreamsAvailable": 6,
    "latencyMs": 158,
    "verifiedAt": "2026-10-27T03:58:10.642Z",
    "epg": {
      "hasEpg": true,
      "channelId": "sportv",
      "channelName": "sportv",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-sportv"
    }
  },
  {
    "id": "br-sportv-2",
    "name": "SPORTV 2",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SPORTV ⚽",
    "logo": "http://1.bp.blogspot.com/-FNoe3QHwayQ/Xk70hTvFcCI/AAAAAAAACG4/Ee21A4oE-uAfcrongPBnTZwhkhKo_lA3ACLcBGAsYHQ/s1600/sportv2.png",
    "streamUrl": "http://45.185.11.126:8000/play/a05f/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sportv-2.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05f%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30123.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81592.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/13586.m3u8"
    ],
    "totalStreamsAvailable": 4,
    "latencyMs": 84,
    "verifiedAt": "2026-10-27T03:58:10.585Z",
    "epg": {
      "hasEpg": true,
      "channelId": "sportv-2",
      "channelName": "sportv-2",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-sportv-2"
    }
  },
  {
    "id": "br-sportv-3",
    "name": "SPORTV 3",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SPORTV ⚽",
    "logo": "http://3.bp.blogspot.com/-FUk3-ex0kBg/XmULJDTD3FI/AAAAAAAACVM/mr2-8Jagpj8GeudN3N0mAALQyyI3layTQCK4BGAYYCw/s400/SPORT%2B3.png",
    "streamUrl": "http://45.185.11.126:8000/play/a06v/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sportv-3.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06v%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30124.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/81593.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 97,
    "verifiedAt": "2026-10-27T03:58:10.603Z",
    "epg": {
      "hasEpg": true,
      "channelId": "sportv-3",
      "channelName": "sportv-3",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-sportv-3"
    }
  },
  {
    "id": "br-sportv-4",
    "name": "SPORTV 4",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: SPORTV ⚽",
    "logo": "http://1.bp.blogspot.com/-3oX39I3AE5Q/Xk70hb83MHI/AAAAAAAACG0/xPBRbtnyn_oqMBPSH10X7XlVE_EEFGMbwCLcBGAsYHQ/s1600/sportv.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/570369.m3u8",
    "liveUrl": "http://localhost:1414/live/br-sportv-4.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F570369.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1973,
    "verifiedAt": "2026-10-27T03:58:03.638Z",
    "epg": {
      "hasEpg": false,
      "channelId": "sportv.4.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-sportv-4"
    }
  },
  {
    "id": "br-studio-universal",
    "name": "STUDIO UNIVERSAL",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://1.bp.blogspot.com/-HwBnoP0mT_M/XmQbJQxtOmI/AAAAAAAACSY/iYDILTxas0AX_cw4uES3H3Pqb9S7aIGPgCK4BGAYYCw/s400/STUDIO.png",
    "streamUrl": "http://45.185.11.126:8000/play/a06o/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-studio-universal.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06o%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9117.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/108183.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 137,
    "verifiedAt": "2026-10-27T03:58:10.454Z",
    "epg": {
      "hasEpg": true,
      "channelId": "studio-universal",
      "channelName": "studio-universal",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-studio-universal"
    }
  },
  {
    "id": "br-studio-universal-latin-america-brazil",
    "name": "Studio Universal Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/StudioUniversal2016.png/960px-StudioUniversal2016.png",
    "streamUrl": "http://187.102.210.46/universo/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-studio-universal-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F187.102.210.46%2Funiverso%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 484,
    "verifiedAt": "2026-10-27T03:56:40.241Z",
    "epg": {
      "hasEpg": false,
      "channelId": "StudioUniversalLatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-studio-universal-latin-america-brazil"
    }
  },
  {
    "id": "br-stz-tv",
    "name": "STZ TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/SeF2I7q.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/webtv/AVJ-12952/playlist/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-stz-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fwebtv%2FAVJ-12952%2Fplaylist%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 52,
    "verifiedAt": "2026-10-27T03:56:39.813Z",
    "epg": {
      "hasEpg": false,
      "channelId": "STZTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-stz-tv"
    }
  },
  {
    "id": "br-tcm-10",
    "name": "TCM 10",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/aMuMVvB.png",
    "streamUrl": "https://live.tcm10.com.br/tcm10hd/stream.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tcm-10.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Flive.tcm10.com.br%2Ftcm10hd%2Fstream.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 574,
    "verifiedAt": "2026-10-27T03:56:40.387Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TCM10HD.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tcm-10"
    }
  },
  {
    "id": "br-tele-6",
    "name": "TELE 6",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/p7tt72X.png",
    "streamUrl": "https://lbgo.bozztv.com/ssh101/ssh101/tele6/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tele-6.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Flbgo.bozztv.com%2Fssh101%2Fssh101%2Ftele6%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2518,
    "verifiedAt": "2026-10-27T03:56:42.344Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TELE6.bo@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tele-6"
    }
  },
  {
    "id": "br-telecine-action",
    "name": "Telecine Action",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "https://i.imgur.com/BHYWG0h.png",
    "streamUrl": "http://45.185.11.126:8000/play/a058/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-action.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa058%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://46.151.196.223:14326/"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 145,
    "verifiedAt": "2026-10-27T03:58:10.511Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TelecineAction.br",
      "channelName": "BR - Telecine Action",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-telecine-action"
    }
  },
  {
    "id": "br-telecine-cult",
    "name": "Telecine Cult",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a05a/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-cult.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa05a%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 138,
    "verifiedAt": "2026-10-27T03:58:10.506Z",
    "epg": {
      "hasEpg": true,
      "channelId": "telecine-cult",
      "channelName": "telecine-cult",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-telecine-cult"
    }
  },
  {
    "id": "br-telecine-fun",
    "name": "TELECINE FUN ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: TELECINE ✨",
    "logo": "http://2.bp.blogspot.com/-U4WH_IfwjL0/Xk81J1ihAbI/AAAAAAAACKE/zz1a5trjqeEu6PQbXNbrpKDe2ZXf7qWSgCK4BGAYYCw/s400/TELECINE%2BFUN.png",
    "streamUrl": "http://45.185.11.126:8000/play/a059/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-fun.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa059%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30139.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 450,
    "verifiedAt": "2026-10-27T03:58:10.829Z",
    "epg": {
      "hasEpg": true,
      "channelId": "telecine-fun",
      "channelName": "telecine-fun",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-telecine-fun"
    }
  },
  {
    "id": "br-telecine-pipoca",
    "name": "Telecine Pipoca",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08g/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-pipoca.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08g%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 119,
    "verifiedAt": "2026-10-27T03:58:10.501Z",
    "epg": {
      "hasEpg": true,
      "channelId": "telecine-pipoca",
      "channelName": "telecine-pipoca",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-telecine-pipoca"
    }
  },
  {
    "id": "br-telecine-premium",
    "name": "Telecine Premium",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08e/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-premium.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08e%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 131,
    "verifiedAt": "2026-10-27T03:58:10.515Z",
    "epg": {
      "hasEpg": true,
      "channelId": "telecine-premium",
      "channelName": "telecine-premium",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-telecine-premium"
    }
  },
  {
    "id": "br-telecine-touch",
    "name": "TELECINE TOUCH ²",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: TELECINE ✨",
    "logo": "http://1.bp.blogspot.com/-xmlHLAgtCtc/Xk70jtK4nZI/AAAAAAAACHM/YTFmhUzOS3Qca5jxGg5O5-AKGgAXFbPLQCLcBGAsYHQ/s1600/tctouch.png",
    "streamUrl": "http://45.185.11.126:8000/play/a08f/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-telecine-touch.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08f%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/30145.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 129,
    "verifiedAt": "2026-10-27T03:58:10.527Z",
    "epg": {
      "hasEpg": true,
      "channelId": "telecine-touch",
      "channelName": "telecine-touch",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-telecine-touch"
    }
  },
  {
    "id": "br-terra-viva",
    "name": "Terra Viva",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Outdoor",
    "logo": "https://i.imgur.com/wnYsE3O.png",
    "streamUrl": "http://45.162.64.114/TERRAVIVA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-terra-viva.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTERRAVIVA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 106,
    "verifiedAt": "2026-10-27T03:56:39.952Z",
    "epg": {
      "hasEpg": true,
      "channelId": "Terra Viva",
      "channelName": "Terra Viva",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-terra-viva"
    }
  },
  {
    "id": "br-tiktok-radio-brasil",
    "name": "TikTok Radio Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Música",
    "logo": "https://static.wikia.nocookie.net/logopedia/images/f/f4/TikTok_Radio.svg",
    "streamUrl": "https://d1bl6tskrpq9ze.cloudfront.net/hls/master.m3u8?ads.xumo_channelId=99992529",
    "liveUrl": "http://localhost:1414/live/br-tiktok-radio-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fd1bl6tskrpq9ze.cloudfront.net%2Fhls%2Fmaster.m3u8%3Fads.xumo_channelId%3D99992529",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 416,
    "verifiedAt": "2026-10-27T03:56:40.266Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TikTokRadio.us",
      "channelName": "US - TikTok Radio",
      "source": "IPTV-Org EPG Estados Unidos",
      "xmltvUrl": "https://iptv-epg.org/files/epg-us.xml",
      "epgEndpoint": "/api/epg/br-tiktok-radio-brasil"
    }
  },
  {
    "id": "br-times-exclusivo-cnbc",
    "name": "TIMES | EXCLUSIVO CNBC",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0a5/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-times-exclusivo-cnbc.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0a5%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 137,
    "verifiedAt": "2026-10-27T03:58:10.458Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TIMES EXCLUSIVO CNBC",
      "channelName": "TIMES EXCLUSIVO CNBC",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-times-exclusivo-cnbc"
    }
  },
  {
    "id": "br-times-brasil",
    "name": "Times Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Times_Brasil_CNBC_logo_2025.svg/960px-Times_Brasil_CNBC_logo_2025.svg.png",
    "streamUrl": "https://ssai2-ads.api.leiniao.com/global-adinsertion-api/hls/live/v2/21fdb6dd7491406bba86497a24390a25/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-times-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fssai2-ads.api.leiniao.com%2Fglobal-adinsertion-api%2Fhls%2Flive%2Fv2%2F21fdb6dd7491406bba86497a24390a25%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2601,
    "verifiedAt": "2026-10-27T03:56:42.463Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TimesBrasil.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-times-brasil"
    }
  },
  {
    "id": "br-tlc",
    "name": "TLC",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0aa/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tlc.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0aa%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 128,
    "verifiedAt": "2026-10-27T03:58:10.452Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TLC HD",
      "channelName": "TLC HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-tlc"
    }
  },
  {
    "id": "br-tlc-latin-america-brazil",
    "name": "TLC Latin America Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Estilo de Vida",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/TLC_Logo.svg/960px-TLC_Logo.svg.png",
    "streamUrl": "http://79.127.238.228:14433",
    "liveUrl": "http://localhost:1414/live/br-tlc-latin-america-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F79.127.238.228%3A14433",
    "corsNative": false,
    "isHls": false,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 267,
    "verifiedAt": "2026-10-27T03:56:40.149Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TLCLatinAmerica.us@Brazil",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tlc-latin-america-brazil"
    }
  },
  {
    "id": "br-tnt-novelas",
    "name": "TNT NOVELAS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://i.postimg.cc/XYqXKpyb/tntnovelas.png",
    "streamUrl": "http://45.185.11.126:8000/play/a088/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tnt-novelas.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa088%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/275103.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/275104.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 127,
    "verifiedAt": "2026-10-27T03:58:10.456Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TNT NOVELAS",
      "channelName": "TNT NOVELAS",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-tnt-novelas"
    }
  },
  {
    "id": "br-tnt-novelas-265",
    "name": "TNT NOVELAS .265",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://i.postimg.cc/XYqXKpyb/tntnovelas.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/275102.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tnt-novelas-265.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F275102.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3140,
    "verifiedAt": "2026-10-27T03:58:04.866Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TNT NOVELAS",
      "channelName": "TNT NOVELAS",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-tnt-novelas-265"
    }
  },
  {
    "id": "br-tnt-novelas-brazil",
    "name": "TNT Novelas Brazil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Séries",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/TNT_Novelas_2025.svg/1920px-TNT_Novelas_2025.svg.png",
    "streamUrl": "http://45.162.64.114/TNT_NOVELAS/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tnt-novelas-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTNT_NOVELAS%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 79,
    "verifiedAt": "2026-10-27T03:56:40.085Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TNT NOVELAS",
      "channelName": "TNT NOVELAS",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-tnt-novelas-brazil"
    }
  },
  {
    "id": "br-tnt-s-ries",
    "name": "TNT SØries",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08a/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tnt-s-ries.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08a%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 134,
    "verifiedAt": "2026-10-27T03:58:10.481Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tnt-s-ries"
    }
  },
  {
    "id": "br-trace-brasil",
    "name": "Trace Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08l/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-trace-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08l%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 116,
    "verifiedAt": "2026-10-27T03:58:10.518Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TRACE BRASIL HD",
      "channelName": "TRACE BRASIL HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-trace-brasil"
    }
  },
  {
    "id": "br-trace-brazuca",
    "name": "Trace Brazuca",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Música",
    "logo": "https://i.imgur.com/DFBocPu.png",
    "streamUrl": "https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01131-tracetv-tracebrazuca-samsungbr/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-trace-brazuca.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn-uw2-prod.tsv2.amagi.tv%2Flinear%2Famg01131-tracetv-tracebrazuca-samsungbr%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 898,
    "verifiedAt": "2026-10-27T03:56:40.915Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TraceBrazuca.fr@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-trace-brazuca"
    }
  },
  {
    "id": "br-travel-food-drinks",
    "name": "Travel Food & Drinks",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a07x/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-travel-food-drinks.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa07x%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 119,
    "verifiedAt": "2026-10-27T03:58:10.536Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-travel-food-drinks"
    }
  },
  {
    "id": "br-tv-a-critica",
    "name": "TV A Critica",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/j51rBro.png",
    "streamUrl": "https://cdn.live.br1.jmvstream.com/w/LVW-20715/LVW20715_50E3x2MCm2/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-a-critica.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.live.br1.jmvstream.com%2Fw%2FLVW-20715%2FLVW20715_50E3x2MCm2%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 270,
    "verifiedAt": "2026-10-27T03:56:40.352Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVACritica.br",
      "channelName": "BR - TV A Crítica",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-a-critica"
    }
  },
  {
    "id": "br-tv-a-folha",
    "name": "TV A Folha",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/I7XGMhj.png",
    "streamUrl": "https://video01.logicahost.com.br/tvafolha/tvafolha/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-a-folha.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo01.logicahost.com.br%2Ftvafolha%2Ftvafolha%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 25,
    "verifiedAt": "2026-10-27T03:56:40.110Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVAFolha.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-a-folha"
    }
  },
  {
    "id": "br-tv-aldeia",
    "name": "TV Aldeia",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/rsfnv4Z.png",
    "streamUrl": "https://stmv1.samcast.com.br/giovane7843/giovane7843/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-aldeia.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.samcast.com.br%2Fgiovane7843%2Fgiovane7843%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 182,
    "verifiedAt": "2026-10-27T03:56:40.294Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVAldeia.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-aldeia"
    }
  },
  {
    "id": "br-tv-alternativa",
    "name": "TV Alternativa",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/wM9xXhc.png",
    "streamUrl": "https://stmv5.samcast.com.br/wagner7919/wagner7919/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-alternativa.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv5.samcast.com.br%2Fwagner7919%2Fwagner7919%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1771,
    "verifiedAt": "2026-10-27T03:56:41.911Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVAlternativa.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-alternativa"
    }
  },
  {
    "id": "br-tv-aparecida",
    "name": "TV Aparecida",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/kxrja0X.png",
    "streamUrl": "http://45.162.64.114/TV_APARECIDA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-aparecida.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_APARECIDA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 76,
    "verifiedAt": "2026-10-27T03:56:40.222Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVAparecida.br",
      "channelName": "BR - TV Aparecida",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-aparecida"
    }
  },
  {
    "id": "br-tv-arapuan",
    "name": "TV Arapuan",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/3395A2h.png",
    "streamUrl": "https://5b7f3c45ab7c2.streamlock.net/arapuan/ngrp:arapuan_all/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-arapuan.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5b7f3c45ab7c2.streamlock.net%2Farapuan%2Fngrp%3Aarapuan_all%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1439,
    "verifiedAt": "2026-10-27T03:56:41.588Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVArapuan.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-arapuan"
    }
  },
  {
    "id": "br-tv-bahia-1080i",
    "name": "TV Bahia (1080i)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/sJOrvHg.png",
    "streamUrl": "http://hls1.sua.tv/live/globotvbahiafhdbr2/s.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-bahia-1080i.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fhls1.sua.tv%2Flive%2Fglobotvbahiafhdbr2%2Fs.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2094,
    "verifiedAt": "2026-10-27T03:56:42.316Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVBahia.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-bahia-1080i"
    }
  },
  {
    "id": "br-tv-brasil",
    "name": "TV Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/TvBrasil2023.png/960px-TvBrasil2023.png",
    "streamUrl": "http://45.162.64.114/TV_BRASIL/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_BRASIL%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/33013.m3u8",
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/43030.m3u8"
    ],
    "totalStreamsAvailable": 3,
    "latencyMs": 78,
    "verifiedAt": "2026-10-27T03:56:40.319Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVBrasil.br",
      "channelName": "BR - TV Brasil",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-brasil"
    }
  },
  {
    "id": "br-tv-brasil-oeste",
    "name": "TV Brasil Oeste",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/noqGfuy.png",
    "streamUrl": "https://5ad482a77183d.streamlock.net/operacaotbomt.com/operacaotbomt.com/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-brasil-oeste.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5ad482a77183d.streamlock.net%2Foperacaotbomt.com%2Foperacaotbomt.com%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 172,
    "verifiedAt": "2026-10-27T03:56:40.418Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVBrasilOeste.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-brasil-oeste"
    }
  },
  {
    "id": "br-tv-brics-portuguese",
    "name": "TV BRICS Portuguese",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/vLpm8tN.png",
    "streamUrl": "https://porbrics.mediacdn.ru/cdn/brics/portuguese/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-brics-portuguese.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fporbrics.mediacdn.ru%2Fcdn%2Fbrics%2Fportuguese%2Fplaylist.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 3616,
    "verifiedAt": "2026-10-27T03:56:43.875Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVBRICSPortuguese.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-brics-portuguese"
    }
  },
  {
    "id": "br-tv-brusque",
    "name": "TV Brusque",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/J2EAZPS.png",
    "streamUrl": "https://5ad482a77183d.streamlock.net/rodrigotvbrusque.com.br/5d880199c902eb4a1e8df00d/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-brusque.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5ad482a77183d.streamlock.net%2Frodrigotvbrusque.com.br%2F5d880199c902eb4a1e8df00d%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 189,
    "verifiedAt": "2026-10-27T03:56:40.455Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVBrusque.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-brusque"
    }
  },
  {
    "id": "br-tv-camara",
    "name": "TV CÂMARA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ABERTOS ✨",
    "logo": "http://lh3.googleusercontent.com/-GAijnROUhNU/YB1HohJOn-I/AAAAAAAAJ5w/Tdh_j1l8Qf47lzGGEwWZHUjLnsv55nBggCLcBGAsYHQ/TV%2BCamara.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69905.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-camara.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F69905.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1976,
    "verifiedAt": "2026-10-27T03:58:09.148Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TV Camara",
      "channelName": "TV Camara",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-tv-camara"
    }
  },
  {
    "id": "br-tv-camara-brazil",
    "name": "TV Camara (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Legislative",
    "logo": "https://i.imgur.com/Sdou1Ab.png",
    "streamUrl": "https://stream3.camara.gov.br/tv1/manifest.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-camara-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstream3.camara.gov.br%2Ftv1%2Fmanifest.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1894,
    "verifiedAt": "2026-10-27T03:56:42.188Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVCamara.br",
      "channelName": "BR - TV Camara",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-camara-brazil"
    }
  },
  {
    "id": "br-tv-cancao-nova",
    "name": "TV Cancao Nova",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/OaM9hkH.png",
    "streamUrl": "http://45.162.64.114/CANCAO_NOVA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-cancao-nova.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FCANCAO_NOVA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 73,
    "verifiedAt": "2026-10-27T03:56:40.404Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCancaoNova.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-cancao-nova"
    }
  },
  {
    "id": "br-tv-cidade-verde-cuiaba",
    "name": "TV Cidade Verde Cuiaba",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/e67h04h.png",
    "streamUrl": "https://televisaocidadeverde.brasilstream.com.br/hls/televisaocidadeverde/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-cidade-verde-cuiaba.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ftelevisaocidadeverde.brasilstream.com.br%2Fhls%2Ftelevisaocidadeverde%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1719,
    "verifiedAt": "2026-10-27T03:56:42.123Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCidadeVerdeCuiaba.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-cidade-verde-cuiaba"
    }
  },
  {
    "id": "br-tv-clube",
    "name": "TV Clube",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/CpXjcyE.png",
    "streamUrl": "https://5c483b9d1019c.streamlock.net/8186/8186/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-clube.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5c483b9d1019c.streamlock.net%2F8186%2F8186%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2629,
    "verifiedAt": "2026-10-27T03:56:43.047Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVClube.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-clube"
    }
  },
  {
    "id": "br-tv-comunitaria",
    "name": "TV Comunitaria",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/uxefHY3.png",
    "streamUrl": "https://5b7f3c45ab7c2.streamlock.net/8008/smil:8008.smil/playlist.m3u8?DVR=",
    "liveUrl": "http://localhost:1414/live/br-tv-comunitaria.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5b7f3c45ab7c2.streamlock.net%2F8008%2Fsmil%3A8008.smil%2Fplaylist.m3u8%3FDVR%3D",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2503,
    "verifiedAt": "2026-10-27T03:56:42.955Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVComunitaria.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-comunitaria"
    }
  },
  {
    "id": "br-tv-cultura",
    "name": "TV Cultura",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.ibb.co/nm0jXMM/cultura-3x.png",
    "streamUrl": "http://45.162.64.114/TV_CULTURA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-cultura.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_CULTURA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 77,
    "verifiedAt": "2026-10-27T03:56:40.532Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCultura.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-cultura"
    }
  },
  {
    "id": "br-tv-curuca",
    "name": "TV Curuca",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/JdCKNZ4.png",
    "streamUrl": "https://stmv1.srvif.com/tvcurucasp/tvcurucasp/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-curuca.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Ftvcurucasp%2Ftvcurucasp%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2712,
    "verifiedAt": "2026-10-27T03:56:43.178Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCuruca.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-curuca"
    }
  },
  {
    "id": "br-tv-diario",
    "name": "TV DIÁRIO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ABERTOS ✨",
    "logo": "http://1.bp.blogspot.com/-RGr0_SiSzdI/YBxY80ZGhOI/AAAAAAAAJzk/JsdvNJY2kfcGvnNXF6zLKfNOAl-NYO8GQCLcBGAsYHQ/s0/TV%2BDIARIO.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69243.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-diario.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F69243.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2197,
    "verifiedAt": "2026-10-27T03:58:09.320Z",
    "epg": {
      "hasEpg": false,
      "channelId": "tv.diario.br",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-diario"
    }
  },
  {
    "id": "br-tv-difusao",
    "name": "TV Difusao",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://storage.googleapis.com/soultv-prod-media/media/brand/LOGO_TV_DIFUS%C3%83O_100x100px_doiivZN.png",
    "streamUrl": "https://tvdsoultv.acessaradios.com.br/tvdsoultv/tvdsoultv.stream/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-difusao.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ftvdsoultv.acessaradios.com.br%2Ftvdsoultv%2Ftvdsoultv.stream%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2786,
    "verifiedAt": "2026-10-27T03:56:43.341Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVDifusao.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-difusao"
    }
  },
  {
    "id": "br-tv-evangelizar",
    "name": "TV Evangelizar",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/IrYR7Kp.png",
    "streamUrl": "http://45.162.64.114/EVANGELIZAR/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-evangelizar.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FEVANGELIZAR%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 75,
    "verifiedAt": "2026-10-27T03:56:40.911Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TV Evangelizar",
      "channelName": "TV Evangelizar",
      "source": "BrazilTVEPG - Vivo Play",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml",
      "epgEndpoint": "/api/epg/br-tv-evangelizar"
    }
  },
  {
    "id": "br-tv-fronteira-480i",
    "name": "TV Fronteira (480i)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/NtcoW6G.png",
    "streamUrl": "https://tvfronteira.brasilstream.com.br/hls/tvfronteira/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-fronteira-480i.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ftvfronteira.brasilstream.com.br%2Fhls%2Ftvfronteira%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1353,
    "verifiedAt": "2026-10-27T03:56:42.264Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVFronteira.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-fronteira-480i"
    }
  },
  {
    "id": "br-tv-gazeta",
    "name": "TV Gazeta",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/0sksWse.png",
    "streamUrl": "http://45.162.64.114/TV_GAZETA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-gazeta.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_GAZETA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/67852.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 79,
    "verifiedAt": "2026-10-27T03:56:41.023Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVGazeta.br",
      "channelName": "BR - TV Gazeta",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-gazeta"
    }
  },
  {
    "id": "br-tv-guarapari",
    "name": "TV Guarapari",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/eDNzwK0.png",
    "streamUrl": "https://video.welltecnologia.com.br/tvguarapari/tvguarapari/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-guarapari.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo.welltecnologia.com.br%2Ftvguarapari%2Ftvguarapari%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1379,
    "verifiedAt": "2026-10-27T03:56:42.646Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVGuarapari.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-guarapari"
    }
  },
  {
    "id": "br-tv-justica",
    "name": "TV Justica",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/rOQKiMO.png",
    "streamUrl": "http://45.162.64.114/TV_JUSTICA/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-justica.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_JUSTICA%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69907.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 133,
    "verifiedAt": "2026-10-27T03:56:42.044Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVJustica.br",
      "channelName": "BR - TV Justica",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-justica"
    }
  },
  {
    "id": "br-tv-life-america",
    "name": "TV Life America",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Culture",
    "logo": "https://i.imgur.com/HZI0ilU.png",
    "streamUrl": "https://streaming.cloudecast.com/hls/tvlifeamerica/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-life-america.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstreaming.cloudecast.com%2Fhls%2Ftvlifeamerica%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 700,
    "verifiedAt": "2026-10-27T03:56:42.744Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVLifeAmerica.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-life-america"
    }
  },
  {
    "id": "br-tv-mais-marica",
    "name": "TV Mais Marica",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/lgCRX7q.png",
    "streamUrl": "https://5cf4a2c2512a2.streamlock.net/tvmaismarica/tvmaismarica/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-mais-marica.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5cf4a2c2512a2.streamlock.net%2Ftvmaismarica%2Ftvmaismarica%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1231,
    "verifiedAt": "2026-10-27T03:56:43.327Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVMaisMarica.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-mais-marica"
    }
  },
  {
    "id": "br-tv-mana-brasil",
    "name": "TV Mana Brasil",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/AFb712e.png",
    "streamUrl": "https://w1.manasat.com/tvmana-brasil/smil:tvmana-brasil.smil/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-mana-brasil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fw1.manasat.com%2Ftvmana-brasil%2Fsmil%3Atvmana-brasil.smil%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1514,
    "verifiedAt": "2026-10-27T03:56:43.637Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVManaBrasil.pt@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-mana-brasil"
    }
  },
  {
    "id": "br-tv-marajoara",
    "name": "TV Marajoara",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/9d9vBN7.png",
    "streamUrl": "https://tv02.zas.media:1936/tvmarajoara/tvmarajoara/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-marajoara.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Ftv02.zas.media%3A1936%2Ftvmarajoara%2Ftvmarajoara%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 835,
    "verifiedAt": "2026-10-27T03:56:43.023Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVMarajoara.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-marajoara"
    }
  },
  {
    "id": "br-tv-metropole",
    "name": "TV Metropole",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/bJyjLpg.png",
    "streamUrl": "https://cdn-fundacao-2110.ciclano.io:1443/fundacao-2110/fundacao-2110/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-metropole.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn-fundacao-2110.ciclano.io%3A1443%2Ffundacao-2110%2Ffundacao-2110%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 647,
    "verifiedAt": "2026-10-27T03:56:42.911Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVMetropole.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-metropole"
    }
  },
  {
    "id": "br-tv-natal",
    "name": "TV Natal",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/wqQmQml.png",
    "streamUrl": "http://185.228.163.146:8000/play/a01y/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-natal.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F185.228.163.146%3A8000%2Fplay%2Fa01y%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1032,
    "verifiedAt": "2026-10-27T03:56:43.348Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVNatal.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-natal"
    }
  },
  {
    "id": "br-tv-padre-cicero",
    "name": "TV Padre Cicero",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/Y7b29VG.png",
    "streamUrl": "https://video01.logicahost.com.br/tvpadrecicero/tvpadrecicero/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-padre-cicero.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo01.logicahost.com.br%2Ftvpadrecicero%2Ftvpadrecicero%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 33,
    "verifiedAt": "2026-10-27T03:56:42.365Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVPadreCicero.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-padre-cicero"
    }
  },
  {
    "id": "br-tv-pai-eterno",
    "name": "TV Pai Eterno",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/iuoXchN.png",
    "streamUrl": "http://45.162.64.114/TV_PAI_ETERNO/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-pai-eterno.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_PAI_ETERNO%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 80,
    "verifiedAt": "2026-10-27T03:56:42.424Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TV Pai Eterno HD",
      "channelName": "TV Pai Eterno HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-tv-pai-eterno"
    }
  },
  {
    "id": "br-tv-pantanal-ms",
    "name": "TV Pantanal MS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/0FOmktl.png",
    "streamUrl": "https://5a2b083e9f360.streamlock.net/tvpantanal/tvpantanal.sdp/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-pantanal-ms.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5a2b083e9f360.streamlock.net%2Ftvpantanal%2Ftvpantanal.sdp%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 838,
    "verifiedAt": "2026-10-27T03:56:43.203Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVPantanalMS.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-pantanal-ms"
    }
  },
  {
    "id": "br-tv-paraense",
    "name": "TV Paraense",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://duckduckgo.com/i/e408ea02.png",
    "streamUrl": "https://video09.logicahost.com.br/tvparaense/tvparaense/playlist.m3u",
    "liveUrl": "http://localhost:1414/live/br-tv-paraense.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo09.logicahost.com.br%2Ftvparaense%2Ftvparaense%2Fplaylist.m3u",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 50,
    "verifiedAt": "2026-10-27T03:56:42.440Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVParaense.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-paraense"
    }
  },
  {
    "id": "br-tv-parana-turismo",
    "name": "TV Parana Turismo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Travel",
    "logo": "https://i.imgur.com/I6pKoBd.png",
    "streamUrl": "http://200.189.113.201/hls/tve.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-parana-turismo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F200.189.113.201%2Fhls%2Ftve.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 115,
    "verifiedAt": "2026-10-27T03:56:42.539Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVParanaTurismo.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-parana-turismo"
    }
  },
  {
    "id": "br-tv-passo-fundo",
    "name": "TV Passo Fundo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/QFE6TiV.png",
    "streamUrl": "https://5a57bda70564a.streamlock.net/tvpasso/tvpasso.sdp/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-passo-fundo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5a57bda70564a.streamlock.net%2Ftvpasso%2Ftvpasso.sdp%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1061,
    "verifiedAt": "2026-10-27T03:56:43.501Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVPassoFundo.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-passo-fundo"
    }
  },
  {
    "id": "br-tv-petropolis",
    "name": "TV Petropolis",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://web2.petropolis.rj.gov.br/imc/film-commission/uploads/profissional/perfil/785b645d9c574b4d88504a85dbd6ef37.png",
    "streamUrl": "https://video02.logicahost.com.br/tvpetropolis/tvpetropolis/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-petropolis.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo02.logicahost.com.br%2Ftvpetropolis%2Ftvpetropolis%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 312,
    "verifiedAt": "2026-10-27T03:56:42.775Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVPetropolis.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-petropolis"
    }
  },
  {
    "id": "br-tv-ra-tim-bum",
    "name": "TV Ra Tim Bum",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/JIQwz0w.png",
    "streamUrl": "http://45.177.114.115/TV_RA_TIM_BUM/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-ra-tim-bum.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.177.114.115%2FTV_RA_TIM_BUM%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9193.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 92,
    "verifiedAt": "2026-10-27T03:56:42.628Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVRaTimBum.br",
      "channelName": "BR - TV Ra Tim Bum",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-ra-tim-bum"
    }
  },
  {
    "id": "br-tv-r-tim-bum",
    "name": "TV RÆ Tim Bum",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a080/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-r-tim-bum.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa080%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 116,
    "verifiedAt": "2026-10-27T03:58:10.466Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-r-tim-bum"
    }
  },
  {
    "id": "br-tv-sao-raimundo",
    "name": "TV Sao Raimundo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/f34CQIG.png",
    "streamUrl": "https://stmv1.voxtvhd.com.br/9030/9030/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-sao-raimundo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.voxtvhd.com.br%2F9030%2F9030%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1026,
    "verifiedAt": "2026-10-27T03:56:43.565Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVSaoRaimundo.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-sao-raimundo"
    }
  },
  {
    "id": "br-tv-senado",
    "name": "TV SENADO",
    "country": "BR",
    "countryName": "Brasil",
    "category": "CANAIS: ABERTOS ✨",
    "logo": "http://vignette.wikia.nocookie.net/tvpediabrasil/images/d/db/Tvsenado.jpg/revision/latest/scale-to-width-down/340?cb=20160604222123&path-prefix=pt-br",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/69027.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-senado.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F69027.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 2190,
    "verifiedAt": "2026-10-27T03:58:09.264Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TV Senado",
      "channelName": "TV Senado",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-tv-senado"
    }
  },
  {
    "id": "br-tv-senado-brazil",
    "name": "TV Senado (Brazil)",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/duy6waL.png",
    "streamUrl": "http://45.162.64.114/TV_SENADO/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-senado-brazil.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FTV_SENADO%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 99,
    "verifiedAt": "2026-10-27T03:56:42.653Z",
    "epg": {
      "hasEpg": true,
      "channelId": "TVSenado.br",
      "channelName": "BR - TV Senado",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-tv-senado-brazil"
    }
  },
  {
    "id": "br-tv-series",
    "name": "TV Series",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Séries",
    "logo": "https://i.imgur.com/Ff5mj0o.png",
    "streamUrl": "https://stmv1.srvif.com/tvserie/tvserie/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-series.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv1.srvif.com%2Ftvserie%2Ftvserie%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 788,
    "verifiedAt": "2026-10-27T03:56:43.353Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVSeries.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-series"
    }
  },
  {
    "id": "br-tv-sim-cachoeiro",
    "name": "TV Sim Cachoeiro",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/t5oUK3C.png",
    "streamUrl": "https://5cf4a2c2512a2.streamlock.net/8104/8104/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-sim-cachoeiro.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F5cf4a2c2512a2.streamlock.net%2F8104%2F8104%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 910,
    "verifiedAt": "2026-10-27T03:56:43.538Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVSimCachoeiro.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-sim-cachoeiro"
    }
  },
  {
    "id": "br-tv-terceiro-anjo",
    "name": "TV Terceiro Anjo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/PExKWNv.png",
    "streamUrl": "https://streamer1.streamhost.org/salive/GMI3anjoh/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-terceiro-anjo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstreamer1.streamhost.org%2Fsalive%2FGMI3anjoh%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1618,
    "verifiedAt": "2026-10-27T03:56:44.378Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVTerceiroAnjo.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-terceiro-anjo"
    }
  },
  {
    "id": "br-tv-ufop",
    "name": "TV UFOP",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://raw.githubusercontent.com/daniloroxette/tvufop/refs/heads/main/images/tvufop_logo.png",
    "streamUrl": "https://app.tvufop.com.br/hls/tvufop.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-ufop.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fapp.tvufop.com.br%2Fhls%2Ftvufop.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 216,
    "verifiedAt": "2026-10-27T03:56:43.064Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVUFOP.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-ufop"
    }
  },
  {
    "id": "br-tv-universal",
    "name": "TV Universal",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Religioso",
    "logo": "https://i.imgur.com/TIsk5zN.png",
    "streamUrl": "https://644398c.ha.azioncdn.net/primary/tvuniversal_480p.sdp/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-universal.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2F644398c.ha.azioncdn.net%2Fprimary%2Ftvuniversal_480p.sdp%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 767,
    "verifiedAt": "2026-10-27T03:56:43.647Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVUniversal.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-universal"
    }
  },
  {
    "id": "br-tv-vicosa",
    "name": "TV Vicosa",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/TZF55f9.png",
    "streamUrl": "http://wz4.dnip.com.br/fratevitv/fratevitv.sdp/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-vicosa.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fwz4.dnip.com.br%2Ffratevitv%2Ffratevitv.sdp%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 511,
    "verifiedAt": "2026-10-27T03:56:43.422Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVVicosa.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-vicosa"
    }
  },
  {
    "id": "br-tv-vila-real",
    "name": "TV Vila Real",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/Z1uWe7g.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-10841/LVW10841_mT77z9o2cP/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-vila-real.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-10841%2FLVW10841_mT77z9o2cP%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 85,
    "verifiedAt": "2026-10-27T03:56:43.009Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVVilaReal.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-vila-real"
    }
  },
  {
    "id": "br-tv-zoom",
    "name": "TV Zoom",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/jCGrjf5.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-9730/LVW9730_LmUwslM8jt/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-zoom.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-9730%2FLVW9730_LmUwslM8jt%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 126,
    "verifiedAt": "2026-10-27T03:56:43.067Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVZoom.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-zoom"
    }
  },
  {
    "id": "br-tv-pet",
    "name": "TV+Pet",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://www.tvmaispet.com.br/images/tvpet-logo.png",
    "streamUrl": "https://stmv5.samcast.com.br/tvmaispet6354/tvmaispet6354/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tv-pet.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstmv5.samcast.com.br%2Ftvmaispet6354%2Ftvmaispet6354%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 210,
    "verifiedAt": "2026-10-27T03:56:43.165Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVPlusPet.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tv-pet"
    }
  },
  {
    "id": "br-tvc-rio",
    "name": "TVC-Rio",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/WDiikWv.png",
    "streamUrl": "https://video05.logicahost.com.br/comunitariario/comunitariario/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvc-rio.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo05.logicahost.com.br%2Fcomunitariario%2Fcomunitariario%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 593,
    "verifiedAt": "2026-10-27T03:56:43.602Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCRio.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvc-rio"
    }
  },
  {
    "id": "br-tvcom-maceio",
    "name": "TVCOM Maceio",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/IE7IZzi.png",
    "streamUrl": "https://srv5.zcast.com.br/tvcommaceio/tvcommaceio/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvcom-maceio.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fsrv5.zcast.com.br%2Ftvcommaceio%2Ftvcommaceio%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1983,
    "verifiedAt": "2026-10-27T03:56:45.006Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVCOMMaceio.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvcom-maceio"
    }
  },
  {
    "id": "br-tve-bahia",
    "name": "TVE Bahia",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/TVE_Bahia_logo.svg/960px-TVE_Bahia_logo.svg.png",
    "streamUrl": "http://streaming.procergs.com.br:1935/tve/stve/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tve-bahia.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fstreaming.procergs.com.br%3A1935%2Ftve%2Fstve%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 324,
    "verifiedAt": "2026-10-27T03:56:43.371Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVEBahia.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tve-bahia"
    }
  },
  {
    "id": "br-tve-rs",
    "name": "TVE RS",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/MQ6lJpS.png",
    "streamUrl": "https://streaming.procergs.com.br:8443/tve/stve/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tve-rs.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstreaming.procergs.com.br%3A8443%2Ftve%2Fstve%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1197,
    "verifiedAt": "2026-10-27T03:56:44.261Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVERS.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tve-rs"
    }
  },
  {
    "id": "br-tvideonews",
    "name": "TVideoNews",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/vstHOYx.png",
    "streamUrl": "https://video01.logicahost.com.br/tvideonews/tvideonews/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvideonews.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fvideo01.logicahost.com.br%2Ftvideonews%2Ftvideonews%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 31,
    "verifiedAt": "2026-10-27T03:56:43.098Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVideoNews.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvideonews"
    }
  },
  {
    "id": "br-tvitape",
    "name": "TVitape",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/XeqcwKe.png",
    "streamUrl": "https://stream01.msolutionbrasil.com.br/hls/tvitape/live.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvitape.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fstream01.msolutionbrasil.com.br%2Fhls%2Ftvitape%2Flive.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 1159,
    "verifiedAt": "2026-10-27T03:56:44.257Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVitape.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvitape"
    }
  },
  {
    "id": "br-tvlatinasat",
    "name": "TVLatinaSat",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://latinasat.com.br/logo.png",
    "streamUrl": "https://www.latinasat.com.br/hls/live/stream/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvlatinasat.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fwww.latinasat.com.br%2Fhls%2Flive%2Fstream%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 154,
    "verifiedAt": "2026-10-27T03:56:43.319Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVLatinaSat.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvlatinasat"
    }
  },
  {
    "id": "br-tvnbn",
    "name": "TVNBN",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral / Variedades",
    "logo": "https://i.imgur.com/zoHBxn1.png",
    "streamUrl": "https://cdn.jmvstream.com/w/LVW-8410/LVW8410_uiZOVm6vz1/playlist.m3u8",
    "liveUrl": "http://localhost:1414/live/br-tvnbn.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fcdn.jmvstream.com%2Fw%2FLVW-8410%2FLVW8410_uiZOVm6vz1%2Fplaylist.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 70,
    "verifiedAt": "2026-10-27T03:56:43.397Z",
    "epg": {
      "hasEpg": false,
      "channelId": "TVNBN.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-tvnbn"
    }
  },
  {
    "id": "br-uma-tv",
    "name": "UMA TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Entretenimento",
    "logo": "https://i.imgur.com/m0RVb79.png",
    "streamUrl": "https://umatv.nuvemplay.live/hls/stream.m3u8",
    "liveUrl": "http://localhost:1414/live/br-uma-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fumatv.nuvemplay.live%2Fhls%2Fstream.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 605,
    "verifiedAt": "2026-10-27T03:56:43.946Z",
    "epg": {
      "hasEpg": false,
      "channelId": "UMATV.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-uma-tv"
    }
  },
  {
    "id": "br-unisul-tv",
    "name": "Unisul TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Educativo",
    "logo": "https://i.imgur.com/N0TvAFz.png",
    "streamUrl": "https://sitetv.brasilstream.com.br/hls/sitetv/index.m3u8?token=",
    "liveUrl": "http://localhost:1414/live/br-unisul-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fsitetv.brasilstream.com.br%2Fhls%2Fsitetv%2Findex.m3u8%3Ftoken%3D",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 301,
    "verifiedAt": "2026-10-27T03:56:43.649Z",
    "epg": {
      "hasEpg": false,
      "channelId": "UnisulTV.br@SD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-unisul-tv"
    }
  },
  {
    "id": "br-universal-channel",
    "name": "UNIVERSAL CHANNEL",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Filmes & Séries",
    "logo": "http://1.bp.blogspot.com/-cl-zcjepRcU/Xk70nmSkZsI/AAAAAAAACH4/ROQDJ7TdojcAxCW6SVf9B1AoxlaV8KYfgCLcBGAsYHQ/s1600/universaltv.png",
    "streamUrl": "http://governosptx.org:80/3llohwk4g9/kwf099q30o/9212.m3u8",
    "liveUrl": "http://localhost:1414/live/br-universal-channel.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2Fgovernosptx.org%3A80%2F3llohwk4g9%2Fkwf099q30o%2F9212.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://governosptx.org:80/3llohwk4g9/kwf099q30o/35256.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 3733,
    "verifiedAt": "2026-10-27T03:58:11.110Z",
    "epg": {
      "hasEpg": true,
      "channelId": "universal",
      "channelName": "universal",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-universal-channel"
    }
  },
  {
    "id": "br-universal-premiere",
    "name": "Universal Premiere",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08m/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-universal-premiere.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08m%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 98,
    "verifiedAt": "2026-10-27T03:58:10.552Z",
    "epg": {
      "hasEpg": true,
      "channelId": "UNIVERSAL PREMIERE HD",
      "channelName": "UNIVERSAL PREMIERE HD",
      "source": "BrazilTVEPG - Principal",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml",
      "epgEndpoint": "/api/epg/br-universal-premiere"
    }
  },
  {
    "id": "br-universal-reality",
    "name": "Universal Reality",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a08c/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-universal-reality.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa08c%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 386,
    "verifiedAt": "2026-10-27T03:58:10.842Z",
    "epg": {
      "hasEpg": true,
      "channelId": "UNIVERSAL REALITY",
      "channelName": "UNIVERSAL REALITY",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-universal-reality"
    }
  },
  {
    "id": "br-universal-tv",
    "name": "Universal TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0af/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-universal-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0af%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 113,
    "verifiedAt": "2026-10-27T03:58:10.571Z",
    "epg": {
      "hasEpg": true,
      "channelId": "UNIVERSAL TV HD",
      "channelName": "UNIVERSAL TV HD",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-universal-tv"
    }
  },
  {
    "id": "br-usa",
    "name": "USA",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a06k/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-usa.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa06k%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 395,
    "verifiedAt": "2026-10-27T03:58:10.847Z",
    "epg": {
      "hasEpg": false,
      "channelId": null,
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-usa"
    }
  },
  {
    "id": "br-veja-tv",
    "name": "VEJA+ TV",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Notícias",
    "logo": "https://i.imgur.com/n0pxHo4.png",
    "streamUrl": "https://gpa-vja.otteravision.com/gpa/vja/vja.m3u8",
    "liveUrl": "http://localhost:1414/live/br-veja-tv.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=https%3A%2F%2Fgpa-vja.otteravision.com%2Fgpa%2Fvja%2Fvja.m3u8",
    "corsNative": false,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 458,
    "verifiedAt": "2026-10-27T03:56:43.829Z",
    "epg": {
      "hasEpg": false,
      "channelId": "VEJAPlusTV.br@HD",
      "channelName": null,
      "source": null,
      "xmltvUrl": null,
      "epgEndpoint": "/api/epg/br-veja-tv"
    }
  },
  {
    "id": "br-warner-channel",
    "name": "Warner Channel",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Geral",
    "logo": "",
    "streamUrl": "http://45.185.11.126:8000/play/a0am/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-warner-channel.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.185.11.126%3A8000%2Fplay%2Fa0am%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [],
    "totalStreamsAvailable": 1,
    "latencyMs": 103,
    "verifiedAt": "2026-10-27T03:58:10.569Z",
    "epg": {
      "hasEpg": true,
      "channelId": "WARNER CHANNEL",
      "channelName": "WARNER CHANNEL",
      "source": "BrazilTVEPG - Claro TV+",
      "xmltvUrl": "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml",
      "epgEndpoint": "/api/epg/br-warner-channel"
    }
  },
  {
    "id": "br-woohoo",
    "name": "WooHoo",
    "country": "BR",
    "countryName": "Brasil",
    "category": "Undefined",
    "logo": "https://i.imgur.com/me622pa.png",
    "streamUrl": "http://45.162.64.114/WOOHOO/index.m3u8",
    "liveUrl": "http://localhost:1414/live/br-woohoo.m3u8",
    "proxyUrl": "http://localhost:1414/proxy?url=http%3A%2F%2F45.162.64.114%2FWOOHOO%2Findex.m3u8",
    "corsNative": true,
    "isHls": true,
    "backupStreams": [
      "http://45.185.11.126:8000/play/a075/index.m3u8"
    ],
    "totalStreamsAvailable": 2,
    "latencyMs": 87,
    "verifiedAt": "2026-10-27T03:56:43.487Z",
    "epg": {
      "hasEpg": true,
      "channelId": "WooHoo.br",
      "channelName": "BR - WooHoo",
      "source": "IPTV-Org EPG Brasil",
      "xmltvUrl": "https://iptv-epg.org/files/epg-br.xml",
      "epgEndpoint": "/api/epg/br-woohoo"
    }
  }
];

const CHANNELS_DATA = [
    CHANNEL_000_STATIC,
    ...RAW_BR_CHANNELS.map((ch, idx) => transformApiChannel(ch, idx + 1))
];

window.CHANNEL_000_STATIC = CHANNEL_000_STATIC;
window.CHANNELS_DATA = CHANNELS_DATA;
window.TVFeedGenerator = TVFeedGenerator;
window.transformApiChannel = transformApiChannel;
window.formatTime12 = formatTime12;
window.formatTimeSlot = formatTimeSlot;
