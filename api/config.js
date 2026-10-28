const path = require('path');

module.exports = {
  // Porta do servidor HTTP conforme especificação
  PORT: parseInt(process.env.PORT, 10) || 1414,

  // Intervalo de re-verificação automática (6 horas em milissegundos)
  SYNC_INTERVAL_MS: 6 * 60 * 60 * 1000, // 6 horas (21.600.000 ms)

  // Configurações do validador de streams
  VALIDATOR: {
    TIMEOUT_MS: 3000,       // Timeout por requisição de teste
    CONCURRENCY: 35,        // Número de testes simultâneos
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  },

  // Fontes de canais IPTV (Brasil e EUA)
  STREAM_SOURCES: [
    {
      id: 'iptv-org-br',
      name: 'IPTV-org Brasil',
      country: 'BR',
      url: 'https://iptv-org.github.io/iptv/countries/br.m3u',
      type: 'm3u'
    },
    {
      id: 'iptv-org-us',
      name: 'IPTV-org USA',
      country: 'US',
      url: 'https://iptv-org.github.io/iptv/countries/us.m3u',
      type: 'm3u'
    },
    {
      id: 'ramys-brasil-canais',
      name: 'IPTV Brasil 2026 (Ramys) - Canais Principais',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Canais.m3u8',
      type: 'm3u'
    },
    {
      id: 'ramys-brasil-canais03',
      name: 'IPTV Brasil 2026 (Ramys) - Canais HD Diretos',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/CanaisBR03.m3u8',
      type: 'm3u'
    }
  ],

  // Metadados adicionais da api iptv-org
  IPTV_ORG_CHANNELS_API: 'https://iptv-org.github.io/api/channels.json',

  // Fontes de dados EPG
  EPG_SOURCES: [
    // Repositório 1: BrazilTVEPG (limaalef/BrazilTVEPG)
    {
      id: 'braziltvepg-main',
      name: 'BrazilTVEPG - Principal',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml'
    },
    {
      id: 'braziltvepg-claro',
      name: 'BrazilTVEPG - Claro TV+',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml'
    },
    {
      id: 'braziltvepg-globo',
      name: 'BrazilTVEPG - Globo & Globoplay',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/globo.xml'
    },
    {
      id: 'braziltvepg-vivoplay',
      name: 'BrazilTVEPG - Vivo Play',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/vivoplay.xml'
    },
    {
      id: 'braziltvepg-maissbt',
      name: 'BrazilTVEPG - Mais SBT',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/maissbt.xml'
    },
    {
      id: 'braziltvepg-xsports',
      name: 'BrazilTVEPG - Xsports TV',
      country: 'BR',
      url: 'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/xsports.xml'
    },
    // Repositório 2: IPTV-ORG EPG (iptv-org/epg / iptv-epg.org)
    {
      id: 'iptv-epg-br',
      name: 'IPTV-Org EPG Brasil',
      country: 'BR',
      url: 'https://iptv-epg.org/files/epg-br.xml'
    },
    {
      id: 'iptv-epg-us',
      name: 'IPTV-Org EPG Estados Unidos',
      country: 'US',
      url: 'https://iptv-epg.org/files/epg-us.xml'
    }
  ],

  // Diretórios e Arquivos de Persistência
  DATA_DIR: path.join(__dirname, 'data'),
  CHANNELS_FILE: path.join(__dirname, 'data', 'channels.json'),
  LAST_SYNC_FILE: path.join(__dirname, 'data', 'last_sync.json')
};
