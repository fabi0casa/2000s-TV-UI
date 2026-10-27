/**
 * Gerenciador de Sincronização e Ciclo de Vida da API
 * Orquestra o ciclo completo:
 *  1. Coleta de listas M3U/M3U8 (iptv-org e Ramys/Iptv-Brasil-2026)
 *  2. Validação concorrente estrita dos links de transmissão (HLS e primeiro chunk de vídeo)
 *  3. Coleta e consolidação de fontes EPG (BrazilTVEPG e IPTV-Org EPG)
 *  4. Tratamento, desduplicação e associação canal <-> EPG dinâmico
 *  5. Geração e persistência do arquivo channels.json e banco EPG
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
      state: 'idle',
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
    this.epgDatabase = null;
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
      hasEpgDatabase: this.epgDatabase !== null,
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  loadCachedData() {
    try {
      if (fs.existsSync(config.CHANNELS_FILE)) {
        const raw = fs.readFileSync(config.CHANNELS_FILE, 'utf-8');
        this.cachedData = JSON.parse(raw);
        console.log(`[Cache] Carregados ${this.cachedData.channels.length} canais do channels.json.`);
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

      // Tenta carregar banco EPG prévio
      const epgDbPath = path.join(config.DATA_DIR, 'epg_database.json');
      if (fs.existsSync(epgDbPath)) {
        const rawEpg = fs.readFileSync(epgDbPath, 'utf-8');
        const parsedEpg = JSON.parse(rawEpg);
        const masterChannels = new Map(Object.entries(parsedEpg.channels));
        const masterSearchMap = new Map(Object.entries(parsedEpg.searchMap));
        
        // Reconstrói métodos de consulta
        this.epgDatabase = {
          channels: masterChannels,
          searchMap: masterSearchMap,
          findEpg(tvgId, title, country = 'BR') {
            if (tvgId) {
              if (masterChannels.has(tvgId)) return masterChannels.get(tvgId);
              const cleanTvgId = tvgId.split('@')[0];
              if (masterChannels.has(cleanTvgId)) return masterChannels.get(cleanTvgId);
            }
            return null;
          },
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
          getChannelSchedule(channelId, atDate = new Date(), hoursAhead = 24) {
            const channel = masterChannels.get(channelId);
            if (!channel) return null;
            const fromMs = atDate.getTime() - (2 * 60 * 60 * 1000);
            const toMs = atDate.getTime() + (hoursAhead * 60 * 60 * 1000);
            const relevant = (channel.programs || [])
              .filter(p => p.stopMs >= fromMs && p.startMs <= toMs)
              .map(p => ({
                title: p.title,
                description: p.description,
                category: p.category,
                start: p.start,
                stop: p.stop,
                isLive: p.startMs <= atDate.getTime() && p.stopMs >= atDate.getTime()
              }));

            return {
              channelId: channel.id,
              channelName: channel.name,
              source: channel.source,
              programsCount: relevant.length,
              programs: relevant
            };
          }
        };
        console.log(`[Cache] Banco de dados EPG carregado em memória (${masterChannels.size} canais com grade).`);
      }
    } catch (err) {
      console.warn('[Cache] Erro ao carregar cache prévio:', err.message);
    }
  }

  saveChannelsJson(payload) {
    this.ensureDirectories();
    const tempFile = `${config.CHANNELS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tempFile, config.CHANNELS_FILE);
    this.cachedData = payload;
  }

  saveEpgDatabase(epgDb) {
    this.ensureDirectories();
    const epgDbPath = path.join(config.DATA_DIR, 'epg_database.json');
    const channelsObj = {};
    for (const [id, data] of epgDb.channels.entries()) {
      channelsObj[id] = {
        id: data.id,
        name: data.name,
        source: data.source,
        xmltvUrl: data.xmltvUrl,
        programs: data.programs || []
      };
    }
    const searchMapObj = Object.fromEntries(epgDb.searchMap.entries());
    fs.writeFileSync(epgDbPath, JSON.stringify({ channels: channelsObj, searchMap: searchMapObj }), 'utf-8');
    this.epgDatabase = epgDb;
  }

  saveLastSyncInfo(info) {
    this.ensureDirectories();
    fs.writeFileSync(config.LAST_SYNC_FILE, JSON.stringify(info, null, 2), 'utf-8');
    this.status.lastSync = info;
  }

  isCacheFresh() {
    if (!this.cachedData || !this.status.lastSync || !this.status.lastSync.completedAt) {
      return false;
    }
    const lastSyncTime = new Date(this.status.lastSync.completedAt).getTime();
    const now = Date.now();
    return (now - lastSyncTime) < config.SYNC_INTERVAL_MS;
  }

  startScheduler() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    console.log(`[Scheduler] Agendador ativado: Re-verificação a cada 72 horas.`);

    this.schedulerTimer = setInterval(() => {
      console.log('[Scheduler] Disparando atualização agendada de 72 horas...');
      this.runFullSync().catch(err => {
        console.error('[Scheduler] Erro no ciclo agendado:', err);
      });
    }, config.SYNC_INTERVAL_MS);
  }

  /**
   * Retorna os canais com cálculo dinâmico em tempo real de o que está passando AGORA
   */
  getChannelsDynamic(atDate = new Date()) {
    if (!this.cachedData) return null;

    const channels = this.cachedData.channels.map(channel => {
      let liveEpg = {
        hasEpg: false,
        channelId: channel.epg?.channelId || null,
        channelName: channel.epg?.channelName || null,
        source: channel.epg?.source || null,
        epgEndpoint: channel.epg?.epgEndpoint || `/api/epg/${channel.id}`,
        now: null,
        next: null
      };

      if (channel.epg && channel.epg.hasEpg && this.epgDatabase) {
        const live = this.epgDatabase.getLiveProgram(channel.epg.channelId, atDate);
        liveEpg = {
          ...liveEpg,
          hasEpg: true,
          now: live.now,
          next: live.next
        };
      }

      return {
        ...channel,
        epg: liveEpg
      };
    });

    return {
      meta: {
        ...this.cachedData.meta,
        queryTimestamp: atDate.toISOString()
      },
      channels: channels
    };
  }

  /**
   * Retorna a grade completa de um canal específico para hoje e próximas horas
   */
  getChannelEpg(channelIdOrSlug, atDate = new Date()) {
    if (!this.cachedData || !this.epgDatabase) return null;

    // Procura o canal pelo slug (ex: br-band) ou tvgId
    const channel = this.cachedData.channels.find(c => c.id === channelIdOrSlug || c.epg?.channelId === channelIdOrSlug);
    if (!channel || !channel.epg?.channelId) return null;

    const schedule = this.epgDatabase.getChannelSchedule(channel.epg.channelId, atDate);
    if (!schedule) return null;

    return {
      channel: {
        id: channel.id,
        name: channel.name,
        country: channel.country,
        category: channel.category,
        logo: channel.logo,
        liveUrl: channel.liveUrl,
        proxyUrl: channel.proxyUrl
      },
      ...schedule
    };
  }

  /**
   * Executa o ciclo completo de verificação estrita, desduplicação e montagem do banco EPG
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
      console.log('[Sync] INICIANDO CICLO COM TESTES ESTRITOS E EPG DINÂMICO...');
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

      // Deduplica URLs antes dos testes estritos
      const uniqueUrlMap = new Map();
      for (const item of allRawStreams) {
        if (!item.url || (!item.url.startsWith('http://') && !item.url.startsWith('https://'))) continue;
        const normalizedUrl = item.url.trim();
        if (!uniqueUrlMap.has(normalizedUrl)) {
          uniqueUrlMap.set(normalizedUrl, item);
        }
      }
      const streamsToTest = Array.from(uniqueUrlMap.values());
      console.log(`[Sync] URLs únicas para validação estrita: ${streamsToTest.length} links.`);

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

      // FASE 2: Validação Estrita de Streams (Manifesto + Download do 1º Fragmento)
      this.status.state = 'testing_streams';
      this.status.message = `Testando reprodução real de ${streamsToTest.length} streams...`;
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
            console.log(`[Validador] Progresso: ${prog.tested}/${prog.total} (${prog.percent}%) — 100% Funcionais: ${prog.active}`);
          }
        }
      });

      console.log(`[Sync] ✔ Testes estritos concluídos! Transmissões realmente reproduzíveis: ${activeStreams.length} de ${streamsToTest.length}.`);

      // FASE 3: Carregamento do Banco de Dados Dinâmico de EPG
      this.status.state = 'fetching_epg';
      this.status.message = 'Baixando e indexando fontes EPG dinâmicas...';
      console.log(`[Sync] 3/5: ${this.status.message}`);

      const epgDatabase = await loadAllEpgSources(config.EPG_SOURCES);
      this.saveEpgDatabase(epgDatabase);

      // FASE 4: Processamento, Desduplicação e Associação EPG
      this.status.state = 'processing';
      this.status.message = 'Desduplicando canais e associando identificadores EPG...';
      console.log(`[Sync] 4/5: ${this.status.message}`);

      const processed = processChannels(activeStreams, epgDatabase, channelsMetaMap, config.PORT);
      console.log(`[Sync] ✔ Canais únicos consolidados: ${processed.totalChannels} (Canais com EPG: ${processed.epgMatchedCount} - ${processed.matchRate}%).`);

      // FASE 5: Montagem do Payload e Persistência
      const nextUpdateDate = new Date(Date.now() + config.SYNC_INTERVAL_MS);
      const outputPayload = {
        meta: {
          title: 'IPTV & EPG Curated API',
          version: '1.1.0',
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
        testedStreams: streamsToTest.length,
        activeStreams: activeStreams.length,
        totalChannels: processed.totalChannels,
        channelsBR: outputPayload.meta.channelsByCountry.BR,
        channelsUS: outputPayload.meta.channelsByCountry.US,
        epgMatchedCount: processed.epgMatchedCount,
        matchRate: `${processed.matchRate}%`
      };

      this.saveLastSyncInfo(syncSummary);

      this.status.state = 'done';
      this.status.message = `Sincronização concluída com sucesso (${processed.totalChannels} canais 100% funcionais salvos).`;
      this.status.nextSync = nextUpdateDate.toISOString();

      console.log('====================================================');
      console.log(`[Sync] ✔ CICLO CONCLUÍDO EM ${syncSummary.durationSeconds}s!`);
      console.log(`[Sync] Arquivo salvo em: ${config.CHANNELS_FILE}`);
      console.log('====================================================');

      return outputPayload;
    } catch (err) {
      console.error('[Sync] Erro fatal:', err);
      this.status.state = 'error';
      this.status.message = `Erro: ${err.message}`;
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }
}

const syncManager = new SyncManager();

module.exports = syncManager;
