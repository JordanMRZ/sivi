import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Marca } from '../marca';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Marca],
  template: `
    <section class="portada">
      <p class="portada-marca"><app-marca />SiVI</p>
      <h1>Una pregunta, en voz.</h1>
      <div class="portada-acciones">
        <a class="btn solid" routerLink="/profesor">Crear pregunta</a>
        <a class="btn line" routerLink="/entrar">Entrar a responder</a>
      </div>
    </section>
  `,
})
export class Home {}
