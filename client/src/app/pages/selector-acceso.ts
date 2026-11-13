import { Component, computed, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Component({
  selector: 'app-selector-acceso',
  template: `
    <div class="selector-acceso" (keydown)="tecla($event)" (focusout)="alSalir($event)">
      <span [id]="id() + '-etiqueta'">{{ etiqueta() }}</span>
      @if (buscable()) {
        <input class="selector-control selector-editable" type="search" autocomplete="off"
          [placeholder]="placeholder()" [value]="abierto() ? busqueda() : valor()"
          [attr.aria-labelledby]="id() + '-etiqueta'"
          [attr.aria-controls]="abierto() ? id() + '-opciones' : null"
          (click)="abrirBusqueda()" (input)="buscar($event)" />
      } @else {
      <button type="button" class="selector-control" [attr.aria-expanded]="abierto()"
        [attr.aria-labelledby]="id() + '-etiqueta ' + id() + '-valor'"
        [attr.aria-controls]="abierto() ? id() + '-opciones' : null" (click)="alternar()">
        <span [id]="id() + '-valor'" [class.selector-placeholder]="!valor()">{{ valor() || placeholder() }}</span>
        <span class="selector-flecha" aria-hidden="true"></span>
      </button>
      }
      @if (abierto()) {
        <div class="selector-menu" [id]="id() + '-opciones'">
          <div class="selector-opciones" role="group" [attr.aria-labelledby]="id() + '-etiqueta'">
            @for (opcion of filtradas(); track opcion) {
              <button type="button" [attr.aria-pressed]="valor() === opcion" (click)="elegir(opcion)">{{ opcion }}</button>
            } @empty {
              <p role="status">No hay materias que coincidan.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SelectorAcceso {
  readonly id = input.required<string>();
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly string[]>();
  readonly valor = input('');
  readonly placeholder = input('Selecciona');
  readonly buscable = input(false);
  readonly cambio = output<string>();
  readonly abierto = signal(false);
  readonly busqueda = signal('');
  readonly filtradas = computed(() => {
    const consulta = normalizar(this.busqueda().trim());
    return this.opciones().filter(opcion => normalizar(opcion).includes(consulta));
  });

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  alternar() {
    if (this.abierto()) {
      this.cerrar();
      return;
    }
    this.busqueda.set('');
    this.abierto.set(true);
    requestAnimationFrame(() => {
      if (this.abierto()) {
        this.host.querySelector<HTMLElement>(
          this.buscable() ? '.selector-editable' : '.selector-opciones button',
        )?.focus({ preventScroll: true });
        this.host.querySelector('.selector-menu')?.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  buscar(event: Event) {
    if (!this.abierto()) this.abierto.set(true);
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  abrirBusqueda() {
    if (!this.abierto()) this.alternar();
  }

  elegir(valor: string) {
    this.cambio.emit(valor);
    this.cerrar(true);
  }

  tecla(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      return;
    }
    if (!this.abierto()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.alternar();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cerrar(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const botones = Array.from(this.host.querySelectorAll<HTMLButtonElement>('.selector-opciones button'));
    const actual = botones.findIndex(boton => boton === event.target);
    if (event.key === 'ArrowUp' && actual === 0 && this.buscable()) {
      this.host.querySelector<HTMLInputElement>('.selector-editable')?.focus();
      return;
    }
    botones[Math.max(0, Math.min(botones.length - 1, actual + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }

  alSalir(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && !this.host.contains(event.relatedTarget)) this.cerrar();
  }

  @HostListener('document:pointerdown', ['$event'])
  fuera(event: PointerEvent) {
    if (event.target instanceof Node && !this.host.contains(event.target)) this.cerrar();
  }

  private cerrar(devolverFoco = false) {
    this.abierto.set(false);
    if (devolverFoco) this.host.querySelector<HTMLElement>('.selector-control')?.focus();
  }
}
