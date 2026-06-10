const path = require('path');

const {createDetoxConfig} = require('../ds-evidence-preset/src');

// O adaptador vive no BRQ-AI e é consumido pelo app via symlink (detox/), mas o
// ds-evidence.config.js é per-app e fica na raiz do host — resolve pelo cwd
// (detox/jest/yarn sempre rodam da raiz do app), nunca pelo realpath deste arquivo.
const hostConfig = require(path.join(process.cwd(), 'ds-evidence.config'));

module.exports = createDetoxConfig(hostConfig);
