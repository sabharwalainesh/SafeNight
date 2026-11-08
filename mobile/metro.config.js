// Metro config: this app lives beside the web client and reuses its data layer
// (web/src/features/*/api.ts, web/src/features/*/live/**, web/src/module_bindings).
// Everything must resolve to ONE copy of react and ONE copy of spacetimedb.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Let Metro see the shared web sources and the root node_modules.
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules'), path.join(repoRoot, 'node_modules')];

// Pick the spacetimedb `browser` build (WebSocket + fetch, no undici) on native too.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

const fromMobile = new Set(['react', 'react-native', 'react-dom']);
const fromRoot = new Set(['spacetimedb']);
const pkgOf = (name) => (name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = pkgOf(moduleName);
  if (fromMobile.has(pkg)) {
    // Web sources import `react`; force the copy installed next to react-native.
    return context.resolveRequest({ ...context, originModulePath: path.join(projectRoot, 'index.ts') }, moduleName, platform);
  }
  if (fromRoot.has(pkg)) {
    // Bindings (web/src/module_bindings) and this app must share one SDK instance
    // so Identity/Timestamp classes compare equal: resolve from the repo root.
    return context.resolveRequest({ ...context, originModulePath: path.join(repoRoot, 'package.json') }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
