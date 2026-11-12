import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Marca } from './marca';

@Component({
  selector: 'app-marco',
  imports: [RouterLink, Marca],
  template: `
    <div class="marco">
      <header class="barra">
        <a class="word" [routerLink]="inicio()"><app-marca />SiVI</a>
        <div class="top-actions">
          <ng-content select="[acciones]" />
        </div>
      </header>
      <main class="page">
        <ng-content />
      </main>
    </div>
  `,
})
export class Marco {
  inicio = input('/');
}
