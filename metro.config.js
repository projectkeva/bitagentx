const nodeLibs = require('node-libs-react-native');

module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
  resolver: {
    extraNodeModules: nodeLibs,
    sourceExts: ['jsx', 'js', 'ts', 'tsx', 'cjs', 'json'], //add here
  },
};
