/**
 * Gerenciador de Sincronização e Ciclo de Vida da API
 * Orquestra o ciclo completo:
 *  1. Coleta de listas M3U/M3U8 (iptv-org e Ramys/Iptv-Brasil-2026)
 *  2. Validação concorrente dos links de transmissão
 *  3. Coleta e consolidação de fontes EPG (BrazilTVEPG e IPTV-Org EPG)
 *  4. Tratamento, desduplicação e associação canal <-> EPG
 *  5. Geração e persistência do arquivo channels.json
 *  6. Agendamento de re-verificação a cada 72 horas
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { parseM3U } = require('./m3uParser');
const { testStreamPool } = require('./streamTester');
const { loadAllEpgSources } = require('./epgParser');
const { processChannels } = require('./matcher');

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.status = {
      state: 'idle', // 'idle' | 'fetching_sources' | 'testing_streams' | 'fetching_epg' | 'processing' | 'done' | 'error'
      message: 'Pronto',
      progress: {
        tested: 0,
        total: 0,
        active: 0,
        percent: 0
      },
      lastSync: null,
      nextSync: null
    };

    this.cachedData = null;
    this.schedulerTimer = null;

    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(config.DATA_DIR)) {
      fs.mkdirSync(config.DATA_DIR, { recursive: true });
    }
  }

  getStatus() {
    return {
      ...this.status,
      isSyncing: this.isSyncing,
      cachedChannelsCount: this.cachedData ? this.cachedData.channels.length : 0,
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  /**
   * Carrega os dados persistidos no disco na inicialização do servidor
   */
  loadCachedData() {
    try {
      if (fs.existsSync(config.CHANNELS_FILE)) {
        const raw = fs.readFileSync(config.CHANNELS_FILE, 'utf-8');
        this.cachedData = JSON.parse(raw);
        console.log(`[Cache] Carregados ${this.cachedData.channels.length} canais do arquivo channels.json existente.`);
      }

      if (fs.existsSync(config.LAST_SYNC_FILE)) {
        const rawSync = fs.readFileSync(config.LAST_SYNC_FILE, 'utf-8');
        const syncInfo = JSON.parse(rawSync);
        this.status.lastSync = syncInfo;
        if (syncInfo.completedAt) {
          const lastTime = new Date(syncInfo.completedAt).getTime();
          this.status.nextSync = new Date(lastTime + config.SYNC_INTERVAL_MS).toISOString();
        }
      }
    } catch (err) {
      console.warn('[Cache] Erro ao carregar cache pré-existente:', err.message);
    }
  }

  /**
   * Salva os dados gerados de forma atômica no arquivo channels.json
   */
  saveChannelsJson(payload) {
    this.ensureDirectories();
    const tempFile = `${config.CHANNELS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tempFile, config.CHANNELS_FILE);
    this.cachedData = payload;
  }

  /**
   * Salva metadados do último ciclo de sincronização
   */
  saveLastSyncInfo(info) {
    this.ensureDirectories();
    fs.writeFileSync(config.LAST_SYNC_FILE, JSON.stringify(info, null, 2), 'utf-8');
    this.status.lastSync = info;
  }

  /**
   * Verifica se o arquivo channels.json é recente (menos de 72 horas)
   */
  isCacheFresh() {
    if (!this.cachedData || !this.status.lastSync || !this.status.lastSync.completedAt) {
      return false;
    }
    const lastSyncTime = new Date(this.status.lastSync.completedAt).getTime();
    const now = Date.now();
    return (now - lastSyncTime) < config.SYNC_INTERVAL_MS;
  }

  /**
   * Inicia o agendador para rodar a cada 72 horas
   */
  startScheduler() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    console.log(`[Scheduler] Agendador ativado: Re-verificação a cada 72 horas (${config.SYNC_INTERVAL_MS / (1000 * 60 * 60)}h).`);

    this.schedulerTimer = setInterval(() => {
      console.log('[Scheduler] Disparando atualização agendada de 72 horas...');
      this.runFullSync().catch(err => {
        console.error('[Scheduler] Erro no ciclo agendado:', err);
      });
    }, config.SYNC_INTERVAL_MS);
  }

  /**
   * Executa o ciclo completo de verificação, teste de streams e associação de EPG
   */
  async runFullSync() {
    if (this.isSyncing) {
      console.log('[Sync] Ciclo de sincronização já está em andamento.');
      return this.getStatus();
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      console.log('====================================================');
      console.log('[Sync] INICIANDO CICLO DE ATUALIZAÇÃO E VALIDAÇÃO...');
      console.log('====================================================');

      // FASE 1: Baixar Listas M3U e Metadados
      this.status.state = 'fetching_sources';
      this.status.message = 'Baixando listas IPTV do Brasil e EUA...';
      console.log(`[Sync] 1/5: ${this.status.message}`);

      let allRawStreams = [];
      for (const src of config.STREAM_SOURCES) {
        try {
          console.log(`[Sync] Baixando ${src.name} (${src.url})...`);
          const res = await fetch(src.url, {
            headers: { 'User-Agent': config.VALIDATOR.USER_AGENT }
          });
          if (res.ok) {
            const m3uText = await res.text();
            const items = parseM3U(m3uText, src.country, src.id);
            console.log(`[Sync] ✔ ${src.name}: ${items.length} streams encontrados.`);
            allRawStreams.push(...items);
          } else {
            console.warn(`[Sync] Falha HTTP ${res.status} ao baixar ${src.name}`);
          }
        } catch (srcErr) {
          console.error(`[Sync] Erro ao obter ${src.name}:`, srcErr.message);
        }
      }

      console.log(`[Sync] Total bruto coletado: ${allRawStreams.length} transmissões.`);

      // Otimização: Filtra URLs inválidas e desduplica URLs idênticas antes do teste
      const uniqueUrlMap = new Map();
      for (const item of allRawStreams) {
        if (!item.url || (!item.url.startsWith('http://') && !item.url.startsWith('https://'))) continue;
        const normalizedUrl = item.url.trim();
        if (!uniqueUrlMap.has(normalizedUrl)) {
          uniqueUrlMap.set(normalizedUrl, item);
        }
      }
      const streamsToTest = Array.from(uniqueUrlMap.values());
      console.log(`[Sync] URLs únicas para testar: ${streamsToTest.length} links.`);

      // Metadados extras da api iptv-org
      const channelsMetaMap = new Map();
      try {
        console.log('[Sync] Baixando metadados complementares da iptv-org...');
        const metaRes = await fetch(config.IPTV_ORG_CHANNELS_API, {
          headers: { 'User-Agent': config.VALIDATOR.USER_AGENT }
        });
        if (metaRes.ok) {
          const metaList = await metaRes.json();
          for (const item of metaList) {
            if (item.id) {
              channelsMetaMap.set(item.id, {
                logo: item.logo,
                categories: item.categories || [],
                website: item.website,
                name: item.name
              });
            }
          }
          console.log(`[Sync] ✔ Metadados da API indexados (${channelsMetaMap.size} canais).`);
        }
      } catch (metaErr) {
        console.warn('[Sync] Aviso ao carregar metadados da api:', metaErr.message);
      }

      // FASE 2: Validação Concorrente de Streams
      this.status.state = 'testing_streams';
      this.status.message = `Testando ${streamsToTest.length} links de transmissão...`;
      console.log(`[Sync] 2/5: ${this.status.message}`);

      this.status.progress = {
        tested: 0,
        total: streamsToTest.length,
        active: 0,
        percent: 0
      };

      const activeStreams = await testStreamPool(streamsToTest, {
        concurrency: config.VALIDATOR.CONCURRENCY,
        timeoutMs: config.VALIDATOR.TIMEOUT_MS,
        onProgress: (prog) => {
          this.status.progress = prog;
          if (prog.tested % 100 === 0 || prog.tested === prog.total) {
            console.log(`[Validador] Progresso: ${prog.tested}/${prog.total} (${prog.percent}%) — Ativos confirmados: ${prog.active}`);
          }
        }
      });

      console.log(`[Sync] ✔ Testes concluídos! Transmissões ativas validadas: ${activeStreams.length} de ${streamsToTest.length}.`);

      // FASE 3: Carregamento e consolidação de EPG
      this.status.state = 'fetching_epg';
      this.status.message = 'Baixando e indexando fontes EPG (BrazilTVEPG e IPTV-Org EPG)...';
      console.log(`[Sync] 3/5: ${this.status.message}`);

      const epgDatabase = await loadAllEpgSources(config.EPG_SOURCES);

      // FASE 4: Processamento, Desduplicação e Associação EPG
      this.status.state = 'processing';
      this.status.message = 'Desduplicando canais e associando informações EPG...';
      console.log(`[Sync] 4/5: ${this.status.message}`);

      const processed = processChannels(activeStreams, epgDatabase, channelsMetaMap);
      console.log(`[Sync] ✔ Canais únicos consolidados: ${processed.totalChannels} (Canais com EPG associado: ${processed.epgMatchedCount} - ${processed.matchRate}%).`);

      // FASE 5: Montagem do Payload Final e Persistência
      const nextUpdateDate = new Date(Date.now() + config.SYNC_INTERVAL_MS);
      const outputPayload = {
        meta: {
          title: 'IPTV & EPG Curated API',
          version: '1.0.0',
          generatedAt: new Date().toISOString(),
          nextUpdateAt: nextUpdateDate.toISOString(),
          updateIntervalHours: 72,
          totalChannels: processed.totalChannels,
          channelsByCountry: {
            BR: processed.channels.filter(c => c.country === 'BR').length,
            US: processed.channels.filter(c => c.country === 'US').length
          },
          totalActiveStreams: activeStreams.length,
          epgMatchedChannels: processed.epgMatchedCount,
          epgMatchRate: `${processed.matchRate}%`,
          syncDurationSeconds: Math.round((Date.now() - startTime) / 1000)
        },
        channels: processed.channels
      };

      this.saveChannelsJson(outputPayload);

      const syncSummary = {
        completedAt: new Date().toISOString(),
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
        testedStreams: allRawStreams.length,
        activeStreams: activeStreams.length,
        totalChannels: processed.totalChannels,
        channelsBR: outputPayload.meta.channelsByCountry.BR,
        channelsUS: outputPayload.meta.channelsByCountry.US,
        epgMatchedCount: processed.epgMatchedCount,
        matchRate: `${processed.matchRate}%`
      };

      this.saveLastSyncInfo(syncSummary);

      this.status.state = 'done';
      this.status.message = `Sincronização concluída com sucesso (${processed.totalChannels} canais ativos salvos).`;
      this.status.nextSync = nextUpdateDate.toISOString();

      console.log('====================================================');
      console.log(`[Sync] ✔ CICLO CONCLUÍDO COM SUCESSO EM ${syncSummary.durationSeconds}s!`);
      console.log(`[Sync] Arquivo salvo em: ${config.CHANNELS_FILE}`);
      console.log(`[Sync] Próxima atualização: ${this.status.nextSync}`);
      console.log('====================================================');

      return outputPayload;
    } catch (err) {
      console.error('[Sync] Erro fatal durante a sincronização:', err);
      this.status.state = 'error';
      this.status.message = `Erro: ${err.message}`;
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }
}

// Instância singleton do gerenciador
const syncManager = new SyncManager();

module.exports = syncManager;
