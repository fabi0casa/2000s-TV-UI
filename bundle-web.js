const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, 'web');
const iconsDir = path.join(webDir, 'icons');

const usedIconNames = [
    'antena.png',
    'aquanet-nosignal-1.png',
    'aquanet-nosignal-2.png',
    'volume-max.png',
    'volume-med.png',
    'volume-min.png',
    'volume-zero.png',
    'tv.png',
    'power-pressed.png',
    'power-unpressed.png'
];

const icons = {};
for (const file of usedIconNames) {
    const filePath = path.join(iconsDir, file);
    if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        icons[file] = `data:image/png;base64,${buf.toString('base64')}`;
    }
}

function inlineIcons(text) {
    let out = text.split('icons/aquanet-nosignal.png').join('icons/aquanet-nosignal-1.png');
    for (const [name, dataUri] of Object.entries(icons)) {
        out = out.split(`icons/${name}`).join(dataUri);
    }
    return out;
}

let html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf-8');
html = inlineIcons(html);

html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    `<style>\n${fs.readFileSync(path.join(webDir, 'style.css'), 'utf-8')}\n</style>`
);

// Injeta o mapa de ícones antes de qualquer script local.
const iconMapScript = `<script>window.__AQUANET_ICONS = ${JSON.stringify(icons)};window.aquanetAsset = function (name) { return (window.__AQUANET_ICONS && window.__AQUANET_ICONS[name]) || ('icons/' + name); };</script>`;
html = html.replace('</head>', `${iconMapScript}\n</head>`);

// Inline o hls.js local (se instalado) para funcionar offline no APK.
const hlsPath = path.join(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
if (fs.existsSync(hlsPath)) {
    const hlsCode = fs.readFileSync(hlsPath, 'utf-8');
    html = html.replace(
        /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/hls\.js@latest"><\/script>/,
        `<script>\n${hlsCode}\n</script>`
    );
} else {
    console.warn('[bundle-web] hls.js local nao encontrado; mantendo CDN.');
}

// Inline todos os scripts locais na ordem em que aparecem.
html = html.replace(/<script src="([^"]+)"><\/script>/g, (match, src) => {
    if (/^https?:\/\//i.test(src)) return match;
    const filePath = path.join(webDir, src);
    if (!fs.existsSync(filePath)) {
        console.warn('[bundle-web] Script não encontrado:', src);
        return match;
    }
    const code = inlineIcons(fs.readFileSync(filePath, 'utf-8'));
    return `<script>\n${code}\n</script>`;
});

const bundledJsContent = `// Auto-generated bundled HTML for React Native WebView
export const BUNDLED_HTML = ${JSON.stringify(html)};
export default BUNDLED_HTML;
`;

fs.writeFileSync(path.join(__dirname, 'bundledHtml.js'), bundledJsContent, 'utf-8');
console.log('bundledHtml.js gerado. Tamanho:', Math.round(bundledJsContent.length / 1024), 'KB');
