const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for .txt and .srt files as assets
config.resolver.assetExts.push('txt', 'srt');

// Ensure video extensions are treated as assets (both cases)
if (!config.resolver.assetExts.includes('MOV')) {
  config.resolver.assetExts.push('MOV');
}
if (!config.resolver.assetExts.includes('MP4')) {
  config.resolver.assetExts.push('MP4');
}

// Provide web mocks for native-only modules
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-purchases') {
    return {
      filePath: path.resolve(__dirname, 'lib/react-native-purchases.web.ts'),
      type: 'sourceFile',
    };
  }
  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

