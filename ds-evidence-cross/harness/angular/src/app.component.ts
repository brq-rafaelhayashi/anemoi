import {
  Component,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
  Type,
  EnvironmentInjector,
  inject,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { DIRECTIVES } from '@gol-smiles/tangerina-angular';

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
export class AppComponent implements OnInit {
  Cmp: Type<any> | null = null;
  args: Record<string, unknown> = {};
  envInjector = inject(EnvironmentInjector);

  ngOnInit() {
    const p = new URLSearchParams(location.search);
    const component = p.get('c')!;
    const brand = p.get('brand') || 'gol';
    const theme = p.get('theme') || 'light';
    this.args = JSON.parse(decodeURIComponent(p.get('args') || '%7B%7D'));

    const html = document.documentElement;
    brand !== 'gol'
      ? html.setAttribute('data-brand', brand)
      : html.removeAttribute('data-brand');
    theme === 'dark'
      ? html.setAttribute('data-theme', 'dark')
      : html.removeAttribute('data-theme');

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
}
