#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const FRAMEWORKS = ['wc', 'react', 'angular'];

function groupKey(group) {
  if (typeof group.storyId !== 'string' || !group.storyId) {
    throw new Error('storyId canonico ausente no grupo.');
  }
  return [group.brand, group.storyId, group.viewport, group.theme].join('|');
}

function sortedEntries(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeViolations(violations = []) {
  return violations
    .map(violation => ({
      id: violation.id || null,
      impact: violation.impact || null,
      nodes: Array.isArray(violation.nodes) ? violation.nodes.length : null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function normalizeGroup(group) {
  const parity = sortedEntries((group.parity || []).map(item => [
    item.against,
    {mismatch: item.mismatch, sizeMatch: item.sizeMatch !== false},
  ]));
  const audits = group.a11y?.audits || {};
  const axe = sortedEntries(Object.entries(audits).map(([framework, audit]) => [
    framework,
    {
      unavailable: Boolean(audit.error),
      violations: normalizeViolations(audit.violations),
    },
  ]));
  const aria = sortedEntries((group.a11y?.ariaParity || []).map(item => [
    item.against,
    item.match,
  ]));
  return {
    captures: Object.fromEntries(FRAMEWORKS.map(framework => [framework, Boolean(group[framework])])),
    parity,
    axe,
    aria,
  };
}

function groupsByKey(manifest, browser, label) {
  if (!manifest || !Array.isArray(manifest.groups)) {
    throw new Error(`manifesto ${label} sem groups canonicos.`);
  }
  const groups = new Map();
  for (const group of manifest.groups) {
    const groupBrowser = group.browser || 'chromium';
    if (groupBrowser !== browser) continue;
    const key = groupKey(group);
    if (groups.has(key)) {
      throw new Error(`manifesto ${label} possui celula canonica duplicada: ${key}.`);
    }
    groups.set(key, normalizeGroup(group));
  }
  return groups;
}

function compareEngineManifests(legacy, current, {browser = 'chromium'} = {}) {
  const legacyGroups = groupsByKey(legacy, browser, 'legacy');
  const currentGroups = groupsByKey(current, browser, 'current');
  const keys = [...new Set([...legacyGroups.keys(), ...currentGroups.keys()])].sort();
  const differences = [];

  for (const cellKey of keys) {
    const before = legacyGroups.get(cellKey);
    const after = currentGroups.get(cellKey);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      differences.push({
        path: `groups.${cellKey}`,
        legacy: before,
        current: after,
      });
    }
  }

  return {
    match: differences.length === 0,
    comparedCells: keys.length,
    differences,
  };
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`argumento invalido: ${key}.`);
    }
    output[key.slice(2)] = value;
    index += 1;
  }
  return output;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.legacy || !args.current) {
    throw new Error('use --legacy <manifest> --current <manifest>.');
  }
  const result = compareEngineManifests(
    JSON.parse(fs.readFileSync(args.legacy, 'utf8')),
    JSON.parse(fs.readFileSync(args.current, 'utf8')),
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.match ? 0 : 1;
}

module.exports = {compareEngineManifests};
