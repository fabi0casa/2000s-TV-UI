const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for html and additional asset extensions
config.resolver.assetExts.push('html', 'css', 'mp3', 'png', 'jpg');

module.exports = config;
