import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements } from '@gol-smiles/tangerina-web-core/dist/components';
import { AppComponent } from './app.component';

defineCustomElements();
bootstrapApplication(AppComponent).catch(err => console.error(err));
