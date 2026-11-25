/**
 * Servidor Xtream Codes falso para testes locais.
 *
 * Uso:
 *   node scripts/xtream-mock.js
 *   node scripts/xtream-mock.js 8099
 *
 * Credenciais: usuário "demo" / senha "demo"
 * Também serve uma lista M3U e um EPG XMLTV de exemplo:
 *   http://localhost:8099/playlist.m3u
 *   http://localhost:8099/epg.xml
 */

const http = require('http');

const PORT = Number(process.argv[2]) || 8099;
const USER = 'demo';
const PASS = 'demo';
const HOST = `http://localhost:${PORT}`;

const now = Date.now();
const hour = 60 * 60 * 1000;

const liveCategories = [
    { category_id: '10', category_name: 'Notícias', parent_id: 0 },
    { category_id: '20', category_name: 'Esportes', parent_id: 0 },
    { category_id: '30', category_name: 'Filmes', parent_id: 0 }
];

const liveStreams = [
    { num: 1, name: 'Canal Notícias HD', stream_id: 1001, stream_icon: '', epg_channel_id: 'news', category_id: '10' },
    { num: 2, name: 'Canal Esportes HD', stream_id: 1002, stream_icon: '', epg_channel_id: 'sports', category_id: '20' },
    { num: 3, name: 'Canal Cinema HD', stream_id: 1003, stream_icon: '', epg_channel_id: 'movies', category_id: '30' }
];

const vodCategories = [{ category_id: '50', category_name: 'Ação', parent_id: 0 }];
const vodStreams = [
    { num: 1, name: 'Filme de Teste', stream_id: 5001, stream_icon: '', category_id: '50', container_extension: 'mp4', rating: '8.0' }
];

const seriesCategories = [{ category_id: '60', category_name: 'Dramaturgia', parent_id: 0 }];
const series = [
    { num: 1, name: 'Série de Teste', series_id: 6001, cover: '', category_id: '60', releaseDate: '2024-01-01' }
];

const seriesInfo = {
    seasons: [
        {
            season_number: 1,
            name: 'Temporada 1',
            episodes: [
                { id: 7001, episode_num: 1, title: 'Episódio Piloto', container_extension: 'mp4', season: 1 },
                { id: 7002, episode_num: 2, title: 'Segundo Episódio', container_extension: 'mp4', season: 1 }
            ]
        }
    ],
    info: { name: 'Série de Teste' },
    episodes: {
        '1': [
            { id: 7001, episode_num: 1, title: 'Episódio Piloto', container_extension: 'mp4', season: 1 },
            { id: 7002, episode_num: 2, title: 'Segundo Episódio', container_extension: 'mp4', season: 1 }
        ]
    }
};

function shortEpg(streamId) {
    const base = Math.floor(now / hour) * hour;
    return {
        epg_listings: [
            {
                id: `${streamId}-1`,
                title: Buffer.from('Programa Atual').toString('base64'),
                description: Buffer.from('Programa de teste em exibição.').toString('base64'),
                start: new Date(base).toISOString().replace('T', ' ').slice(0, 19),
                end: new Date(base + hour).toISOString().replace('T', ' ').slice(0, 19),
                start_timestamp: Math.floor(base / 1000),
                stop_timestamp: Math.floor((base + hour) / 1000)
            },
            {
                id: `${streamId}-2`,
                title: Buffer.from('Próximo Programa').toString('base64'),
                description: Buffer.from('Programa seguinte da grade.').toString('base64'),
                start: new Date(base + hour).toISOString().replace('T', ' ').slice(0, 19),
                end: new Date(base + 2 * hour).toISOString().replace('T', ' ').slice(0, 19),
                start_timestamp: Math.floor((base + hour) / 1000),
                stop_timestamp: Math.floor((base + 2 * hour) / 1000)
            }
        ]
    };
}

const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="news" tvg-name="Canal Notícias" group-title="Notícias",Canal Notícias M3U
${HOST}/live/demo/demo/1001.ts
#EXTINF:-1 tvg-id="sports" tvg-name="Canal Esportes" group-title="Esportes",Canal Esportes M3U
${HOST}/live/demo/demo/1002.ts
`;

const xmltv = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="news"><display-name>Canal Notícias</display-name></channel>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="news">
    <title>Jornal de Teste</title>
    <desc>Notícias do dia.</desc>
  </programme>
</tv>`;

const server = http.createServer((req, res) => {
    const url = new URL(req.url, HOST);

    const send = (status, type, body) => {
        res.writeHead(status, {
            'Content-Type': type,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS'
        });
        res.end(body);
    };

    if (req.method === 'OPTIONS') {
        send(204, 'text/plain', '');
        return;
    }

    if (url.pathname === '/playlist.m3u') {
        send(200, 'audio/x-mpegurl', m3u);
        return;
    }

    if (url.pathname === '/epg.xml') {
        send(200, 'application/xml', xmltv);
        return;
    }

    if (url.pathname.startsWith('/live/') || url.pathname.startsWith('/movie/') || url.pathname.startsWith('/series/')) {
        send(200, 'video/mp2t', Buffer.alloc(188));
        return;
    }

    if (url.pathname !== '/player_api.php') {
        send(404, 'text/plain', 'not found');
        return;
    }

    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');
    const action = url.searchParams.get('action');

    if (username !== USER || password !== PASS) {
        send(200, 'application/json', JSON.stringify({ user_info: { auth: 0, status: 'Disabled', message: 'Credenciais inválidas' } }));
        return;
    }

    let payload = {};

    if (!action) {
        payload = {
            user_info: {
                username: USER,
                password: PASS,
                auth: 1,
                status: 'Active',
                exp_date: String(Math.floor((now + 365 * 24 * hour) / 1000)),
                max_connections: '2',
                active_cons: '0'
            },
            server_info: { url: 'localhost', port: PORT, https_port: '', server_protocol: 'http' }
        };
    } else if (action === 'get_live_categories') {
        payload = liveCategories;
    } else if (action === 'get_live_streams') {
        payload = liveStreams;
    } else if (action === 'get_vod_categories') {
        payload = vodCategories;
    } else if (action === 'get_vod_streams') {
        payload = vodStreams;
    } else if (action === 'get_series_categories') {
        payload = seriesCategories;
    } else if (action === 'get_series') {
        payload = series;
    } else if (action === 'get_series_info') {
        payload = seriesInfo;
    } else if (action === 'get_short_epg') {
        payload = shortEpg(Number(url.searchParams.get('stream_id')) || 1001);
    } else {
        payload = [];
    }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(payload));
});

server.listen(PORT, () => {
    console.log(`[Xtream Mock] Rodando em ${HOST}`);
    console.log(`[Xtream Mock] Usuário: ${USER} | Senha: ${PASS}`);
    console.log(`[Xtream Mock] M3U: ${HOST}/playlist.m3u`);
    console.log(`[Xtream Mock] EPG: ${HOST}/epg.xml`);
});

module.exports = { PORT, USER, PASS, HOST };
