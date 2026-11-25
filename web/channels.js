/**
 * Aquanet TV - Brazilian & Generic IPTV Lineup & Procedural Canvas Feeds
 * Recreating the authentic 2000s TV aesthetic with interactive Frutiger Aero visuals
 * Supports: Xtream Codes, EzhomeTech API, FastoCloud, and Direct M3U URL
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
 * Helper: Formata horários para tags compactas de grade EPG (ex: 11:30am, 1:00pm, 2:45am)
 */
function formatTimeBadge(date) {
    if (!date) return '--:--';
    const d = (typeof date === 'string') ? new Date(date) : date;
    if (isNaN(d.getTime())) return '--:--';
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${m}${ampm}`;
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

function stripEmoji(value) {
    if (!value) return '';
    try {
        return String(value)
            .replace(/\p{Extended_Pictographic}/gu, '')
            .replace(/[\uFE0F\u200D\u20E3]/g, '');
    } catch (e) {
        return String(value).replace(/[\u2600-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
    }
}

function cleanChannelName(rawName) {
    if (!rawName) return 'CANAL';
    return stripEmoji(decodeHtmlEntities(rawName))
        .replace(/CANAIS:\s*/gi, '')
        .trim() || 'CANAL';
}

function buildChannelKey(rawCh, index) {
    if (!rawCh) return `channel-${index}`;
    if (rawCh.key) return String(rawCh.key);
    if (rawCh.stream_id) return `x:${rawCh.stream_id}`;
    if (rawCh.tvgId) return `epg:${rawCh.tvgId}:${index}`;
    const urlPart = rawCh.streamUrl || rawCh.url || '';
    if (urlPart) return `url:${urlPart}`;
    return `name:${stripEmoji(rawCh.name || rawCh.title || '')}-${index}`;
}

/**
 * HTTP client unificado.
 * No APK usa a ponte nativa do React Native (sem CORS / sem bloqueio de HTTP).
 * No navegador usa fetch normalmente.
 */
const AquanetHttp = {
    _nextId: 1,
    _pending: new Map(),

    isNativeAvailable() {
        return typeof window !== 'undefined' &&
            window.ReactNativeWebView &&
            typeof window.ReactNativeWebView.postMessage === 'function';
    },

    async request(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const headers = options.headers || {};
        const timeoutMs = options.timeout || 25000;

        if (this.isNativeAvailable()) {
            return this.nativeRequest(url, { method, headers, timeoutMs });
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const res = await fetch(url, {
                method,
                headers,
                signal: controller ? controller.signal : undefined
            });
            const text = await res.text();
            return {
                ok: res.ok,
                status: res.status,
                headers: {},
                text
            };
        } finally {
            if (timer) clearTimeout(timer);
        }
    },

    nativeRequest(url, { method, headers, timeoutMs }) {
        return new Promise((resolve, reject) => {
            const id = this._nextId++;
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`Tempo esgotado ao conectar em ${url}`));
            }, timeoutMs);

            this._pending.set(id, { resolve, reject, timer });

            try {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'HTTP_REQUEST',
                    id,
                    url,
                    method,
                    headers
                }));
            } catch (e) {
                clearTimeout(timer);
                this._pending.delete(id);
                reject(e);
            }
        });
    },

    handleNativeResponse(payload) {
        if (!payload) return;
        const pending = this._pending.get(payload.id);
        if (!pending) return;
        this._pending.delete(payload.id);
        clearTimeout(pending.timer);

        if (payload.error) {
            pending.reject(new Error(payload.error));
            return;
        }
        pending.resolve({
            ok: Boolean(payload.ok),
            status: Number(payload.status) || 0,
            headers: payload.headers || {},
            text: typeof payload.body === 'string' ? payload.body : ''
        });
    },

    async json(url, options = {}) {
        const res = await this.request(url, options);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} em ${url}`);
        }
        try {
            return JSON.parse(res.text);
        } catch (e) {
            throw new Error('Resposta inválida do servidor (não é JSON).');
        }
    },

    async text(url, options = {}) {
        const res = await this.request(url, options);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} em ${url}`);
        }
        return res.text;
    }
};

window.AquanetHttp = AquanetHttp;
window.__aquanetNativeHttpResolve = function (payload) {
    try {
        if (payload && typeof payload === 'string') payload = JSON.parse(payload);
        AquanetHttp.handleNativeResponse(payload);
    } catch (e) {
        console.warn('[HTTP Bridge] Resposta inválida:', e);
    }
};

/**
 * Parser de Listas M3U / M3U8 Client-side
 */
function parseM3U(content, defaultCategory = 'Geral') {
    if (!content || typeof content !== 'string') return [];

    const lines = content.split(/\r?\n/);
    const items = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
            const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
            const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
            const groupTitleMatch = line.match(/group-title="([^"]*)"/i);
            const tvgCountryMatch = line.match(/tvg-country="([^"]*)"/i);

            const commaIdx = line.lastIndexOf(',');
            let rawTitle = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : '';

            if (!rawTitle && tvgNameMatch) {
                rawTitle = tvgNameMatch[1];
            }

            current = {
                tvgId: tvgIdMatch ? tvgIdMatch[1].trim() : '',
                tvgName: tvgNameMatch ? tvgNameMatch[1].trim() : '',
                tvgLogo: tvgLogoMatch ? tvgLogoMatch[1].trim() : '',
                category: groupTitleMatch ? groupTitleMatch[1].trim() : defaultCategory,
                name: rawTitle || 'Canal Desconhecido',
                country: tvgCountryMatch ? tvgCountryMatch[1].toUpperCase() : 'BR',
                streamUrl: ''
            };
        } else if (!line.startsWith('#') && current) {
            if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://')) {
                current.streamUrl = line;
                items.push(current);
                current = null;
            }
        }
    }

    return items;
}

/**
 * Parser simples de XMLTV / EPG
 */
function parseXMLTV(xmlString) {
    const channelMap = new Map();
    if (!xmlString) return channelMap;

    const channelRegex = /<channel\s+id="([^"]+)">([\s\S]*?)<\/channel>/gi;
    let chMatch;
    while ((chMatch = channelRegex.exec(xmlString)) !== null) {
        const id = chMatch[1];
        channelMap.set(id, []);
    }

    const progRegex = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)">([\s\S]*?)<\/programme>/gi;
    let pMatch;
    while ((pMatch = progRegex.exec(xmlString)) !== null) {
        const startRaw = pMatch[1];
        const stopRaw = pMatch[2];
        const channelId = pMatch[3];
        const block = pMatch[4];

        if (!channelMap.has(channelId)) continue;

        const titleMatch = block.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = block.match(/<desc[^>]*>([^<]+)<\/desc>/i);

        const parseDate = (dStr) => {
            if (!dStr) return null;
            const m = dStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
            if (!m) return null;
            return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
        };

        const start = parseDate(startRaw);
        const stop = parseDate(stopRaw);
        if (start && stop) {
            channelMap.get(channelId).push({
                start: start.toISOString(),
                stop: stop.toISOString(),
                title: titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : 'Programa ao Vivo',
                description: descMatch ? decodeHtmlEntities(descMatch[1].trim()) : ''
            });
        }
    }

    return channelMap;
}

/**
 * Cliente Xtream Codes API
 */
class XtreamCodesClient {
    static sanitizeUrl(url) {
        if (!url) return '';
        let clean = url.trim();
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'http://' + clean;
        }
        return clean.replace(/\/+$/, '');
    }

    static apiUrl(server, username, password, action = '', extra = '') {
        const base = this.sanitizeUrl(server);
        let url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        if (action) url += `&action=${encodeURIComponent(action)}`;
        if (extra) url += `&${extra}`;
        return url;
    }

    static async authenticate(server, username, password) {
        const authUrl = this.apiUrl(server, username, password);
        let data;
        try {
            data = await AquanetHttp.json(authUrl);
        } catch (err) {
            throw new Error(`Falha de conexão com o servidor Xtream: ${err.message}`);
        }

        if (!data || !data.user_info) {
            throw new Error('O servidor não retornou dados de usuário. Verifique a URL.');
        }
        if (Number(data.user_info.auth) === 0 || data.user_info.status === 'Disabled' || data.user_info.status === 'Expired') {
            throw new Error(data.user_info.message || 'Credenciais inválidas, conta desativada ou expirada.');
        }

        return {
            userInfo: data.user_info,
            serverInfo: data.server_info || {}
        };
    }

    static async getLiveStreams(server, username, password) {
        const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_live_streams'));
        if (!Array.isArray(data)) return [];
        return data;
    }

    static async getCategories(server, username, password) {
        try {
            const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_live_categories'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('[Xtream] Falha ao carregar categorias:', e);
            return [];
        }
    }

    static async getVodCategories(server, username, password) {
        try {
            const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_vod_categories'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('[Xtream] Falha ao carregar categorias de filmes:', e);
            return [];
        }
    }

    static async getVodStreams(server, username, password) {
        const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_vod_streams'));
        return Array.isArray(data) ? data : [];
    }

    static async getSeriesCategories(server, username, password) {
        try {
            const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_series_categories'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('[Xtream] Falha ao carregar categorias de séries:', e);
            return [];
        }
    }

    static async getSeries(server, username, password) {
        const data = await AquanetHttp.json(this.apiUrl(server, username, password, 'get_series'));
        return Array.isArray(data) ? data : [];
    }

    static async getSeriesInfo(server, username, password, seriesId) {
        const data = await AquanetHttp.json(
            this.apiUrl(server, username, password, 'get_series_info', `series_id=${encodeURIComponent(seriesId)}`)
        );
        return data || {};
    }

    static decodeEpgText(value) {
        if (!value) return '';
        const raw = String(value);
        // Xtream costuma enviar título/descrição do EPG em base64.
        if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 8) {
            try {
                const binary = atob(raw.replace(/\s+/g, ''));
                if (typeof TextDecoder !== 'undefined') {
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    const decoded = new TextDecoder('utf-8').decode(bytes);
                    if (decoded && /[a-zA-ZÀ-ÿ0-9]/.test(decoded)) return decoded;
                }
                if (binary && /[a-zA-ZÀ-ÿ0-9]/.test(binary)) return binary;
            } catch (e) {}
        }
        return raw;
    }

    static async getShortEpg(server, username, password, streamId) {
        try {
            const data = await AquanetHttp.json(
                this.apiUrl(server, username, password, 'get_short_epg', `stream_id=${encodeURIComponent(streamId)}&limit=24`)
            );
            const listings = data && Array.isArray(data.epg_listings) ? data.epg_listings : [];
            return listings.map(item => {
                let start = null;
                let stop = null;
                if (item.start_timestamp) start = new Date(Number(item.start_timestamp) * 1000);
                else if (item.start) start = new Date(String(item.start).replace(' ', 'T'));
                if (item.stop_timestamp) stop = new Date(Number(item.stop_timestamp) * 1000);
                else if (item.end) stop = new Date(String(item.end).replace(' ', 'T'));

                const startIso = start && !isNaN(start.getTime()) ? start.toISOString() : null;
                const stopIso = stop && !isNaN(stop.getTime()) ? stop.toISOString() : null;
                if (!startIso || !stopIso) return null;

                return {
                    title: this.decodeEpgText(item.title),
                    description: this.decodeEpgText(item.description),
                    start: startIso,
                    stop: stopIso
                };
            }).filter(Boolean);
        } catch (e) {
            console.warn('[Xtream] Falha ao carregar EPG do canal:', streamId, e);
            return [];
        }
    }

    static buildStreamUrl(server, username, password, streamId, container = 'ts') {
        const base = this.sanitizeUrl(server);
        return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${container}`;
    }

    static buildVodUrl(server, username, password, streamId, container = 'mp4') {
        const base = this.sanitizeUrl(server);
        return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${container || 'mp4'}`;
    }

    static buildSeriesUrl(server, username, password, episodeId, container = 'mp4') {
        const base = this.sanitizeUrl(server);
        return `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${episodeId}.${container || 'mp4'}`;
    }
}

/**
 * Cliente EzhomeTech API (Ezserver / Ezhome Portal)
 */
class EzhomeTechClient {
    static sanitizeUrl(url) {
        if (!url) return '';
        let clean = url.trim();
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'http://' + clean;
        }
        return clean.replace(/\/+$/, '');
    }

    static async getLive(server, username, password) {
        const base = this.sanitizeUrl(server);
        // Primeiro tenta endpoint JSON do EzhomeTech
        const jsonUrl = `${base}/get_live?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        try {
            const data = await AquanetHttp.json(jsonUrl);
            if (Array.isArray(data) && data.length > 0) return data;
        } catch (e) {}

        // Fallback: playlist M3U gerada pelo EzhomeTech
        const m3uUrl = `${base}/playlist.m3u?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const text = await AquanetHttp.text(m3uUrl);
        return parseM3U(text);
    }
}

/**
 * Cliente FastoCloud API
 */
class FastoCloudClient {
    static sanitizeUrl(url) {
        if (!url) return '';
        let clean = url.trim();
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'http://' + clean;
        }
        return clean.replace(/\/+$/, '');
    }

    static async getStreams(server, username, password) {
        const base = this.sanitizeUrl(server);
        const headers = {};
        if (username) {
            headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`);
        }

        const apiUrl = `${base}/api/v1/streams`;
        try {
            const data = await AquanetHttp.json(apiUrl, { headers });
            if (Array.isArray(data?.streams)) return data.streams;
            if (Array.isArray(data)) return data;
        } catch (e) {}

        // Fallback playlist HLS/M3U do FastoCloud
        const m3uUrl = `${base}/playlist.m3u8`;
        const text = await AquanetHttp.text(m3uUrl, { headers });
        return parseM3U(text);
    }
}

/**
 * Canais Públicos de Demonstração (Fallback instantâneo sem necessidade de login)
 */
const DEMO_CHANNELS = [
    {
        name: "TV Brasil HD",
        category: "Nacional / Notícias",
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/TV_Brasil_2023.svg/320px-TV_Brasil_2023.svg.png",
        streamUrl: "https://tvbrasil-stream.ebc.com.br/index.m3u8",
        epgId: "tvbrasil"
    },
    {
        name: "Record News",
        category: "Notícias 24h",
        logo: "https://upload.wikimedia.org/wikipedia/pt/thumb/a/ad/Record_News_2016.png/260px-Record_News_2016.png",
        streamUrl: "https://stream.recordtv.com.br/recordnews/live.m3u8",
        epgId: "recordnews"
    },
    {
        name: "Red Bull TV",
        category: "Esportes Radicais",
        logo: "https://images.pluto.tv/channels/5e00ee4c3ec3ab00096538b9/colorLogoPNG.png",
        streamUrl: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
        epgId: "redbulltv"
    },
    {
        name: "NASA TV HD",
        category: "Ciência & Espaço",
        logo: "https://images.pluto.tv/channels/582df5e08b1735bc5d7c80ab/colorLogoPNG.png",
        streamUrl: "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
        epgId: "nasatv"
    },
    {
        name: "Euronews Português",
        category: "Mundo & Notícias",
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Euronews_2016_logo.svg/320px-Euronews_2016_logo.svg.png",
        streamUrl: "https://euronews-euronews-portugues-1-pt.samsung.wurl.tv/playlist.m3u8",
        epgId: "euronews"
    },
    {
        name: "Bloomberg TV Live",
        category: "Economia & Negócios",
        logo: "https://images.pluto.tv/channels/59b94091a0c4f8db277114b0/colorLogoPNG.png",
        streamUrl: "https://liveproduseast.global.ssl.fastly.net/us/Channel-HD-AWS-virginia-1/live.m3u8",
        epgId: "bloomberg"
    }
];

/**
 * Transforma item bruto de qualquer provedor em objeto padrão do canal
 */
function transformGenericChannel(rawCh, index, providerType = 'iptv') {
    const channelNum = index;
    const channelIdStr = String(channelNum).padStart(3, '0');
    const cleanName = cleanChannelName(rawCh.name || rawCh.title || `CANAL ${channelNum}`);
    const shortCode = cleanName.toUpperCase().slice(0, 14);
    const categoryName = cleanChannelName(rawCh.category || rawCh.category_name || 'Geral');
    const categoryId = rawCh.categoryId || rawCh.category_id || `group:${categoryName}`;
    const channelKey = buildChannelKey(rawCh, index);

    const realPrograms = Array.isArray(rawCh.epgPrograms) ? rawCh.epgPrograms : [];
    let hasRealEpg = realPrograms.length > 0;
    let schedule = [];

    if (hasRealEpg) {
        schedule = realPrograms
            .filter(p => p && p.start && p.stop)
            .map(p => {
                const startMs = new Date(p.start).getTime();
                const stopMs = new Date(p.stop).getTime();
                const nowMs = Date.now();
                return {
                    time: formatTime12(p.start),
                    timeBadge: formatTimeBadge(p.start),
                    timeSlot: formatTimeSlot(p.start, p.stop),
                    title: cleanChannelName(p.title || 'Programa ao Vivo'),
                    description: stripEmoji(p.description || ''),
                    category: p.category || categoryName,
                    rating: p.rating || 'LIVRE',
                    current: nowMs >= startMs && nowMs < stopMs,
                    start: new Date(p.start).toISOString(),
                    stop: new Date(p.stop).toISOString()
                };
            })
            .sort((a, b) => new Date(a.start) - new Date(b.start));
        hasRealEpg = schedule.length > 0;
    }

    if (!hasRealEpg) {
        const now = new Date();
        const baseH = now.getHours();
        const start1 = new Date(now);
        start1.setMinutes(0, 0, 0);
        const stop1 = new Date(start1);
        stop1.setHours(baseH + 1);

        const start2 = new Date(stop1);
        const stop2 = new Date(start2);
        stop2.setHours(baseH + 2);

        schedule = [
            {
                time: formatTime12(start1),
                timeBadge: formatTimeBadge(start1),
                timeSlot: formatTimeSlot(start1, stop1),
                title: `${cleanName} - Transmissão ao Vivo`,
                description: `Transmissão contínua de ${cleanName}. Categoria: ${categoryName}.`,
                rating: "LIVRE",
                current: true,
                start: start1.toISOString(),
                stop: stop1.toISOString()
            },
            {
                time: formatTime12(start2),
                timeBadge: formatTimeBadge(start2),
                timeSlot: formatTimeSlot(start2, stop2),
                title: `${cleanName} - Próxima Atração`,
                description: `Programação seguinte na grade da emissora ${cleanName}.`,
                rating: "LIVRE",
                current: false,
                start: start2.toISOString(),
                stop: stop2.toISOString()
            }
        ];
    }

    const currentLiveProg = schedule.find(p => p.current) || schedule[0];
    const progTitle = currentLiveProg ? currentLiveProg.title : `${cleanName} - Ao Vivo`;
    const progDesc = currentLiveProg ? currentLiveProg.description : `Transmissão via satélite do canal ${cleanName}.`;
    const timeSlotStr = currentLiveProg ? currentLiveProg.timeSlot : formatTimeSlot(null, null);

    return {
        id: channelIdStr,
        number: channelNum,
        key: channelKey,
        slug: rawCh.stream_id ? String(rawCh.stream_id) : `ch-${channelNum}`,
        providerType,
        categoryId,
        category: categoryName,
        code: shortCode,
        name: cleanName,
        title: progTitle,
        timeSlot: timeSlotStr,
        language: "Português",
        rating: "LIVRE",
        description: progDesc,
        logo: rawCh.logo || rawCh.stream_icon || rawCh.tvgLogo || "",
        streamUrl: rawCh.streamUrl || rawCh.url || "",
        liveUrl: rawCh.streamUrl || rawCh.url || "",
        type: "iptv",
        epg: {
            hasEpg: hasRealEpg
        },
        schedule: schedule
    };
}

/**
 * Gerenciador Unificado de Provedores IPTV
 */
class GenericIPTVManager {
    static STORAGE_KEY = 'aquanet_iptv_provider_config';

    static getSavedConfig() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    static saveConfig(config) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
        } catch (e) {}
    }

    static clearConfig() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {}
    }

    static async loadProvider(config) {
        if (!config) throw new Error('Configuração de provedor ausente.');

        let rawChannels = [];
        let providerCategories = [];
        let meta = {};
        const type = config.type; // 'xtream' | 'ezhome' | 'fasto' | 'm3u' | 'demo'

        switch (type) {
            case 'xtream': {
                const auth = await XtreamCodesClient.authenticate(config.server, config.username, config.password);
                const categories = await XtreamCodesClient.getCategories(config.server, config.username, config.password);
                const catMap = new Map();
                categories.forEach(c => catMap.set(String(c.category_id), cleanChannelName(c.category_name)));

                const streams = await XtreamCodesClient.getLiveStreams(config.server, config.username, config.password);
                rawChannels = streams.map(s => {
                    const catId = String(s.category_id || 'general');
                    const catName = catMap.get(catId) || 'Geral';
                    const streamUrl = XtreamCodesClient.buildStreamUrl(config.server, config.username, config.password, s.stream_id);
                    return {
                        key: `x:${s.stream_id}`,
                        name: s.name,
                        stream_id: s.stream_id,
                        categoryId: catId,
                        category: catName,
                        logo: s.stream_icon,
                        streamUrl: streamUrl,
                        tvgId: s.epg_channel_id || ''
                    };
                });
                providerCategories = categories.map(c => ({ id: String(c.category_id), name: cleanChannelName(c.category_name) }));
                meta = {
                    userInfo: auth.userInfo,
                    serverInfo: auth.serverInfo,
                    liveCount: rawChannels.length
                };
                break;
            }
            case 'ezhome': {
                const streams = await EzhomeTechClient.getLive(config.server, config.username, config.password);
                rawChannels = streams.map(s => ({
                    key: s.stream_id ? `e:${s.stream_id}` : undefined,
                    name: s.name || s.rawTitle,
                    categoryId: s.groupTitle || s.category || 'ezhome',
                    category: s.category || s.groupTitle || 'Ezhome',
                    logo: s.logo || s.tvgLogo,
                    streamUrl: s.streamUrl || s.url,
                    tvgId: s.tvgId || ''
                }));
                providerCategories = Array.from(new Set(rawChannels.map(ch => ch.categoryId)))
                    .map(id => ({ id, name: rawChannels.find(ch => ch.categoryId === id)?.category || id }));
                break;
            }
            case 'fasto': {
                const streams = await FastoCloudClient.getStreams(config.server, config.username, config.password);
                rawChannels = streams.map(s => ({
                    key: s.stream_id ? `f:${s.stream_id}` : undefined,
                    name: s.name || s.rawTitle,
                    categoryId: s.groupTitle || s.category || 'fasto',
                    category: s.category || s.groupTitle || 'FastoCloud',
                    logo: s.logo || s.tvgLogo,
                    streamUrl: s.streamUrl || s.url,
                    tvgId: s.tvgId || ''
                }));
                providerCategories = Array.from(new Set(rawChannels.map(ch => ch.categoryId)))
                    .map(id => ({ id, name: rawChannels.find(ch => ch.categoryId === id)?.category || id }));
                break;
            }
            case 'm3u': {
                if (!config.m3uUrl) throw new Error('A URL da lista M3U é obrigatória.');
                const text = await AquanetHttp.text(config.m3uUrl);
                rawChannels = parseM3U(text);

                // EPG XMLTV opcional
                if (config.epgUrl) {
                    try {
                        const xml = await AquanetHttp.text(config.epgUrl);
                        const epgMap = parseXMLTV(xml);
                        rawChannels.forEach(ch => {
                            const programs = epgMap.get(ch.tvgId) || epgMap.get(ch.tvgName) || [];
                            if (programs.length) ch.epgPrograms = programs;
                        });
                    } catch (e) {
                        console.warn('[M3U] Não foi possível carregar o EPG XMLTV:', e);
                    }
                }

                rawChannels = rawChannels.map((ch, idx) => ({
                    key: ch.tvgId ? `m:${ch.tvgId}:${idx}` : `m:${ch.streamUrl}`,
                    name: ch.name,
                    categoryId: `group:${cleanChannelName(ch.category || 'Geral')}`,
                    category: cleanChannelName(ch.category || 'Geral'),
                    logo: ch.tvgLogo,
                    streamUrl: ch.streamUrl,
                    tvgId: ch.tvgId,
                    epgPrograms: ch.epgPrograms || []
                }));
                providerCategories = Array.from(new Set(rawChannels.map(ch => ch.categoryId)))
                    .map(id => ({ id, name: rawChannels.find(ch => ch.categoryId === id)?.category || id }));
                break;
            }
            case 'demo':
            default: {
                rawChannels = DEMO_CHANNELS.map((ch, idx) => ({
                    key: `demo:${idx + 1}`,
                    name: ch.name,
                    categoryId: `demo:${ch.category || 'Geral'}`,
                    category: ch.category || 'Geral',
                    logo: ch.logo,
                    streamUrl: ch.streamUrl,
                    tvgId: ch.epgId || ''
                }));
                providerCategories = Array.from(new Set(rawChannels.map(ch => ch.categoryId)))
                    .map(id => ({ id, name: rawChannels.find(ch => ch.categoryId === id)?.category || id }));
                break;
            }
        }

        if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
            throw new Error('Nenhum canal ativo encontrado no provedor selecionado.');
        }

        // Converte para objetos de canais do player
        const channels = rawChannels.map((ch, idx) => transformGenericChannel(ch, idx + 1, type));

        const counts = new Map();
        channels.forEach(ch => counts.set(ch.categoryId, (counts.get(ch.categoryId) || 0) + 1));

        const categoryList = [];
        providerCategories.forEach(cat => {
            if (counts.get(cat.id)) categoryList.push({ id: cat.id, name: cat.name, count: counts.get(cat.id) });
        });
        // Categorias que apareceram nos canais mas não vieram na lista oficial
        counts.forEach((count, id) => {
            if (!categoryList.some(c => c.id === id)) {
                const ch = channels.find(c => c.categoryId === id);
                categoryList.push({ id, name: ch ? ch.category : id, count });
            }
        });
        categoryList.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        return {
            channels,
            categories: categoryList,
            providerType: type,
            config,
            meta
        };
    }
}

/**
 * Procedural TV Content Canvas Renderer (Sem Sinal, Snow Noise & Bouncing Logo)
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

        // No Signal alternating images (aquanet-nosignal-1.png & aquanet-nosignal-2.png)
        this.noSignalImg1 = new Image();
        this.noSignalImg1.src = (typeof window !== 'undefined' && window.__AQUANET_ICONS && window.__AQUANET_ICONS['aquanet-nosignal-1.png'])
            ? window.__AQUANET_ICONS['aquanet-nosignal-1.png']
            : 'icons/aquanet-nosignal-1.png';
        this.noSignalImg2 = new Image();
        this.noSignalImg2.src = (typeof window !== 'undefined' && window.__AQUANET_ICONS && window.__AQUANET_ICONS['aquanet-nosignal-2.png'])
            ? window.__AQUANET_ICONS['aquanet-nosignal-2.png']
            : 'icons/aquanet-nosignal-2.png';

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
        let currentImg = isFrame1 ? this.noSignalImg1 : this.noSignalImg2;
        if (!currentImg || !currentImg.complete || currentImg.naturalWidth === 0) {
            currentImg = (currentImg === this.noSignalImg1) ? this.noSignalImg2 : this.noSignalImg1;
        }

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

// Inicializa com Canal 000 (Sem Sinal)
const CHANNELS_DATA = [
    CHANNEL_000_STATIC
];

window.CHANNEL_000_STATIC = CHANNEL_000_STATIC;
window.CHANNELS_DATA = CHANNELS_DATA;
window.TVFeedGenerator = TVFeedGenerator;
window.transformGenericChannel = transformGenericChannel;
window.formatTime12 = formatTime12;
window.formatTimeBadge = formatTimeBadge;
window.formatTimeSlot = formatTimeSlot;
window.XtreamCodesClient = XtreamCodesClient;
window.EzhomeTechClient = EzhomeTechClient;
window.FastoCloudClient = FastoCloudClient;
window.parseM3U = parseM3U;
window.parseXMLTV = parseXMLTV;
window.GenericIPTVManager = GenericIPTVManager;
window.DEMO_CHANNELS = DEMO_CHANNELS;
window.AquanetHttp = AquanetHttp;
window.stripEmoji = stripEmoji;
window.buildChannelKey = buildChannelKey;
