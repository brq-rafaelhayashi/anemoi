const path = require('node:path');
const {parseArgs} = require('./args');
const {configureRepository, resolveRepository} = require('./config');
const {runCurrentState} = require('./run');

const ROOT = path.resolve(__dirname, '..', '..', '..');

async function runCli(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (args.configure) {
    configureRepository({
      rootDir: ROOT,
      cwd,
      alias: args.alias,
      repoPath: args.repo,
      makeDefault: Boolean(args.default),
    });
    console.log(`Repositorio "${args.alias}" configurado.`);
    return;
  }

  const repo = resolveRepository({rootDir: ROOT, cwd, repoArg: args.repo});
  await runCurrentState({...args, repo}, cwd);
}

module.exports = {runCli};
