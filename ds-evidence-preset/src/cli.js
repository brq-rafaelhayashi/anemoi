const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');

const DEFAULT_PLATFORMS = ['ios'];
const STASH_MESSAGE_PREFIX = 'ds-evidence-preset:';
const FLOW_CATEGORIES = {
  appScreen: 'Telas do app',
  testState: 'Estados de teste',
};

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

function slug(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function repoRootFromConfigPath(configPath) {
  return path.dirname(configPath);
}

function resolveConfigPath(args, cwd) {
  return path.resolve(cwd, args.config || 'ds-evidence.config.js');
}

function loadConfig(args, cwd) {
  const configPath = resolveConfigPath(args, cwd);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `DS Evidence config not found at ${configPath}. Run with --config or create ds-evidence.config.js.`,
    );
  }

  const config = require(configPath);
  return {
    ...config,
    configPath,
    repoRoot: config.repoRoot
      ? path.resolve(repoRootFromConfigPath(configPath), config.repoRoot)
      : repoRootFromConfigPath(configPath),
  };
}

function resolveHostPath(config, value) {
  return path.resolve(config.repoRoot, value);
}

function loadRegistry(config) {
  const registryPath = resolveHostPath(config, config.registryPath);
  return {
    registry: readJson(registryPath),
    registryPath,
  };
}

function basename(value) {
  return path.basename(String(value || '').replace(/:\d+$/, ''));
}

function flowLabel(item) {
  if (item.label) {
    return item.label;
  }

  const flow = Array.isArray(item.flow)
    ? item.flow.join(' > ')
    : item.flow || item.screen || 'Estado de teste';
  const file = basename(item.screenPath || item.path || 'DsEvidenceScreen.js');
  return `${flow} - ${file}`;
}

function normalizeReference(item) {
  return {
    label: item.label || flowLabel(item),
    screen: item.screen,
    screenPath: item.screenPath || item.path,
    component: item.component,
    flow: item.flow,
    notes: item.notes,
  };
}

function normalizeFlow(item, index) {
  const flowId = item.flowId || item.scenarioId;
  const hasProductFlow = Array.isArray(item.flow) && item.flow.length > 0;

  return {
    ...item,
    flowId,
    scenarioId: flowId,
    category: item.category || (hasProductFlow ? 'appScreen' : 'testState'),
    label: flowLabel(item),
    targetTestID: item.targetTestID || `ds-evidence-flow-${flowId || index}`,
  };
}

function flowsForEntry(entry) {
  return (entry.flows || entry.harness || []).map(normalizeFlow);
}

function referencesForEntry(entry) {
  return (entry.references || entry.realScreens || []).map(normalizeReference);
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function formatReferences(references) {
  if (!references.length) {
    return '';
  }

  return [
    'Referencias sem fluxo renderizavel:',
    ...references.map(item => {
      const lines = [`- ${item.label}`];
      if (item.screenPath) lines.push(`  ${item.screenPath}`);
      if (item.notes) lines.push(`  ${item.notes}`);
      return lines.join('\n');
    }),
  ].join('\n');
}

function groupedFlowLines(flows) {
  const lines = [];
  let index = 1;

  for (const [category, title] of Object.entries(FLOW_CATEGORIES)) {
    const categoryFlows = flows.filter(item => item.category === category);
    if (!categoryFlows.length) {
      continue;
    }

    lines.push(`${title}:`);
    for (const flow of categoryFlows) {
      lines.push(`${index}. ${flow.flowId}`);
      lines.push(`   ${flow.label}`);
      index += 1;
    }
    lines.push('');
  }

  const uncategorized = flows.filter(item => !FLOW_CATEGORIES[item.category]);
  if (uncategorized.length) {
    lines.push('Fluxos com categoria invalida:');
    for (const flow of uncategorized) {
      lines.push(`${index}. ${flow.flowId}`);
      lines.push(`   ${flow.label} (category: ${flow.category || 'missing'})`);
      index += 1;
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function formatFlowList(flows, references = []) {
  return [groupedFlowLines(flows), formatReferences(references)]
    .filter(Boolean)
    .join('\n\n');
}

function levenshtein(a, b) {
  const previous = Array.from({length: b.length + 1}, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let last = i - 1;
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] =
        a[i - 1] === b[j - 1]
          ? last
          : Math.min(last, previous[j - 1], previous[j]) + 1;
      last = old;
    }
  }

  return previous[b.length];
}

function closestFlowId(value, flows) {
  if (!flows.length) {
    return undefined;
  }

  return flows
    .map(flow => ({
      flowId: flow.flowId,
      distance: levenshtein(value, flow.flowId),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function normalizePlatforms(value) {
  if (!value) {
    return DEFAULT_PLATFORMS;
  }

  const normalized = String(value)
    .split(',')
    .flatMap(item => (item.trim() === 'both' ? ['ios', 'android'] : item))
    .map(item => String(item).trim())
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  const invalid = unique.filter(item => !['ios', 'android'].includes(item));

  if (invalid.length > 0) {
    throw new Error(`Unsupported platform: ${invalid.join(', ')}.`);
  }

  return unique.length ? unique : DEFAULT_PLATFORMS;
}

function flowMeta(entry, flows) {
  return flowsForEntry(entry).filter(item => flows.includes(item.flowId));
}

function collectInputs(args, config) {
  const {registry, registryPath} = loadRegistry(config);
  const analysis = args.analysis ? readJson(path.resolve(args.analysis)) : {};
  const component = args.component || analysis.component;
  const card = args.card || analysis.card || 'NO-CARD';

  if (!component) {
    throw new Error('Missing --component or analysis.component.');
  }

  const entry = registry[component];
  if (!entry) {
    throw new Error(
      `Component ${component} is not registered in ${registryPath}.`,
    );
  }

  if (args.scenarios && !args.flows) {
    console.warn('--scenarios is deprecated. Use --flows.');
  }

  const availableFlows = flowsForEntry(entry);
  const references = referencesForEntry(entry);
  const requestedFlows = args.flows || args.scenarios;
  const flows = requestedFlows ? splitList(requestedFlows) : [];
  const knownFlows = new Set(availableFlows.map(item => item.flowId));
  const unknownFlows = flows.filter(item => !knownFlows.has(item));

  if (unknownFlows.length > 0) {
    const suggestions = unknownFlows
      .map(item => {
        const closest = closestFlowId(item, availableFlows);
        return closest && closest.distance <= 4
          ? `\nDid you mean "${closest.flowId}" for "${item}"?`
          : '';
      })
      .filter(Boolean)
      .join('');

    throw new Error(
      `Unknown flow(s) for ${component}: ${unknownFlows.join(
        ', ',
      )}.${suggestions}\n\nAvailable flows:\n${formatFlowList(
        availableFlows,
        references,
      )}`,
    );
  }

  return {
    analysis,
    card,
    component,
    entry,
    availableFlows,
    platforms: normalizePlatforms(args.platform),
    flows,
    references,
  };
}

function parseFlowSelection(answer, flows) {
  const value = String(answer || '').trim();
  if (value.toLowerCase() === 'all') {
    return flows.map(item => item.flowId);
  }

  const indexes = splitList(value).map(item => Number(item) - 1);
  if (
    indexes.length > 0 &&
    indexes.every(index => Number.isInteger(index) && flows[index])
  ) {
    return indexes.map(index => flows[index].flowId);
  }

  return undefined;
}

async function chooseFlows(args, input) {
  if (input.flows.length > 0) {
    return input;
  }

  const flows = input.availableFlows;
  if (flows.length === 0) {
    throw new Error(`No flows registered for ${input.component}.`);
  }

  if (flows.length === 1) {
    return {...input, flows: [flows[0].flowId]};
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Multiple flows registered for ${
        input.component
      }. Pass --flows with one or more flow ids.\n\nAvailable flows:\n${formatFlowList(
        flows,
        input.references,
      )}`,
    );
  }

  console.log(`Choose which ${input.component} flows to render:`);
  console.log(formatFlowList(flows, input.references));
  console.log('');

  while (true) {
    const answer = await askQuestion(
      'Flow numbers separated by comma, or "all": ',
    );
    const selected = parseFlowSelection(answer, flows);

    if (selected) {
      return {...input, flows: selected};
    }

    console.log(
      `Invalid option. Choose numbers from 1 to ${flows.length}, or "all".`,
    );
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkMetro(port) {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${port}/status`, res => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => resolve(body.includes('packager-status:running')));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function assertMetroPortIsFree(port) {
  if (await checkMetro(port)) {
    throw new Error(
      `Metro is already running on port ${port}. Stop it or choose another port.`,
    );
  }
}

async function waitForMetro(port, metro) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await checkMetro(port)) {
      return;
    }
    if (metro && metro.exitCode !== null) {
      break;
    }
    await wait(1000);
  }

  const tail = metro?.metroLogTail?.();
  throw new Error(
    `Metro did not start on port ${port}.` +
      (tail ? `\nLast Metro output:\n${tail}` : ''),
  );
}

function startMetro(config, mode, port, options = {}) {
  const command = config.commands?.startMetro || 'npx';
  const commandArgs = config.commands?.startMetroArgs || [
    'react-native',
    'start',
    '--port',
    String(port),
  ];
  const child = childProcess.spawn(command, commandArgs, {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      RCT_METRO_PORT: String(port),
      TANGERINA_MODE: mode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logStream = null;
  if (options.logPath) {
    ensureDir(path.dirname(options.logPath));
    logStream = fs.createWriteStream(options.logPath, {flags: 'a'});
  }
  const echo = Boolean(options.verbose) || !logStream;
  const logTail = [];

  const handleChunk = (chunk, stream) => {
    logTail.push(...chunk.toString().split('\n').filter(Boolean));
    if (logTail.length > 200) {
      logTail.splice(0, logTail.length - 200);
    }
    if (logStream) {
      logStream.write(chunk);
    }
    if (echo) {
      stream.write(`[metro] ${chunk}`);
    }
  };

  child.stdout.on('data', chunk => handleChunk(chunk, process.stdout));
  child.stderr.on('data', chunk => handleChunk(chunk, process.stderr));
  child.on('close', () => {
    if (logStream) {
      logStream.end();
    }
  });

  if (logStream && !echo) {
    console.log(
      `[metro] port ${port}, mode ${mode} — logging to ${options.logPath} (use --verbose to echo)`,
    );
  }

  child.metroLogTail = () => logTail.slice(-60).join('\n');

  return child;
}

function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');
}

function runCommand(command, args, options = {}) {
  const proc = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    encoding: options.encoding,
    stdio: options.stdio || 'inherit',
  });

  if (proc.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with ${proc.status}.`);
  }

  return proc.stdout || '';
}

function detoxConfiguration(platform) {
  if (platform === 'ios') {
    return 'ds.ios.debug';
  }

  if (platform === 'android') {
    return 'ds.android.debug';
  }

  throw new Error(`Unsupported platform: ${platform}. Use ios or android.`);
}

function relative(config, filePath) {
  return path.relative(config.repoRoot, filePath).replaceAll(path.sep, '/');
}

function imageFigure(runDir, imagePath, caption, alt) {
  const relativePath = path
    .relative(runDir, imagePath)
    .replaceAll(path.sep, '/');

  return `
    <figure>
      <figcaption>${escapeHtml(caption)}</figcaption>
      <img src="${escapeHtml(relativePath)}" alt="${escapeHtml(
        alt,
      )}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="missing-image">Imagem ainda nao gerada pelo Detox<br /><code>${escapeHtml(
        relativePath,
      )}</code></div>
    </figure>
  `;
}

function writeManifest(runDir, data) {
  const manifestPath = path.join(runDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n');
  return manifestPath;
}

function writeSummary(config, runDir, data) {
  const namedHtml = `${slug(data.card)}-${slug(data.component)}.html`;
  const namedHtmls =
    data.htmlOutput === 'per-flow'
      ? data.flows.map(
          flow =>
            `${slug(data.card)}-${slug(data.component)}-${slug(
              flow.flowId,
            )}.html`,
        )
      : [namedHtml];
  const cropFallbacks = (data.captures || []).filter(
    item => !item.cropped && !/overlay/.test(item.cropReason || ''),
  );
  const lines = [
    `# DS Evidence - ${data.component}`,
    '',
    `- Card: ${data.card}`,
    `- Generated at: ${data.generatedAt}`,
    `- Platforms: ${data.platforms.join(', ')}`,
    `- Flows: ${data.flows.map(item => item.flowId).join(', ')}`,
    `- References: ${data.references.length}`,
    `- Analysis usages: ${data.analysisUsageCount}`,
    ...(cropFallbacks.length
      ? [
          `- ⚠ Crop fallback (print é full screen, não recorte do componente): ${cropFallbacks
            .map(item => `${item.phase}/${item.platform}/${item.flowId}`)
            .join(', ')}`,
        ]
      : []),
    '',
    '## Outputs',
    '',
    `- Manifest: ${relative(config, path.join(runDir, 'manifest.json'))}`,
    data.html
      ? `- HTML: ${relative(config, path.join(runDir, 'index.html'))}`
      : '- HTML: not generated; rerun with --html or --html-only <runDir>.',
    data.html
      ? `- Named HTML: ${namedHtmls
          .map(file => relative(config, path.join(runDir, file)))
          .join(', ')}`
      : '',
    '',
    '## References',
    '',
    data.references.length
      ? 'Usage references are registered for QA/dev guidance.'
      : `No usage reference is registered yet. Add references to ${data.registryPath}.`,
  ].filter(Boolean);

  fs.writeFileSync(path.join(runDir, 'summary.md'), `${lines.join('\n')}\n`);
}

function flowDiagram(flow, componentLabel) {
  if (!Array.isArray(flow.flow) || flow.flow.length === 0) {
    return '';
  }

  const steps = flow.flow
    .map(step => `<span class="step">${escapeHtml(step)}</span>`)
    .join('<span class="arrow">&rarr;</span>');
  const screenPath = flow.screenPath
    ? `<small>Tela: <code>${escapeHtml(flow.screenPath)}</code></small>`
    : '';

  return `
        <div class="flow">
          <h3>Fluxo ate o componente</h3>
          <div class="flow-steps">
            ${steps}<span class="arrow">&rarr;</span><span class="step target">&#9679; ${escapeHtml(
              componentLabel,
            )}</span>
          </div>
          ${screenPath}
        </div>
  `;
}

function renderHtml(runDir, data, flows) {
  const sections = [];
  const references = data.references || [];
  const hasFlows = references.some(
    item => Array.isArray(item.flow) && item.flow.length > 0,
  );
  const flowMap = references.length
    ? `
      <section class="flow-map">
        <h3>${
          hasFlows
            ? 'Fluxos no app (QA) &mdash; onde encontrar o componente'
            : 'Referencias sem fluxo renderizavel'
        }</h3>
        <ul>${references
          .map(item => {
            const componentLabel = item.component || `Tgr${data.component}`;
            const steps =
              Array.isArray(item.flow) && item.flow.length > 0
                ? `<div class="flow-steps">${item.flow
                    .map(
                      step =>
                        `<span class="step">${escapeHtml(
                          step,
                        )}</span><span class="arrow">&rarr;</span>`,
                    )
                    .join(
                      '',
                    )}<span class="step target">&#9679; ${escapeHtml(
                    componentLabel,
                  )}</span></div>`
                : '';
            return `
            <li>
              <strong>${escapeHtml(item.label || item.screen)}</strong>
              ${steps}
              <span>${escapeHtml(item.screen || '')}</span>
              <code>${escapeHtml(item.screenPath || '')}</code>
              ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
            </li>
          `;
          })
          .join('\n')}</ul>
      </section>
      `
    : '';
  const columnCount = Math.min(Math.max(flows.length, 1), 3);

  for (const platform of data.platforms) {
    const columns = flows.map(flow => {
      const componentLabel = flow.component || `Tgr${data.component}`;
      const before = path.join(
        runDir,
        'before',
        platform,
        `${data.component}-${flow.flowId}.png`,
      );
      const after = path.join(
        runDir,
        'after',
        platform,
        `${data.component}-${flow.flowId}.png`,
      );
      const reference = path.join(
        runDir,
        'reference',
        platform,
        `${data.component}-${flow.flowId}.png`,
      );

      const imagesBlock = data.referenceMode
        ? `<div class="comparison single">
          ${imageFigure(runDir, reference, 'Referência visual (estado atual)', `${flow.flowId} referência`)}
        </div>`
        : `<div class="comparison">
          ${imageFigure(runDir, before, 'antes: Source baseline sem o fix', `${flow.flowId} antes`)}
          ${imageFigure(runDir, after, 'depois: Source atual com o fix', `${flow.flowId} depois`)}
        </div>`;

      return `
      <section class="component">
        <p class="eyebrow">${escapeHtml(
          FLOW_CATEGORIES[flow.category] || flow.category || 'Fluxo',
        )} &middot; ${escapeHtml(platform)}</p>
        <h2>${escapeHtml(componentLabel)}</h2>
        <h3 class="flow-title">${escapeHtml(flow.label)}</h3>
        ${flowDiagram(flow, componentLabel)}
        <p class="desc">${escapeHtml(flow.description || '')}</p>
        ${imagesBlock}
      </section>
      `;
    });

    sections.push(
      `${
        data.platforms.length > 1
          ? `<h2 class="platform">${escapeHtml(platform)}</h2>`
          : ''
      }\n<div class="columns">${columns.join('\n')}</div>`,
    );
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DS Evidence - ${escapeHtml(data.component)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { background: #eef1f5; color: #17202a; font-family: Arial, sans-serif; margin: 0; }
    header { background: #17202a; color: #fff; padding: 24px; }
    header h1 { font-size: 28px; line-height: 1.2; margin: 0 0 8px; }
    header p { color: #d7dde5; margin: 0; }
    main { margin: 0 auto; max-width: 1760px; padding: 20px 24px 28px; }
    .intro { color: #4f5d6b; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
    .platform { font-size: 20px; margin: 24px 0 12px; }
    .columns { display: grid; gap: 20px; grid-template-columns: repeat(${columnCount}, minmax(0, 1fr)); }
    .component, .flow-map { background: #fff; border: 1px solid #cfd7e3; border-radius: 8px; padding: 18px; }
    .component { display: flex; flex-direction: column; gap: 14px; }
    .component h2 { font-size: 20px; margin: 0; }
    .flow-title { font-size: 16px; line-height: 1.3; margin: 0; }
    .eyebrow { color: #8a4b00; font-size: 12px; font-weight: 700; letter-spacing: .02em; margin: 0; text-transform: uppercase; }
    .flow { border: 1px solid #dfe5ec; border-radius: 6px; background: #f8fafc; padding: 12px; }
    .flow h3 { color: #596775; font-size: 12px; font-weight: 700; letter-spacing: .02em; margin: 0 0 10px; text-transform: uppercase; }
    .flow-steps { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .step { background: #fff; border: 1px solid #aeb9c6; border-radius: 5px; color: #24313f; font-size: 12.5px; line-height: 1.3; padding: 5px 9px; white-space: nowrap; }
    .step.target { background: #fff3e8; border-color: #d96c00; color: #8a4b00; font-weight: 700; }
    .arrow { color: #8a96a5; font-size: 14px; }
    .flow small { color: #596775; display: block; font-size: 11.5px; line-height: 1.4; margin-top: 10px; }
    .flow-map { margin: 0 0 20px; }
    .flow-map h3 { font-size: 18px; margin: 0 0 12px; }
    .flow-map ul { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); list-style: none; margin: 0; padding: 0; }
    .flow-map li { border: 1px solid #dfe5ec; border-radius: 6px; display: grid; gap: 6px; padding: 12px; }
    .flow-map strong { color: #17202a; font-size: 14px; line-height: 1.3; }
    .flow-map span, .flow-map small, .desc { color: #596775; font-size: 13px; line-height: 1.4; }
    .desc { margin: 0; }
    .comparison { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-top: auto; }
    .comparison.single { grid-template-columns: 1fr; max-width: 320px; }
    figure { margin: 0; }
    figcaption { color: #4f5d6b; font-size: 12px; line-height: 1.4; margin-bottom: 6px; }
    img { background: #f9fafb; border: 1px solid #dfe5ec; display: block; max-width: 100%; min-height: 160px; object-fit: contain; width: 100%; }
    .missing-image { align-items: center; background: #f8fafc; border: 1px dashed #aeb9c6; color: #596775; display: none; flex-direction: column; font-size: 14px; justify-content: center; line-height: 1.5; min-height: 160px; padding: 16px; text-align: center; width: 100%; }
    code { background: #edf1f6; border-radius: 4px; color: #24313f; overflow-wrap: anywhere; padding: 2px 4px; }
  </style>
</head>
<body>
  <header>
    <h1>DS Evidence - ${escapeHtml(data.component)}</h1>
    <p>${escapeHtml(data.card)} | ${escapeHtml(data.generatedAt)}</p>
  </header>
  <main>
    <p class="intro">Comparacao por componente, lado a lado: <code>antes</code> usa Source baseline sem o fix; <code>depois</code> usa Source atual com o fix. A captura e feita pela DS Evidence Gallery via Detox.</p>
    ${flowMap}
    ${sections.join('\n')}
  </main>
</body>
</html>
`;

  return html;
}

function assertHtmlOutput(value) {
  const output = value || 'single';
  if (!['single', 'per-flow'].includes(output)) {
    throw new Error('--html-output must be single or per-flow.');
  }

  return output;
}

function writeHtml(runDir, data) {
  const htmlOutput = assertHtmlOutput(data.htmlOutput);

  if (htmlOutput === 'per-flow') {
    const indexSections = [];
    for (const flow of data.flows) {
      const html = renderHtml(runDir, data, [flow]);
      const namedHtml = `${slug(data.card)}-${slug(data.component)}-${slug(
        flow.flowId,
      )}.html`;
      fs.writeFileSync(path.join(runDir, namedHtml), html);
      indexSections.push(
        `<li><a href="${escapeHtml(namedHtml)}">${escapeHtml(
          flow.label,
        )}</a></li>`,
      );
    }

    const indexHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DS Evidence - ${escapeHtml(data.component)}</title>
  <style>
    body { background: #eef1f5; color: #17202a; font-family: Arial, sans-serif; margin: 0; }
    header { background: #17202a; color: #fff; padding: 24px; }
    main { margin: 0 auto; max-width: 960px; padding: 24px; }
    li { background: #fff; border: 1px solid #cfd7e3; border-radius: 8px; margin: 0 0 12px; padding: 14px; }
    a { color: #17202a; font-weight: 700; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <h1>DS Evidence - ${escapeHtml(data.component)}</h1>
    <p>${escapeHtml(data.card)} | ${escapeHtml(data.generatedAt)}</p>
  </header>
  <main>
    <h2>HTML por fluxo</h2>
    <ul>${indexSections.join('\n')}</ul>
  </main>
</body>
</html>
`;
    fs.writeFileSync(path.join(runDir, 'index.html'), indexHtml);
    return;
  }

  const html = renderHtml(runDir, data, data.flows);
  fs.writeFileSync(path.join(runDir, 'index.html'), html);
  fs.writeFileSync(
    path.join(runDir, `${slug(data.card)}-${slug(data.component)}.html`),
    html,
  );
}

function assertHtmlImagesExist(runDir, data) {
  const missing = [];
  const phases = data.referenceMode ? ['reference'] : ['before', 'after'];

  for (const platform of data.platforms) {
    for (const flow of data.flows) {
      for (const phase of phases) {
        const imagePath = path.join(
          runDir,
          phase,
          platform,
          `${data.component}-${flow.flowId}.png`,
        );

        if (!fs.existsSync(imagePath)) {
          missing.push(path.relative(runDir, imagePath));
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `HTML requires real captured images. Missing:\n- ${missing.join('\n- ')}`,
    );
  }
}

function makeRunManifest(config, input, runDir, html, htmlOutput, referenceMode) {
  const {registryPath} = loadRegistry(config);

  return {
    card: input.card,
    component: input.component,
    generatedAt: new Date().toISOString(),
    platforms: input.platforms,
    flows: flowMeta(input.entry, input.flows),
    references: input.references,
    analysisUsageCount: input.analysis?.appUsages?.matches?.length || 0,
    registryPath: relative(config, registryPath),
    runDir,
    html,
    htmlOutput,
    referenceMode: referenceMode || false,
  };
}

function sourceRepoRoot(config) {
  const corePath = config.tangerina?.corePath;
  if (!corePath) {
    throw new Error('Missing tangerina.corePath in ds-evidence.config.js.');
  }

  const absoluteCore = resolveHostPath(config, corePath);
  return absoluteCore.endsWith('/src')
    ? path.dirname(absoluteCore)
    : absoluteCore;
}

function sourcePathsFor(input, config) {
  const sourcePaths =
    input.entry.sourcePaths ||
    config.sourcePathsByComponent?.[input.component] ||
    config.defaultSourcePaths?.(input.component);

  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error(
      `Missing sourcePaths for ${input.component}. Declare it in the registry or ds-evidence.config.js.`,
    );
  }

  return sourcePaths;
}

function ensureSourceDiff(input, config, sourcePaths) {
  const repoRoot = sourceRepoRoot(config);
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`Tangerina source repo not found at ${repoRoot}.`);
  }

  const result = childProcess.spawnSync(
    'git',
    ['diff', '--quiet', 'HEAD', '--', ...sourcePaths],
    {
      cwd: repoRoot,
      stdio: 'ignore',
    },
  );

  if (result.status === 0) {
    throw new Error(
      `No source diff found for ${input.component} in ${repoRoot}. Before/After source+stash would be identical.`,
    );
  }

  if (result.status !== 1) {
    throw new Error(`Could not inspect source diff for ${input.component}.`);
  }
}

function assertNoOrphanStash(config) {
  const repoRoot = sourceRepoRoot(config);
  const output = childProcess.spawnSync(
    'git',
    ['stash', 'list', '--format=%gd%x09%s'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (output.status !== 0) {
    throw new Error(`Could not inspect git stash in ${repoRoot}.`);
  }

  const orphan = output.stdout
    .split('\n')
    .find(line => line.includes(STASH_MESSAGE_PREFIX));

  if (orphan) {
    throw new Error(
      `Found a previous DS Evidence stash in ${repoRoot}: ${orphan}. Recover it before running again.`,
    );
  }
}

function pushSourceStash(input, config, sourcePaths) {
  const repoRoot = sourceRepoRoot(config);
  const message = `${STASH_MESSAGE_PREFIX}${input.card}:${
    input.component
  }:${Date.now()}`;

  runCommand(
    'git',
    ['stash', 'push', '-u', '-m', message, '--', ...sourcePaths],
    {
      cwd: repoRoot,
    },
  );

  return {repoRoot, ref: 'stash@{0}', message};
}

function popSourceStash(stash) {
  if (!stash) return;

  runCommand('git', ['stash', 'pop', stash.ref], {
    cwd: stash.repoRoot,
  });
}

function detoxCommandArgs(config, command, platform) {
  return [
    'detox',
    command,
    '--config-path',
    config.detoxConfigPath || 'detox/.detoxrc.js',
    '-c',
    detoxConfiguration(platform),
    ...(command === 'test'
      ? ['--record-logs', 'none', '--take-screenshots', 'failing']
      : []),
  ];
}

function detoxCommandEnv(config, env) {
  return {
    DS_EVIDENCE_REGISTRY_PATH: resolveHostPath(config, config.registryPath),
    DS_EVIDENCE_SCHEME: config.scheme,
    ...env,
  };
}

function detoxCommand(config, command, platform, env) {
  runCommand('yarn', detoxCommandArgs(config, command, platform), {
    cwd: config.repoRoot,
    env: detoxCommandEnv(config, env),
  });
}

function detoxCommandAsync(config, command, platform, env) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(
      'yarn',
      detoxCommandArgs(config, command, platform),
      {
        cwd: config.repoRoot,
        env: {
          ...process.env,
          ...detoxCommandEnv(config, env),
        },
        stdio: 'inherit',
      },
    );
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`yarn detox ${command} (${platform}) failed with ${code}.`),
        );
      }
    });
  });
}

async function runDetoxPhase(
  config,
  input,
  phase,
  port,
  outputDir,
  mode,
  options = {},
) {
  const tangerina_mode = mode || 'source';
  const sharedMetro = options.metro;
  let metro = sharedMetro;

  try {
    if (!sharedMetro) {
      await assertMetroPortIsFree(port);
      metro = startMetro(config, tangerina_mode, port, {
        logPath: path.join(outputDir, `metro-${tangerina_mode}-${phase}.log`),
        verbose: options.verbose,
      });
      await waitForMetro(port, metro);
    }

    for (const platform of input.platforms) {
      ensureDir(path.join(outputDir, phase, platform));

      detoxCommand(config, 'test', platform, {
        DS_EVIDENCE_COMPONENT: input.component,
        DS_EVIDENCE_FLOWS: input.flows.join(','),
        DS_EVIDENCE_SCENARIOS: input.flows.join(','),
        DS_EVIDENCE_OUTPUT_DIR: outputDir,
        DS_EVIDENCE_PHASE: phase,
        DS_EVIDENCE_PLATFORM: platform,
        TANGERINA_MODE: tangerina_mode,
        RCT_METRO_PORT: String(port),
      });
    }
  } finally {
    if (!sharedMetro) {
      stopProcess(metro);
      await wait(1000);
    }
  }
}

function collectCaptureMetadata(runDir) {
  const captures = [];

  for (const phase of ['before', 'after', 'reference']) {
    const phaseDir = path.join(runDir, phase);
    if (!fs.existsSync(phaseDir)) {
      continue;
    }

    for (const platform of fs.readdirSync(phaseDir)) {
      const platformDir = path.join(phaseDir, platform);
      if (!fs.statSync(platformDir).isDirectory()) {
        continue;
      }

      for (const file of fs.readdirSync(platformDir)) {
        if (!file.endsWith('.json')) {
          continue;
        }

        try {
          const meta = readJson(path.join(platformDir, file));
          captures.push({
            phase: meta.phase,
            platform: meta.platform,
            flowId: meta.flowId,
            cropped: meta.cropped === true,
            cropReason: meta.cropReason ?? null,
          });
        } catch (error) {
          console.warn(
            `[ds-evidence] unreadable capture metadata: ${path.join(platformDir, file)}`,
          );
        }
      }
    }
  }

  return captures;
}

function writeOutputs(config, runDir, manifest, html) {
  manifest.captures = collectCaptureMetadata(runDir);
  const manifestPath = writeManifest(runDir, manifest);
  if (html) {
    assertHtmlImagesExist(runDir, manifest);
    writeHtml(runDir, manifest);
  }
  writeSummary(config, runDir, manifest);
  return manifestPath;
}

async function runEvidence(args, config, input) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(
    config.repoRoot,
    config.outputDir || 'outputs/ds-evidence',
    slug(input.card),
    slug(input.component),
    timestamp,
  );
  const port = Number(args.port || config.metroPort || 8081);
  const skipBuild = Boolean(args['skip-build']);
  const dryRun = Boolean(args['dry-run']);
  const html = Boolean(args.html);
  const htmlOutput = assertHtmlOutput(args['html-output']);

  ensureDir(runDir);

  const manifest = makeRunManifest(config, input, runDir, html, htmlOutput);

  if (dryRun) {
    if (html) {
      throw new Error(
        '--dry-run cannot be combined with --html because HTML must contain real captured component images.',
      );
    }

    const manifestPath = writeOutputs(config, runDir, manifest, false);
    console.log(`DS evidence dry-run written to ${runDir}`);
    console.log(`Manifest: ${manifestPath}`);
    return;
  }

  const sourcePaths = sourcePathsFor(input, config);
  assertNoOrphanStash(config);
  ensureSourceDiff(input, config, sourcePaths);

  if (!skipBuild) {
    const buildEnv = platform => ({
      DS_EVIDENCE_PLATFORM: platform,
      TANGERINA_MODE: 'source',
      RCT_METRO_PORT: String(port),
    });

    if (args['parallel-builds'] && input.platforms.length > 1) {
      await Promise.all(
        input.platforms.map(platform =>
          detoxCommandAsync(config, 'build', platform, buildEnv(platform)),
        ),
      );
    } else {
      for (const platform of input.platforms) {
        detoxCommand(config, 'build', platform, buildEnv(platform));
      }
    }
  }

  let stash;
  let metro;
  try {
    await assertMetroPortIsFree(port);
    // Metro fica vivo entre as fases: o Detox relança o app a cada fase e o
    // watcher do Metro re-transforma os arquivos alterados pelo stash.
    metro = startMetro(config, 'source', port, {
      logPath: path.join(runDir, 'metro-source.log'),
      verbose: Boolean(args.verbose),
    });
    await waitForMetro(port, metro);

    await runDetoxPhase(config, input, 'after', port, runDir, 'source', {
      metro,
    });
    stash = pushSourceStash(input, config, sourcePaths);
    await runDetoxPhase(config, input, 'before', port, runDir, 'source', {
      metro,
    });
  } finally {
    if (stash) {
      popSourceStash(stash);
    }
    stopProcess(metro);
    await wait(1000);
  }

  const manifestPath = writeOutputs(config, runDir, manifest, html);
  console.log(`DS evidence written to ${runDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function runReference(args, config, input) {
  const mode = args.mode || 'package';
  if (!['package', 'source'].includes(mode)) {
    throw new Error('--reference requires --mode package|source.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(
    config.repoRoot,
    config.outputDir || 'outputs/ds-evidence',
    slug(input.card),
    slug(input.component),
    timestamp,
  );
  const port = Number(args.port || config.metroPort || 8081);
  const skipBuild = Boolean(args['skip-build']);
  const html = Boolean(args.html);
  const htmlOutput = assertHtmlOutput(args['html-output']);

  ensureDir(runDir);

  const manifest = makeRunManifest(config, input, runDir, html, htmlOutput, true);

  if (!skipBuild) {
    for (const platform of input.platforms) {
      detoxCommand(config, 'build', platform, {
        DS_EVIDENCE_PLATFORM: platform,
        TANGERINA_MODE: mode,
        RCT_METRO_PORT: String(port),
      });
    }
  }

  await runDetoxPhase(config, input, 'reference', port, runDir, mode, {
    verbose: Boolean(args.verbose),
  });

  const manifestPath = writeOutputs(config, runDir, manifest, html);
  console.log(`DS evidence reference written to ${runDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

function openUrlCommand(config, platform, url) {
  if (platform === 'ios') {
    return (
      config.commands?.openUrl?.ios || [
        'xcrun',
        ['simctl', 'openurl', 'booted', url],
      ]
    );
  }

  return (
    config.commands?.openUrl?.android || [
      'adb',
      [
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        url,
      ],
    ]
  );
}

function terminateAppCommand(config, platform) {
  const appId = config.appIds?.[platform];
  if (!appId) {
    return undefined;
  }

  if (platform === 'ios') {
    return ['xcrun', ['simctl', 'terminate', 'booted', appId]];
  }

  return ['adb', ['shell', 'am', 'force-stop', appId]];
}

function startDeviceCommand(config, platform) {
  return config.commands?.startDevice?.[platform];
}

function interactiveRunCommand(config, platform) {
  return config.commands?.interactiveRun?.[platform];
}

function relaunchAppBeforeDeepLink(config, platform) {
  const command = terminateAppCommand(config, platform);
  if (!command) {
    return;
  }

  runCommand(command[0], command[1], {
    cwd: config.repoRoot,
    allowFailure: true,
    stdio: 'ignore',
  });
}

async function openInteractiveUrl(config, platform, url) {
  const attempts = config.interactive?.openUrlAttempts || 3;
  const retryDelayMs = config.interactive?.openUrlRetryDelayMs || 2500;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const command = openUrlCommand(config, platform, url);
    runCommand(command[0], command[1], {cwd: config.repoRoot});

    if (attempt < attempts) {
      await wait(retryDelayMs);
    }
  }
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function askRequired(question, defaultValue) {
  while (true) {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await askQuestion(`${question}${suffix}: `)).trim();
    const value = answer || defaultValue;

    if (value) {
      return value;
    }

    console.log('Required value.');
  }
}

async function askCategory() {
  while (true) {
    console.log('Category:');
    console.log('1. Tela do app (appScreen)');
    console.log('2. Estado de teste (testState)');
    const answer = (await askQuestion('Choose 1 or 2: ')).trim();

    if (answer === '1' || answer === 'appScreen') {
      return 'appScreen';
    }

    if (answer === '2' || answer === 'testState') {
      return 'testState';
    }

    console.log('Invalid category. Use 1/appScreen or 2/testState.');
  }
}

function pascalCase(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(item => item.charAt(0).toUpperCase() + item.slice(1))
    .join('');
}

function flowStub(component, flow) {
  const functionName = `${pascalCase(component)}${pascalCase(flow.flowId)}Flow`;

  return `function ${functionName}() {
  return (
    <ScenarioFrame component="${component}" scenario="${flow.flowId}">
      <View testID="${flow.targetTestID}" style={styles.column}>
        {/* TODO: render ${
          flow.component || `Tgr${component}`
        } with the same props used by ${basename(
          flow.screenPath || 'the referenced screen',
        )}. */}
      </View>
    </ScenarioFrame>
  );
}`;
}

function writeRegistry(registryPath, registry) {
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
}

async function runAddFlow(args, config) {
  if (!process.stdin.isTTY) {
    throw new Error('--add-flow requires an interactive terminal.');
  }

  const component =
    typeof args['add-flow'] === 'string' ? args['add-flow'] : args.component;
  if (!component) {
    throw new Error('Missing component. Use --add-flow <Component>.');
  }

  const {registry, registryPath} = loadRegistry(config);
  const entry = registry[component] || {flows: [], references: []};
  const existingFlows = flowsForEntry(entry);

  console.log(`Adding flow for ${component}.`);
  const category = await askCategory();
  const flowId = await askRequired('Flow id');

  if (existingFlows.some(flow => flow.flowId === flowId)) {
    throw new Error(
      `${component}.${flowId} already exists in ${registryPath}.`,
    );
  }

  const defaultLabel =
    category === 'testState'
      ? `Estado de teste > ${flowId} - DsEvidenceScreen.js`
      : undefined;
  const label = await askRequired('Label', defaultLabel);
  const renderedComponent = await askRequired(
    'Rendered component',
    `Tgr${component}`,
  );
  const targetTestID = await askRequired(
    'Target testID',
    `ds-evidence-${slug(flowId)}`,
  );
  const screenPath = await askRequired(
    'Screen path',
    category === 'testState'
      ? 'src/Automation/DsEvidence/DsEvidenceScreen.js'
      : undefined,
  );
  const description = await askRequired('Description');
  const flowSteps =
    category === 'appScreen'
      ? splitList(
          await askQuestion('Flow steps separated by comma (optional): '),
        )
      : [];

  const flow = {
    flowId,
    category,
    label,
    targetTestID,
    component: renderedComponent,
    ...(flowSteps.length ? {flow: flowSteps} : {}),
    screenPath,
    description,
  };

  registry[component] = {
    ...entry,
    flows: [...existingFlows, flow],
    references: referencesForEntry(entry),
  };
  delete registry[component].harness;
  delete registry[component].realScreens;

  writeRegistry(registryPath, registry);

  console.log(
    `Added flow ${component}.${flowId} to ${relative(config, registryPath)}.`,
  );
  console.log(
    'Review and commit this registry change so other users can select it.',
  );
  console.log('');
  console.log(
    'Next: add this render flow to src/Automation/DsEvidence/DsEvidenceScreen.js',
  );
  console.log('');
  console.log(flowStub(component, flow));
  console.log('');
  console.log(`Then register it in the Gallery mapping for "${flowId}".`);
}

async function runInteractive(args, config, input) {
  const mode = args.mode;
  if (!mode || !['package', 'source'].includes(mode)) {
    throw new Error('--mode package|source is required with --interactive.');
  }

  if (input.platforms.length > 1) {
    throw new Error('--interactive supports one platform per run.');
  }

  const platform = input.platforms[0];
  const port = Number(args.port || config.metroPort || 8081);
  const scheme = config.scheme;

  if (!scheme) {
    throw new Error('Missing scheme in ds-evidence.config.js.');
  }

  if (args['start-device']) {
    const command = startDeviceCommand(config, platform);
    if (!command) {
      throw new Error(`No startDevice command configured for ${platform}.`);
    }
    runCommand(command[0], command[1] || [], {cwd: config.repoRoot});
  }

  let metro;
  try {
    await assertMetroPortIsFree(port);
    metro = startMetro(config, mode, port);
    await waitForMetro(port, metro);

    if (!args['skip-build']) {
      const command = interactiveRunCommand(config, platform);
      if (!command) {
        throw new Error(
          `No interactiveRun command configured for ${platform}.`,
        );
      }
      runCommand(command[0], command[1] || [], {
        cwd: config.repoRoot,
        env: {
          TANGERINA_MODE: mode,
          RCT_METRO_PORT: String(port),
        },
      });
    }

    const url = `${scheme.replace(/\/$/, '')}/automation/ds/${
      input.component
    }?flows=${encodeURIComponent(input.flows.join(','))}&t=${Date.now()}`;
    relaunchAppBeforeDeepLink(config, platform);
    await openInteractiveUrl(config, platform, url);
    console.log(`DS Evidence interactive route opened: ${url}`);
    console.log(
      'Metro is still running. Stop this process with Ctrl+C when done.',
    );

    await new Promise(resolve => {
      process.on('SIGINT', resolve);
      process.on('SIGTERM', resolve);
    });
  } finally {
    stopProcess(metro);
  }
}

function runHtmlOnly(args, config) {
  const runDir = path.resolve(config.repoRoot, args['html-only']);
  const manifestPath = path.join(runDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${runDir}.`);
  }

  const manifest = readJson(manifestPath);
  manifest.html = true;
  manifest.htmlOutput = assertHtmlOutput(
    args['html-output'] || manifest.htmlOutput,
  );
  assertHtmlImagesExist(runDir, manifest);
  writeHtml(runDir, manifest);
  writeManifest(runDir, manifest);
  writeSummary(config, runDir, manifest);
  console.log(`DS evidence HTML written to ${path.join(runDir, 'index.html')}`);
}

function doctorEnvironment(config, issues, warnings) {
  // corePath errado e falha SILENCIOSA em runtime: o Metro cai no fallback npm
  // e serve o app sem o source local — o doctor transforma isso em erro.
  const corePath = config.tangerina?.corePath;
  if (corePath) {
    const corePackageJson = path.join(corePath, 'package.json');
    if (!fs.existsSync(corePath)) {
      issues.push(`tangerina.corePath does not exist: ${corePath}.`);
    } else if (!fs.existsSync(corePackageJson)) {
      issues.push(`tangerina.corePath has no package.json: ${corePath}.`);
    } else {
      try {
        const name = readJson(corePackageJson).name;
        if (name !== '@gol-smiles/tangerina-react-native-core') {
          issues.push(
            `tangerina.corePath resolves to "${name}", expected @gol-smiles/tangerina-react-native-core: ${corePath}.`,
          );
        }
      } catch (error) {
        issues.push(`tangerina.corePath package.json is unreadable: ${error.message}.`);
      }
    }
  }
  for (const [key, metroPath] of Object.entries(
    config.tangerina?.metroPaths || {},
  )) {
    if (metroPath && !fs.existsSync(metroPath)) {
      issues.push(`tangerina.metroPaths.${key} does not exist: ${metroPath}.`);
    }
  }

  const iosDevice = config.devices?.ios;
  if (iosDevice && process.platform === 'darwin') {
    const sim = childProcess.spawnSync(
      'xcrun',
      ['simctl', 'list', 'devices', 'available'],
      {encoding: 'utf8'},
    );
    if (sim.status === 0 && !sim.stdout.includes(`${iosDevice} (`)) {
      warnings.push(
        `iOS simulator "${iosDevice}" not found in xcrun simctl list — Detox launch will fail.`,
      );
    }
  }
  const androidDevice = config.devices?.android;
  if (androidDevice) {
    const avds = childProcess.spawnSync('emulator', ['-list-avds'], {
      encoding: 'utf8',
    });
    if (avds.status === 0 && !avds.stdout.split('\n').includes(androidDevice)) {
      warnings.push(
        `Android AVD "${androidDevice}" not found in emulator -list-avds.`,
      );
    }
  }

  const port = config.metroPort || 8081;
  const lsof = childProcess.spawnSync(
    'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
    {encoding: 'utf8'},
  );
  if (lsof.status === 0 && lsof.stdout.trim()) {
    warnings.push(
      `Metro port ${port} is already in use — stop the listener or pass --port.`,
    );
  }

  try {
    const {createDetoxConfig} = require('./lib/detoxConfig');
    const detoxConfig = createDetoxConfig(config);
    for (const [appName, app] of Object.entries(detoxConfig.apps || {})) {
      if (app.binaryPath && !fs.existsSync(app.binaryPath)) {
        warnings.push(
          `Binary for ${appName} not built yet (${app.binaryPath}) — run without --skip-build first.`,
        );
      }
    }
  } catch (error) {
    warnings.push(`Could not derive Detox config: ${error.message}.`);
  }
}

function runDoctor(config) {
  const {registryPath, registry} = loadRegistry(config);
  const issues = [];
  const warnings = [];

  if (!config.scheme) issues.push('Missing scheme.');
  if (!fs.existsSync(registryPath))
    issues.push(`Registry not found: ${registryPath}.`);
  if (!config.commands?.interactiveRun?.ios) {
    issues.push('Missing commands.interactiveRun.ios.');
  }
  if (!config.tangerina?.corePath) {
    issues.push('Missing tangerina.corePath.');
  }

  doctorEnvironment(config, issues, warnings);

  const componentsWithoutSourcePaths = Object.entries(registry)
    .filter(([component, entry]) => {
      const paths =
        entry.sourcePaths ||
        config.sourcePathsByComponent?.[component] ||
        config.defaultSourcePaths?.(component);
      return !Array.isArray(paths) || paths.length === 0;
    })
    .map(([component]) => component);

  if (componentsWithoutSourcePaths.length > 0) {
    issues.push(
      `Missing sourcePaths for: ${componentsWithoutSourcePaths.join(', ')}.`,
    );
  }

  for (const [component, entry] of Object.entries(registry)) {
    const flows = flowsForEntry(entry);
    if (!flows.length) {
      issues.push(
        `No flows registered for ${component}. Add flows[] or legacy harness[].`,
      );
      continue;
    }

    for (const flow of flows) {
      const prefix = `${component}.${flow.flowId || '<missing flowId>'}`;
      if (!flow.flowId) {
        issues.push(`${prefix}: missing flowId.`);
      }
      if (!FLOW_CATEGORIES[flow.category]) {
        issues.push(
          `${prefix}: invalid category "${flow.category}". Use appScreen or testState.`,
        );
      }
      if (!flow.label) {
        issues.push(`${prefix}: missing label.`);
      }
      if (!flow.targetTestID) {
        issues.push(`${prefix}: missing targetTestID.`);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `DS Evidence doctor warnings:\n- ${warnings.join('\n- ')}`,
    );
  }

  if (issues.length > 0) {
    throw new Error(
      `DS Evidence doctor found issues:\n- ${issues.join('\n- ')}`,
    );
  }

  console.log(
    warnings.length > 0
      ? 'DS Evidence doctor passed (with warnings).'
      : 'DS Evidence doctor passed.',
  );
}

function runInit(cwd) {
  const configPath = path.resolve(cwd, 'ds-evidence.config.js');
  const registryDir = path.resolve(cwd, 'detox/ds-evidence');
  const registryPath = path.join(registryDir, 'registry.json');

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      `module.exports = {
  repoRoot: '.',
  scheme: 'app://',
  envFile: '.env.automation',
  detoxConfigPath: 'detox/.detoxrc.js',
  registryPath: 'detox/ds-evidence/registry.json',
  outputDir: 'outputs/ds-evidence',
  metroPort: 8081,
  devices: {
    ios: 'iPhone 16',
    android: 'Medium_Phone_API_36.1',
  },
  tangerina: {
    corePath: '../projects_tangerina/golsmiles-reactnative-tangerina-ds',
    metroPaths: {
      corePath: '../projects_tangerina/golsmiles-reactnative-tangerina-ds/src',
      assetsPath: '../projects_tangerina/golsmiles-reactnative-tangerina-ds-assets',
      tokensPath: '../projects_tangerina/golsmiles-nodejs-tangerina-ds-tokens',
    },
  },
  commands: {
    interactiveRun: {
      ios: ['yarn', ['ios:automation']],
      android: ['yarn', ['android:automation']],
    },
  },
  defaultSourcePaths: component => [\`src/components/\${component}\`],
};
`,
    );
  }

  ensureDir(registryDir);
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          ExampleComponent: {
            sourcePaths: ['src/components/ExampleComponent'],
            flows: [
              {
                flowId: 'default',
                category: 'testState',
                label: 'Estado de teste > Default - DsEvidenceScreen.js',
                targetTestID: 'ds-evidence-screen',
                description: 'Estado default do componente.',
              },
            ],
            references: [],
          },
        },
        null,
        2,
      ) + '\n',
    );
  }

  console.log('DS Evidence templates created.');
}

async function runCli(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);

  if (args.init) {
    runInit(cwd);
    return;
  }

  const config = loadConfig(args, cwd);

  if (args.doctor) {
    runDoctor(config);
    return;
  }

  if (args['html-only']) {
    runHtmlOnly(args, config);
    return;
  }

  if (args['add-flow']) {
    await runAddFlow(args, config);
    return;
  }

  const input = collectInputs(args, config);

  if (args['list-flows']) {
    console.log(formatFlowList(input.availableFlows, input.references));
    return;
  }

  const selectedInput = await chooseFlows(args, input);

  if (args.interactive) {
    await runInteractive(args, config, selectedInput);
    return;
  }

  if (args.reference) {
    await runReference(args, config, selectedInput);
    return;
  }

  await runEvidence(args, config, selectedInput);
}

module.exports = {
  runCli,
};
