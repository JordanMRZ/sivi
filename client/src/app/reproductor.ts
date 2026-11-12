import { Component, effect, ElementRef, HostListener, inject, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { Api } from './api';
import { fmt } from './texto';

@Component({
  selector: 'app-reproductor',
  template: `
    <div class="reproductor" tabindex="0" (keydown)="alTecla($event)">
      <video
        #medio
        playsinline
        [attr.src]="archivo()"
        preload="auto"
        (click)="alternar()"
        (loadedmetadata)="alMeta()"
        (durationchange)="alDuracion()"
        (timeupdate)="alTiempo()"
        (play)="playing.set(true)"
        (pause)="playing.set(false)"
        (ended)="playing.set(false)"
        (loadeddata)="alListo()"
        (canplay)="alListo()"
        (error)="alError()"
      ></video>
      @if (error()) {
        <div class="repro-carga">
          <p role="alert">{{ error() }}</p>
          <button type="button" class="repro-reintentar" (click)="reintentar()">
            {{ archivoLocal() ? 'Reintentar reproducción' : 'Reintentar descarga' }}
          </button>
        </div>
      } @else if (!listo()) {
        <div class="repro-carga" role="status">
          @if (archivo()) {
            <p>Preparando el video</p>
            <progress aria-label="Preparando el video"></progress>
          } @else {
            <p>Descargando grabación @if (progreso() !== null) { · {{ progreso() }}% }</p>
            <progress max="100" [attr.value]="progreso()" aria-label="Descargando grabación"></progress>
          }
        </div>
      }
      <div class="cine-arriba">
        <strong>{{ titulo() }}</strong>
        <button class="cine-x" type="button" (click)="cerrar.emit()" aria-label="Cerrar">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      @if (listo() && !playing()) {
        <button class="cine-centro" type="button" (click)="alternar()" aria-label="Reproducir">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.4v11.2L13.4 8z" /></svg>
        </button>
      }
      @if (listo()) {
      <div class="cine-abajo">
        <div class="repro-pista" (pointerdown)="buscar($event)">
          <span class="repro-lleno" [style.width.%]="porcentaje()"></span>
          <span class="repro-bolita" [style.left.%]="porcentaje()"></span>
        </div>
        <div class="cine-controles">
          <button class="repro-icono" type="button" (click)="alternar()" [attr.aria-label]="playing() ? 'Pausar' : 'Reproducir'">
            @if (playing()) {
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3.4v12H3zm6.6 0H13v12H9.6z" /></svg>
            } @else {
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.4v11.2L13.4 8z" /></svg>
            }
          </button>
          <span class="repro-tiempo">{{ reloj() }}</span>
          <div
            class="repro-volumen"
            #volumen
            (pointerenter)="mostrarVolumen()"
            (pointerleave)="ocultarVolumen()"
          >
            @if (volumenAbierto()) {
              <div class="repro-pop">
                <span class="repro-porcentaje">{{ nivel() }}%</span>
                <input
                  class="repro-nivel"
                  type="range"
                  min="0"
                  max="150"
                  [value]="nivel()"
                  (input)="alNivel($event)"
                  aria-label="Volumen"
                />
              </div>
            }
            <button class="repro-icono" type="button" (click)="alternarVolumen($event)" [attr.aria-label]="mudo() ? 'Subir volumen' : 'Volumen'">
              @if (nivel() === 0) {
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.2L8 3.2v9.6L4.2 10H2zm8.1 1.1 1.4 1.4 1.4-1.4.9.9-1.4 1.4 1.4 1.4-.9.9-1.4-1.4-1.4 1.4-.9-.9 1.4-1.4-1.4-1.4z" /></svg>
              } @else if (nivel() < 70) {
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.2L8 3.2v9.6L4.2 10H2zm7.2-1.2a3.2 3.2 0 0 1 0 6.4v-1.2a2 2 0 0 0 0-4z" /></svg>
              } @else {
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.2L8 3.2v9.6L4.2 10H2zm7.2-1.2a3.2 3.2 0 0 1 0 6.4v-1.2a2 2 0 0 0 0-4zm2.2-1.6a5.2 5.2 0 0 1 0 9.6V11.6a4 4 0 0 0 0-7.2z" /></svg>
              }
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
})
export class Reproductor implements OnDestroy {
  readonly src = input.required<string>();
  readonly archivoLocal = input<string | null>(null);
  readonly estimado = input(0);
  readonly autoplay = input(true);
  readonly titulo = input('');
  readonly cerrar = output<void>();

  readonly playing = signal(false);
  readonly actual = signal(0);
  readonly total = signal(0);
  readonly mudo = signal(false);
  readonly nivel = signal(100);
  readonly volumenAbierto = signal(false);
  readonly listo = signal(false);
  readonly archivo = signal<string | null>(null);
  readonly error = signal('');
  readonly progreso = signal<number | null>(null);

  private readonly medio = viewChild<ElementRef<HTMLVideoElement>>('medio');
  private readonly api = inject(Api);
  private readonly cajaVolumen = viewChild<ElementRef<HTMLElement>>('volumen');
  private readonly intentoDescarga = signal(0);
  private esperaVideo = 0;
  private arranco = false;
  private audio: AudioContext | null = null;
  private ganancia: GainNode | null = null;
  private nivelPrevio = 100;
  private cierreVol = 0;
  private readonly flota = matchMedia('(hover: hover) and (pointer: fine)').matches;

  constructor() {
    effect((limpiar) => {
      const ruta = this.src();
      const local = this.archivoLocal();
      this.intentoDescarga();
      const control = new AbortController();
      let archivo: string | undefined;
      this.archivo.set(null);
      this.error.set('');
      this.listo.set(false);
      this.progreso.set(null);
      this.actual.set(0);
      this.total.set(0);
      this.playing.set(false);
      this.arranco = false;
      limpiar(() => {
        control.abort();
        window.clearTimeout(this.esperaVideo);
        if (archivo) URL.revokeObjectURL(archivo);
      });
      const preparar = (url: string) => {
        this.archivo.set(url);
        this.esperaVideo = window.setTimeout(() => {
          if (!this.listo()) this.error.set('Se descargó el video, pero el navegador no pudo prepararlo.');
        }, 15000);
      };
      if (local) {
        preparar(local);
        return;
      }
      void this.api.descargarVideo(ruta, control.signal, (avance) => {
        if (!control.signal.aborted) this.progreso.set(avance);
      })
        .then((datos) => {
          if (control.signal.aborted) return;
          archivo = URL.createObjectURL(datos);
          preparar(archivo);
        })
        .catch((error: unknown) => {
          if (control.signal.aborted) return;
          this.error.set(error instanceof Error && error.name === 'TimeoutError'
            ? 'El servidor tardó demasiado en entregar un segmento.'
            : 'No se pudo descargar el video completo.');
          control.abort();
        });
    });
  }

  alError() {
    if (!this.archivo()) return;
    window.clearTimeout(this.esperaVideo);
    this.listo.set(false);
    this.error.set('El navegador no pudo reproducir este video.');
  }

  alListo() {
    if (this.listo() || !this.archivo()) return;
    window.clearTimeout(this.esperaVideo);
    this.error.set('');
    this.listo.set(true);
    const video = this.medio()?.nativeElement;
    if (video) this.comenzar(video);
  }

  reintentar() {
    this.intentoDescarga.update((valor) => valor + 1);
  }

  ngOnDestroy() {
    const video = this.medio()?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    window.clearTimeout(this.cierreVol);
    void this.audio?.close().catch(() => undefined);
  }

  alMeta() {
    const video = this.medio()?.nativeElement;
    if (!video) return;
    this.tomarDuracion(video);
    if (!this.total() && this.estimado() > 0) this.total.set(this.estimado());
  }

  alDuracion() {
    const video = this.medio()?.nativeElement;
    if (!video) return;
    this.tomarDuracion(video);
  }

  alTiempo() {
    const video = this.medio()?.nativeElement;
    if (!video) return;
    this.actual.set(video.currentTime || 0);
    this.tomarDuracion(video);
  }

  alternar() {
    if (!this.listo()) return;
    const video = this.medio()?.nativeElement;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  mostrarVolumen() {
    if (!this.flota) return;
    window.clearTimeout(this.cierreVol);
    this.volumenAbierto.set(true);
  }

  ocultarVolumen() {
    if (!this.flota) return;
    window.clearTimeout(this.cierreVol);
    this.cierreVol = window.setTimeout(() => this.volumenAbierto.set(false), 420);
  }

  alternarVolumen(event: Event) {
    event.stopPropagation();
    if (this.nivel() === 0) this.ponerNivel(this.nivelPrevio || 100);
    else {
      this.nivelPrevio = this.nivel() || 100;
      this.ponerNivel(0);
    }
    this.volumenAbierto.set(true);
  }

  @HostListener('document:pointerdown', ['$event'])
  alPuntero(event: PointerEvent) {
    if (!this.volumenAbierto() || this.flota) return;
    const caja = this.cajaVolumen()?.nativeElement;
    if (caja && event.target instanceof Node && caja.contains(event.target)) return;
    this.volumenAbierto.set(false);
  }

  bajar() {
    this.ponerNivel(this.nivel() - 10);
  }

  subir() {
    this.ponerNivel(this.nivel() + 10);
  }

  alNivel(event: Event) {
    this.ponerNivel(Number((event.target as HTMLInputElement).value));
  }

  buscar(event: PointerEvent) {
    const pista = event.currentTarget as HTMLElement;
    const video = this.medio()?.nativeElement;
    const total = this.total();
    if (!video || !total || !video.seekable.length) return;
    const limite = video.seekable.end(video.seekable.length - 1);
    if (limite <= 0) return;
    pista.setPointerCapture(event.pointerId);
    const mover = (ev: PointerEvent) => {
      const rect = pista.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      const destino = Math.min(ratio * total, limite);
      const hasta = video.seekable.end(video.seekable.length - 1);
      video.currentTime = Math.min(destino, hasta);
      this.actual.set(video.currentTime || 0);
    };
    mover(event);
    const soltar = () => {
      pista.removeEventListener('pointermove', mover);
      pista.removeEventListener('pointerup', soltar);
    };
    pista.addEventListener('pointermove', mover);
    pista.addEventListener('pointerup', soltar);
  }

  alTecla(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cerrar.emit();
      return;
    }
    if (!this.listo()) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.subir();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.bajar();
      return;
    }
    if (event.key !== ' ' && event.key !== 'k') return;
    event.preventDefault();
    this.alternar();
  }

  porcentaje() {
    const total = this.total();
    if (!total) return 0;
    return Math.min(100, (this.actual() / total) * 100);
  }

  reloj() {
    const total = this.total();
    const ahora = fmt(Math.floor(this.actual()));
    return total ? ahora + ' / ' + fmt(Math.floor(total)) : ahora;
  }

  private ponerNivel(valor: number) {
    const nivel = Math.round(Math.min(150, Math.max(0, valor)));
    if (nivel > 0) this.nivelPrevio = nivel;
    this.nivel.set(nivel);
    this.mudo.set(nivel === 0);
    this.asegurarAudio();
    if (this.ganancia) this.ganancia.gain.value = nivel / 100;
    const video = this.medio()?.nativeElement;
    if (video) {
      video.muted = nivel === 0;
      video.volume = 1;
    }
    void this.audio?.resume().catch(() => undefined);
  }

  private asegurarAudio() {
    const video = this.medio()?.nativeElement;
    if (!video || this.ganancia) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const fuente = ctx.createMediaElementSource(video);
    const ganancia = ctx.createGain();
    ganancia.gain.value = this.nivel() / 100;
    fuente.connect(ganancia);
    ganancia.connect(ctx.destination);
    this.audio = ctx;
    this.ganancia = ganancia;
  }

  private tomarDuracion(video: HTMLVideoElement) {
    const d = video.duration;
    if (Number.isFinite(d) && d > 0) this.total.set(d);
  }

  private comenzar(video: HTMLVideoElement) {
    if (this.arranco || !this.autoplay()) return;
    this.arranco = true;
    void video.play().catch(() => undefined);
  }

}
