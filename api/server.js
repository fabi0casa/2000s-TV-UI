/**
 * Servidor HTTP da API IPTV & EPG
 * Fornece os canais validados e dados EPG via porta 1414 com atualização periódica a cada 72 horas.
 */

const http = require('http');
const config = require('./config');
const syncManager = require('./lib/syncManager');

const server = http.createServer(async (req, res) => {
  // Configuração global de CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(reqUrl.searchParams.entries());

  try {
    // 1. Rota Raiz: Painel informativo e documentação das rotas
    if (pathname === '/') {
      const status = syncManager.getStatus();
      const info = {
        title: 'IPTV & EPG Curated API',
        description: 'API Node.js para validação de streams IPTV (Brasil e EUA) e associação com grades EPG.',
        status: status.state,
        uptimeSeconds: status.uptimeSeconds,
        isSyncing: status.isSyncing,
        syncProgress: status.progress,
        totalChannelsLoaded: status.cachedChannelsCount,
        lastSync: status.lastSync,
        nextSync: status.nextSync,
        syncInterval: '72 horas',
        endpoints: {
          'GET /channels.json': 'Retorna o arquivo .json completo com todos os canais ativos e dados EPG',
          'GET /api/channels': 'Mesmo resultado de /channels.json, com suporte a filtros ?country=BR&category=Notícias&search=globo',
          'GET /api/channels/br': 'Retorna apenas canais ativos do Brasil',
          'GET /api/channels/us': 'Retorna apenas canais ativos dos Estados Unidos',
          'GET /api/status': 'Retorna o status em tempo real do validador e agendador',
          'GET /api/epg': 'Lista as fontes EPG utilizadas e estatísticas de cobertura',
          'POST /api/refresh': 'Força uma re-verificação manual imediata de todas as fontes'
        }
      };

      res.writeHead(200, headers);
      res.end(JSON.stringify(info, null, 2));
      return;
    }

    // 2. Rota Principal: /channels.json e /api/channels
    if (pathname === '/channels.json' || pathname === '/api/channels') {
      const data = syncManager.cachedData;

      if (!data) {
        res.writeHead(503, headers);
        res.end(JSON.stringify({
          error: 'Dados ainda não disponíveis',
          message: 'A primeira sincronização e validação dos canais está em andamento. Consulte /api/status para ver o progresso.',
          status: syncManager.getStatus()
        }, null, 2));
        return;
      }

      // Aplica filtros se informados na query string
      let channels = data.channels;

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

      const responsePayload = {
        meta: {
          ...data.meta,
          returnedChannels: channels.length,
          filtersApplied: query
        },
        channels: channels
      };

      res.writeHead(200, headers);
      res.end(JSON.stringify(responsePayload, null, 2));
      return;
    }

    // 3. Rota Atalho: /api/channels/br
    if (pathname === '/api/channels/br') {
      const data = syncManager.cachedData;
      if (!data) {
        res.writeHead(503, headers);
        res.end(JSON.stringify({ error: 'Sincronização inicial em andamento', status: syncManager.getStatus() }));
        return;
      }

      const brChannels = data.channels.filter(c => c.country === 'BR');
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        meta: {
          ...data.meta,
          country: 'BR',
          totalChannels: brChannels.length
        },
        channels: brChannels
      }, null, 2));
      return;
    }

    // 4. Rota Atalho: /api/channels/us
    if (pathname === '/api/channels/us') {
      const data = syncManager.cachedData;
      if (!data) {
        res.writeHead(503, headers);
        res.end(JSON.stringify({ error: 'Sincronização inicial em andamento', status: syncManager.getStatus() }));
        return;
      }

      const usChannels = data.channels.filter(c => c.country === 'US');
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        meta: {
          ...data.meta,
          country: 'US',
          totalChannels: usChannels.length
        },
        channels: usChannels
      }, null, 2));
      return;
    }

    // 5. Rota de Status: /api/status
    if (pathname === '/api/status') {
      res.writeHead(200, headers);
      res.end(JSON.stringify(syncManager.getStatus(), null, 2));
      return;
    }

    // 6. Rota de EPG: /api/epg
    if (pathname === '/api/epg') {
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        sources: config.EPG_SOURCES,
        lastSync: syncManager.status.lastSync
      }, null, 2));
      return;
    }

    // 7. Rota de Re-sincronização Manual: /api/refresh (suporta GET ou POST)
    if (pathname === '/api/refresh') {
      if (syncManager.isSyncing) {
        res.writeHead(409, headers);
        res.end(JSON.stringify({
          success: false,
          message: 'Um ciclo de validação já está em execução no momento.',
          status: syncManager.getStatus()
        }, null, 2));
        return;
      }

      // Dispara em segundo plano
      syncManager.runFullSync().catch(err => {
        console.error('[Manual Sync] Erro:', err);
      });

      res.writeHead(202, headers);
      res.end(JSON.stringify({
        success: true,
        message: 'Re-verificação de streams e fontes EPG iniciada com sucesso.',
        status: syncManager.getStatus()
      }, null, 2));
      return;
    }

    // Rota não encontrada
    res.writeHead(404, headers);
    res.end(JSON.stringify({
      error: 'Not Found',
      message: `Rota ${pathname} não existe. Consulte GET / para documentação.`
    }, null, 2));

  } catch (err) {
    console.error('[Server Error]', err);
    res.writeHead(500, headers);
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: err.message
    }, null, 2));
  }
});

// Inicialização do serviço
async function start() {
  // 1. Carrega dados prévios se existirem
  syncManager.loadCachedData();

  // 2. Inicia o agendador de 72 horas
  syncManager.startScheduler();

  // 3. Sobe o servidor HTTP na porta 1414
  server.listen(config.PORT, () => {
    console.log('===========================================================');
    console.log(` IPTV & EPG API INICIADA COM SUCESSO!`);
    console.log(` Porta: http://localhost:${config.PORT}`);
    console.log(` JSON Principal: http://localhost:${config.PORT}/channels.json`);
    console.log(` Status em tempo real: http://localhost:${config.PORT}/api/status`);
    console.log(` Ciclo de atualização automática: a cada 72 horas`);
    console.log('===========================================================');

    // Se o arquivo não existir ou tiver mais de 72 horas, executa sync inicial
    const forceSync = process.argv.includes('--sync-now');
    if (forceSync || !syncManager.isCacheFresh()) {
      console.log('[Startup] Executando validação inicial das fontes...');
      syncManager.runFullSync().catch(err => {
        console.error('[Startup] Falha na validação inicial:', err.message);
      });
    } else {
      console.log(`[Startup] Cache válido carregado (${syncManager.cachedData.channels.length} canais prontos). Próximo sync agendado.`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] A porta ${config.PORT} já está em uso por outro processo.`);
    } else {
      console.error('[Server] Erro no servidor:', err);
    }
    process.exit(1);
  });
}

// Inicia se executado diretamente
if (require.main === module) {
  start();
}

module.exports = { server, start };
