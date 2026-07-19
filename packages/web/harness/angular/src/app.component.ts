import {
  Component,
  OnInit,
  AfterViewInit,
  CUSTOM_ELEMENTS_SCHEMA,
  Type,
  EnvironmentInjector,
  inject,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { DIRECTIVES } from '@gol-smiles/tangerina-angular';
import {iconTag, parseSceneQuery} from '../../scene-query';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgComponentOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div id="evidence-root">
      @if (Cmp) {
        @if (context?.kind === 'form') {
          <form [id]="context!.id" (submit)="$event.preventDefault()">
            <ng-container *ngComponentOutlet="Cmp; inputs: args; environmentInjector: envInjector"></ng-container>
          </form>
        } @else {
          <ng-container *ngComponentOutlet="Cmp; inputs: args; environmentInjector: envInjector"></ng-container>
        }
      }
    </div>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  Cmp: Type<any> | null = null;
  args: Record<string, unknown> = {};
  // slots: texto ou referencia declarativa de icone; toda entrada usa <span>.
  slots: Record<string, string | { icon: string }> = {};
  context: {kind: 'form'; id: string} | null = null;
  component = '';
  envInjector = inject(EnvironmentInjector);

  ngOnInit() {
    const p = new URLSearchParams(location.search);
    const component = p.get('c')!;
    this.component = component;
    const brand = p.get('brand') || 'gol';
    const theme = p.get('theme') || 'light';
    const background = p.get('background') || '';
    const scene = parseSceneQuery(p);
    this.args = scene.args;
    this.slots = scene.slots;
    this.context = scene.context;

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
    // Projeta uma light DOM uniforme: <span> por slot, com texto ou custom element.
    if (!this.Cmp || Object.keys(this.slots).length === 0) return;
    const host = document.querySelector(`#evidence-root ${this.component}`) as HTMLElement | null;
    if (!host) return;
    host.replaceChildren();
    for (const [name, value] of Object.entries(this.slots)) {
      const slot = document.createElement('span');
      if (name) slot.setAttribute('slot', name);
      if (typeof value === 'string') slot.textContent = value;
      else {
        const icon = document.createElement(iconTag(value.icon));
        icon.setAttribute('aria-hidden', 'true');
        slot.appendChild(icon);
      }
      host.appendChild(slot);
    }
  }
}
