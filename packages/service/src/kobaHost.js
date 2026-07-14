'use strict';
// Host "koba-live" — aponta o captureCells do core para o dev server do Koba.
// Um unico host cobre react e angular: o seletor varia por celula
// (.koba-compare__pane--react / --angular), a pagina e a mesma (/compare).

const fs = require('node:fs');
const path = require('node:path');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');

// Espelha o serializeCompareState do Koba: ?state=<JSON>.
function serializeState(state) {
  const params = new URLSearchParams();
  params.set('state', JSON.stringify(state));
  return params.toString();
}

function urlFor(cell, baseUrl) {
  return `${baseUrl}/compare/${encodeURIComponent(cell.component)}?${serializeState(cell.state)}`;
}

function selectorFor(cell) {
  return `.koba-compare__pane--${cell.framework}`;
}

function makeKobaHost({verifyTimeoutMs = 15000} = {}) {
  // Espera o pane conter um custom element tgr-* ja definido (hidratado).
  // Em falha, grava um screenshot full-page como diagnostico no bundle e relanca.
  async function verify(page, cell) {
    try {
      await page.waitForFunction((selector) => {
        const pane = document.querySelector(selector);
        if (!pane) return false;
        const element = [...pane.querySelectorAll('*')]
          .find(node => node.tagName.toLowerCase().startsWith('tgr-'));
        return Boolean(element && customElements.get(element.tagName.toLowerCase()));
      }, selectorFor(cell), {timeout: verifyTimeoutMs});
    } catch (error) {
      if (cell.diagnosticsDir) {
        fs.mkdirSync(cell.diagnosticsDir, {recursive: true});
        const shotPath = path.join(cell.diagnosticsDir, `verify-${cell.framework}-${cell.viewport}-${cell.theme}.png`);
        await page.screenshot({path: shotPath, fullPage: true}).catch(() => {});
      }
      throw new Error(
        `Pane "${selectorFor(cell)}" nao renderizou um tgr-* hidratado em ${verifyTimeoutMs}ms `
        + `para ${cell.component}. O Koba esta com o DS buildado? (${error.message})`,
      );
    }
  }

  return {framework: 'koba-live', viewportWidths: VIEWPORT_WIDTHS, urlFor, selectorFor, verify};
}

module.exports = {makeKobaHost};
