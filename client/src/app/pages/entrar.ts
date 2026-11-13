import { afterNextRender, Component, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, servicioNoDisponible } from '../api';
import { EstadoPagina } from '../estado-pagina';
import { Marca } from '../marca';
import { MATERIAS } from './materias';
import { SelectorAcceso } from './selector-acceso';

@Component({
  selector: 'app-entrar',
  imports: [Marca, SelectorAcceso, EstadoPagina],
  template: `
    @if (errorAcceso(); as problema) {
      <app-estado-pagina [codigo]="problema.temporal ? 503 : undefined"
        [titulo]="problema.temporal ? 'SiVI no está disponible por ahora' : 'No se pudo usar el código'"
        [mensaje]="problema.mensaje" [accion]="problema.temporal ? 'Reintentar' : 'Revisar el formulario'"
        [mostrarAcceso]="false" (actuar)="problema.temporal ? enviar() : volverAlFormulario()" />
    } @else {
    <form class="acceso" (submit)="enviar($event)">
      <p class="acceso-marca"><app-marca variante="contorno" /></p>
      <div class="acceso-centro">
      <p class="pista">Ingresa el código</p>
      <div class="digitos">
        @for (hueco of huecos; track hueco) {
          <input
            class="digito"
            maxlength="1"
            inputmode="text"
            autocomplete="one-time-code"
            [attr.aria-label]="'Dígito ' + (hueco + 1)"
            [value]="digitos()[hueco]"
            (input)="alDigito(hueco, $event)"
            (keydown)="tecla(hueco, $event)"
            (paste)="pegar($event)"
          />
        }
      </div>
      <div class="acceso-campos">
      <label class="nombre-bloque">
        <span>Escribe tu nombre completo</span>
        <input
          class="nombre-linea"
          autocomplete="name"
          required
          placeholder="Ej. Laura Pérez"
          [value]="nombre()"
          (input)="nombre.set(texto($event))"
        />
      </label>
      <label class="nombre-bloque">
        <span>Nombre del profesor</span>
        <input class="nombre-linea" name="profesor" required minlength="2" maxlength="100" placeholder="Ej. Andrés Ruiz"
          [value]="profesor()" (input)="profesor.set(texto($event))" />
      </label>
      <app-selector-acceso id="semestre" etiqueta="Semestre" placeholder="Selecciona el semestre" [opciones]="semestres"
        [valor]="semestre()" (cambio)="semestre.set($event)" />
      <app-selector-acceso id="materia" etiqueta="Materia" placeholder="Busca una materia" [opciones]="materias" [buscable]="true"
        [valor]="materia()" (cambio)="materia.set($event)" />
      </div>
      <div class="acceso-privacidad">
        <p>SiVI usa tus datos y la grabación de imagen y voz únicamente para realizar, revisar y calificar esta evaluación. La grabación deja de estar disponible en SiVI después de 20 días calendario.</p>
        <details>
          <summary>Tratamiento de datos personales</summary>
          <p>Se tratan tu nombre, el código de evaluación, el nombre del docente, el semestre, la materia y la grabación. La grabación está disponible para el docente encargado de la evaluación.</p>
          <p>Puedes consultar, actualizar o rectificar tus datos y solicitar su supresión o la revocatoria de la autorización cuando corresponda.</p>
        </details>
        <label class="acceso-autorizacion">
          <input type="checkbox" required [checked]="autorizado()" (change)="autorizar($event)" />
          <span>Autorizo el tratamiento de mis datos personales y la grabación de mi imagen y voz para esta evaluación.</span>
        </label>
      </div>
      </div>
      <div class="acceso-pie">
      @if (error()) {
        <p class="fallo">{{ error() }}</p>
      }
      <button class="empezar-prep" type="submit" [disabled]="enviando()" [attr.aria-busy]="enviando()">
        @if (enviando()) {
          <span class="entrada-indicador" aria-hidden="true"></span>
          <span role="status">Entrando…</span>
        } @else {
          Entrar
        }
      </button>
      </div>
    </form>
    }
  `,
})
export class Entrar implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly huecos = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly digitos = signal(['', '', '', '', '', '', '', '']);
  readonly nombre = signal('');
  readonly profesor = signal('');
  readonly semestre = signal('');
  readonly materia = signal('');
  readonly semestres = Array.from({ length: 10 }, (_, indice) => String(indice + 1));
  readonly materias = MATERIAS;
  readonly autorizado = signal(false);
  readonly error = signal('');
  readonly errorAcceso = signal<{ temporal: boolean; mensaje: string } | null>(null);
  readonly enviando = signal(false);

  constructor() {
    sessionStorage.removeItem('encuadro.intento');
    document.body.classList.add('fondo-blanco');
    afterNextRender(() => document.querySelector<HTMLInputElement>('.digito')?.focus());
  }

  ngOnDestroy() {
    document.body.classList.remove('fondo-blanco');
  }

  texto(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  autorizar(event: Event) {
    this.autorizado.set((event.target as HTMLInputElement).checked);
  }

  alDigito(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const char = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const copia = [...this.digitos()];
    copia[index] = char;
    this.digitos.set(copia);
    if (char && index < this.huecos.length - 1) this.enfocar(index + 1);
  }

  tecla(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !this.digitos()[index] && index > 0) {
      event.preventDefault();
      const copia = [...this.digitos()];
      copia[index - 1] = '';
      this.digitos.set(copia);
      this.enfocar(index - 1);
    }
  }

  pegar(event: ClipboardEvent) {
    event.preventDefault();
    const texto = (event.clipboardData?.getData('text') ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, this.huecos.length);
    const copia = this.huecos.map(() => '');
    for (let i = 0; i < texto.length; i += 1) copia[i] = texto[i] ?? '';
    this.digitos.set(copia);
    this.enfocar(Math.min(texto.length, this.huecos.length - 1));
  }

  volverAlFormulario() {
    this.errorAcceso.set(null);
    requestAnimationFrame(() => this.enfocar(0));
  }

  async enviar(event?: Event) {
    event?.preventDefault();
    if (this.enviando()) return;
    if (!this.autorizado()) {
      this.error.set('Autoriza el tratamiento de datos para continuar.');
      return;
    }
    const codigo = this.digitos().join('');
    if (codigo.length < this.huecos.length) {
      this.error.set('El código tiene 8 caracteres.');
      return;
    }
    if (!this.semestre() || !this.materia()) {
      this.error.set(!this.semestre() ? 'Selecciona el semestre.' : 'Selecciona la materia.');
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    this.errorAcceso.set(null);
    try {
      const data = await this.api.request<{ id: string }>('/api/intentos', {
        method: 'POST',
        body: {
          nombre: this.nombre(), codigo, profesor: this.profesor(),
          semestre: this.semestre(), materia: this.materia(),
          autorizacion: 'sivi-evaluacion-v1',
        },
      });
      sessionStorage.setItem('encuadro.intento', data.id);
      await this.router.navigateByUrl('/sala');
    } catch (error) {
      const temporal = servicioNoDisponible(error);
      this.errorAcceso.set({
        temporal,
        mensaje: temporal
          ? 'Revisa tu conexión e inténtalo de nuevo. Conservamos los datos que escribiste.'
          : error instanceof Error ? error.message : 'Revisa el código e inténtalo otra vez.',
      });
      this.enviando.set(false);
    }
  }

  private enfocar(index: number) {
    const caja = document.querySelectorAll<HTMLInputElement>('.digito')[index];
    caja?.focus();
    caja?.select();
  }
}
