const path = require('node:path');

function assertSafePathSegment(value, label = 'segment') {
  const segment = String(value ?? '');
  if (
    segment.length === 0 ||
    segment === '.' ||
    segment === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(segment)
  ) {
    throw new Error(`${label}: segmento de caminho invalido: ${JSON.stringify(segment)}.`);
  }
  return segment;
}

function invalidRelativePath(value, label) {
  return new Error(`${label}: caminho relativo invalido: ${JSON.stringify(value)}.`);
}

function assertSafeRelativePath(value, label = 'path', {allowEmpty = false} = {}) {
  const relativePath = String(value ?? '');
  if (relativePath === '' && allowEmpty) return '';
  if (
    relativePath === '' ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    throw invalidRelativePath(relativePath, label);
  }

  const segments = relativePath.split('/');
  for (const segment of segments) {
    // Prefixos de artefato sao internos e nao precisam representar `%`.
    // Rejeitar o caractere elimina qualquer profundidade de percent encoding.
    if (segment.includes('%')) throw invalidRelativePath(relativePath, label);
    try {
      assertSafePathSegment(segment, label);
    } catch {
      throw invalidRelativePath(relativePath, label);
    }
  }
  return path.join(...segments);
}

function resolveContainedPath(rootDir, relativePath, label = 'path') {
  const safeRelativePath = assertSafeRelativePath(relativePath, label);
  // Trust boundary: rootDir e um diretorio novo e exclusivo criado pelo Anemoi.
  // A garantia aqui e containment lexical, nao defesa fisica contra symlink/TOCTOU.
  const root = path.resolve(rootDir);
  const target = path.resolve(root, safeRelativePath);
  const relativeToRoot = path.relative(root, target);
  if (
    relativeToRoot === '..' ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw invalidRelativePath(relativePath, label);
  }
  return target;
}

module.exports = {assertSafePathSegment, assertSafeRelativePath, resolveContainedPath};
