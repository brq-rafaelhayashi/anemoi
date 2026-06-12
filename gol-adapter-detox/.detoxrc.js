const path = require('path');

const {createDetoxConfig} = require('../ds-evidence-preset/src');

// O adaptador vive no BRQ-AI e é consumido pelo app via symlink (detox/), mas o
// ds-evidence.config.js é per-app e fica na raiz do host — resolve pelo cwd
// (detox/jest/yarn sempre rodam da raiz do app), nunca pelo realpath deste arquivo.
const hostConfig = require(path.join(process.cwd(), 'ds-evidence.config'));

const config = createDetoxConfig(hostConfig);

// Allow per-app config or env var to constrain the iOS simulator OS version.
// Useful when multiple "iPhone X" simulators with different OS versions are installed
// and Detox would otherwise pick the newest (which may have compatibility issues).
const iosOs = process.env.DS_EVIDENCE_IOS_OS || hostConfig.devices?.iosOs;
if (iosOs && config.devices?.['ios.simulator']?.device) {
  config.devices['ios.simulator'].device.os = iosOs;
}

module.exports = config;
