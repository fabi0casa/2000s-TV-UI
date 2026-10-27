/**
 * Validador Estrito de Streams IPTV
 * Executa testes aprofundados para garantir que o canal realmente reproduz no navegador:
 *  1. Converte automaticamente links .ts para .m3u8 (formato HLS suportado por players web)
 *  2. Valida o manifesto (#EXTM3U presente, sem mensagens de erro de geo-bloqueio)
 *  3. Testa o download do primeiro fragmento de vídeo/áudio (evita falsos positivos como 403/414/502)
 *  4. Detecta suporte nativo a CORS
 */

async function testSingleStreamStrict(url, options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  // Otimização: Se for link .ts de servidor Xtream Codes (:80/), tenta converter para .m3u8
  let testUrl = url;
  if (testUrl.includes(':80/') && testUrl.endsWith('.ts')) {
    testUrl = testUrl.replace(/\.ts$/, '.m3u8');
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(testUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': '*/*'
      },
      redirect: 'follow'
    });

    if (!res.ok) {
      clearTimeout(timer);
      return { playable: false, reason: `HTTP ${res.status}` };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isM3u = contentType.includes('mpegurl') || testUrl.includes('.m3u8');
    const corsHeader = res.headers.get('access-control-allow-origin');
    const isDirectCors = corsHeader === '*' || corsHeader === 'null';

    // Se for stream direto de vídeo (ex: stream puro mpeg-ts contínuo)
    if (!isM3u && (contentType.includes('video/') || contentType.includes('octet-stream'))) {
      clearTimeout(timer);
      return {
        playable: true,
        streamUrl: testUrl,
        isHls: false,
        corsNative: isDirectCors,
        latencyMs: Date.now() - startTime,
        contentType: contentType
      };
    }

    // Se não for HLS nem vídeo válido, rejeita
    if (!isM3u) {
      clearTimeout(timer);
      return { playable: false, reason: `Tipo de conteúdo incompatível: ${contentType}` };
    }

    // Validação do manifesto HLS (.m3u8)
    const manifestText = await res.text();
    if (!manifestText.includes('#EXTM3U')) {
      clearTimeout(timer);
      return { playable: false, reason: 'Manifesto não contém cabeçalho #EXTM3U' };
    }

    // Detecção de respostas de bloqueio geográfico ou restrição
    const lowerText = manifestText.toLowerCase();
    if (
      lowerText.includes('geo-blocked') ||
      lowerText.includes('not available in your region') ||
      lowerText.includes('access denied') ||
      lowerText.includes('unauthorized') ||
      lowerText.includes('error 403')
    ) {
      clearTimeout(timer);
      return { playable: false, reason: 'Transmissão com bloqueio regional (Geo-blocked)' };
    }

    // Extrai o primeiro item (pode ser sub-playlist variante ou fragmento .ts)
    const lines = manifestText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      clearTimeout(timer);
      return { playable: false, reason: 'Playlist HLS vazia' };
    }

    let firstChunkUrl = '';
    try {
      firstChunkUrl = new URL(lines[0], testUrl).toString();
    } catch {
      clearTimeout(timer);
      return { playable: false, reason: 'URL de fragmento inválida no manifesto' };
    }

    // Teste real de consumo do primeiro fragmento de vídeo
    const chunkController = new AbortController();
    const chunkTimer = setTimeout(() => chunkController.abort(), timeoutMs);

    try {
      const chunkRes = await fetch(firstChunkUrl, {
        signal: chunkController.signal,
        headers: {
          'User-Agent': userAgent,
          'Range': 'bytes=0-2048',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });

      clearTimeout(chunkTimer);

      if (!chunkRes.ok && chunkRes.status !== 206) {
        clearTimeout(timer);
        return { playable: false, reason: `Erro no fragmento de mídia: HTTP ${chunkRes.status}` };
      }

      // Consome e encerra o stream do chunk imediatamente
      try {
        if (chunkRes.body) {
          const reader = chunkRes.body.getReader();
          await reader.read();
          await reader.cancel();
        }
      } catch {
        // ignora
      }

      clearTimeout(timer);
      return {
        playable: true,
        streamUrl: testUrl,
        isHls: true,
        corsNative: isDirectCors,
        latencyMs: Date.now() - startTime,
        contentType: contentType || 'application/vnd.apple.mpegurl'
      };

    } catch (chunkErr) {
      clearTimeout(chunkTimer);
      clearTimeout(timer);
      return { playable: false, reason: `Falha ao carregar fragmento: ${chunkErr.message}` };
    }

  } catch (err) {
    clearTimeout(timer);
    return { playable: false, reason: err.name === 'AbortError' ? 'Timeout' : err.message };
  }
}

/**
 * Executa os testes estritos em pool de concorrência limitada
 */
async function testStreamPool(items, config = {}) {
  const concurrency = config.concurrency || 25;
  const timeoutMs = config.timeoutMs || 4000;
  const onProgress = config.onProgress || (() => {});

  const total = items.length;
  let currentIndex = 0;
  let activeCount = 0;
  let testedCount = 0;
  const activeItems = [];

  async function worker() {
    while (currentIndex < total) {
      const index = currentIndex++;
      const item = items[index];

      const testResult = await testSingleStreamStrict(item.url, { timeoutMs });
      testedCount++;

      if (testResult.playable) {
        activeCount++;
        activeItems.push({
          ...item,
          url: testResult.streamUrl || item.url,
          isHls: testResult.isHls !== false,
          corsNative: testResult.corsNative === true,
          latencyMs: testResult.latencyMs || 0,
          contentType: testResult.contentType || '',
          verifiedAt: new Date().toISOString()
        });
      }

      onProgress({
        tested: testedCount,
        total,
        active: activeCount,
        percent: Math.round((testedCount / total) * 100)
      });
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, total);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return activeItems;
}

module.exports = {
  testSingleStreamStrict,
  testStreamPool
};
