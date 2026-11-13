import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Marca } from './marca';

@Component({
  selector: 'app-estado-pagina',
  imports: [Marca, RouterLink],
  template: `
    <main class="estado-pagina" aria-labelledby="estado-titulo">
      <app-marca variante="contorno" />
      <section class="estado-contenido">
        <div class="estado-grafico" aria-hidden="true">
          <svg viewBox="0 0 112 84" fill="none">
            <rect x="10" y="13" width="76" height="57" rx="14" fill="#eaddfa" />
            <rect x="18" y="6" width="76" height="57" rx="14" fill="#faf8ff" stroke="#8b3dff" stroke-width="2" />
            <path d="M30 19h34m-34 11h47m-47 11h20" stroke="#bb6bff" stroke-width="3" stroke-linecap="round" />
            <circle cx="88" cy="60" r="19" fill="#2a0a4e" stroke="#faf8ff" stroke-width="3" />
            <path d="M88 51v10m0 7h.01" stroke="white" stroke-width="3" stroke-linecap="round" />
          </svg>
        </div>
        @if (codigo()) { <span class="estado-codigo">{{ codigo() }}</span> }
        <h1 id="estado-titulo">{{ titulo() }}</h1>
        <p>{{ mensaje() }}</p>
        <div class="estado-acciones">
          @if (accion()) {
            <button class="btn solid" type="button" (click)="actuar.emit()">{{ accion() }}</button>
          }
          @if (secundaria()) {
            <button class="btn line" type="button" (click)="volver.emit()">{{ secundaria() }}</button>
          }
          @if (mostrarAcceso()) {
            <a class="btn line" routerLink="/entrar" replaceUrl>Volver al acceso</a>
          }
        </div>
      </section>
    </main>
  `,
})
export class EstadoPagina {
  readonly codigo = input<number>();
  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();
  readonly accion = input('');
  readonly secundaria = input('');
  readonly mostrarAcceso = input(true);
  readonly actuar = output<void>();
  readonly volver = output<void>();
}

@Component({
  imports: [EstadoPagina],
  template: `<app-estado-pagina [codigo]="404" titulo="Página no encontrada"
    mensaje="Revisa la dirección o vuelve al acceso para ingresar tu código de examen." />`,
})
export class PaginaNoEncontrada {}
