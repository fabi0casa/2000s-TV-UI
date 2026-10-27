/**
 * Parser e Indexador de EPG (XMLTV)
 * Baixa e analisa guias de programação dos repositórios especificados (BrazilTVEPG e IPTV-Org EPG)
 * e indexa as grades para associação instantânea com os canais.
 */

const zlib = require('zlib');

/**
 * Converte data XMLTV (ex: "20261026213000 -0300" ou "20261026213000 +0000") para objeto Date
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
 * Normaliza strings de texto para chaves de busca fonética e textual
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
 * Analisa conteúdo XMLTV bruto
 */
function parseXMLTV(xmlString, sourceInfo, now = new Date()) {
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
      currentProgram: null,
      nextProgram: null,
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
  const nowMs = now.getTime();

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

    const prog = {
      title: titleMatch ? titleMatch[1].trim() : 'Sem título',
      description: descMatch ? descMatch[1].trim() : '',
      category: categoryMatch ? categoryMatch[1].trim() : '',
      start: startDate.toISOString(),
      stop: stopDate.toISOString(),
      startMs: startDate.getTime(),
      stopMs: stopDate.getTime()
    };

    // Identifica programa atual e próximo
    if (prog.startMs <= nowMs && prog.stopMs >= nowMs) {
      channelObj.currentProgram = {
        title: prog.title,
        description: prog.description,
        category: prog.category,
        start: prog.start,
        stop: prog.stop
      };
    } else if (prog.startMs > nowMs) {
      if (!channelObj.nextProgram || prog.startMs < channelObj.nextProgram.startMs) {
        channelObj.nextProgram = {
          title: prog.title,
          description: prog.description,
          category: prog.category,
          start: prog.start,
          stop: prog.stop,
          startMs: prog.startMs
        };
      }
    }
  }

  // Limpa campos auxiliares
  for (const ch of channelIndex.values()) {
    if (ch.nextProgram && ch.nextProgram.startMs) {
      delete ch.nextProgram.startMs;
    }
    delete ch.programs;
  }

  return { channelIndex, searchMap };
}

/**
 * Baixa e carrega uma fonte EPG (trata tanto XML quanto XML comprimido em GZIP)
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
 * Carrega todas as fontes EPG configuradas e consolida em um único catálogo
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

      // Mescla canais
      for (const [id, chData] of parsed.channelIndex.entries()) {
        if (!masterChannels.has(id)) {
          masterChannels.set(id, chData);
        } else {
          // Atualiza programas atuais se a fonte tiver dados mais recentes
          const existing = masterChannels.get(id);
          if (!existing.currentProgram && chData.currentProgram) {
            existing.currentProgram = chData.currentProgram;
          }
          if (!existing.nextProgram && chData.nextProgram) {
            existing.nextProgram = chData.nextProgram;
          }
        }
      }

      // Mescla busca normalizada
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
     * Busca um canal no EPG por tvgId, nome exibido ou termo aproximado
     */
    findEpg(tvgId, title, country = 'BR') {
      // 1. Busca exata por tvgId
      if (tvgId) {
        if (masterChannels.has(tvgId)) return masterChannels.get(tvgId);
        // Tenta tvgId sem sufixo @SD, @HD
        const cleanTvgId = tvgId.split('@')[0];
        if (masterChannels.has(cleanTvgId)) return masterChannels.get(cleanTvgId);

        const normTvgId = normalizeEpgKey(cleanTvgId);
        if (masterSearchMap.has(normTvgId)) {
          return masterChannels.get(masterSearchMap.get(normTvgId));
        }
      }

      // 2. Busca por nome normalizado
      if (title) {
        const normTitle = normalizeEpgKey(title);
        if (masterSearchMap.has(normTitle)) {
          return masterChannels.get(masterSearchMap.get(normTitle));
        }

        // Tenta com sufixo do país se não tiver
        const withCountry = normalizeEpgKey(`${title} ${country}`);
        if (masterSearchMap.has(withCountry)) {
          return masterChannels.get(masterSearchMap.get(withCountry));
        }
      }

      return null;
    }
  };
}

module.exports = {
  loadAllEpgSources,
  normalizeEpgKey,
  parseXMLTV
};
