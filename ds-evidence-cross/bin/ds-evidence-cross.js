#!/usr/bin/env node
const {runCli} = require('../src/cli');
runCli(process.argv.slice(2)).catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
