const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, 'web');
const iconsDir = path.join(webDir, 'icons');

// Read used icons as base64
const usedIconNames = [
    'antena.png',
    'aquanet-nosignal.png',
    'aquanet-nosignal-1.png',
    'volume-max.png',
    'volume-med.png',
    'volume-min.png',
    'volume-zero.png',
    'tv.png'
];

const icons = {};
for (const file of usedIconNames) {
    // If aquanet-nosignal-1.png is requested, we can alias to the optimized aquanet-nosignal.png
    const actualFile = (file === 'aquanet-nosignal-1.png') ? 'aquanet-nosignal.png' : file;
    const filePath = path.join(iconsDir, actualFile);
    if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        icons[file] = `data:image/png;base64,${buf.toString('base64')}`;
    }
}

// Read web assets
let html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(webDir, 'style.css'), 'utf-8');
const audioJs = fs.readFileSync(path.join(webDir, 'audio.js'), 'utf-8');
const channelsJs = fs.readFileSync(path.join(webDir, 'channels.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(webDir, 'app.js'), 'utf-8');

// Replace icon references with base64
for (const [name, dataUri] of Object.entries(icons)) {
    // Replace "icons/name" or 'icons/name'
    html = html.split(`icons/${name}`).join(dataUri);
}

// Inline CSS
html = html.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`);

// Inline JS scripts (keep external cdn scripts intact)
const scriptsToInline = `
<script>
// Base64 icon map for JS runtime access
window.__AQUANET_ICONS = ${JSON.stringify(icons)};
// Overwrite icon references in runtime
(function() {
    const origImage = window.Image;
})();
\n${audioJs}\n
\n${channelsJs}\n
\n${appJs}\n
</script>
`;

html = html.replace(
    /<script src="audio\.js"><\/script>\s*<script src="channels\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    scriptsToInline
);

// Update icon paths in appJs if any
for (const [name, dataUri] of Object.entries(icons)) {
    html = html.split(`'icons/${name}'`).join(`'${dataUri}'`);
    html = html.split(`"icons/${name}"`).join(`"${dataUri}"`);
}

// Export bundledHtml.js
const bundledJsContent = `// Auto-generated bundled HTML for React Native WebView
export const BUNDLED_HTML = ${JSON.stringify(html)};
export default BUNDLED_HTML;
`;

fs.writeFileSync(path.join(__dirname, 'bundledHtml.js'), bundledJsContent, 'utf-8');
console.log('Successfully generated bundledHtml.js! Size:', Math.round(bundledJsContent.length / 1024), 'KB');

// Also copy web directory to assets/web for Android WebView file:// access
const assetsWebDir = path.join(__dirname, 'assets', 'web');
fs.mkdirSync(assetsWebDir, { recursive: true });
const copyRecursive = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};
copyRecursive(webDir, assetsWebDir);
console.log('Successfully copied assets to assets/web!');
