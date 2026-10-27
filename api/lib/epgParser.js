/**
 * Parser e Indexador Dinâmico de EPG (XMLTV)
 * Baixa e analisa guias de programação dos repositórios (BrazilTVEPG e IPTV-Org EPG)
 * e mantém a grade completa em memória para consultas em tempo real com cálculo dinâmico do que está no ar.
 */

const zlib = require('zlib');

/**
 * Converte data XMLTV (ex: "20261026213000 -0300") para objeto Date
 */
function parseXMLTVDate(str) {
  if (!str) return null;
  const match = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!match) return null;
  const [_, y, m, d, h, min, s, tz] = match;
  let iso = `${y}-${m}-${d}T${h}:${min}:${s}`;
  if (tz) {
    iso += `${tz.slice(0, 3)}:${tz.slice(3)}`;
  } else {
    iso += 'Z';
  }
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normaliza strings para chaves de busca fonética e textual
 */
function normalizeEpgKey(val) {
  if (!val) return '';
  return String(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(br|us|fhd|hd|sd|4k|8k|uhd|hevc|h\.?265|h\.?264|1080p?|720p?|local|brasil|usa)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Analisa conteúdo XMLTV bruto preservando a grade completa
 */
function parseXMLTV(xmlString, sourceInfo) {
  const channelIndex = new Map();
  const searchMap = new Map();

  // 1. Extração de canais: <channel id="..."> <display-name>...</display-name> </channel>
  const channelRegex = /<channel\s+id="([^"]+)">([\s\S]*?)<\/channel>/gi;
  let chMatch;

  while ((chMatch = channelRegex.exec(xmlString)) !== null) {
    const channelId = chMatch[1];
    const channelBlock = chMatch[2];

    const nameMatch = channelBlock.match(/<display-name[^>]*>([^<]+)<\/display-name>/i);
    const iconMatch = channelBlock.match(/<icon\s+src="([^"]+)"/i);

    const displayName = nameMatch ? nameMatch[1].trim() : channelId;
    const icon = iconMatch ? iconMatch[1].trim() : '';

    const channelData = {
      id: channelId,
      name: displayName,
      icon: icon,
      source: sourceInfo.name,
      xmltvUrl: sourceInfo.url,
      programs: []
    };

    channelIndex.set(channelId, channelData);

    // Índices de busca normalizados
    const normId = normalizeEpgKey(channelId);
    const normName = normalizeEpgKey(displayName);
    if (normId) searchMap.set(normId, channelId);
    if (normName) searchMap.set(normName, channelId);
  }

  // 2. Extração de programas: <programme start="..." stop="..." channel="...">
  const progRegex = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)">([\s\S]*?)<\/programme>/gi;
  let pMatch;

  while ((pMatch = progRegex.exec(xmlString)) !== null) {
    const rawStart = pMatch[1];
    const rawStop = pMatch[2];
    const channelId = pMatch[3];
    const progBlock = pMatch[4];

    const channelObj = channelIndex.get(channelId);
    if (!channelObj) continue;

    const startDate = parseXMLTVDate(rawStart);
    const stopDate = parseXMLTVDate(rawStop);
    if (!startDate || !stopDate) continue;

    const titleMatch = progBlock.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = progBlock.match(/<desc[^>]*>([^<]+)<\/desc>/i);
    const categoryMatch = progBlock.match(/<category[^>]*>([^<]+)<\/category>/i);

    channelObj.programs.push({
      title: titleMatch ? titleMatch[1].trim() : 'Sem título',
      description: descMatch ? descMatch[1].trim() : '',
      category: categoryMatch ? categoryMatch[1].trim() : '',
      start: startDate.toISOString(),
      stop: stopDate.toISOString(),
      startMs: startDate.getTime(),
      stopMs: stopDate.getTime()
    });
  }

  // Ordena os programas por data de início
  for (const ch of channelIndex.values()) {
    ch.programs.sort((a, b) => a.startMs - b.startMs);
  }

  return { channelIndex, searchMap };
}

/**
 * Baixa e carrega uma fonte EPG (trata XML puro e GZIP)
 */
async function loadEpgSource(source) {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[EPG] Falha ao baixar ${source.name} (${res.status}): ${source.url}`);
      return null;
    }

    let xmlText = '';
    const contentType = res.headers.get('content-type') || '';
    const isGzip = source.url.endsWith('.gz') || contentType.includes('gzip');

    if (isGzip) {
      const buffer = Buffer.from(await res.arrayBuffer());
      xmlText = zlib.gunzipSync(buffer).toString('utf-8');
    } else {
      xmlText = await res.text();
    }

    return parseXMLTV(xmlText, source);
  } catch (err) {
    console.error(`[EPG] Erro ao processar ${source.name}:`, err.message);
    return null;
  }
}

/**
 * Carrega todas as fontes EPG e constrói o banco de dados dinâmico
 */
async function loadAllEpgSources(sources) {
  console.log(`[EPG] Carregando ${sources.length} fontes de grade de programação...`);

  const masterChannels = new Map();
  const masterSearchMap = new Map();

  for (const src of sources) {
    try {
      console.log(`[EPG] Baixando fonte: ${src.name}...`);
      const parsed = await loadEpgSource(src);
      if (!parsed) continue;

      for (const [id, chData] of parsed.channelIndex.entries()) {
        if (!masterChannels.has(id)) {
          masterChannels.set(id, chData);
        } else {
          // Concatena programas se vier de mais de uma fonte
          const existing = masterChannels.get(id);
          existing.programs.push(...chData.programs);
          existing.programs.sort((a, b) => a.startMs - b.startMs);
        }
      }

      for (const [key, chId] of parsed.searchMap.entries()) {
        if (!masterSearchMap.has(key)) {
          masterSearchMap.set(key, chId);
        }
      }
      console.log(`[EPG] ✔ ${src.name}: ${parsed.channelIndex.size} canais indexados.`);
    } catch (e) {
      console.warn(`[EPG] Erro ao carregar ${src.name}:`, e.message);
    }
  }

  console.log(`[EPG] Total consolidado: ${masterChannels.size} canais com dados de grade.`);

  return {
    channels: masterChannels,
    searchMap: masterSearchMap,

    /**
     * Busca canal no catálogo EPG por tvgId ou nome
     */
    findEpg(tvgId, title, country = 'BR') {
      if (tvgId) {
        if (masterChannels.has(tvgId)) return masterChannels.get(tvgId);
        const cleanTvgId = tvgId.split('@')[0];
        if (masterChannels.has(cleanTvgId)) return masterChannels.get(cleanTvgId);

        const normTvgId = normalizeEpgKey(cleanTvgId);
        if (masterSearchMap.has(normTvgId)) {
          return masterChannels.get(masterSearchMap.get(normTvgId));
        }
      }

      if (title) {
        const normTitle = normalizeEpgKey(title);
        if (masterSearchMap.has(normTitle)) {
          return masterChannels.get(masterSearchMap.get(normTitle));
        }

        const withCountry = normalizeEpgKey(`${title} ${country}`);
        if (masterSearchMap.has(withCountry)) {
          return masterChannels.get(masterSearchMap.get(withCountry));
        }
      }

      return null;
    },

    /**
     * Calcula dinamicamente o programa atual e próximo no momento exato da consulta
     */
    getLiveProgram(channelId, atDate = new Date()) {
      const channel = masterChannels.get(channelId);
      if (!channel || !channel.programs || channel.programs.length === 0) {
        return { now: null, next: null };
      }

      const nowMs = atDate.getTime();
      let current = null;
      let next = null;

      for (let i = 0; i < channel.programs.length; i++) {
        const p = channel.programs[i];
        if (p.startMs <= nowMs && p.stopMs >= nowMs) {
          const durationMs = p.stopMs - p.startMs;
          const elapsedMs = nowMs - p.startMs;
          const progressPercent = durationMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / durationMs) * 100))) : 0;

          current = {
            title: p.title,
            description: p.description,
            category: p.category,
            start: p.start,
            stop: p.stop,
            progressPercent
          };

          // O próximo é o programa seguinte da lista
          if (i + 1 < channel.programs.length) {
            const nextP = channel.programs[i + 1];
            next = {
              title: nextP.title,
              description: nextP.description,
              category: nextP.category,
              start: nextP.start,
              stop: nextP.stop
            };
          }
          break;
        } else if (p.startMs > nowMs && !current) {
          // Se não há programa atual cobrindo o instante, o próximo é o primeiro que começa depois de agora
          next = {
            title: p.title,
            description: p.description,
            category: p.category,
            start: p.start,
            stop: p.stop
          };
          break;
        }
      }

      return { now: current, next };
    },

    /**
     * Retorna a grade completa de um canal filtrada para as próximas 24 horas
     */
    getChannelSchedule(channelId, atDate = new Date(), hoursAhead = 24) {
      const channel = masterChannels.get(channelId);
      if (!channel) return null;

      const fromMs = atDate.getTime() - (2 * 60 * 60 * 1000); // inclui últimas 2 horas
      const toMs = atDate.getTime() + (hoursAhead * 60 * 60 * 1000);

      const relevantPrograms = channel.programs
        .filter(p => p.stopMs >= fromMs && p.startMs <= toMs)
        .map(p => {
          const isLive = p.startMs <= atDate.getTime() && p.stopMs >= atDate.getTime();
          return {
            title: p.title,
            description: p.description,
            category: p.category,
            start: p.start,
            stop: p.stop,
            isLive
          };
        });

      return {
        channelId: channel.id,
        channelName: channel.name,
        source: channel.source,
        xmltvUrl: channel.xmltvUrl,
        programsCount: relevantPrograms.length,
        programs: relevantPrograms
      };
    }
  };
}

module.exports = {
  loadAllEpgSources,
  normalizeEpgKey,
  parseXMLTV
};
