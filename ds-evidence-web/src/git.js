const childProcess = require('node:child_process');

const STASH_MESSAGE_PREFIX = 'ds-evidence-web:';

function run(repoPath, args) {
  const result = childProcess.spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} falhou (status ${result.status}): ${result.stderr || ''}`,
    );
  }
  return result.stdout;
}

// Garante que o working tree difere do HEAD (senao before/after seria identico).
function ensureWorkingTreeDiff(repoPath) {
  const status = run(repoPath, ['status', '--porcelain']);
  if (!status.trim()) {
    throw new Error(
      'Nenhuma mudanca no working tree — o modo before/after precisa de alteracoes nao commitadas para comparar.',
    );
  }
}

// Detecta stash residual de uma execucao anterior do motor.
function assertNoOrphanStash(repoPath) {
  const output = childProcess.spawnSync(
    'git',
    ['stash', 'list', '--format=%gd%x09%s'],
    {cwd: repoPath, encoding: 'utf8'},
  );
  const orphan = (output.stdout || '')
    .split('\n')
    .find(line => line.includes(STASH_MESSAGE_PREFIX));
  if (orphan) {
    throw new Error(
      `Encontrado um stash residual do ds-evidence-web em ${repoPath}: ${orphan}. Recupere-o (git stash pop) antes de rodar de novo.`,
    );
  }
}

// Empilha o working tree (after) e deixa o HEAD (before) na arvore.
function pushStash(repoPath, card, component) {
  const message = `${STASH_MESSAGE_PREFIX}${card}:${component}`;
  run(repoPath, ['stash', 'push', '-u', '-m', message]);
  return {repoPath, ref: 'stash@{0}', message};
}

// Restaura o working tree (after).
function popStash(stash) {
  if (!stash) return;
  run(stash.repoPath, ['stash', 'pop', stash.ref]);
}

module.exports = {
  STASH_MESSAGE_PREFIX,
  ensureWorkingTreeDiff,
  assertNoOrphanStash,
  pushStash,
  popStash,
};
