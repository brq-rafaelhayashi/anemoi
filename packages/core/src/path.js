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

function assertNoEncodedTraversal(segment, value, label) {
  let decoded = segment;
  for (let i = 0; i < 4; i += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw invalidRelativePath(value, label);
    }
    if (
      next === '.' ||
      next === '..' ||
      /[\\/\u0000-\u001f\u007f]/.test(next)
    ) {
      throw invalidRelativePath(value, label);
    }
    if (next === decoded) return;
    decoded = next;
  }
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
  try {
    for (const segment of segments) {
      assertSafePathSegment(segment, label);
      assertNoEncodedTraversal(segment, relativePath, label);
    }
  } catch (error) {
    if (error.message.includes('caminho relativo invalido')) throw error;
    throw invalidRelativePath(relativePath, label);
  }
  return path.join(...segments);
}

function resolveContainedPath(rootDir, relativePath, label = 'path') {
  const safeRelativePath = assertSafeRelativePath(relativePath, label);
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
