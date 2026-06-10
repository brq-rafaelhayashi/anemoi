const path = require('path');
const {createRequire} = require('module');

// O adaptador vive no BRQ-AI e é consumido pelo app via symlink (detox/).
// `detox test` roda jest com cwd na raiz do app — é de lá que o pacote detox
// (globalSetup/reporter/testEnvironment) precisa resolver, nunca do realpath
// deste arquivo. Os testes, por sua vez, vivem aqui no adaptador (__dirname).
const hostRequire = createRequire(path.join(process.cwd(), 'package.json'));
const hostResolve = id => hostRequire.resolve(id);

module.exports = {
  rootDir: __dirname,
  testMatch: ['<rootDir>/**/*.test.js'],
  // Orçamento legítimo por teste: 20s de settle + 2 waitFor de 60s + captura.
  testTimeout: 150000,
  maxWorkers: 1,
  globalSetup: hostResolve('detox/runners/jest/globalSetup'),
  globalTeardown: hostResolve('detox/runners/jest/globalTeardown'),
  reporters: [hostResolve('detox/runners/jest/reporter')],
  testEnvironment: hostResolve('detox/runners/jest/testEnvironment'),
  verbose: true,
};
