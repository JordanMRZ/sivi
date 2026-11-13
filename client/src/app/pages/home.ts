import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Marca } from '../marca';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Marca],
  template: `
    <section class="portada">
      <div class="portada-contenido">
        <p class="portada-marca"><app-marca /></p>
        <h1>Una pregunta, en voz.</h1>
        <div class="portada-acciones">
          <a class="btn solid" routerLink="/entrar">Entrar al examen</a>
          <a class="btn line" routerLink="/profesor">Panel del profesor</a>
        </div>
      </div>
    </section>
  `,
})
export class Home {}
