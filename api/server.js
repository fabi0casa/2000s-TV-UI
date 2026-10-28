/**
 * Servidor HTTP da API IPTV & EPG com Proxy de Streams e EPG Dinâmico
 * Fornece:
 *  - /channels.json e /api/channels (com cálculo dinâmico de programação no ar)
 *  - /api/epg/:channelId (grade diária completa do canal em tempo real)
 *  - /live/:channelId.m3u8 (endpoint direto de reprodução sem erros de CORS)
 *  - /proxy?url=... (proxy reescritor de HLS/TS que contorna CORS e restrições de cabeçalhos)
 * Porta padrão: 1414
 */

const http = require('http');
const config = require('./config');
const syncManager = require('./lib/syncManager');

/**
 * Reescreve manifestos M3U8 para que todas as sub-playlists e fragmentos .ts passem pelo proxy local
 */
function rewriteM3U8(content, baseUrl, proxyBaseUrl) {
  const lines = content.split(/\r?\n/);
  const rewritten = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      // Trata atributos URI="..." em tags como #EXT-X-MEDIA, #EXT-X-STREAM-INF
      const withRewrittenUris = line.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          const resolved = new URL(uri, baseUrl).toString();
          return `URI="${proxyBaseUrl}?url=${encodeURIComponent(resolved)}"`;
        } catch {
          return match;
        }
      });
      rewritten.push(withRewrittenUris);
    } else {
      // Linha de URL de fragmento (.ts) ou sub-manifesto (.m3u8)
      try {
        const resolved = new URL(line, baseUrl).toString();
        rewritten.push(`${proxyBaseUrl}?url=${encodeURIComponent(resolved)}`);
      } catch {
        rewritten.push(line);
      }
    }
  }

  return rewritten.join('\n');
}

/**
 * Executa o proxy de streams e segmentos de vídeo
 */
async function handleStreamProxy(targetUrl, req, res, hostHeader) {
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Parâmetro url é obrigatório' }));
    return;
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        'User-Agent': config.VALIDATOR.USER_AGENT,
        'Accept': '*/*',
        ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {})
      },
      redirect: 'follow'
    });

    const contentType = upstreamRes.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    const isM3u = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    // Se for manifesto HLS, reescrevemos os links para passarem pelo proxy
    if (isM3u && req.method !== 'HEAD') {
      const manifestText = await upstreamRes.text();
      const proxyBaseUrl = `http://${hostHeader || `localhost:${config.PORT}`}/proxy`;
      const rewritten = rewriteM3U8(manifestText, targetUrl, proxyBaseUrl);

      res.writeHead(upstreamRes.status, {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(rewritten);
      return;
    }

    // Se for binário (fragmento .ts, áudio ou vídeo) ou HEAD
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': contentType
    };

    if (upstreamRes.headers.get('content-length')) {
      responseHeaders['Content-Length'] = upstreamRes.headers.get('content-length');
    }
    if (upstreamRes.headers.get('content-range')) {
      responseHeaders['Content-Range'] = upstreamRes.headers.get('content-range');
    }

    res.writeHead(upstreamRes.status, responseHeaders);

    if (req.method === 'HEAD' || !upstreamRes.body) {
      res.end();
      return;
    }

    // Streaming de chunks direto para o cliente
    const reader = upstreamRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (err) {
    console.error(`[Proxy Error] ${targetUrl}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway ao conectar no stream', message: err.message }));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const globalCors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, globalCors);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(reqUrl.searchParams.entries());

  try {
    // 1. ROTA DE PROXY UNIVERSAL: /proxy?url=...
    if (pathname === '/proxy') {
      await handleStreamProxy(query.url, req, res, req.headers.host);
      return;
    }

    // 2. ROTA DE STREAM DIRETO: /live/:channelId.m3u8
    if (pathname.startsWith('/live/') && pathname.endsWith('.m3u8')) {
      const channelSlug = pathname.slice('/live/'.length, -'.m3u8'.length);
      const data = syncManager.cachedData;
      const channel = data?.channels.find(c => c.id === channelSlug);

      if (!channel) {
        res.writeHead(404, globalCors);
        res.end(JSON.stringify({ error: `Canal ${channelSlug} não encontrado` }));
        return;
      }

      await handleStreamProxy(channel.streamUrl, req, res, req.headers.host);
      return;
    }

    // 3. ROTA RAIZ: Documentação e status
    if (pathname === '/') {
      const status = syncManager.getStatus();
      const info = {
        title: 'IPTV & EPG Curated API',
        version: '1.1.0',
        description: 'API com validação estrita de reprodução, bypass de CORS e EPG dinâmico em tempo real.',
        status: status.state,
        uptimeSeconds: status.uptimeSeconds,
        isSyncing: status.isSyncing,
        syncProgress: status.progress,
        totalChannelsLoaded: status.cachedChannelsCount,
        lastSync: status.lastSync,
        nextSync: status.nextSync,
        features: {
          'CORS Bypass': 'Transmissões sem CORS nativo podem ser reproduzidas via /live/:channelId.m3u8 ou /proxy?url=...',
          'EPG Dinâmico': 'now e next calculados no instante exato da requisição, mais grade diária via /api/epg/:channelId',
          'Filtro Estrito': 'Canais geo-bloqueados ou com fragmentos corrompidos são purgados automaticamente da lista'
        },
        endpoints: {
          'GET /channels.json': 'Retorna a lista completa com cálculo dinâmico da programação atual',
          'GET /api/channels': 'Mesmo resultado de /channels.json com suporte a filtros (?country=BR, ?category=..., ?search=...)',
          'GET /api/epg/:channelId': 'Retorna a grade diária completa do canal especificado em tempo real',
          'GET /api/epg/live': 'Retorna o que está passando agora em todos os canais',
          'GET /live/:channelId.m3u8': 'Stream HLS reproduzível diretamente no navegador sem nenhum erro de CORS',
          'GET /proxy?url=...': 'Proxy universal para qualquer link de transmissão IPTV ou fragmento .ts',
          'GET /api/status': 'Status da API e do agendador',
          'POST /api/refresh': 'Força uma re-verificação manual imediata'
        }
      };

      res.writeHead(200, globalCors);
      res.end(JSON.stringify(info, null, 2));
      return;
    }

    // 4. ROTA PRINCIPAL: /channels.json e /api/channels (Cálculo Dinâmico em Tempo Real)
    if (pathname === '/channels.json' || pathname === '/api/channels') {
      const dynamicResult = syncManager.getChannelsDynamic(new Date());

      if (!dynamicResult) {
        res.writeHead(503, globalCors);
        res.end(JSON.stringify({
          error: 'Dados ainda não disponíveis',
          message: 'A validação inicial dos canais está em andamento. Consulte /api/status.',
          status: syncManager.getStatus()
        }, null, 2));
        return;
      }

      let channels = dynamicResult.channels;

      if (query.country) {
        const countryFilter = query.country.toUpperCase();
        channels = channels.filter(c => c.country === countryFilter);
      }

      if (query.category) {
        const catFilter = query.category.toLowerCase();
        channels = channels.filter(c => c.category && c.category.toLowerCase().includes(catFilter));
      }

      if (query.hasEpg === 'true') {
        channels = channels.filter(c => c.epg && c.epg.hasEpg);
      }

      if (query.search) {
        const term = query.search.toLowerCase();
        channels = channels.filter(c => c.name.toLowerCase().includes(term) || (c.category && c.category.toLowerCase().includes(term)));
      }

      res.writeHead(200, globalCors);
      res.end(JSON.stringify({
        meta: {
          ...dynamicResult.meta,
          returnedChannels: channels.length,
          filtersApplied: query
        },
        channels: channels
      }, null, 2));
      return;
    }

    // 5. ROTA ATALHO: /api/channels/br
    if (pathname === '/api/channels/br') {
      const dynamicResult = syncManager.getChannelsDynamic(new Date());
      if (!dynamicResult) {
        res.writeHead(503, globalCors);
        res.end(JSON.stringify({ error: 'Sincronização em andamento', status: syncManager.getStatus() }));
        return;
      }

      const br = dynamicResult.channels.filter(c => c.country === 'BR');
      res.writeHead(200, globalCors);
      res.end(JSON.stringify({
        meta: { ...dynamicResult.meta, country: 'BR', totalChannels: br.length },
        channels: br
      }, null, 2));
      return;
    }

    // 6. ROTA ATALHO: /api/channels/us
    if (pathname === '/api/channels/us') {
      const dynamicResult = syncManager.getChannelsDynamic(new Date());
      if (!dynamicResult) {
        res.writeHead(503, globalCors);
        res.end(JSON.stringify({ error: 'Sincronização em andamento', status: syncManager.getStatus() }));
        return;
      }

      const us = dynamicResult.channels.filter(c => c.country === 'US');
      res.writeHead(200, globalCors);
      res.end(JSON.stringify({
        meta: { ...dynamicResult.meta, country: 'US', totalChannels: us.length },
        channels: us
      }, null, 2));
      return;
    }

    // 7. ROTA DE EPG DINÂMICO ESPECÍFICO: /api/epg/:channelId
    if (pathname.startsWith('/api/epg/') && pathname !== '/api/epg/live') {
      const channelSlug = pathname.slice('/api/epg/'.length);
      const schedule = syncManager.getChannelEpg(channelSlug, new Date());

      if (!schedule) {
        res.writeHead(404, globalCors);
        res.end(JSON.stringify({
          error: 'EPG não encontrado',
          message: `Nenhum guia de programação disponível para o canal "${channelSlug}".`
        }, null, 2));
        return;
      }

      res.writeHead(200, globalCors);
      res.end(JSON.stringify(schedule, null, 2));
      return;
    }

    // 8. ROTA DE PROGRAMAÇÃO AO VIVO: /api/epg/live
    if (pathname === '/api/epg/live') {
      const dynamic = syncManager.getChannelsDynamic(new Date());
      if (!dynamic) {
        res.writeHead(503, globalCors);
        res.end(JSON.stringify({ error: 'Dados não disponíveis' }));
        return;
      }

      const liveList = dynamic.channels
        .filter(c => c.epg && c.epg.hasEpg && c.epg.now)
        .map(c => ({
          channelId: c.id,
          channelName: c.name,
          country: c.country,
          logo: c.logo,
          now: c.epg.now,
          next: c.epg.next
        }));

      res.writeHead(200, globalCors);
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        totalLiveChannels: liveList.length,
        live: liveList
      }, null, 2));
      return;
    }

    // 9. ROTA DE STATUS: /api/status
    if (pathname === '/api/status') {
      res.writeHead(200, globalCors);
      res.end(JSON.stringify(syncManager.getStatus(), null, 2));
      return;
    }

    // 10. ROTA DE ATUALIZAÇÃO MANUAL: /api/refresh
    if (pathname === '/api/refresh') {
      if (syncManager.isSyncing) {
        res.writeHead(409, globalCors);
        res.end(JSON.stringify({ success: false, message: 'Ciclo em andamento', status: syncManager.getStatus() }));
        return;
      }

      syncManager.runFullSync().catch(err => console.error('[Refresh]', err));
      res.writeHead(202, globalCors);
      res.end(JSON.stringify({ success: true, message: 'Re-verificação estrita iniciada', status: syncManager.getStatus() }));
      return;
    }

    // 404
    res.writeHead(404, globalCors);
    res.end(JSON.stringify({ error: 'Not Found', path: pathname }));

  } catch (err) {
    console.error('[Server Error]', err);
    res.writeHead(500, globalCors);
    res.end(JSON.stringify({ error: 'Internal Error', message: err.message }));
  }
});

async function start() {
  syncManager.loadCachedData();
  syncManager.startScheduler();

  server.listen(config.PORT, () => {
    console.log('===========================================================');
    console.log(` IPTV & EPG API INICIADA COM SUCESSO!`);
    console.log(` Porta: http://localhost:${config.PORT}`);
    console.log(` JSON Dinâmico: http://localhost:${config.PORT}/channels.json`);
    console.log(` Proxy de Streams: http://localhost:${config.PORT}/live/:channelId.m3u8`);
    console.log(` EPG em Tempo Real: http://localhost:${config.PORT}/api/epg/:channelId`);
    console.log(` Status em tempo real: http://localhost:${config.PORT}/api/status`);
    console.log(` Ciclo de atualização automática: a cada 6 horas`);
    console.log('===========================================================');

    const forceSync = process.argv.includes('--sync-now');
    if (forceSync || !syncManager.isCacheFresh()) {
      console.log('[Startup] Executando validação estrita inicial das fontes...');
      syncManager.runFullSync().catch(err => {
        console.error('[Startup] Falha na validação:', err.message);
      });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] A porta ${config.PORT} já está em uso.`);
    } else {
      console.error('[Server] Erro no servidor:', err);
    }
    process.exit(1);
  });
}

if (require.main === module) {
  start();
}

module.exports = { server, start };
