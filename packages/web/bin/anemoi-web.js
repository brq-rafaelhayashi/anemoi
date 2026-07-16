#!/usr/bin/env node
// Codigos de saida: 0 = ok; 1 = paridade divergente com --fail-on-diff; 2 = erro de execucao.
const {runCli} = require('../src/cli');
runCli(process.argv.slice(2)).catch(err => {
  console.error(err.message || err);
  process.exit(2);
});
