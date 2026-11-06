import { Component, HostListener, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Panel } from '../api';
import { Marco } from '../marco';
import { Marca } from '../marca';
import { Reproductor } from '../reproductor';
import { fmt, formatoCodigo, hace } from '../texto';

interface Fila {
  id: string | null;
  nombre: string;
  cuando: string;
  codigo: string;
  codigoPlano: string;
  pregunta: string;
  duracion: string;
  segundos: number;
  video: boolean;
  marcas: string[];
  revision: string;
}

interface Grupo {
  codigo: string;
  codigoPlano: string;
  pregunta: string;
  filas: Fila[];
}

@Component({
  selector: 'app-profesor',
  imports: [Marco, Marca, Reproductor],
  template: `
    @if (cargando()) {
      <app-marco inicio="/profesor">
        <p class="kicker">Profesor</p>
        <h1>Un momento</h1>
      </app-marco>
    } @else if (panel(); as datos) {
      <app-marco inicio="/profesor">
        <div acciones>
          <div class="cuenta">
            <p class="quien">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {{ datos.nombre }}
            </p>
            <button class="salir" type="button" (click)="salir()" aria-label="Salir">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        <section class="gestion">
          <h1>Tus preguntas</h1>
          <p class="gestion-texto">Los códigos que creaste y el video de cada respuesta.</p>
          <div class="gestion-barra">
            <button class="crear" type="button" (click)="empezarCreacion()">Crear una pregunta</button>
            <input
              class="filtro"
              type="search"
              placeholder="Nombre o código"
              [value]="filtro()"
              (input)="filtro.set(texto($event))"
            />
          </div>
          @if (!grupos(datos).length) {
            @if (filtro()) {
              <p class="vacio">Nada coincide con la búsqueda.</p>
            } @else {
              <div class="vacio-centro">
                <svg class="vacio-dibujo" viewBox="0 0 320 200" fill="none" aria-hidden="true">
                  <rect x="18" y="28" width="168" height="112" rx="22" stroke="#1a1a1a" stroke-width="2" />
                  <circle cx="102" cy="78" r="26" stroke="#1a1a1a" stroke-width="2" />
                  <circle cx="93" cy="73" r="2.4" fill="#1a1a1a" />
                  <circle cx="111" cy="73" r="2.4" fill="#1a1a1a" />
                  <path d="M92 86c6 7 16 7 22 0" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" />
                  <path stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" d="M28 168v14M44 158v34M60 170v10M76 152v46M92 164v22M108 146v58M124 162v26M140 154v42" />
                  <path fill="#1a1a1a" fill-rule="evenodd" d="M236 36 286 124H186L236 36zm0 28 10 22h-20l10-22z" />
                  <circle cx="248" cy="158" r="18" stroke="#1a1a1a" stroke-width="2" />
                  <circle cx="248" cy="158" r="3.5" fill="#1a1a1a" />
                </svg>
                <p>Todavía no hay preguntas.</p>
              </div>
            }
          }
          @for (grupo of grupos(datos); track grupo.codigoPlano) {
            <section class="grupo">
              <header class="grupo-cabeza">
                <div class="codigo-bloque">
                  <span class="codigo-etiqueta">Código</span>
                  <button class="codigo-copia" type="button" (click)="copiar(grupo.codigoPlano, 'lista')">{{ grupo.codigo }}</button>
                </div>
                <p class="grupo-pregunta">{{ grupo.pregunta }}</p>
                <span class="grupo-cuenta">{{ cuentaGrupo(grupo) }}</span>
                <button class="borrar-fila" type="button" aria-label="Editar pregunta" (click)="empezarEdicion(grupo)">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button class="borrar-fila" type="button" aria-label="Retirar pregunta" (click)="pedirRetirarGrupo(grupo)">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                    <path d="m14.5 12.5-5 5" />
                    <path d="m9.5 12.5 5 5" />
                  </svg>
                </button>
              </header>
              @if (!grupo.filas.length) {
                <p class="vacio-grupo">Cuando alguien responda, el video aparece aquí.</p>
              } @else {
                <div class="tabla">
                  <div class="tabla-cabeza">
                    <span>#</span>
                    <span>Video</span>
                    <span>Estudiante</span>
                    <span>Estado</span>
                    <span>Avisos</span>
                    <span>Duración</span>
                    <span></span>
                  </div>
                  @for (fila of grupo.filas; track fila.id; let n = $index) {
                    <div class="respuesta" [class.quiet]="!fila.video" (click)="abrir(fila)">
                      <span class="num">{{ n + 1 }}</span>
                      <span class="miniatura" [class.espera]="fila.video && !visto(fila.id)">
                        @if (fila.video && fila.id) {
                          <video
                            class="cuadro"
                            muted
                            playsinline
                            preload="metadata"
                            [src]="'/api/intentos/' + fila.id + '/video'"
                            (loadeddata)="cuadro($event, fila.id)"
                          ></video>
                          @if (!visto(fila.id)) {
                            <span class="mini-carga">Cargando</span>
                          }
                        } @else {
                          <svg class="ico tenue" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                            <rect x="2" y="6" width="14" height="12" rx="2" />
                          </svg>
                        }
                      </span>
                      <span>
                        <span class="nombre-fila">{{ fila.nombre }}</span>
                        <small>{{ fila.cuando }}</small>
                      </span>
                      <span class="estado-rev" [class.visto]="fila.revision !== 'nueva'">
                        {{ fila.revision === 'nueva' ? 'Sin ver' : 'Visto' }}
                      </span>
                      <span class="marcas">
                        @for (marca of fila.marcas; track marca) {
                          <span class="etiqueta" [class.grave]="esGrave(marca)">{{ textoMarca(marca) }}</span>
                        } @empty {
                          <span class="sin-dato">—</span>
                        }
                      </span>
                      <span class="col">{{ fila.duracion }}</span>
                      <span class="fila-acciones" (click)="$event.stopPropagation()">
                        @if (fila.video && fila.id) {
                          <button class="borrar-fila" type="button" aria-label="Eliminar video" (click)="pedirBorrar(fila)">
                            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                        }
                      </span>
                    </div>
                  }
                </div>
              }
            </section>
          }
        </section>
        @if (creando()) {
          <div class="velo" (click)="cerrarCreacion()">
            <div class="hoja" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
              <button class="cerrar-hoja" type="button" (click)="cerrarCreacion()" aria-label="Cerrar">
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              @if (codigoNuevo(); as codigo) {
                <h2>Listo para compartir</h2>
                <p class="hoja-ayuda">Pasa el código y el enlace. El estudiante entra y responde en voz.</p>
                <div class="casillas">
                  @for (letra of codigo.split(''); track $index) {
                    <span class="casilla">{{ letra }}</span>
                  }
                </div>
                <button class="generar" type="button" (click)="copiar(codigo, 'codigo')">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  {{ avisoCopia() === 'codigo' ? 'Copiado' : 'Copiar código' }}
                </button>
                <p class="enlace">{{ enlaceEntrar }}</p>
                <button class="generar suave" type="button" (click)="copiar(enlaceEntrar, 'enlace')">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  {{ avisoCopia() === 'enlace' ? 'Copiado' : 'Copiar enlace' }}
                </button>
              } @else if (editando()) {
                <form (submit)="guardarEdicion($event)">
                  <h2>Editar pregunta</h2>
                  <p class="hoja-ayuda">El código sigue igual. Quien entre después ve este texto.</p>
                  @if (errorCrear()) {
                    <p class="fallo">{{ errorCrear() }}</p>
                  }
                  <label class="campo">
                    <span>Pregunta</span>
                    <textarea
                      required
                      [value]="preguntaNueva()"
                      (input)="preguntaNueva.set(texto($event))"
                    ></textarea>
                  </label>
                  <button class="generar" type="submit" [disabled]="enviandoCrear()">Guardar</button>
                </form>
              } @else {
                <form (submit)="generar($event)">
                  <h2>Nueva pregunta</h2>
                  <p class="hoja-ayuda">Una sola pregunta. El video de la cara y la voz es la respuesta.</p>
                  @if (errorCrear()) {
                    <p class="fallo">{{ errorCrear() }}</p>
                  }
                  <label class="campo">
                    <span>Pregunta</span>
                    <textarea
                      required
                      placeholder="La van a responder en voz, con la cámara encendida"
                      [value]="preguntaNueva()"
                      (input)="preguntaNueva.set(texto($event))"
                    ></textarea>
                  </label>
                  <div class="campo">
                    <span>Duración</span>
                    <div class="tiempos">
                      @for (opcion of sugeridos; track opcion.valor) {
                        <button
                          class="tiempo"
                          type="button"
                          [class.activa]="chipActivo(opcion.valor)"
                          (click)="elegirTiempo(opcion.valor)"
                        >
                          {{ opcion.etiqueta }}
                        </button>
                      }
                    </div>
                    <label class="otro-tiempo">
                      <span>Otro</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        inputmode="numeric"
                        placeholder="1–30"
                        [value]="otro()"
                        (input)="alOtro($event)"
                      />
                      <span>min</span>
                    </label>
                  </div>
                  <button class="generar" type="submit" [disabled]="enviandoCrear()">Generar código</button>
                </form>
              }
            </div>
          </div>
        }
        @if (confirmar(); as pedido) {
          <div class="velo" (click)="confirmar.set(null)">
            <div class="hoja" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
              <button class="cerrar-hoja" type="button" (click)="confirmar.set(null)" aria-label="Cerrar">
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <h2>{{ pedido.tipo === 'video' ? 'Eliminar video' : 'Retirar pregunta' }}</h2>
              <p class="hoja-ayuda">
                {{ pedido.tipo === 'video'
                  ? 'Se borra la respuesta de ' + pedido.fila.nombre + '. La pregunta sigue.'
                  : 'Se retira esta pregunta y todos sus videos.' }}
              </p>
              @if (errorBorrar()) {
                <p class="fallo">{{ errorBorrar() }}</p>
              }
              <div class="hoja-acciones">
                <button class="generar suave" type="button" (click)="confirmar.set(null)">Cancelar</button>
                <button class="generar" type="button" (click)="confirmarAccion()">
                  {{ pedido.tipo === 'video' ? 'Eliminar' : 'Retirar' }}
                </button>
              </div>
            </div>
          </div>
        }
        @if (abierto(); as video) {
          <app-reproductor
            [src]="'/api/intentos/' + video.id + '/video'"
            [estimado]="video.segundos"
            [titulo]="video.nombre"
            (cerrar)="cerrar()"
          />
        }
        @for (item of avisos(); track item.id) {
          <div class="aviso-ancla">
            <p class="aviso-flotante" role="status">
              {{ item.texto }}
              @if (item.deshacer) {
                <button class="deshacer" type="button" (click)="deshacer()">Deshacer</button>
              }
            </p>
          </div>
        }
      </app-marco>
    } @else {
      <section class="puerta">
        <div class="puerta-arte">
          <p class="puerta-marca"><app-marca />AVIA</p>
          <svg class="puerta-dibujo" viewBox="0 0 440 420" fill="none" aria-hidden="true">
            <rect x="28" y="36" width="248" height="176" rx="28" stroke="#fff" stroke-width="2" />
            <circle cx="152" cy="112" r="38" stroke="#fff" stroke-width="2" />
            <circle cx="138" cy="104" r="3" fill="#fff" />
            <circle cx="166" cy="104" r="3" fill="#fff" />
            <path d="M136 122c8 10 24 10 32 0" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            <path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M36 268v24M56 252v56M76 274v12M96 242v76M116 262v36M136 232v96M156 258v44M176 246v68M196 272v16M216 254v52M236 266v28" />
            <path fill="#fff" fill-rule="evenodd" d="M338 64 412 196H264L338 64zm0 46 16 36h-32l16-36z" />
            <circle cx="338" cy="292" r="52" stroke="#fff" stroke-width="2" />
            <circle cx="338" cy="292" r="8" fill="#fff" />
            <circle cx="78" cy="372" r="7" fill="#fff" />
            <circle cx="104" cy="388" r="3.5" fill="#fff" opacity=".55" />
            <circle cx="392" cy="360" r="4" fill="#fff" opacity=".7" />
          </svg>
          <p class="puerta-frase">Una pregunta, en voz.</p>
        </div>
        <div class="puerta-lado">
          <p class="puerta-kicker">Para profesores</p>
          <h1>{{ alta() ? 'Crear cuenta' : 'Entrar' }}</h1>
          <p class="lede">
            {{ alta()
              ? 'Cada profesor ve solo sus preguntas y los videos de sus códigos.'
              : 'Aquí se crean las preguntas y se revisan las respuestas.' }}
          </p>
          <form class="form" (submit)="enviar($event)">
            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
            @if (alta()) {
              <label>
                <span>Nombre</span>
                <input name="nombre" autocomplete="name" required [value]="nombre()" (input)="nombre.set(valor($event))" />
              </label>
            }
            <label>
              <span>Usuario</span>
              <input name="usuario" autocomplete="username" required [value]="usuario()" (input)="alUsuario($event)" />
            </label>
            <label>
              <span>Clave</span>
              <input
                name="clave"
                type="password"
                minlength="4"
                required
                [attr.autocomplete]="alta() ? 'new-password' : 'current-password'"
                [value]="clave()"
                (input)="clave.set(valor($event))"
              />
            </label>
            <div class="acciones">
              <button class="btn solid" type="submit" [disabled]="enviando()">
                {{ alta() ? 'Crear cuenta' : 'Entrar' }}
              </button>
              <button class="btn ghost" type="button" (click)="cambiar()">
                {{ alta() ? 'Ya tengo cuenta' : 'Crear cuenta' }}
              </button>
            </div>
          </form>
        </div>
      </section>
    }
  `,
})
export class Profesor implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private timer = 0;

  readonly cargando = signal(true);
  readonly panel = signal<Panel | null>(null);
  readonly alta = signal(false);
  readonly error = signal('');
  readonly enviando = signal(false);
  readonly nombre = signal('');
  readonly usuario = signal('');
  readonly clave = signal('');
  readonly abierto = signal<Fila | null>(null);
  readonly creando = signal(false);
  readonly preguntaNueva = signal('');
  readonly minutosNuevos = signal(5);
  readonly otro = signal('');
  readonly sugeridos = [
    { valor: 3, etiqueta: '3 min' },
    { valor: 5, etiqueta: '5 min' },
    { valor: 10, etiqueta: '10 min' },
    { valor: 0, etiqueta: 'Sin límite' },
  ];
  readonly codigoNuevo = signal<string | null>(null);
  readonly editando = signal<string | null>(null);
  readonly errorCrear = signal('');
  readonly enviandoCrear = signal(false);
  readonly avisoCopia = signal('');
  readonly aviso = signal<{ id: number; texto: string; deshacer: boolean } | null>(null);
  readonly avisos = computed(() => {
    const actual = this.aviso();
    return actual ? [actual] : [];
  });
  readonly ocultos = signal<string[]>([]);
  readonly preguntasOcultas = signal<string[]>([]);
  readonly confirmar = signal<{ tipo: 'video' | 'pregunta'; fila: Fila } | null>(null);
  readonly errorBorrar = signal('');
  readonly enviandoBorrar = signal(false);
  readonly enlaceEntrar = location.origin + '/entrar';
  readonly filtro = signal('');
  readonly posters = signal<Record<string, boolean>>({});
  private chipTimer = 0;
  private borrarTimer = 0;
  private chipId = 0;
  private pendiente: { tipo: 'video' | 'pregunta'; id: string } | null = null;

  constructor() {
    document.body.classList.add('fondo-blanco');
    void this.cargar(true);
    this.timer = window.setInterval(() => {
      if (this.panel()) void this.cargar(false);
    }, 4000);
  }

  ngOnDestroy() {
    document.body.classList.remove('fondo-blanco');
    window.clearInterval(this.timer);
    window.clearTimeout(this.chipTimer);
    if (this.pendiente) void this.cerrarPendiente();
  }

  @HostListener('document:keydown.escape')
  alEscape() {
    if (this.confirmar()) {
      this.confirmar.set(null);
      return;
    }
    if (this.creando()) {
      this.cerrarCreacion();
      return;
    }
    this.cerrar();
  }

  grupos(datos: Panel): Grupo[] {
    const ocultos = new Set(this.ocultos());
    const preguntas = new Set(this.preguntasOcultas());
    const busca = this.filtro().trim().toLocaleLowerCase();
    const grupos: Grupo[] = [];
    for (const examen of datos.examenes) {
      if (preguntas.has(examen.codigo)) continue;
      const filas = examen.intentos
        .filter((intento) => !ocultos.has(intento.id))
        .map((intento) => ({
          id: intento.id,
          nombre: intento.nombre,
          cuando: hace(intento.inicio, this.api.now()),
          codigo: formatoCodigo(examen.codigo),
          codigoPlano: examen.codigo,
          pregunta: examen.pregunta,
          duracion: intento.segundos ? fmt(intento.segundos) : intento.trozos ? fmt(intento.trozos * 4) : '—',
          segundos: intento.segundos || intento.trozos * 4,
          video: intento.trozos > 0 && intento.estado !== 'esperando',
          marcas: intento.marcas ?? [],
          revision: intento.revision || 'nueva',
        }));
      const texto = (examen.codigo + ' ' + formatoCodigo(examen.codigo) + ' ' + examen.pregunta).toLocaleLowerCase();
      const porNombre = filas.filter((fila) => fila.nombre.toLocaleLowerCase().includes(busca));
      if (busca && !texto.includes(busca) && !porNombre.length) continue;
      grupos.push({
        codigo: formatoCodigo(examen.codigo),
        codigoPlano: examen.codigo,
        pregunta: examen.pregunta,
        filas: busca && !texto.includes(busca) ? porNombre : filas,
      });
    }
    return grupos;
  }

  cuentaGrupo(grupo: Grupo) {
    const n = grupo.filas.length;
    if (!n) return 'Sin respuestas';
    return n === 1 ? '1 respuesta' : n + ' respuestas';
  }

  pedirRetirarGrupo(grupo: Grupo) {
    this.pedirRetirar({
      id: null,
      nombre: '',
      cuando: '',
      codigo: grupo.codigo,
      codigoPlano: grupo.codigoPlano,
      pregunta: grupo.pregunta,
      duracion: '',
      segundos: 0,
      video: false,
      marcas: [],
      revision: 'nueva',
    });
  }

  abrir(fila: Fila) {
    if (!fila.video || !fila.id) return;
    this.abierto.set(fila);
    if (fila.revision === 'nueva') void this.ponerRevision(fila, 'vista');
  }

  cerrar() {
    this.abierto.set(null);
  }

  empezarCreacion() {
    this.cerrar();
    this.preguntaNueva.set('');
    this.minutosNuevos.set(5);
    this.otro.set('');
    this.codigoNuevo.set(null);
    this.editando.set(null);
    this.errorCrear.set('');
    this.avisoCopia.set('');
    this.creando.set(true);
  }

  cerrarCreacion() {
    this.creando.set(false);
    this.codigoNuevo.set(null);
    this.editando.set(null);
  }

  empezarEdicion(grupo: Grupo) {
    this.cerrar();
    this.codigoNuevo.set(null);
    this.errorCrear.set('');
    this.preguntaNueva.set(grupo.pregunta);
    this.editando.set(grupo.codigoPlano);
    this.creando.set(true);
  }

  async guardarEdicion(event: Event) {
    event.preventDefault();
    const codigo = this.editando();
    if (!codigo) return;
    this.enviandoCrear.set(true);
    this.errorCrear.set('');
    try {
      await this.api.request('/api/profesor/examenes/' + codigo, {
        method: 'POST',
        body: { pregunta: this.preguntaNueva() },
      });
      this.cerrarCreacion();
      await this.cargar(false);
    } catch (error) {
      this.errorCrear.set(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      this.enviandoCrear.set(false);
    }
  }

  texto(event: Event) {
    return (event.target as HTMLTextAreaElement).value;
  }

  elegirTiempo(valor: number) {
    this.minutosNuevos.set(valor);
    this.otro.set('');
  }

  chipActivo(valor: number) {
    const libre = this.otro();
    if (!libre) return this.minutosNuevos() === valor;
    return Number(libre) === valor;
  }

  alOtro(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    this.otro.set(raw);
    const minutos = Number(raw);
    if (Number.isInteger(minutos) && minutos >= 1 && minutos <= 30) this.minutosNuevos.set(minutos);
  }

  pedirBorrar(fila: Fila) {
    this.cerrar();
    this.cerrarCreacion();
    this.errorBorrar.set('');
    this.confirmar.set({ tipo: 'video', fila });
  }

  pedirRetirar(fila: Fila) {
    this.cerrar();
    this.cerrarCreacion();
    this.errorBorrar.set('');
    this.confirmar.set({ tipo: 'pregunta', fila });
  }

  async confirmarAccion() {
    const pedido = this.confirmar();
    if (!pedido) return;
    this.confirmar.set(null);
    if (this.pendiente) await this.cerrarPendiente();
    if (pedido.tipo === 'video') {
      if (!pedido.fila.id) return;
      this.ocultos.update((ids) => [...ids, pedido.fila.id!]);
      this.pendiente = { tipo: 'video', id: pedido.fila.id };
      this.mostrarAviso('Video eliminado', true);
    } else {
      this.preguntasOcultas.update((codigos) => [...codigos, pedido.fila.codigoPlano]);
      this.pendiente = { tipo: 'pregunta', id: pedido.fila.codigoPlano };
      this.mostrarAviso('Pregunta retirada', true);
    }
    window.clearTimeout(this.borrarTimer);
    this.borrarTimer = window.setTimeout(() => void this.cerrarPendiente(), 5000);
  }

  deshacer() {
    const pendiente = this.pendiente;
    window.clearTimeout(this.borrarTimer);
    this.pendiente = null;
    this.aviso.set(null);
    if (!pendiente) return;
    if (pendiente.tipo === 'video') {
      this.ocultos.update((ids) => ids.filter((id) => id !== pendiente.id));
    } else {
      this.preguntasOcultas.update((codigos) => codigos.filter((codigo) => codigo !== pendiente.id));
    }
  }

  private async cerrarPendiente() {
    const pendiente = this.pendiente;
    this.pendiente = null;
    window.clearTimeout(this.borrarTimer);
    if (this.aviso()?.deshacer) this.aviso.set(null);
    if (!pendiente) return;
    try {
      if (pendiente.tipo === 'video') {
        await this.api.request('/api/profesor/intentos/' + pendiente.id, { method: 'DELETE' });
      } else {
        await this.api.request('/api/profesor/examenes/' + pendiente.id, { method: 'DELETE' });
      }
      await this.cargar(false);
      if (pendiente.tipo === 'video') {
        this.ocultos.update((ids) => ids.filter((id) => id !== pendiente.id));
      } else {
        this.preguntasOcultas.update((codigos) => codigos.filter((codigo) => codigo !== pendiente.id));
      }
    } catch (error) {
      if (pendiente.tipo === 'video') {
        this.ocultos.update((ids) => ids.filter((id) => id !== pendiente.id));
      } else {
        this.preguntasOcultas.update((codigos) => codigos.filter((codigo) => codigo !== pendiente.id));
      }
      this.mostrarAviso(error instanceof Error ? error.message : 'No se pudo eliminar', false);
    }
  }

  textoMarca(marca: string) {
    return (
      {
        tab: 'Salió de la pestaña',
        camara: 'Cámara apagada',
        fullscreen: 'Salió de pantalla',
        virtual: 'Cámara virtual',
        hueco: 'Grabación cortada',
        segunda_pantalla: 'Otra pantalla',
        copiar: 'Copió texto',
        pegar: 'Pegó texto',
        menu: 'Clic derecho',
        silencio: 'Casi no habló',
        imagen: 'Imagen quieta o negra',
      }[marca] ?? marca
    );
  }

  async ponerRevision(fila: Fila, revision: string) {
    if (!fila.id || fila.revision === revision) return;
    this.tocarIntento(fila.id, { revision });
    try {
      await this.api.request('/api/profesor/intentos/' + fila.id + '/ficha', {
        method: 'POST',
        body: { revision },
      });
    } catch {
      this.tocarIntento(fila.id, { revision: fila.revision });
    }
  }

  private tocarIntento(id: string, cambio: { revision?: string }) {
    this.panel.update((panel) => {
      if (!panel) return panel;
      return {
        ...panel,
        examenes: panel.examenes.map((examen) => ({
          ...examen,
          intentos: examen.intentos.map((intento) => (intento.id === id ? { ...intento, ...cambio } : intento)),
        })),
      };
    });
  }

  private mostrarAviso(texto: string, deshacer: boolean) {
    this.chipId += 1;
    this.aviso.set({ id: this.chipId, texto, deshacer });
    if (deshacer) return;
    window.clearTimeout(this.chipTimer);
    const id = this.chipId;
    this.chipTimer = window.setTimeout(() => {
      if (this.aviso()?.id === id) this.aviso.set(null);
    }, 2600);
  }

  visto(id: string | null) {
    return !!id && !!this.posters()[id];
  }

  cuadro(event: Event, id: string) {
    const video = event.target as HTMLVideoElement;
    video.pause();
    const fin = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
    if (fin > 0.4 && !video.dataset['listo']) video.currentTime = Math.min(0.6, fin);
    video.dataset['listo'] = '1';
    this.posters.update((mapa) => ({ ...mapa, [id]: true }));
  }

  esGrave(marca: string) {
    return (
      marca === 'tab' ||
      marca === 'camara' ||
      marca === 'fullscreen' ||
      marca === 'virtual' ||
      marca === 'hueco' ||
      marca === 'copiar' ||
      marca === 'pegar' ||
      marca === 'menu' ||
      marca === 'silencio' ||
      marca === 'imagen'
    );
  }

  async generar(event: Event) {
    event.preventDefault();
    this.enviandoCrear.set(true);
    this.errorCrear.set('');
    try {
      const data = await this.api.request<{ codigo: string }>('/api/profesor/examenes', {
        method: 'POST',
        body: { pregunta: this.preguntaNueva(), minutos: this.minutosNuevos() },
      });
      this.codigoNuevo.set(data.codigo);
      await this.cargar(false);
    } catch (error) {
      this.errorCrear.set(error instanceof Error ? error.message : 'No se pudo crear');
    } finally {
      this.enviandoCrear.set(false);
    }
  }

  async copiar(texto: string, cual: string) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-999px';
      document.body.append(area);
      area.select();
      ok = document.execCommand('copy');
      area.remove();
    }
    if (!ok) return;
    if (cual === 'lista') {
      if (this.pendiente) void this.cerrarPendiente();
      this.mostrarAviso('Código copiado correctamente', false);
      return;
    }
    this.avisoCopia.set(cual);
    window.setTimeout(() => {
      if (this.avisoCopia() === cual) this.avisoCopia.set('');
    }, 1200);
  }

  async cargar(inicial: boolean) {
    if (inicial) this.cargando.set(true);
    try {
      this.panel.set(await this.api.request<Panel>('/api/profesor'));
    } catch {
      if (inicial) this.panel.set(null);
    } finally {
      if (inicial) this.cargando.set(false);
    }
  }

  cambiar() {
    this.alta.update((valor) => !valor);
    this.error.set('');
  }

  valor(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  alUsuario(event: Event) {
    const input = event.target as HTMLInputElement;
    const limpio = input.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    this.usuario.set(limpio);
  }

  async enviar(event: Event) {
    event.preventDefault();
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.api.request(this.alta() ? '/api/cuentas' : '/api/sesion', {
        method: 'POST',
        body: {
          nombre: this.alta() ? this.nombre() : '',
          usuario: this.usuario(),
          clave: this.clave(),
        },
      });
      this.clave.set('');
      await this.cargar(true);
      await this.router.navigateByUrl('/profesor');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo entrar');
    } finally {
      this.enviando.set(false);
    }
  }

  async salir() {
    await this.api.request('/api/salir', { method: 'POST', body: {} }).catch(() => undefined);
    this.panel.set(null);
    await this.router.navigateByUrl('/profesor');
  }
}
