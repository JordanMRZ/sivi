import { afterNextRender, Component, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../api';
import { Marca } from '../marca';

@Component({
  selector: 'app-entrar',
  imports: [Marca],
  template: `
    <form class="acceso" (submit)="enviar($event)">
      <p class="acceso-marca"><app-marca />AVIA</p>
      <p class="pista">Ingresa el codigo</p>
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
      <label class="nombre-bloque">
        <span>Escribe tu nombre completo</span>
        <input
          class="nombre-linea"
          autocomplete="name"
          required
          placeholder="Tu nombre"
          [value]="nombre()"
          (input)="nombre.set(texto($event))"
        />
      </label>
      <p class="acceso-nota">Después se enciende la cámara y el micrófono.</p>
      @if (error()) {
        <p class="fallo">{{ error() }}</p>
      }
      <button class="empezar-prep" type="submit" [disabled]="enviando()">Entrar</button>
    </form>
  `,
})
export class Entrar implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly huecos = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly digitos = signal(['', '', '', '', '', '', '', '']);
  readonly nombre = signal('');
  readonly error = signal('');
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

  async enviar(event: Event) {
    event.preventDefault();
    const codigo = this.digitos().join('');
    if (codigo.length < this.huecos.length) {
      this.error.set('El código tiene 8 caracteres.');
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    try {
      const data = await this.api.request<{ id: string }>('/api/intentos', {
        method: 'POST',
        body: { nombre: this.nombre(), codigo },
      });
      sessionStorage.setItem('encuadro.intento', data.id);
      await this.router.navigateByUrl('/sala');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo entrar');
      this.enviando.set(false);
    }
  }

  private enfocar(index: number) {
    const caja = document.querySelectorAll<HTMLInputElement>('.digito')[index];
    caja?.focus();
    caja?.select();
  }
}
