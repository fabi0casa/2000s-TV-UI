/**
 * Validador de Streams IPTV
 * Executa testes HTTP controlados com timeout e concorrência para determinar canais ativos e medir latência.
 */

async function testSingleStream(url, options = {}) {
  const timeoutMs = options.timeoutMs || 3500;
  const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Tenta método HEAD primeiro (mais leve e rápido)
    let res = null;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          'Accept': '*/*'
        },
        redirect: 'follow'
      });
    } catch {
      res = null;
    }

    // Se HEAD funcionou com 200 ou 206
    if (res && (res.status === 200 || res.status === 206)) {
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      return {
        active: true,
        statusCode: res.status,
        latencyMs,
        contentType: res.headers.get('content-type') || ''
      };
    }

    // 2. Se HEAD deu 405 (Method Not Allowed) ou não respondeu, tenta GET com Range parcial
    clearTimeout(timer);
    const getController = new AbortController();
    const getTimer = setTimeout(() => getController.abort(), timeoutMs);

    try {
      const getRes = await fetch(url, {
        method: 'GET',
        signal: getController.signal,
        headers: {
          'User-Agent': userAgent,
          'Range': 'bytes=0-1024',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });

      clearTimeout(getTimer);

      if (getRes.status === 200 || getRes.status === 206) {
        // Interrompe o consumo do corpo imediatamente após confirmar resposta
        try {
          if (getRes.body) {
            const reader = getRes.body.getReader();
            await reader.read();
            await reader.cancel();
          }
        } catch {
          // ignora erro ao cancelar stream
        }

        const latencyMs = Date.now() - startTime;
        return {
          active: true,
          statusCode: getRes.status,
          latencyMs,
          contentType: getRes.headers.get('content-type') || ''
        };
      }
    } catch (err) {
      clearTimeout(getTimer);
      return {
        active: false,
        statusCode: 0,
        latencyMs: Date.now() - startTime,
        error: err.name === 'AbortError' ? 'Timeout' : err.message
      };
    }

    return {
      active: false,
      statusCode: res ? res.status : 0,
      latencyMs: Date.now() - startTime,
      error: `HTTP ${res ? res.status : 'desconhecido'}`
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      active: false,
      statusCode: 0,
      latencyMs: Date.now() - startTime,
      error: err.name === 'AbortError' ? 'Timeout' : err.message
    };
  }
}

/**
 * Testa uma lista de itens com pool de concorrência limitada
 * @param {Array} items - Array com objetos contendo a propriedade `url`
 * @param {Object} config - Configurações de timeout, concorrência e callback de progresso
 */
async function testStreamPool(items, config = {}) {
  const concurrency = config.concurrency || 20;
  const timeoutMs = config.timeoutMs || 3500;
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

      const testResult = await testSingleStream(item.url, { timeoutMs });
      testedCount++;

      if (testResult.active) {
        activeCount++;
        activeItems.push({
          ...item,
          latencyMs: testResult.latencyMs,
          statusCode: testResult.statusCode,
          contentType: testResult.contentType,
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
  testSingleStream,
  testStreamPool
};
