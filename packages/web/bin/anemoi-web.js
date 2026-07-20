#!/usr/bin/env node
// Codigos de saida: 0 = gate aprovado ou run diagnostico concluido;
// 1 = Gate de Confiabilidade reprovado; 2 = erro de execucao.
const {runCli} = require('../src/cli');
runCli(process.argv.slice(2)).catch(err => {
  console.error(err.message || err);
  process.exit(2);
});
