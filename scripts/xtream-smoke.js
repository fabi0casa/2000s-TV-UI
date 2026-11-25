/**
 * Teste rápido de um servidor Xtream Codes.
 *
 * Com as credenciais do seu provedor:
 *   XTREAM_URL=http://host:8080 XTREAM_USER=usuario XTREAM_PASS=senha node scripts/xtream-smoke.js
 *
 * Sem variáveis de ambiente, sobe o servidor mock local e testa contra ele:
 *   node scripts/xtream-smoke.js
 */

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    return res.json();
}

async function main() {
    let base = process.env.XTREAM_URL;
    let user = process.env.XTREAM_USER;
    let pass = process.env.XTREAM_PASS;
    let mock = null;

    if (!base) {
        const port = await findFreePort();
        base = `http://localhost:${port}`;
        user = 'demo';
        pass = 'demo';
        mock = spawn(process.execPath, [path.join(__dirname, 'xtream-mock.js'), String(port)], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        mock.stdout.on('data', () => {});
        mock.stderr.on('data', (data) => console.error(String(data)));
        await sleep(700);
    }

    const api = (action) => {
        const params = new URLSearchParams({ username: user, password: pass });
        if (action) params.set('action', action);
        return `${base.replace(/\/+$/, '')}/player_api.php?${params.toString()}`;
    };

    let failures = 0;
    const check = (label, condition, detail) => {
        if (condition) {
            console.log(`  OK   ${label}${detail ? ` - ${detail}` : ''}`);
        } else {
            failures += 1;
            console.log(`  FALHA ${label}${detail ? ` - ${detail}` : ''}`);
        }
    };

    try {
        console.log(`Testando ${base} (usuário: ${user})`);

        const auth = await getJson(api());
        check('Autenticação', Number(auth.user_info && auth.user_info.auth) === 1, auth.user_info && auth.user_info.status);

        const cats = await getJson(api('get_live_categories'));
        check('Categorias ao vivo', Array.isArray(cats) && cats.length > 0, `${cats.length} categorias`);

        const live = await getJson(api('get_live_streams'));
        check('Canais ao vivo', Array.isArray(live) && live.length > 0, `${live.length} canais`);

        const vodCats = await getJson(api('get_vod_categories'));
        check('Categorias de filmes', Array.isArray(vodCats), `${vodCats.length} categorias`);

        const vod = await getJson(api('get_vod_streams'));
        check('Filmes', Array.isArray(vod), `${vod.length} filmes`);

        const seriesCats = await getJson(api('get_series_categories'));
        check('Categorias de séries', Array.isArray(seriesCats), `${seriesCats.length} categorias`);

        const series = await getJson(api('get_series'));
        check('Séries', Array.isArray(series), `${series.length} séries`);

        if (series.length) {
            const info = await getJson(`${api('get_series_info')}&series_id=${encodeURIComponent(series[0].series_id)}`);
            const seasons = info && Array.isArray(info.seasons) ? info.seasons : [];
            check('Episódios da primeira série', seasons.length > 0, `${seasons.length} temporadas`);
        }

        if (live.length) {
            const epg = await getJson(`${api('get_short_epg')}&stream_id=${encodeURIComponent(live[0].stream_id)}&limit=4`);
            const listings = epg && Array.isArray(epg.epg_listings) ? epg.epg_listings : [];
            check('EPG do primeiro canal', listings.length > 0, `${listings.length} programas`);

            const streamUrl = `${base.replace(/\/+$/, '')}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${live[0].stream_id}.ts`;
            const streamRes = await fetch(streamUrl, { method: 'GET' });
            check('Stream do primeiro canal', streamRes.status === 200, `HTTP ${streamRes.status}`);
            try {
                if (streamRes.body && streamRes.body.cancel) await streamRes.body.cancel();
            } catch (e) {}
        }

        console.log(failures === 0 ? '\nTodos os testes passaram.' : `\n${failures} teste(s) falharam.`);
        process.exitCode = failures === 0 ? 0 : 1;
    } catch (err) {
        console.error('\nErro no teste:', err.message);
        process.exitCode = 1;
    } finally {
        if (mock) {
            mock.kill();
        }
    }
}

main();
