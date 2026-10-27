/**
 * Sistema de Normalização, Desduplicação e Associação EPG
 * Responsável por:
 *  1. Limpar e padronizar nomes de canais
 *  2. Unificar transmissões duplicadas (priorizando a menor latência e guardando alternativas em backupUrls)
 *  3. Associar canais ao banco de dados EPG com suporte a consultas dinâmicas em tempo real
 */

const config = require('../config');

/**
 * Remove resoluções, codecs, formatos e ruídos para obter o nome limpo e canônico
 */
function cleanChannelName(rawName) {
  if (!rawName) return '';

  return rawName
    // Remove notas entre colchetes [Not 24/7], [Geo-blocked], etc.
    .replace(/\[[^\]]*\]/g, '')
    // Remove notas entre parênteses referentes a qualidade (720p), (1080p), etc.
    .replace(/\((?:fhd|hd|sd|4k|uhd|hevc|h\.?265|h\.?264|\d+p)[^)]*\)/gi, '')
    // Remove termos de qualidade e codec isolados
    .replace(/\b(?:fhd|hd|sd|4k|8k|uhd|hevc|h\.?265|h\.?264|1080p|720p|480p|360p)\b/gi, '')
    // Remove prefixos numéricos ou marcadores como "24HRS =", "01 - "
    .replace(/^\s*\d+\s*[-=:]\s*/i, '')
    .replace(/^24hrs\s*=\s*/i, '')
    // Remove prefixos de categorias comuns em listas M3U
    .replace(/^canais[:\s]+/i, '')
    // Substitui múltiplos espaços por um só
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera uma chave única padronizada para identificar se dois canais são o mesmo
 */
function getCanonicalKey(name, country = 'BR') {
  const cleaned = cleanChannelName(name);
  const normalized = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

  return `${country.toUpperCase()}:${normalized}`;
}

const CATEGORY_MAP = {
  'news': 'Notícias',
  'sports': 'Esportes',
  'movies': 'Filmes & Séries',
  'series': 'Séries',
  'entertainment': 'Entretenimento',
  'kids': 'Infantil',
  'music': 'Música',
  'documentary': 'Documentários',
  'general': 'Geral / Variedades',
  'religious': 'Religioso',
  'shop': 'Vendas / Compras',
  'comedy': 'Comédia',
  'lifestyle': 'Estilo de Vida',
  'education': 'Educativo',
  'auto': 'Automobilismo',
  'weather': 'Clima'
};

function standardizeCategory(rawCategory) {
  if (!rawCategory) return 'Geral';
  const clean = rawCategory.trim();
  const lower = clean.toLowerCase();

  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val;
  }

  if (lower.includes('noticia') || lower.includes('notícia') || lower.includes('jornal')) return 'Notícias';
  if (lower.includes('esporte') || lower.includes('futebol')) return 'Esportes';
  if (lower.includes('filme') || lower.includes('cinema') || lower.includes('serie')) return 'Filmes & Séries';
  if (lower.includes('infantil') || lower.includes('desenho') || lower.includes('kids')) return 'Infantil';
  if (lower.includes('musica') || lower.includes('música') || lower.includes('clipe')) return 'Música';
  if (lower.includes('document') || lower.includes('historia')) return 'Documentários';
  if (lower.includes('religio') || lower.includes('gospel') || lower.includes('catol')) return 'Religioso';

  return clean;
}

/**
 * Agrupa transmissões ativas, remove duplicatas e associa metadados e EPG
 */
function processChannels(activeStreams, epgDatabase, channelsMetadata = new Map(), apiPort = 1414) {
  const channelGroups = new Map();

  // 1. Agrupamento por chave canônica
  for (const stream of activeStreams) {
    const rawTitle = stream.rawTitle || stream.tvgName || stream.title || 'Canal Desconhecido';
    const cleanName = cleanChannelName(rawTitle) || rawTitle;
    const country = (stream.country || 'BR').toUpperCase();
    const groupKey = getCanonicalKey(cleanName, country);

    if (!channelGroups.has(groupKey)) {
      channelGroups.set(groupKey, {
        key: groupKey,
        name: cleanName,
        rawName: rawTitle,
        country: country,
        tvgId: stream.tvgId || '',
        tvgLogo: stream.tvgLogo || '',
        category: standardizeCategory(stream.groupTitle || ''),
        streams: []
      });
    }

    const group = channelGroups.get(groupKey);

    if (!group.tvgId && stream.tvgId) group.tvgId = stream.tvgId;
    if (!group.tvgLogo && stream.tvgLogo) group.tvgLogo = stream.tvgLogo;

    group.streams.push({
      url: stream.url,
      sourceId: stream.sourceId,
      latencyMs: stream.latencyMs || 0,
      statusCode: stream.statusCode || 200,
      corsNative: stream.corsNative === true,
      isHls: stream.isHls !== false,
      verifiedAt: stream.verifiedAt || new Date().toISOString()
    });
  }

  // 2. Monta a lista final tratada
  const finalChannels = [];
  let epgMatchedCount = 0;

  for (const group of channelGroups.values()) {
    // Prioriza streams com suporte nativo a CORS e menor latência
    group.streams.sort((a, b) => {
      if (a.corsNative && !b.corsNative) return -1;
      if (!a.corsNative && b.corsNative) return 1;
      return a.latencyMs - b.latencyMs;
    });

    const primaryStream = group.streams[0];
    const backupStreams = group.streams.slice(1).map(s => s.url);

    const meta = group.tvgId ? channelsMetadata.get(group.tvgId) : null;
    const logo = group.tvgLogo || (meta ? meta.logo : '') || '';
    const category = group.category !== 'Geral'
      ? group.category
      : (meta && meta.categories && meta.categories[0] ? standardizeCategory(meta.categories[0]) : group.category);

    // Associação de EPG
    const epgMatch = epgDatabase ? epgDatabase.findEpg(group.tvgId, group.name, group.country) : null;

    const safeSlug = group.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const channelId = `${group.country.toLowerCase()}-${safeSlug || 'tv'}`;

    let epgInfo = null;
    if (epgMatch) {
      epgMatchedCount++;
      epgInfo = {
        hasEpg: true,
        channelId: epgMatch.id,
        channelName: epgMatch.name,
        source: epgMatch.source,
        xmltvUrl: epgMatch.xmltvUrl,
        epgEndpoint: `/api/epg/${channelId}`
      };
    } else {
      epgInfo = {
        hasEpg: false,
        channelId: group.tvgId || null,
        channelName: null,
        source: null,
        xmltvUrl: null,
        epgEndpoint: `/api/epg/${channelId}`
      };
    }

    finalChannels.push({
      id: channelId,
      name: group.name,
      country: group.country,
      countryName: group.country === 'BR' ? 'Brasil' : 'Estados Unidos',
      category: category,
      logo: logo,
      // Stream original
      streamUrl: primaryStream.url,
      // URL direta do proxy local da API que contorna 100% dos bloqueios de CORS e cabeçalhos no navegador
      liveUrl: `http://localhost:${apiPort}/live/${channelId}.m3u8`,
      proxyUrl: `http://localhost:${apiPort}/proxy?url=${encodeURIComponent(primaryStream.url)}`,
      corsNative: primaryStream.corsNative,
      isHls: primaryStream.isHls,
      backupStreams: backupStreams,
      totalStreamsAvailable: group.streams.length,
      latencyMs: primaryStream.latencyMs,
      verifiedAt: primaryStream.verifiedAt,
      epg: epgInfo
    });
  }

  // Ordena por país e nome
  finalChannels.sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  return {
    channels: finalChannels,
    totalChannels: finalChannels.length,
    epgMatchedCount: epgMatchedCount,
    matchRate: finalChannels.length > 0 ? Math.round((epgMatchedCount / finalChannels.length) * 100) : 0
  };
}

module.exports = {
  cleanChannelName,
  getCanonicalKey,
  processChannels
};
