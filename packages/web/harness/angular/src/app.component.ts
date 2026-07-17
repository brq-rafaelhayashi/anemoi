import {
  Component,
  OnInit,
  AfterViewInit,
  CUSTOM_ELEMENTS_SCHEMA,
  Type,
  EnvironmentInjector,
  inject,
  createComponent,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { DIRECTIVES } from '@gol-smiles/tangerina-angular';
import * as TgrIcons from '@gol-smiles/tangerina-assets-angular/icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgComponentOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div id="evidence-root">
      @if (Cmp) {
        <ng-container *ngComponentOutlet="Cmp; inputs: args; environmentInjector: envInjector"></ng-container>
      }
    </div>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  Cmp: Type<any> | null = null;
  args: Record<string, unknown> = {};
  // slots: mapa nome→HTML. Chave '' = default slot (HTML direto, sem <span slot>).
  slots: Record<string, string | { icon: string }> = {};
  component = '';
  envInjector = inject(EnvironmentInjector);

  ngOnInit() {
    const p = new URLSearchParams(location.search);
    const component = p.get('c')!;
    this.component = component;
    const brand = p.get('brand') || 'gol';
    const theme = p.get('theme') || 'light';
    const background = p.get('background') || '';
    this.args = JSON.parse(decodeURIComponent(p.get('args') || '%7B%7D'));
    this.slots = JSON.parse(decodeURIComponent(p.get('slots') || '%7B%7D'));

    const html = document.documentElement;
    brand !== 'gol'
      ? html.setAttribute('data-brand', brand)
      : html.removeAttribute('data-brand');
    theme === 'dark'
      ? html.setAttribute('data-theme', 'dark')
      : html.removeAttribute('data-theme');
    document.body.style.background = background;

    // Find component from DIRECTIVES by selector.
    // DIRECTIVES is [TgrButton, ...]; TgrButton.ɵcmp.selectors = [['tgr-button']]
    this.Cmp = (DIRECTIVES as Type<any>[]).find((dir: any) => {
      const meta = dir.ɵcmp;
      if (!meta?.selectors) return false;
      return (meta.selectors as string[][]).some((s: string[]) => s[0] === component);
    }) ?? null;

    if (!this.Cmp) {
      const available = (DIRECTIVES as any[])
        .map(d => d.ɵcmp?.selectors?.[0]?.[0] ?? '?')
        .join(', ');
      document.getElementById('evidence-root')!.textContent =
        `Componente Angular nao encontrado: ${component}. Disponíveis: ${available}`;
    }
  }

  ngAfterViewInit() {
    // Projeta os slots na light DOM do custom element ja renderizado pelo outlet.
    // string = HTML bruto (comportamento original); {icon} = standalone component
    // dos assets-angular localizado pelo seletor tgr-icon-<nome>.
    if (!this.Cmp || Object.keys(this.slots).length === 0) return;
    const host = document.querySelector(`#evidence-root ${this.component}`) as HTMLElement | null;
    if (!host) return;
    host.innerHTML = '';
    for (const [name, value] of Object.entries(this.slots)) {
      if (value !== null && typeof value === 'object') {
        const selector = `tgr-icon-${value.icon}`;
        const IconCls = (Object.values(TgrIcons) as Type<any>[]).find((cls: any) => {
          const meta = cls?.ɵcmp;
          if (!meta?.selectors) return false;
          return (meta.selectors as string[][]).some((s: string[]) => s[0] === selector);
        });
        if (!IconCls) {
          host.insertAdjacentHTML(
            'beforeend',
            `<span${name ? ` slot="${name}"` : ''}>Ícone não encontrado: ${value.icon}</span>`
          );
          continue;
        }
        const el = document.createElement(selector);
        if (name) el.setAttribute('slot', name);
        host.appendChild(el);
        const ref = createComponent(IconCls, {
          environmentInjector: this.envInjector,
          hostElement: el,
        });
        ref.changeDetectorRef.detectChanges();
      } else {
        host.insertAdjacentHTML(
          'beforeend',
          name ? `<span slot="${name}">${value ?? ''}</span>` : String(value ?? '')
        );
      }
    }
  }
}
