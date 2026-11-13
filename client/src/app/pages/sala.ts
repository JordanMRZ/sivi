import { Component, inject, OnDestroy, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Api, SalaDto, TrozoDto, servicioNoDisponible } from '../api';
import { EstadoPagina } from '../estado-pagina';
import { Marca } from '../marca';
import { BARRAS, elegirMime, esperar, esVirtual, fmt, mensajeCorte, mensajeMedia, REGLAS } from '../texto';

type Fase = 'carga' | 'instrucciones' | 'camara' | 'examen' | 'fin' | 'error';

const INSTRUCCIONES = [
  {
    etiqueta: 'Preparación',
    titulo: 'Antes de empezar',
    puntos: [
      'Busca un lugar tranquilo, con buena luz y una conexión estable.',
      'Permite el acceso a la cámara y al micrófono y comprueba que se te vea y se te escuche.',
      'La pregunta se mostrará cuando el programa empiece a grabar. Si la evaluación tiene límite de tiempo, el contador empezará en ese momento.',
    ],
  },
  {
    etiqueta: 'Reglas',
    titulo: 'Durante la evaluación',
    puntos: [
      {
        texto: 'Mantén abierta la pestaña y la pantalla completa si el navegador la activó. No cambies de aplicación ni recargues la página',
        advertencia: 'porque de lo contrario la actividad oral se cerrará de manera automática',
      },
      'Si SiVI detecta que sales de la evaluación o se apaga la cámara, cierra la pregunta y marca el intento para revisión. El intento marcado no se acepta como entrega válida.',
      'Pulsa «Terminar y enviar» al acabar. Mantén la ventana abierta hasta que SiVI confirme que el video quedó guardado.',
    ],
  },
  {
    etiqueta: 'Problemas',
    titulo: 'Si algo falla',
    puntos: [
      'Si se interrumpe la conexión, mantén abierta la página. SiVI intenta enviar de nuevo los segmentos que no se pudieron guardar.',
      'Si la conexión no se recupera o SiVI indica que la grabación se cortó, la entrega puede quedar incompleta.',
      'Si no ves la confirmación de guardado o el intento quedó cerrado, por favor realice captura(s) de pantalla, video(s), o cualquier otro soporte y/o material probatorio sobre su caso en particular donde se logre evidenciar que presentó una falla técnica.',
    ],
  },
] as const;

@Component({
  selector: 'app-sala',
  imports: [RouterLink, Marca, NgTemplateOutlet, EstadoPagina],
  template: `
    <ng-template #avisoCamara>
      <div class="sala-aviso-imagen" role="alert">
        <div class="aviso-camara-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3M9 9v3m0 3h.01" /></svg>
        </div>
        <h2>La cámara se ve en negro</h2>
        <p>Descubre la cámara o mejora la iluminación.
          {{ fase() === 'camara' ? 'Podrás empezar cuando la imagen sea visible.' : 'La pregunta volverá a aparecer cuando la imagen sea visible.' }}
        </p>
      </div>
    </ng-template>
    <ng-template #plazos>
      <ul class="plazos-grabacion">
        <li>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
          <div><strong>8 días hábiles</strong><span>El docente tiene este plazo para calificar desde el envío.</span></div>
        </li>
        <li>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" /></svg>
          <div><strong>20 días calendario</strong><span>La grabación se elimina al vencer este plazo.</span></div>
        </li>
      </ul>
    </ng-template>
    <ng-template #graficoEntrega let-estado>
    <div class="entrega-ilustracion" aria-hidden="true">
      <svg viewBox="0 0 128 92" fill="none">
        <rect x="12" y="17" width="88" height="61" rx="15" fill="#eaddfa" />
        <rect x="23" y="9" width="88" height="61" rx="15" fill="#faf8ff" stroke="#8b3dff" stroke-width="2" />
        <path d="M58 27v25l19-12.5L58 27Z" fill="#8b3dff" />
        <circle cx="100" cy="68" r="21" fill="#2a0a4e" stroke="#faf8ff" stroke-width="3" />
        @if (estado === 'completo') {
          <path d="m90 68 7 7 13-14" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        } @else if (estado === 'cerrado') {
          <rect x="93" y="66" width="14" height="10" rx="2" stroke="white" stroke-width="2" />
          <path d="M96 66v-4a4 4 0 0 1 8 0v4" stroke="white" stroke-width="2" stroke-linecap="round" />
        } @else {
          <path class="entrega-flecha" d="M100 77V59m-7 7 7-7 7 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        }
      </svg>
    </div>
    </ng-template>
    @if (fase() === 'carga') {
      <div class="sala-carga" role="status" aria-label="Cargando la sala">
        <app-marca variante="carga" />
      </div>
    }
    @if (fase() === 'instrucciones') {
      <main class="sala-instrucciones">
        <app-marca variante="contorno" />
        <section class="instrucciones-contenido" aria-labelledby="instrucciones-titulo">
          <h1 id="instrucciones-titulo">Instrucciones de la evaluación</h1>
          <div class="instrucciones-pestanas" role="tablist" aria-label="Instrucciones" (keydown)="navegarInstrucciones($event)">
            @for (item of instrucciones; track item.etiqueta; let indice = $index) {
              <button type="button" role="tab" [id]="'instruccion-' + indice"
                [attr.aria-selected]="tabInstruccion() === indice"
                [attr.tabindex]="tabInstruccion() === indice ? 0 : -1"
                [attr.aria-controls]="'instrucciones-panel-' + indice"
                [attr.aria-label]="item.etiqueta"
                (click)="tabInstruccion.set(indice)">
                <span class="instruccion-punto" aria-hidden="true"></span>
                <small>{{ item.etiqueta }}</small>
              </button>
            }
          </div>
          <div class="instrucciones-paneles">
            @for (item of instrucciones; track item.etiqueta; let indice = $index) {
              <div class="instrucciones-panel" role="tabpanel" [id]="'instrucciones-panel-' + indice"
                [attr.aria-labelledby]="'instruccion-' + indice"
                [attr.inert]="tabInstruccion() === indice ? null : ''"
                [attr.tabindex]="tabInstruccion() === indice ? 0 : -1">
                <h2>{{ item.titulo }}</h2>
                <ul>
                  @for (punto of item.puntos; track punto) {
                    <li>
                      @if (typeof punto === 'string') {
                        {{ punto }}
                      } @else {
                        {{ punto.texto }} <strong>{{ punto.advertencia }}</strong>.
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
          <div class="instrucciones-acciones">
            <button class="instruccion-flecha btn line" type="button" aria-label="Instrucción anterior"
              [class.instruccion-flecha-oculta]="tabInstruccion() === 0"
              [disabled]="tabInstruccion() === 0" (click)="tabInstruccion.set(tabInstruccion() - 1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
            </button>
            <button class="instruccion-continuar btn solid" type="button" (click)="avanzarInstruccion()">
              {{ tabInstruccion() === instrucciones.length - 1 ? 'Continuar a cámara' : 'Continuar' }}
            </button>
          </div>
        </section>
      </main>
    }
    @if (fase() === 'fin' && respuestaEnviada()) {
      <main class="blanco sala-envio sala-ya-enviada">
        <div class="centro-blanco">
          <section class="cierre" aria-labelledby="resultado-titulo">
            <div class="entrega-video">
              <ng-container [ngTemplateOutlet]="graficoEntrega" [ngTemplateOutletContext]="{ $implicit: 'completo' }" />
              <h2 id="resultado-titulo">Respuesta enviada</h2>
              <p>{{ finTexto() }}</p>
              <a class="btn line" routerLink="/entrar" replaceUrl>Volver al acceso</a>
            </div>
            <ng-container [ngTemplateOutlet]="plazos" />
          </section>
        </div>
      </main>
    } @else if (fase() === 'fin') {
      <main class="blanco sala-envio sala-ya-enviada">
        <div class="centro-blanco">
          <section class="cierre" aria-labelledby="resultado-titulo">
            <div class="entrega-video">
              <ng-container [ngTemplateOutlet]="graficoEntrega" [ngTemplateOutletContext]="{ $implicit: 'cerrado' }" />
              <h2 id="resultado-titulo">Intento cerrado</h2>
              <p>{{ finTexto() }}</p>
              <a class="btn line" routerLink="/entrar" replaceUrl>Volver al acceso</a>
            </div>
          </section>
        </div>
      </main>
    } @else if (fase() === 'error') {
      <app-estado-pagina [codigo]="errorTemporal() ? 503 : undefined"
        titulo="No se pudo abrir la sala" [mensaje]="finTexto()"
        [accion]="errorTemporal() ? 'Reintentar' : ''" (actuar)="reintentarSala()" />
    }
    @if (fase() === 'camara' && error() && !lista()) {
      <app-estado-pagina titulo="No se pudo preparar la cámara" [mensaje]="error()"
        accion="Reintentar" secundaria="Volver a las instrucciones" [mostrarAcceso]="false"
        (actuar)="reintentarCamara()" (volver)="volverAInstrucciones()" />
    } @else if (fase() === 'camara') {
      <section class="preparar" [class.encoge]="encogiendo()">
        <button class="volver-instrucciones" type="button" aria-label="Volver a las instrucciones"
          [disabled]="encogiendo()" (click)="volverAInstrucciones()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
        </button>
        <p class="prep-marca"><app-marca variante="contorno" /></p>
        <div class="visor-prev">
          <video id="preview" autoplay muted playsinline (loadedmetadata)="ajustarVisor($event)"></video>
        </div>
        @if (error()) {
          <p class="fallo-prep">{{ error() }}</p>
        }
        @if (imagenNegra()) {
          <ng-container [ngTemplateOutlet]="avisoCamara" />
        } @else {
          <p class="prep-nota">Mírate, elige la cámara y habla un momento para probar el sonido.</p>
        }
        <div class="prep-fila">
          <select class="elige-camara" [value]="camaraId()" (change)="cambiarCamara($event)">
            @if (!camaraId()) {
              <option value="" disabled>seleccionar camara</option>
            }
            @for (cam of camaras(); track cam.id) {
              <option [value]="cam.id">{{ cam.label }}</option>
            }
          </select>
          <div class="medidor prueba-audio">
            <div class="voz" id="voz-prev" aria-hidden="true">
              @for (barra of barras; track barra) {
                <i></i>
              }
            </div>
            <p class="voz-leyenda" role="status">
              {{ audioComprobado() ? 'Micrófono listo' : 'Habla para probar el micrófono' }}
            </p>
          </div>
        </div>
        <button class="empezar-prep" type="button" [disabled]="!puedeEmpezar()" (click)="empezar()">Empezar</button>
      </section>
    }
    @if (fase() === 'examen') {
      <div class="blanco" [class.sala-envio]="finalizando() || guardado()">
        <header class="cabecera-blanca">
          @if (!cerrado()) {
            <div class="sala-medicion">
            <p class="reloj" id="tiempo">{{ tiempo() }}</p>
            <div class="medidor">
              <div class="voz voz-blanca" id="voz-examen" aria-label="Volumen de la voz">
                @for (barra of barras; track barra) {
                  <i></i>
                }
              </div>
              <p class="voz-leyenda">Voz</p>
            </div>
            </div>
            <div class="pip">
              <video id="cara" autoplay muted playsinline></video>
            </div>
          }
        </header>
        <div class="centro-blanco">
          @if (cerrado()) {
            <div class="cierre">
              @if (finalizando() || guardado()) {
                <div class="entrega-video" role="status">
                  <ng-container [ngTemplateOutlet]="graficoEntrega" [ngTemplateOutletContext]="{ $implicit: guardado() ? 'completo' : 'guardando' }" />
                  <h2>{{ guardado() ? 'Listo, tu video quedó guardado' : 'Guardando tu video' }}</h2>
                  <p>{{ guardado() ? 'Ya puedes cerrar esta ventana.' : '¡Espera! No cierres esta ventana.' }}</p>
                  @if (finalizando()) { <div class="entrega-pista" aria-hidden="true"><span></span></div> }
                </div>
                <ng-container [ngTemplateOutlet]="plazos" />
              } @else {
                <h2>{{ mensaje() }}</h2>
                @if (errorSubida()) {
                  <p role="alert">{{ errorSubida() }}</p>
                }
                @if (errorSubida() && chunkIndex === 0) {
                  <a class="btn line" routerLink="/entrar" replaceUrl>Volver al acceso</a>
                } @else {
                  <p>Ya puedes cerrar esta ventana.</p>
                }
              }
            </div>
          } @else if (imagenNegra()) {
            <ng-container [ngTemplateOutlet]="avisoCamara" />
          } @else if (pregunta() && imagenComprobada()) {
            <div class="enunciado" [class.varios]="parrafos().length > 1">
              @for (parrafo of parrafos(); track $index) {
                <p>{{ parrafo }}</p>
              }
            </div>
          } @else {
            <p class="espera">Grabando. La pregunta aparece en un momento.</p>
          }
        </div>
        @if (!cerrado()) {
          <footer class="pie-blanco">
            <button class="btn terminar" id="terminar" type="button" (click)="terminar('ok')">Terminar y enviar</button>
          </footer>
        }
      </div>
    }
  `,
})
export class Sala implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  readonly fase = signal<Fase>('carga');
  readonly imagenNegra = signal(false);
  readonly imagenComprobada = signal(false);
  readonly audioComprobado = signal(false);
  private revisionImagen = 0;
  readonly errorTemporal = signal(false);
  readonly instrucciones = INSTRUCCIONES;
  readonly tabInstruccion = signal(0);
  readonly respuestaEnviada = signal(false);
  readonly finTexto = signal('');
  readonly error = signal('');
  readonly camaras = signal<{ id: string; label: string }[]>([]);
  readonly camaraId = signal('');
  readonly lista = signal(false);
  readonly encogiendo = signal(false);
  readonly pregunta = signal('');
  readonly tiempo = signal('--:--');
  readonly cerrado = signal(false);
  readonly mensaje = signal('');
  readonly errorSubida = signal('');
  readonly finalizando = signal(false);
  readonly guardado = signal(false);
  readonly barras = BARRAS;

  private id = '';
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  protected chunkIndex = 0;
  private cola: Promise<void> = Promise.resolve();
  private finEnCurso = false;
  private preguntaVisible = false;
  private inicio: number | null = null;
  private minutos: number | null = null;
  private finReloj = 0;
  private timer = 0;
  private hideTimer = 0;
  private pollSala = 0;
  private enSubida = false;
  private frame = 0;
  private audioStop = () => {};
  private ac = new AbortController();
  private vivo = true;
  private versionCamara = 0;
  private nombreAlumno = '';
  private muestras = 0;
  private muestrasVoz = 0;
  private negro = 0;
  private quieto = 0;
  private firmaPrevia = -1;
  private ultimoMuestreo = 0;
  private rotuloFrame = 0;
  private rotuloVideo: HTMLVideoElement | null = null;
  private exigePantalla = false;
  private readonly avisosPuestos = new Set<string>();
  private readonly alVolver = (event: PageTransitionEvent) => {
    if (!event.persisted || (this.fase() !== 'fin' && this.fase() !== 'error')) return;
    sessionStorage.removeItem('encuadro.intento');
    void this.router.navigateByUrl('/entrar', { replaceUrl: true });
  };

  constructor() {
    window.addEventListener('pageshow', this.alVolver);
    void this.abrir();
  }

  ngOnDestroy() {
    this.vivo = false;
    window.removeEventListener('pageshow', this.alVolver);
    this.limpiar();
    document.body.classList.remove('en-examen', 'fondo-blanco');
    this.title.setTitle('SiVI');
  }

  async empezar() {
    if (!this.puedeEmpezar()) return;
    window.clearInterval(this.revisionImagen);
    this.error.set('');
    this.lista.set(false);
    this.exigePantalla = await this.pedirPantalla();
    const pantalla = window.screen as Screen & { isExtended?: boolean };
    if (pantalla.isExtended) {
      void this.api
        .request('/api/intentos/' + this.id + '/marca', { method: 'POST', body: { tipo: 'segunda_pantalla' } })
        .catch(() => undefined);
    }
    await this.encogerCamara();
    this.audioStop();
    const preview = document.getElementById('preview') as HTMLVideoElement | null;
    if (preview) preview.srcObject = null;
    this.fase.set('examen');
    document.body.classList.add('en-examen');
    this.title.setTitle('Examen · SiVI');
    window.setTimeout(() => this.comenzarGrabacion(), 40);
  }

  puedeEmpezar() {
    return this.lista() && this.imagenComprobada() && !this.imagenNegra() && this.audioComprobado();
  }

  async terminar(tipo: string) {
    if (this.finEnCurso) return;
    if (this.muestras >= 45 && this.muestrasVoz / this.muestras < 0.06) this.avisar('silencio');
    this.finEnCurso = true;
    window.clearInterval(this.revisionImagen);
    this.finalizando.set(true);
    this.preguntaVisible = false;
    window.clearInterval(this.timer);
    window.clearInterval(this.pollSala);
    window.clearTimeout(this.hideTimer);
    this.pregunta.set('');
    this.cerrado.set(true);
    this.mensaje.set(mensajeCorte(tipo));
    this.audioStop();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    if (!['ok', 'tiempo', 'supervision'].includes(tipo)) {
      await this.api
        .request('/api/intentos/' + this.id + '/marca', { method: 'POST', body: { tipo } })
        .catch(() => undefined);
    }
    await new Promise<void>((resolve) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.addEventListener('stop', () => resolve(), { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
    if (this.enSubida) {
      this.cola = this.cola.then(() => this.cerrarIntento());
      return;
    }
    await this.cola.catch(() => undefined);
    await this.cerrarIntento();
  }

  private async cerrarIntento() {
    try {
      const resultado = await this.api.request<{ estado: string }>('/api/intentos/' + this.id + '/cerrar', { method: 'POST', body: {} });
      this.guardado.set(resultado.estado === 'completo' && !this.errorSubida() && this.chunkIndex > 0);
    } catch {
      if (!this.errorSubida()) this.errorSubida.set('No se pudo confirmar el cierre de la grabación.');
    } finally {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.pararRotulo();
      window.onbeforeunload = null;
      this.finalizando.set(false);
    }
  }

  private async encogerCamara() {
    const visor = document.querySelector('.visor-prev') as HTMLElement | null;
    if (!visor) return;
    const rect = visor.getBoundingClientRect();
    visor.style.position = 'fixed';
    visor.style.margin = '0';
    visor.style.left = rect.left + 'px';
    visor.style.top = rect.top + 'px';
    visor.style.width = rect.width + 'px';
    visor.style.height = rect.height + 'px';
    visor.style.aspectRatio = 'auto';
    visor.style.transformOrigin = 'top left';
    visor.style.zIndex = '30';
    this.encogiendo.set(true);
    await esperar(24);
    const estilos = getComputedStyle(document.documentElement);
    const ancho = parseFloat(estilos.getPropertyValue('--pip-w')) || 280;
    const margen = parseFloat(estilos.getPropertyValue('--pip-m')) || 28;
    const left = window.innerWidth - margen - ancho;
    const top = Math.max(margen, 16);
    const escala = rect.width ? ancho / rect.width : 1;
    visor.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)';
    visor.style.transform = `translate(${left - rect.left}px, ${top - rect.top}px) scale(${escala})`;
    await esperar(580);
  }

  private async abrir() {
    const id = sessionStorage.getItem('encuadro.intento');
    if (!id) {
      this.finTexto.set('Ingresa tu código de examen desde el formulario de acceso.');
      this.fase.set('error');
      return;
    }
    this.id = id;
    let sala: SalaDto;
    try {
      const duracion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100;
      [sala] = await Promise.all([
        this.api.request<SalaDto>('/api/intentos/' + id + '/sala'),
        esperar(duracion),
      ]);
    } catch (error) {
      const temporal = servicioNoDisponible(error);
      if (!temporal) sessionStorage.removeItem('encuadro.intento');
      this.errorTemporal.set(temporal);
      this.finTexto.set(temporal ? 'Revisa tu conexión e intenta cargar la sala otra vez.'
        : error instanceof Error ? error.message : 'Vuelve al acceso y revisa el código.');
      this.fase.set('error');
      return;
    }
    if (!this.vivo) return;
    if (sala.estado === 'esperando') {
      this.nombreAlumno = sala.nombre;
      document.body.classList.add('fondo-blanco');
      this.fase.set('instrucciones');
      return;
    }
    if (sala.estado === 'grabando') {
      await this.api
        .request('/api/intentos/' + id + '/marca', { method: 'POST', body: { tipo: 'hueco' } })
        .catch(() => undefined);
      await this.api.request('/api/intentos/' + id + '/cerrar', { method: 'POST', body: {} }).catch(() => undefined);
      this.finTexto.set('La grabación se interrumpió al recargar. Para volver a intentarlo con el mismo nombre y código, pídele al profesor que elimine el intento.');
      this.fase.set('fin');
      return;
    }
    if (sala.estado === 'completo') {
      this.respuestaEnviada.set(true);
      this.finTexto.set('La respuesta ya se entregó. Puedes cerrar esta ventana.');
    } else if (sala.estado === 'sospechoso') {
      this.finTexto.set('Este intento quedó marcado y la pregunta se cerró. Pídele al profesor que elimine el intento. Después podrás entrar con el mismo nombre y código.');
    } else if (sala.trozos === 0) {
      this.finTexto.set('No se guardó ninguna grabación. Vuelve al acceso e inténtalo con el mismo nombre y código.');
    } else {
      this.finTexto.set('El intento quedó incompleto. Si necesitas repetirlo, pídele al profesor que lo elimine. Después podrás entrar con el mismo nombre y código.');
    }
    this.fase.set('fin');
  }

  reintentarSala() {
    this.errorTemporal.set(false);
    this.fase.set('carga');
    void this.abrir();
  }

  cambiarInstruccion(indice: number) {
    this.tabInstruccion.set(indice);
    document.getElementById('instruccion-' + indice)?.focus();
  }

  avanzarInstruccion() {
    if (this.tabInstruccion() === this.instrucciones.length - 1) {
      void this.continuarACamara();
      return;
    }
    this.tabInstruccion.update(indice => indice + 1);
  }

  navegarInstrucciones(event: KeyboardEvent) {
    const actual = this.tabInstruccion();
    const total = this.instrucciones.length;
    const destinos: Record<string, number> = {
      ArrowLeft: (actual + total - 1) % total,
      ArrowRight: (actual + 1) % total,
      Home: 0,
      End: total - 1,
    };
    if (!Object.hasOwn(destinos, event.key)) return;
    event.preventDefault();
    this.cambiarInstruccion(destinos[event.key]);
  }

  async continuarACamara() {
    if (this.fase() !== 'instrucciones') return;
    const version = this.versionCamara;
    this.imagenComprobada.set(false);
    this.imagenNegra.set(false);
    this.audioComprobado.set(false);
    this.fase.set('camara');
    await esperar(40);
    if (this.vivo && this.fase() === 'camara' && version === this.versionCamara) await this.abrirCamara();
  }

  volverAInstrucciones() {
    if (this.fase() !== 'camara' || this.encogiendo()) return;
    this.versionCamara += 1;
    window.clearInterval(this.revisionImagen);
    this.audioStop();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.lista.set(false);
    this.error.set('');
    this.fase.set('instrucciones');
  }

  async reintentarCamara() {
    if (this.fase() !== 'camara' || !this.error()) return;
    window.clearInterval(this.revisionImagen);
    this.audioStop();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.error.set('');
    this.audioComprobado.set(false);
    await esperar(40);
    if (this.vivo && this.fase() === 'camara') await this.abrirCamara();
  }

  private async abrirCamara() {
    const version = ++this.versionCamara;
    const vigente = () => this.vivo && this.fase() === 'camara' && version === this.versionCamara;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: this.opcionesAudio(),
        video: this.opcionesVideo(),
      });
    } catch (error) {
      if (vigente()) this.error.set(mensajeMedia(error as { name?: string }));
      return;
    }
    if (!vigente()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    const label = track?.label ?? '';
    const video = document.getElementById('preview') as HTMLVideoElement | null;
    if (video) {
      this.ponerVideo(video, stream);
      this.revisarImagenCamara(video);
    }
    await this.listarCamaras(track?.getSettings().deviceId || '');
    if (!vigente()) return;
    const medidor = document.getElementById('voz-prev');
    if (medidor) this.medir(stream, medidor, true);
    if (esVirtual(label)) {
      await this.api
        .request('/api/intentos/' + this.id + '/marca', {
          method: 'POST',
          body: { tipo: 'virtual', detalle: label },
        })
        .catch(() => undefined);
      stream.getTracks().forEach((item) => item.stop());
      if (vigente()) {
        this.error.set('Esta cámara parece virtual (' + label + '). Usa la cámara de la computadora.');
        this.stream = null;
      }
      return;
    }
    if (!stream.getAudioTracks().length) {
      this.error.set('Hace falta micrófono, porque la respuesta es en voz.');
      return;
    }
    this.lista.set(true);
  }

  async cambiarCamara(event: Event) {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    const stream = this.stream;
    if (!id || !stream || id === this.camaraId()) return;
    const anterior = this.camaraId();
    const volver = () => {
      select.value = anterior;
      this.camaraId.set(anterior);
    };
    const etiqueta = select.selectedOptions[0]?.text || '';
    if (esVirtual(etiqueta)) {
      volver();
      this.error.set('Esta cámara parece virtual (' + etiqueta + '). Usa la cámara de la computadora.');
      return;
    }
    try {
      const pedido = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: this.opcionesVideo(id),
      });
      if (this.fase() !== 'camara' || this.stream !== stream) {
        pedido.getTracks().forEach(track => track.stop());
        return;
      }
      const track = pedido.getVideoTracks()[0];
      const label = track?.label ?? '';
      if (!track || esVirtual(label)) {
        track?.stop();
        volver();
        if (label) this.error.set('Esta cámara parece virtual (' + label + '). Usa la cámara de la computadora.');
        return;
      }
      const audio = stream.getAudioTracks();
      const viejos = stream.getVideoTracks();
      const nuevo = new MediaStream([...audio, track]);
      this.stream = nuevo;
      const video = document.getElementById('preview') as HTMLVideoElement | null;
      if (video) {
        this.ponerVideo(video, nuevo);
        this.revisarImagenCamara(video);
      }
      viejos.forEach((item) => item.stop());
      this.camaraId.set(id);
      this.error.set('');
    } catch (error) {
      if (this.fase() !== 'camara' || this.stream !== stream) return;
      volver();
      this.error.set(mensajeMedia(error as { name?: string }));
    }
  }

  private async listarCamaras(actual: string) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((device) => device.kind === 'videoinput' && device.deviceId);
    this.camaras.set(
      videos.map((device, index) => ({
        id: device.deviceId,
        label: device.label || 'Cámara ' + (index + 1),
      })),
    );
    this.camaraId.set(actual || videos[0]?.deviceId || '');
  }

  private async comenzarGrabacion() {
    const stream = this.stream;
    if (!stream || !this.vivo) return;
    const cara = document.getElementById('cara') as HTMLVideoElement | null;
    if (cara) {
      this.ponerVideo(cara, stream);
      this.revisarImagenCamara(cara);
    }
    const medidor = document.getElementById('voz-examen');
    if (medidor) this.medir(stream, medidor);
    this.ac.abort();
    this.ac = new AbortController();
    const signal = this.ac.signal;
    const volver = () => window.clearTimeout(this.hideTimer);
    const salir = () => {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => {
        if (document.hidden || !document.hasFocus()) void this.terminar('tab');
      }, REGLAS.ocultarMs);
    };
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) salir();
        else volver();
      },
      { signal },
    );
    window.addEventListener('blur', () => salir(), { signal });
    window.addEventListener('focus', () => volver(), { signal });
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.altKey && event.key === 'Tab') void this.terminar('tab');
        if (!(event.ctrlKey || event.metaKey) || !this.preguntaVisible) return;
        const tecla = event.key.toLowerCase();
        if (tecla === 'c' || tecla === 'x') {
          event.preventDefault();
          this.avisar('copiar');
        }
        if (tecla === 'v') {
          event.preventDefault();
          this.avisar('pegar');
        }
      },
      { signal, capture: true },
    );
    document.addEventListener(
      'copy',
      (event) => {
        if (!this.preguntaVisible) return;
        event.preventDefault();
        this.avisar('copiar');
      },
      { signal },
    );
    document.addEventListener(
      'cut',
      (event) => {
        if (!this.preguntaVisible) return;
        event.preventDefault();
        this.avisar('copiar');
      },
      { signal },
    );
    document.addEventListener(
      'paste',
      (event) => {
        if (!this.preguntaVisible) return;
        event.preventDefault();
        this.avisar('pegar');
      },
      { signal },
    );
    document.addEventListener(
      'contextmenu',
      (event) => {
        if (!this.preguntaVisible) return;
        event.preventDefault();
        this.avisar('menu');
      },
      { signal },
    );
    const alSalir = () => {
      if (this.salioDePantalla()) void this.terminar('fullscreen');
    };
    document.addEventListener('fullscreenchange', alSalir, { signal });
    document.addEventListener('webkitfullscreenchange', alSalir, { signal });
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => void this.terminar('camara'), { signal });
      track.addEventListener(
        'mute',
        () => {
          if (!this.preguntaVisible) return;
          window.setTimeout(() => {
            if (track.muted) void this.terminar('camara');
          }, REGLAS.ocultarMs);
        },
        { signal },
      );
    }
    const mime = elegirMime();
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: REGLAS.bitrate,
      audioBitsPerSecond: REGLAS.audioBitrate,
    };
    if (mime) options.mimeType = mime;
    const salida = await this.conRotulo(stream);
    if (!this.vivo || this.finEnCurso) return;
    try {
      this.recorder = new MediaRecorder(salida, options);
    } catch {
      void this.terminar('camara');
      return;
    }
    this.recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;
      const blob = event.data;
      this.cola = this.cola.then(() => this.subir(blob)).catch(() => undefined);
    };
    this.recorder.start(this.api.enWeb ? 8000 : REGLAS.chunkMs);
    window.setTimeout(() => {
      if (this.recorder && this.recorder.state === 'recording') {
        try {
          this.recorder.requestData();
        } catch {
          // sigue el corte de cada 4 segundos
        }
      }
    }, 700);
    window.onbeforeunload = (event) => {
      event.preventDefault();
    };
  }

  parrafos() {
    const partes = this.pregunta()
      .replace(/\r\n/g, '\n')
      .split(/\n+/)
      .map((parte) => parte.trim())
      .filter(Boolean);
    return partes.length ? partes : [this.pregunta()];
  }

  ajustarVisor(event: Event) {
    const video = event.target as HTMLVideoElement;
    const visor = video.parentElement;
    if (!visor || !video.videoWidth || !video.videoHeight) return;
    visor.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight;
  }

  private async pedirPantalla() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const pedir = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!pedir) return false;
    try {
      await pedir();
    } catch {
      return false;
    }
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return !!(document.fullscreenElement || doc.webkitFullscreenElement);
  }

  private salioDePantalla() {
    if (!this.exigePantalla) return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return !document.fullscreenElement && !doc.webkitFullscreenElement;
  }

  private opcionesAudio(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    };
  }

  private opcionesVideo(deviceId?: string): MediaTrackConstraints {
    const video: MediaTrackConstraints = {
      width: { ideal: 960 },
      height: { ideal: 720 },
      aspectRatio: { ideal: 4 / 3 },
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = 'user';
    return video;
  }

  private async subir(blob: Blob) {
    if (this.errorSubida()) return;
    this.enSubida = true;
    let fallo: unknown = null;
    try {
      for (let intento = 0; intento < 3; intento += 1) {
        try {
          const data = await this.api.request<TrozoDto>('/api/intentos/' + this.id + '/trozo', {
            method: 'POST',
            body: blob,
            headers: {
              'X-Chunk-Index': String(this.chunkIndex),
              'X-Device': encodeURIComponent(this.stream?.getVideoTracks()[0]?.label ?? ''),
              'X-Tipo': blob.type.includes('mp4') ? 'mp4' : 'webm',
            },
          });
          this.chunkIndex += 1;
          if (data.pregunta && !this.preguntaVisible && !this.finEnCurso && this.salioDePantalla()) {
            await this.terminar('fullscreen');
            return;
          }
          if (data.pregunta && !this.preguntaVisible && !this.finEnCurso && document.hidden) {
            await this.terminar('tab');
            return;
          }
          if (data.pregunta && !this.preguntaVisible && !this.finEnCurso) {
            this.revelar(data);
            return;
          }
          if (!data.pregunta && this.preguntaVisible && !this.finEnCurso) {
            const vencio = data.minutos > 0 && data.inicio &&
              (performance.now() >= this.finReloj || data.ahora >= data.inicio + data.minutos * 60);
            await this.terminar(vencio ? 'tiempo' : data.estado === 'incompleto' ? 'hueco' : 'camara');
          }
          return;
        } catch (error) {
          fallo = error;
          if (error instanceof Error && error.message === 'El intento se cerró por un aviso de supervisión.') {
            this.errorSubida.set('La supervisión marcó este intento. Si necesitas repetirlo, comunícate con tu profesor.');
            if (!this.finEnCurso) await this.terminar('supervision');
            else this.mensaje.set('Intento cerrado');
            return;
          }
          if (intento < 2) await esperar(500 * (intento + 1));
        }
      }
      const detalle = fallo instanceof Error ? fallo.message : 'No se pudo confirmar la subida.';
      this.errorSubida.set(
        this.chunkIndex === 0
          ? 'El primer segmento no se pudo guardar. ' + detalle
          : 'No se pudo guardar un segmento de la grabación. ' + detalle,
      );
      if (!this.finEnCurso) await this.terminar('hueco');
    } finally {
      this.enSubida = false;
    }
  }

  private revelar(data: TrozoDto) {
    this.preguntaVisible = true;
    this.inicio = data.inicio;
    this.minutos = data.minutos;
    const inicioReloj = performance.now() - Math.max(0, data.ahora - (data.inicio ?? data.ahora)) * 1000;
    this.finReloj = inicioReloj + data.minutos * 60000;
    this.pregunta.set(data.pregunta ?? '');
    const tick = () => {
      if (this.inicio == null || this.minutos == null) return;
      if (this.minutos <= 0) {
        this.tiempo.set(fmt(Math.max(0, Math.floor((performance.now() - inicioReloj) / 1000))));
        return;
      }
      const queda = Math.max(0, Math.ceil((this.finReloj - performance.now()) / 1000));
      this.tiempo.set(fmt(queda));
      if (queda <= 0) void this.terminar('tiempo');
    };
    tick();
    this.timer = window.setInterval(tick, 250);
    this.pollSala = window.setInterval(() => void this.vigilar(), 5000);
  }

  private async vigilar() {
    if (this.finEnCurso) return;
    try {
      const sala = await this.api.request<SalaDto>('/api/intentos/' + this.id + '/sala');
      if (sala.pregunta) return;
      if (sala.minutos > 0 && sala.inicio && sala.ahora >= sala.inicio + sala.minutos * 60) {
        await this.terminar('tiempo');
      } else if (sala.estado === 'sospechoso') {
        const grave = sala.marcas.find(
          (marca) =>
            marca !== 'segunda_pantalla' &&
            marca !== 'hueco' &&
            marca !== 'copiar' &&
            marca !== 'pegar' &&
            marca !== 'menu' &&
            marca !== 'silencio' &&
            marca !== 'imagen',
        );
        await this.terminar(grave || 'camara');
      } else {
        await this.terminar('hueco');
      }
    } catch {
      return;
    }
  }

  private avisar(tipo: string) {
    if (this.avisosPuestos.has(tipo) || !this.id) return;
    this.avisosPuestos.add(tipo);
    void this.api
      .request('/api/intentos/' + this.id + '/marca', { method: 'POST', body: { tipo } })
      .catch(() => this.avisosPuestos.delete(tipo));
  }

  private pararRotulo() {
    cancelAnimationFrame(this.rotuloFrame);
    const video = this.rotuloVideo;
    this.rotuloVideo = null;
    if (!video) return;
    video.pause();
    video.srcObject = null;
  }

  private conRotulo(stream: MediaStream) {
    const origen = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    if (!origen) return Promise.resolve(stream);
    return new Promise<MediaStream>((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.volume = 0;
      video.playsInline = true;
      video.srcObject = new MediaStream([origen]);
      this.rotuloVideo = video;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(stream);
        return;
      }
      let listo = false;
      const entregar = (salida: MediaStream) => {
        if (listo) return;
        listo = true;
        resolve(salida);
      };
      const dibujar = () => {
        if (!this.vivo || !this.rotuloVideo) return;
        if (video.videoWidth && canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const nombre = (this.nombreAlumno || 'Estudiante').slice(0, 42);
        const reloj = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const texto = nombre + '   ' + reloj;
        ctx.font = '600 22px Poppins, sans-serif';
        const caja = Math.min(ctx.measureText(texto).width + 28, canvas.width - 32);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(16, canvas.height - 52, caja, 36);
        ctx.fillStyle = '#fff';
        ctx.fillText(texto, 28, canvas.height - 28);
        this.mirarImagen(ctx, canvas);
        this.rotuloFrame = requestAnimationFrame(dibujar);
      };
      video.addEventListener(
        'loadeddata',
        () => {
          if (video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const salida = canvas.captureStream(15);
          if (audio) salida.addTrack(audio);
          this.rotuloFrame = requestAnimationFrame(dibujar);
          entregar(salida);
        },
        { once: true },
      );
      void video.play().catch(() => entregar(stream));
      window.setTimeout(() => entregar(stream), 1500);
    });
  }

  private mirarImagen(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (!this.preguntaVisible || this.avisosPuestos.has('imagen') || !canvas.width) return;
    const ahora = performance.now();
    if (ahora - this.ultimoMuestreo < 2000) return;
    this.ultimoMuestreo = ahora;
    const x = Math.max(0, Math.floor(canvas.width / 2) - 16);
    const y = Math.max(0, Math.floor(canvas.height / 2) - 16);
    let datos: ImageData;
    try {
      datos = ctx.getImageData(x, y, 32, 32);
    } catch {
      return;
    }
    let suma = 0;
    let firma = 0;
    const pixeles = datos.data.length / 16;
    for (let i = 0; i < datos.data.length; i += 16) {
      const luma = datos.data[i]! * 0.3 + datos.data[i + 1]! * 0.59 + (datos.data[i + 2] ?? 0) * 0.11;
      suma += luma;
      firma = (firma * 33 + Math.round(luma / 8)) >>> 0;
    }
    if (suma / pixeles < 14) this.negro += 1;
    else this.negro = 0;
    if (firma === this.firmaPrevia) this.quieto += 1;
    else this.quieto = 0;
    this.firmaPrevia = firma;
    if (this.negro >= 3 || this.quieto >= 4) this.avisar('imagen');
  }

  private revisarImagenCamara(video: HTMLVideoElement) {
    window.clearInterval(this.revisionImagen);
    this.imagenComprobada.set(false);
    this.imagenNegra.set(false);
    const muestra = document.createElement('canvas');
    muestra.width = 32;
    muestra.height = 24;
    const ctx = muestra.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.imagenComprobada.set(true);
      return;
    }
    let oscuras = 0;
    let claras = 0;
    this.revisionImagen = window.setInterval(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
      ctx.drawImage(video, 0, 0, muestra.width, muestra.height);
      const { data } = ctx.getImageData(0, 0, muestra.width, muestra.height);
      let pixelesOscuros = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! * .3 + data[i + 1]! * .59 + data[i + 2]! * .11 < 18) pixelesOscuros++;
      }
      const oscura = pixelesOscuros >= muestra.width * muestra.height * .97;
      oscuras = oscura ? oscuras + 1 : 0;
      claras = oscura ? 0 : claras + 1;
      if (oscuras >= 2) {
        this.imagenNegra.set(true);
        if (this.preguntaVisible) this.avisar('imagen');
      } else if (claras >= 2) {
        this.imagenComprobada.set(true);
        this.imagenNegra.set(false);
      }
    }, 350);
  }

  private ponerVideo(video: HTMLVideoElement, stream: MediaStream) {
    video.muted = true;
    video.volume = 0;
    video.srcObject = stream;
  }

  private medir(stream: MediaStream, root: HTMLElement, prueba = false) {
    this.audioStop();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const copia = stream.clone();
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const source = ctx.createMediaStreamSource(copia);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const bars = Array.from(root.querySelectorAll('i'));
    const fill = root.querySelector('.sonido-fill') as HTMLElement | null;
    let smooth = 0;
    let vozDesde: number | null = null;
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i]! - 128) / 128;
        sum += value * value;
      }
      const target = Math.min(1, Math.sqrt(sum / data.length) * 7);
      smooth += (target - smooth) * 0.28;
      if (prueba && !this.audioComprobado()) {
        const ahora = performance.now();
        vozDesde = smooth >= 0.12 ? vozDesde ?? ahora : null;
        if (vozDesde !== null && ahora - vozDesde >= 350) this.audioComprobado.set(true);
      }
      if (this.preguntaVisible) {
        this.muestras += 1;
        if (smooth > 0.12) this.muestrasVoz += 1;
      }
      if (fill) fill.style.width = Math.round(smooth * 100) + '%';
      bars.forEach((bar, index) => {
        const gate = index / Math.max(1, bars.length - 1);
        const amount = Math.max(0, Math.min(1, (smooth - gate * 0.55) / 0.28));
        const el = bar as HTMLElement;
        el.style.height = 8 + amount * 32 + 'px';
        el.classList.toggle('on', amount > 0.12);
      });
      this.frame = requestAnimationFrame(loop);
    };
    void ctx.resume().catch(() => undefined);
    loop();
    this.audioStop = () => {
      cancelAnimationFrame(this.frame);
      source.disconnect();
      copia.getTracks().forEach((track) => track.stop());
      void ctx.close().catch(() => undefined);
    };
  }

  private limpiar() {
    window.clearInterval(this.revisionImagen);
    this.ac.abort();
    window.clearInterval(this.timer);
    window.clearInterval(this.pollSala);
    window.clearTimeout(this.hideTimer);
    window.onbeforeunload = null;
    this.audioStop();
    this.pararRotulo();
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // ya se estaba cerrando
      }
    }
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
