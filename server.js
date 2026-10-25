/**
 * Repositório Flash - Servidor Dual (Principal + Windows 93)
 * 
 * Sobe simultaneamente:
 *  1. Servidor Principal na porta 3000 (serve todo o repositório, incluindo /legacy)
 *  2. Servidor Windows 93 na porta 9393 (serve a pasta media/jogos/html5/Windows 93 como raiz)
 * 
 * Uso:
 *   node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT_MAIN = parseInt(process.env.PORT, 10) || 3000;
const PORT_WIN93 = parseInt(process.env.PORT_WIN93, 10) || 9393;

const ROOT_MAIN = path.resolve(__dirname);
const ROOT_WIN93 = path.resolve(__dirname, 'media', 'jogos', 'html5', 'Windows 93');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.cur': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.tgz': 'application/gzip',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.swf': 'application/x-shockwave-flash',
    '.dcr': 'application/x-director',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
};

function getMimeType(filePath) {
    if (filePath.endsWith('.tar.gz')) {
        return 'application/gzip';
    }
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

function createStaticServer(rootDir, serverName) {
    return http.createServer((req, res) => {
        // Headers de CORS e compatibilidade
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'X-Content-Type-Options': 'nosniff',
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, headers);
            res.end('Method Not Allowed');
            return;
        }

        // Separa caminho da query string (ex: ?flash=nomedojogo)
        const queryIndex = req.url.indexOf('?');
        const rawPath = queryIndex !== -1 ? req.url.slice(0, queryIndex) : req.url;
        const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';

        // Redireciona URLs que contenham .html/.htm para a versão limpa (301 Moved Permanently)
        if (rawPath === '/index.html' || rawPath === '/index.htm') {
            res.writeHead(301, { ...headers, Location: '/' + queryString });
            res.end();
            return;
        }

        if (rawPath.endsWith('/index.html')) {
            const cleanPath = rawPath.slice(0, -'index.html'.length);
            res.writeHead(301, { ...headers, Location: cleanPath + queryString });
            res.end();
            return;
        }

        if (rawPath.endsWith('/index.htm')) {
            const cleanPath = rawPath.slice(0, -'index.htm'.length);
            res.writeHead(301, { ...headers, Location: cleanPath + queryString });
            res.end();
            return;
        }

        if (rawPath.endsWith('.html')) {
            const cleanPath = rawPath.slice(0, -5);
            res.writeHead(301, { ...headers, Location: cleanPath + queryString });
            res.end();
            return;
        }

        if (rawPath.endsWith('.htm')) {
            const cleanPath = rawPath.slice(0, -4);
            res.writeHead(301, { ...headers, Location: cleanPath + queryString });
            res.end();
            return;
        }

        let decodedPath = '';
        try {
            decodedPath = decodeURIComponent(rawPath);
        } catch {
            res.writeHead(400, headers);
            res.end('Bad Request: Invalid URL encoding');
            return;
        }

        // Sanitiza caminho para impedir Directory Traversal
        let safePath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
        let targetPath = path.join(rootDir, safePath);

        // Garante que o arquivo acessado está dentro do rootDir
        if (!targetPath.startsWith(rootDir)) {
            res.writeHead(403, headers);
            res.end('Forbidden');
            return;
        }

        fs.stat(targetPath, (err, stats) => {
            if (!err) {
                // Se for diretório
                if (stats.isDirectory()) {
                    // Garante barra final para diretórios (ex: /legacy/) para manter caminhos relativos corretos
                    if (!rawPath.endsWith('/')) {
                        res.writeHead(301, { ...headers, Location: rawPath + '/' + queryString });
                        res.end();
                        return;
                    }

                    const indexPath = path.join(targetPath, 'index.html');
                    fs.stat(indexPath, (indexErr, indexStats) => {
                        if (!indexErr && indexStats.isFile()) {
                            serveFile(req, res, indexPath, indexStats, headers);
                            return;
                        }

                        const indexHtmPath = path.join(targetPath, 'index.htm');
                        fs.stat(indexHtmPath, (htmErr, htmStats) => {
                            if (!htmErr && htmStats.isFile()) {
                                serveFile(req, res, indexHtmPath, htmStats, headers);
                                return;
                            }
                            res.writeHead(403, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('Directory listing forbidden');
                        });
                    });
                    return;
                }

                serveFile(req, res, targetPath, stats, headers);
                return;
            }

            // Se o arquivo exato não existe, tenta servir com extensão .html ou .htm
            const cleanTarget = targetPath.replace(/[\\\/]+$/, '');
            const htmlPath = cleanTarget + '.html';

            fs.stat(htmlPath, (htmlErr, htmlStats) => {
                if (!htmlErr && htmlStats.isFile()) {
                    // Se foi acessado com barra no final mas é arquivo (ex: /jogo/), redireciona para /jogo
                    if (rawPath.endsWith('/') && rawPath !== '/') {
                        res.writeHead(301, { ...headers, Location: rawPath.slice(0, -1) + queryString });
                        res.end();
                        return;
                    }
                    serveFile(req, res, htmlPath, htmlStats, headers);
                    return;
                }

                const htmPath = cleanTarget + '.htm';
                fs.stat(htmPath, (htmErr, htmStats) => {
                    if (!htmErr && htmStats.isFile()) {
                        if (rawPath.endsWith('/') && rawPath !== '/') {
                            res.writeHead(301, { ...headers, Location: rawPath.slice(0, -1) + queryString });
                            res.end();
                            return;
                        }
                        serveFile(req, res, htmPath, htmStats, headers);
                        return;
                    }

                    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(`404 Not Found: ${rawPath}`);
                });
            });
        });
    });
}

function serveFile(req, res, filePath, stats, baseHeaders) {
    const mimeType = getMimeType(filePath);
    const rangeHeader = req.headers.range;

    // Suporte a HTTP 206 Partial Content para mídias / streaming / range requests
    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        if (start >= stats.size || end >= stats.size || start > end) {
            res.writeHead(416, {
                ...baseHeaders,
                'Content-Range': `bytes */${stats.size}`,
            });
            res.end();
            return;
        }

        const chunkSize = end - start + 1;
        res.writeHead(206, {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mimeType,
        });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', () => res.end());
        stream.pipe(res);
    } else {
        res.writeHead(200, {
            ...baseHeaders,
            'Content-Length': stats.size,
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
        });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath);
        stream.on('error', () => res.end());
        stream.pipe(res);
    }
}

// Inicialização dos servidores
const mainServer = createStaticServer(ROOT_MAIN, 'Principal');
const win93Server = createStaticServer(ROOT_WIN93, 'Windows 93');

mainServer.listen(PORT_MAIN, () => {
    win93Server.listen(PORT_WIN93, () => {
        console.log('');
        console.log('================================================================');
        console.log('       REPOSITÓRIO FLASH - SERVIDORES INICIADOS COM SUCESSO     ');
        console.log('================================================================');
        console.log(` [1] Servidor Principal:    http://localhost:${PORT_MAIN}`);
        console.log(`     -> Versao Legado:      http://localhost:${PORT_MAIN}/legacy/`);
        console.log(`     -> Versao Atual:       http://localhost:${PORT_MAIN}/`);
        console.log('');
        console.log(` [2] Servidor Windows 93:  http://localhost:${PORT_WIN93}`);
        console.log('     -> Servindo raiz de:  media/jogos/html5/Windows 93');
        console.log('================================================================');
        console.log(' Pressione Ctrl + C para encerrar os servidores a qualquer momento.');
        console.log('');
    });
});

mainServer.on('error', (err) => {
    console.error(`[ERRO Servidor Principal :${PORT_MAIN}]`, err.message);
});

win93Server.on('error', (err) => {
    console.error(`[ERRO Servidor Windows 93 :${PORT_WIN93}]`, err.message);
});
