import { Component, inject, OnDestroy, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Api, SalaDto, TrozoDto } from '../api';
import { Marco } from '../marco';
import { Marca } from '../marca';
import { BARRAS, elegirMime, esperar, esVirtual, fmt, mensajeCorte, mensajeMedia, REGLAS } from '../texto';

type Fase = 'carga' | 'camara' | 'examen' | 'fin' | 'error';

@Component({
  selector: 'app-sala',
  imports: [Marco, RouterLink, Marca],
  template: `
    @if (fase() === 'carga') {
      <app-marco inicio="/entrar">
        <p class="kicker">Preparando</p>
        <h1>Un momento</h1>
      </app-marco>
    }
    @if (fase() === 'fin' || fase() === 'error') {
      <app-marco inicio="/entrar">
        <p class="kicker">Respuesta</p>
        <h1>{{ fase() === 'fin' ? 'Listo' : 'No se pudo abrir' }}</h1>
        <p class="lede">{{ finTexto() }}</p>
        <a class="btn line" routerLink="/entrar" replaceUrl>Usar otro nombre</a>
      </app-marco>
    }
    @if (fase() === 'camara') {
      <section class="preparar" [class.encoge]="encogiendo()">
        <p class="prep-marca"><app-marca />AVIA</p>
        <div class="visor-prev">
          <video id="preview" autoplay muted playsinline (loadedmetadata)="ajustarVisor($event)"></video>
        </div>
        @if (error()) {
          <p class="fallo-prep">{{ error() }}</p>
        }
        <p class="prep-nota">Mírate, elige la cámara y habla un momento para probar el sonido.</p>
        <div class="prep-fila">
          <select class="elige-camara" [value]="camaraId()" (change)="cambiarCamara($event)">
            @if (!camaraId()) {
              <option value="" disabled>seleccionar camara</option>
            }
            @for (cam of camaras(); track cam.id) {
              <option [value]="cam.id">{{ cam.label }}</option>
            }
          </select>
          <div class="medidor">
            <div class="voz" id="voz-prev" aria-label="Sonido">
              @for (barra of barras; track barra) {
                <i></i>
              }
            </div>
            <p class="voz-leyenda">Sonido</p>
          </div>
        </div>
        <button class="empezar-prep" type="button" [disabled]="!lista()" (click)="empezar()">Empezar</button>
      </section>
    }
    @if (fase() === 'examen') {
      <div class="blanco">
        <header class="cabecera-blanca">
          @if (!cerrado()) {
            <p class="reloj" id="tiempo">{{ tiempo() }}</p>
            <div class="medidor">
              <div class="voz voz-blanca" id="voz-examen" aria-label="Volumen de la voz">
                @for (barra of barras; track barra) {
                  <i></i>
                }
              </div>
              <p class="voz-leyenda">Voz</p>
            </div>
          }
        </header>
        <div class="centro-blanco">
          @if (cerrado()) {
            <div class="cierre">
              <h2>{{ mensaje() }}</h2>
              <p>Ya puedes cerrar esta ventana.</p>
            </div>
          } @else if (pregunta()) {
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
          <div class="pip">
            <video id="cara" autoplay muted playsinline></video>
          </div>
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
  readonly barras = BARRAS;

  private id = '';
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunkIndex = 0;
  private cola: Promise<void> = Promise.resolve();
  private finEnCurso = false;
  private preguntaVisible = false;
  private inicio: number | null = null;
  private minutos: number | null = null;
  private timer = 0;
  private hideTimer = 0;
  private pollSala = 0;
  private enSubida = false;
  private frame = 0;
  private audioStop = () => {};
  private ac = new AbortController();
  private vivo = true;
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
    this.title.setTitle('AVIA');
  }

  async empezar() {
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
    this.title.setTitle('Examen');
    window.setTimeout(() => this.comenzarGrabacion(), 40);
  }

  async terminar(tipo: string) {
    if (this.finEnCurso) return;
    if (this.muestras >= 45 && this.muestrasVoz / this.muestras < 0.06) this.avisar('silencio');
    this.finEnCurso = true;
    this.preguntaVisible = false;
    window.clearInterval(this.timer);
    window.clearInterval(this.pollSala);
    window.clearTimeout(this.hideTimer);
    window.onbeforeunload = null;
    this.pregunta.set('');
    this.cerrado.set(true);
    this.mensaje.set(mensajeCorte(tipo));
    this.audioStop();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    if (tipo !== 'ok' && tipo !== 'tiempo') {
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
        recorder.requestData();
      } catch {
        // el stop igual entrega el último trozo
      }
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
    await this.api.request('/api/intentos/' + this.id + '/cerrar', { method: 'POST', body: {} }).catch(() => undefined);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.pararRotulo();
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
      await this.router.navigateByUrl('/entrar', { replaceUrl: true });
      return;
    }
    this.id = id;
    let sala: SalaDto;
    try {
      sala = await this.api.request<SalaDto>('/api/intentos/' + id + '/sala');
    } catch (error) {
      sessionStorage.removeItem('encuadro.intento');
      this.finTexto.set(error instanceof Error ? error.message : 'No se pudo abrir');
      this.fase.set('error');
      return;
    }
    if (!this.vivo) return;
    if (sala.estado === 'esperando') {
      this.nombreAlumno = sala.nombre;
      document.body.classList.add('fondo-blanco');
      this.fase.set('camara');
      await esperar(40);
      await this.abrirCamara();
      return;
    }
    if (sala.estado === 'grabando') {
      await this.api
        .request('/api/intentos/' + id + '/marca', { method: 'POST', body: { tipo: 'hueco' } })
        .catch(() => undefined);
      await this.api.request('/api/intentos/' + id + '/cerrar', { method: 'POST', body: {} }).catch(() => undefined);
      this.finTexto.set('La grabación se interrumpió al recargar. El profesor ve el intento incompleto.');
      this.fase.set('fin');
      return;
    }
    if (sala.estado === 'completo') {
      this.finTexto.set('Este nombre ya envió la respuesta. Ya puedes cerrar la ventana.');
    } else if (sala.estado === 'sospechoso') {
      this.finTexto.set('Este intento quedó marcado. No se puede volver a abrir la pregunta.');
    } else {
      this.finTexto.set('Este intento quedó incompleto. Si fue una prueba, el profesor puede borrarlo.');
    }
    this.fase.set('fin');
  }

  private async abrirCamara() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: this.opcionesVideo(),
      });
    } catch (error) {
      this.error.set(mensajeMedia(error as { name?: string }));
      return;
    }
    if (!this.vivo || this.fase() !== 'camara') {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      return;
    }
    const track = this.stream.getVideoTracks()[0];
    const label = track?.label ?? '';
    const video = document.getElementById('preview') as HTMLVideoElement | null;
    if (video) video.srcObject = this.stream;
    await this.listarCamaras(track?.getSettings().deviceId || '');
    const medidor = document.getElementById('voz-prev');
    if (medidor) this.medir(this.stream, medidor);
    if (esVirtual(label)) {
      await this.api
        .request('/api/intentos/' + this.id + '/marca', {
          method: 'POST',
          body: { tipo: 'virtual', detalle: label },
        })
        .catch(() => undefined);
      this.error.set('Esta cámara parece virtual (' + label + '). Usa la cámara de la computadora.');
      this.stream.getTracks().forEach((item) => item.stop());
      this.stream = null;
      return;
    }
    if (!this.stream.getAudioTracks().length) {
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
      if (video) video.srcObject = nuevo;
      viejos.forEach((item) => item.stop());
      this.camaraId.set(id);
      this.error.set('');
    } catch (error) {
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
    if (cara) cara.srcObject = stream;
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
    const options: MediaRecorderOptions = { videoBitsPerSecond: REGLAS.bitrate };
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
    this.recorder.start(REGLAS.chunkMs);
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
            await this.terminar(data.estado === 'incompleto' ? 'hueco' : 'camara');
          }
          return;
        } catch (error) {
          fallo = error;
          await esperar(400);
        }
      }
      if (!this.finEnCurso) await this.terminar('hueco');
      else throw fallo;
    } finally {
      this.enSubida = false;
    }
  }

  private revelar(data: TrozoDto) {
    this.preguntaVisible = true;
    this.inicio = data.inicio;
    this.minutos = data.minutos;
    this.pregunta.set(data.pregunta ?? '');
    const tick = () => {
      if (this.inicio == null || this.minutos == null) return;
      if (this.minutos <= 0) {
        this.tiempo.set(fmt(Math.max(0, Math.floor(this.api.now() - this.inicio))));
        return;
      }
      const queda = Math.max(0, Math.ceil(this.inicio + this.minutos * 60 - this.api.now()));
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
      if (sala.minutos > 0 && sala.inicio && this.api.now() >= sala.inicio + sala.minutos * 60) {
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

  private medir(stream: MediaStream, root: HTMLElement) {
    this.audioStop();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const bars = Array.from(root.querySelectorAll('i'));
    const fill = root.querySelector('.sonido-fill') as HTMLElement | null;
    let smooth = 0;
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = (data[i]! - 128) / 128;
        sum += value * value;
      }
      const target = Math.min(1, Math.sqrt(sum / data.length) * 7);
      smooth += (target - smooth) * 0.28;
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
      void ctx.close().catch(() => undefined);
    };
  }

  private limpiar() {
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
