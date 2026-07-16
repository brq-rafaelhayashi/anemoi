'use strict';

const DARK_BACKGROUND = '#211E1C';
const ON_BRAND_BACKGROUND = 'var(--action-primary-background)';

function backgroundForCell(cell) {
  const args = cell.args || {};
  if (args.brand || args.onBrand) return ON_BRAND_BACKGROUND;
  return cell.theme === 'dark' ? DARK_BACKGROUND : '';
}

module.exports = {backgroundForCell, DARK_BACKGROUND, ON_BRAND_BACKGROUND};
