const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for .txt and .srt files as assets
config.resolver.assetExts.push('txt', 'srt');

// Ensure uppercase video extensions are also treated as assets
// (MOV, MP4, etc. - case insensitive)
if (!config.resolver.assetExts.includes('MOV')) {
  config.resolver.assetExts.push('MOV');
}

module.exports = config;

