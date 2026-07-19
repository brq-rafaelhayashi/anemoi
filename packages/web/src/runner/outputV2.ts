type Dimension = {
  status: string;
  failed: number;
  unavailable: number;
};

type ManifestV2 = {
  tool: string;
  status: string;
  card: string;
  component: string;
  cellCount: number;
  axes: {browsers: string[]};
  gate: {
    status?: string;
    trusted: boolean;
    dimensions: Record<string, Dimension>;
  };
  groups?: Array<Record<string, unknown>>;
  behavior?: {
    results?: Array<{
      logicalTestId: string;
      stability: string;
      routes: Array<{
        routeId: string;
        parity: string;
        frameworks?: Record<string, {conformance?: string}>;
      }>;
    }>;
  };
  attempts?: Array<{
    logicalTestId?: string;
    stability: string;
    attempts?: Array<{
      attempt: number;
      status: string;
      resultPath: string;
      attachments?: string[];
    }>;
  }>;
};

const FRAMEWORKS = ['wc', 'react', 'angular'];

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] as string);
}

function escapeMarkdownInline(value: unknown) {
  return escapeHtml(String(value ?? '').replace(/\s+/g, ' ').trim())
    .replace(/[\\`*_\[\]()]/g, character => `\\${character}`);
}

function safeRelativeHref(value: unknown) {
  if (typeof value !== 'string'
    || !value
    || /[\\%?#\u0000-\u001f\u007f]/.test(value)
    || value.startsWith('/')
    || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return segments.map(segment => encodeURIComponent(segment)).join('/');
}

function expectedResultHref(logicalTestId: unknown, attempt: unknown) {
  const id = safeRelativeHref(logicalTestId);
  if (!id || id.includes('/') || !Number.isSafeInteger(attempt) || (attempt as number) < 0) return null;
  return `results/${id}/attempt-${attempt}/result.json`;
}

function scopedAttachmentHref(resultHref: string | null, attachment: unknown) {
  const attachmentHref = safeRelativeHref(attachment);
  if (!resultHref || !attachmentHref) return null;
  const attemptDirectory = resultHref.split('/').slice(0, -1).join('/');
  return attachmentHref.startsWith(`${attemptDirectory}/`) ? attachmentHref : null;
}

function titleCase(value: string) {
  if (value.toLowerCase() === 'webkit') return 'WebKit';
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

export function renderSummaryV2(manifest: ManifestV2) {
  const dimensions = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `- ${escapeMarkdownInline(name)}: ${escapeMarkdownInline(value.status)} (falhas: ${escapeMarkdownInline(value.failed)}, indisponíveis: ${escapeMarkdownInline(value.unavailable)})`);
  const flaky = (manifest.attempts || []).filter(item => item.stability === 'flaky').length;
  return [
    `# ${escapeMarkdownInline(manifest.tool)} - ${escapeMarkdownInline(manifest.component)}`,
    '',
    `- Card: ${escapeMarkdownInline(manifest.card)}`,
    `- Status: ${escapeMarkdownInline(manifest.status)}`,
    `- Gate confiável: ${manifest.gate.trusted ? 'sim' : 'não'}`,
    `- Browsers: ${manifest.axes.browsers.map(titleCase).map(escapeMarkdownInline).join(', ')}`,
    `- Células capturadas: ${escapeMarkdownInline(manifest.cellCount)}`,
    `- Resultados flaky: ${escapeMarkdownInline(flaky)}`,
    '',
    '## Dimensões de confiança',
    '',
    ...dimensions,
    '',
    '## Artefatos',
    '',
    '- Manifest: manifest.json',
    '- Galeria: index.html',
    '',
  ].join('\n');
}

export function renderHtmlV2(manifest: ManifestV2) {
  const dimensionRows = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `<tr><td>${escapeHtml(name)}</td><td class="${escapeHtml(value.status)}">${escapeHtml(value.status)}</td><td>${escapeHtml(value.failed)}</td><td>${escapeHtml(value.unavailable)}</td></tr>`).join('');
  const visualRows = (manifest.groups || []).map(group => {
    const browser = group.browser || (group._cell as Record<string, unknown> | undefined)?.browser;
    const frameworkCells = FRAMEWORKS.map(framework => {
      const source = safeRelativeHref(group[framework]);
      return source
        ? `<td><img src="${escapeHtml(source)}" alt="${escapeHtml(framework)}" /></td>`
        : '<td>indisponível</td>';
    }).join('');
    return `<tr data-browser="${escapeHtml(browser)}"><td>${escapeHtml(browser)}</td><td>${escapeHtml(group.label)}</td>${frameworkCells}</tr>`;
  }).join('');
  const behaviorRows = (manifest.behavior?.results || []).flatMap(result =>
    result.routes.map(route => {
      const conformance = FRAMEWORKS.map(framework =>
        `<td>${escapeHtml(route.frameworks?.[framework]?.conformance || 'indisponível')}</td>`).join('');
      return `<tr><td>${escapeHtml(result.logicalTestId)}</td><td>${escapeHtml(result.stability)}</td><td>${escapeHtml(route.routeId)}</td><td>${escapeHtml(route.parity)}</td>${conformance}</tr>`;
    })).join('');
  const attemptRows = (manifest.attempts || []).flatMap(logical =>
    (logical.attempts || []).map(attempt => {
      const candidateResultHref = safeRelativeHref(attempt.resultPath);
      const expectedHref = expectedResultHref(logical.logicalTestId, attempt.attempt);
      const resultHref = candidateResultHref === expectedHref ? candidateResultHref : null;
      const attachments = (attempt.attachments || []).map(item => {
        const href = scopedAttachmentHref(resultHref, item);
        return href ? `<a href="${escapeHtml(href)}">${escapeHtml(item.split('/').at(-1))}</a>` : '';
      }).filter(Boolean).join(' ') || '—';
      const resultLink = resultHref
        ? `<a href="${escapeHtml(resultHref)}">result.json</a>`
        : 'indisponível';
      return `<tr><td>${escapeHtml(logical.logicalTestId)}</td><td>${escapeHtml(logical.stability)}</td><td>${escapeHtml(attempt.attempt)}</td><td>${escapeHtml(attempt.status)}</td><td>${resultLink}</td><td>${attachments}</td></tr>`;
    })).join('');
  const browserButtons = manifest.axes.browsers.map(browser =>
    `<button type="button" data-filter="${escapeHtml(browser)}">${escapeHtml(browser)}</button>`).join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.component)} — confiança</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f7f9;color:#1d2433}table{border-collapse:collapse;width:100%;background:white;margin:16px 0}th,td{border:1px solid #d8dce3;padding:8px;text-align:left;vertical-align:top}img{max-width:240px}.passed{color:#167044}.failed,.unavailable{color:#b42318}.chips button{margin-right:8px}</style></head><body>
<h1>${escapeHtml(manifest.component)}</h1><p>Gate: <strong>${escapeHtml(manifest.gate.status)}</strong> · confiável: ${manifest.gate.trusted ? 'sim' : 'não'}</p>
<h2>Dimensões do gate</h2><table><thead><tr><th>Dimensão</th><th>Status</th><th>Falhas</th><th>Indisponíveis</th></tr></thead><tbody>${dimensionRows}</tbody></table>
<h2>Evidência visual por browser</h2><div class="chips">${browserButtons}<button type="button" data-filter="all">todos</button></div>
<table><thead><tr><th>Browser</th><th>Cena</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody id="visual">${visualRows}</tbody></table>
<h2>Comportamento</h2><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Roteiro</th><th>Paridade</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody>${behaviorRows}</tbody></table>
<h2>Tentativas e diagnósticos</h2><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Tentativa</th><th>Status</th><th>Resultado</th><th>Attachments</th></tr></thead><tbody>${attemptRows}</tbody></table>
<script>document.querySelector('.chips').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;document.querySelectorAll('#visual tr').forEach(row=>row.hidden=button.dataset.filter!=='all'&&row.dataset.browser!==button.dataset.filter);});</script>
</body></html>`;
}
