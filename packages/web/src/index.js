'use strict';
// Interface publica do pacote. Consumidores externos (anemoi-service) importam
// SO daqui — o campo "exports" do package.json bloqueia subpaths de src/.

const {groupByCell, computeParity} = require('./parity');
const {capturePipeline} = require('./pipeline');
const {createRunDir, prepareCapture, runCurrentState} = require('./run');
const {writeFailureManifest} = require('./failure');
const {VIEWPORT_WIDTHS} = require('./brands');
const {readLocalConfig, resolveRepository} = require('./config');
const {assertCaptureReady, runDoctor} = require('./doctor');
const {makeWcHost} = require('./hosts/wc');
const {makeReactHost} = require('./hosts/react');
const {makeAngularHost} = require('./hosts/angular');

module.exports = {
  capturePipeline,
  groupByCell,
  computeParity,
  createRunDir,
  prepareCapture,
  runCurrentState,
  writeFailureManifest,
  VIEWPORT_WIDTHS,
  readLocalConfig,
  resolveRepository,
  assertCaptureReady,
  runDoctor,
  makeWcHost,
  makeReactHost,
  makeAngularHost,
};
