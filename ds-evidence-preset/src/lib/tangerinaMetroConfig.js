const path = require('path');
const fs = require('fs');
const {hostRequire} = require('./hostRequire');

const exclusionList = hostRequire('metro-config/src/defaults/exclusionList');

const VALID_TANGERINA_MODES = ['package', 'source'];
const TANGERINA_CORE_PKG = '@gol-smiles/tangerina-react-native-core';
const TANGERINA_DIST_PREFIX = `${TANGERINA_CORE_PKG}/dist/`;

function getPackageName(moduleName) {
  return moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
}

function resolveSourceFile(root, subPath) {
  const base = path.join(root, subPath);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {type: 'sourceFile', filePath: candidate};
    }
  }

  return null;
}

function validateMode(mode) {
  if (!VALID_TANGERINA_MODES.includes(mode)) {
    throw new Error(
      `Invalid TANGERINA_MODE="${mode}". Use "package" or "source".`,
    );
  }
}

function defaultPaths(projectRoot) {
  const tangerinaRoot = path.resolve(projectRoot, '../projects_tangerina');

  return {
    hostNodeModules: path.resolve(projectRoot, 'node_modules'),
    corePath: path.resolve(
      tangerinaRoot,
      'golsmiles-reactnative-tangerina-ds/src',
    ),
    assetsPath: path.resolve(
      tangerinaRoot,
      'golsmiles-reactnative-tangerina-ds-assets',
    ),
    tokensPath: path.resolve(
      tangerinaRoot,
      'golsmiles-nodejs-tangerina-ds-tokens',
    ),
  };
}

function getTangerinaMetroConfig({projectRoot, mode, paths = {}}) {
  validateMode(mode);

  if (mode !== 'source') {
    return {};
  }

  const resolvedPaths = {
    ...defaultPaths(projectRoot),
    ...paths,
  };
  const {hostNodeModules, corePath, assetsPath, tokensPath} = resolvedPaths;

  function resolveTangerinaSourceRequest(context, moduleName, platform) {
    if (moduleName === TANGERINA_CORE_PKG) {
      const result = resolveSourceFile(corePath, 'index');
      if (result) return result;
    }

    if (moduleName.startsWith(TANGERINA_DIST_PREFIX)) {
      const subPath = moduleName.substring(TANGERINA_DIST_PREFIX.length);
      const result = resolveSourceFile(corePath, subPath);
      if (result) return result;
    }

    if (moduleName[0] !== '.' && moduleName[0] !== '/') {
      const pkgName = getPackageName(moduleName);

      if (fs.existsSync(path.join(hostNodeModules, pkgName))) {
        return context.resolveRequest(
          {...context, originModulePath: __filename},
          moduleName,
          platform,
        );
      }
    }

    return context.resolveRequest(context, moduleName, platform);
  }

  return {
    watchFolders: [corePath, assetsPath, tokensPath],
    resolver: {
      blockList: exclusionList([
        /.*\/projects_tangerina\/[^/]+\/node_modules\/.*/,
        /.*\/projects_tangerina\/[^/]+\/\.git\/.*/,
      ]),
      nodeModulesPaths: [hostNodeModules],
      resolveRequest: resolveTangerinaSourceRequest,
    },
  };
}

module.exports = {
  getTangerinaMetroConfig,
};
