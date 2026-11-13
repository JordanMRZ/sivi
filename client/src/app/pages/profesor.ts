import { Component, HostListener, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Panel, servicioNoDisponible } from '../api';
import { EstadoPagina } from '../estado-pagina';
import { Marco } from '../marco';
import { Marca } from '../marca';
import { Reproductor } from '../reproductor';
import { RUTA_DOCENTE } from '../ruta-docente';
import { esperar, fmt, formatoCodigo, hace } from '../texto';

interface Fila {
  id: string | null;
  nombre: string;
  profesor?: string;
  semestre?: string;
  materia?: string;
  cuando: string;
  fecha?: number;
  codigo: string;
  codigoPlano: string;
  pregunta: string;
  duracion: string;
  segundos: number;
  video: boolean;
  marcas: string[];
  revision: string;
}

interface DescargaVideo {
  control: AbortController;
  progreso?: number;
  url?: string;
  error?: boolean;
}

interface Grupo {
  codigo: string;
  codigoPlano: string;
  pregunta: string;
  minutos: number;
  vence?: number;
  filas: Fila[];
}

@Component({
  selector: 'app-profesor',
  imports: [Marco, Marca, Reproductor, EstadoPagina],
  styleUrl: './profesor.css',
  template: `
    @if (cargando()) {
      <div class="sala-carga" role="status" aria-label="Cargando el panel del profesor">
        <app-marca variante="carga" />
      </div>
    } @else if (errorPanel()) {
      <app-estado-pagina [codigo]="503" titulo="No se pudo cargar el panel"
        mensaje="Revisa tu conexión e inténtalo de nuevo." accion="Reintentar" (actuar)="cargar(true)" />
    } @else if (panel(); as datos) {
      <app-marco [inicio]="rutaDocente">
        <div acciones>
          <div class="cuenta-docente">
            <span class="avatar" aria-hidden="true">{{ iniciales(datos.nombre) }}</span>
            <span class="cuenta-texto">
              <strong>{{ datos.nombre }}</strong>
              <small>Docente</small>
            </span>
            <button class="cuenta-salir" type="button" (click)="salir()" aria-label="Salir" title="Salir">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        @let resumen = estadisticas();
        <div class="panel-docente">
        <header class="panel-encabezado">
          <div>
            <p class="panel-kicker">Panel docente</p>
            <h1>Hola, {{ primerNombre(datos.nombre) }}</h1>
            <p class="panel-sub">Crea preguntas, comparte el código y revisa cada respuesta en video.</p>
          </div>
          <button class="panel-crear" type="button" (click)="empezarCreacion()">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Crear pregunta
          </button>
        </header>
        <section class="panel-kpis" aria-label="Resumen">
          <article class="kpi">
            <span class="kpi-icono">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
            </span>
            <div>
              <p>Preguntas</p>
              <strong>{{ resumen.preguntas }}</strong>
              <small>{{ resumen.activas === 1 ? '1 activa' : resumen.activas + ' activas' }}</small>
            </div>
          </article>
          <article class="kpi">
            <span class="kpi-icono">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
            </span>
            <div>
              <p>Respuestas</p>
              <strong>{{ resumen.respuestas }}</strong>
              <small>{{ resumen.conVideo === 1 ? '1 con video' : resumen.conVideo + ' con video' }}</small>
            </div>
          </article>
          <article class="kpi" [class.kpi-atencion]="resumen.sinVer > 0">
            <span class="kpi-icono">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
            </span>
            <div>
              <p>Sin revisar</p>
              <strong>{{ resumen.sinVer }}</strong>
              <small>{{ resumen.sinVer ? 'Pendientes de ver' : 'Todo al día' }}</small>
            </div>
          </article>
          <article class="kpi" [class.kpi-alerta]="resumen.alertas > 0">
            <span class="kpi-icono">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            </span>
            <div>
              <p>Con avisos</p>
              <strong>{{ resumen.alertas }}</strong>
              <small>{{ resumen.alertas ? 'Revisa estos intentos' : 'Sin avisos graves' }}</small>
            </div>
          </article>
        </section>
        <section class="gestion preguntas-panel">
          @let grupos = gruposVisibles();
          @let grupo = grupoActivo();
          <aside class="preguntas-columna" aria-label="Mis preguntas">
            <div class="columna-cabeza">
              <h2>Mis preguntas</h2>
              <span class="contador">{{ grupos.length }}</span>
            </div>
            <label class="buscador">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="search" aria-label="Buscar preguntas por código o contenido"
                placeholder="Buscar código o pregunta" [value]="filtro()" (input)="filtro.set(texto($event))" />
            </label>
            <div class="preguntas-listado">
              @for (item of grupos; track item.codigoPlano) {
                @let nuevos = sinVer(item);
                <div class="pregunta-item" [class.seleccionada]="grupo?.codigoPlano === item.codigoPlano">
                  <button type="button" class="pregunta-seleccion" (click)="seleccionarPregunta(item.codigoPlano)"
                    [attr.aria-pressed]="grupo?.codigoPlano === item.codigoPlano">
                    <span class="pregunta-codigo">
                      <strong>{{ item.codigo }}</strong>
                      @if (vencido(item)) {
                        <em class="insignia gris">Vencido</em>
                      } @else if (nuevos) {
                        <em class="insignia">{{ nuevos }} sin ver</em>
                      }
                    </span>
                    <span class="pregunta-texto">{{ item.pregunta }}</span>
                    <span class="pregunta-pie">
                      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
                      {{ cuentaGrupo(item) }}
                      <i aria-hidden="true">·</i>
                      {{ item.minutos ? item.minutos + ' min' : 'Sin límite' }}
                    </span>
                  </button>
                  <button class="pregunta-menu-boton" type="button" aria-label="Acciones de la pregunta"
                    [attr.popovertarget]="'acciones-' + item.codigoPlano"
                    (click)="ubicarMenu($event, acciones)">···</button>
                  <div #acciones class="pregunta-menu-flotante" [id]="'acciones-' + item.codigoPlano" popover>
                    <button type="button" (click)="acciones.hidePopover(); empezarEdicion(item)">Editar pregunta</button>
                    <button type="button" (click)="acciones.hidePopover(); copiar(item.codigoPlano, 'lista')">Copiar código</button>
                    <button type="button" (click)="acciones.hidePopover(); pedirRetirarGrupo(item)">Retirar pregunta</button>
                  </div>
                </div>
              } @empty {
                <div class="lista-vacia">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
                  <p>{{ filtro() ? 'No hay coincidencias.' : 'Todavía no hay preguntas.' }}</p>
                  @if (!filtro()) {
                    <button type="button" (click)="empezarCreacion()">Crear la primera</button>
                  }
                </div>
              }
            </div>
          </aside>
          <div class="preguntas-detalle">
            @if (grupo) {
              @let nuevosGrupo = sinVer(grupo);
              <header class="pregunta-detalle-cabecera">
                <div class="detalle-titulo">
                  <span class="detalle-etiqueta">Código</span>
                  <div class="detalle-codigo">
                    <h2>{{ grupo.codigo }}</h2>
                    <span class="estado-codigo" [class.vencido]="vencido(grupo)">{{ vencido(grupo) ? 'Vencido' : 'Activo' }}</span>
                  </div>
                </div>
                <div class="pregunta-acciones">
                  <button type="button" class="accion" (click)="empezarEdicion(grupo)">
                    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
                    Editar
                  </button>
                  <button type="button" class="accion" (click)="copiar(grupo.codigoPlano, 'lista')">
                    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                    Copiar código
                  </button>
                  <button type="button" class="accion principal" (click)="copiar(enlaceEntrar, 'lista')">
                    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    Copiar enlace
                  </button>
                </div>
              </header>
              <div class="pregunta-completa">
                <span class="detalle-etiqueta">Pregunta</span>
                <p>{{ grupo.pregunta }}</p>
              </div>
              <div class="pregunta-metadatos">
                <span>
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  {{ grupo.minutos ? 'Hasta ' + grupo.minutos + ' min' : 'Sin límite de tiempo' }}
                </span>
                @if (grupo.vence) {
                  <span [class.dato-vencido]="vencido(grupo)">
                    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                    {{ vencido(grupo) ? 'Venció el ' : 'Vence el ' }}{{ fechaCompleta(grupo.vence) }}
                  </span>
                }
                <span>
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  {{ cuentaGrupo(grupo) }}
                </span>
                @if (nuevosGrupo) {
                  <span class="dato-nuevo">{{ nuevosGrupo }} sin ver</span>
                }
              </div>
              <header class="videos-cabecera">
                <h3>Respuestas</h3>
                <span>{{ filasVisibles().length }} de {{ grupo.filas.length }}</span>
              </header>
              <div class="respuestas-filtros">
                <label class="buscador">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  <input type="search" aria-label="Buscar estudiante" placeholder="Buscar estudiante"
                    [value]="filtroEstudiante()" (input)="filtroEstudiante.set(texto($event))" />
                </label>
                <div class="segmentos" role="group" aria-label="Estado de visualización">
                  <button type="button" [attr.aria-pressed]="estadoFiltro() === 'todos'" (click)="estadoFiltro.set('todos')">Todas</button>
                  <button type="button" [attr.aria-pressed]="estadoFiltro() === 'nuevos'" (click)="estadoFiltro.set('nuevos')">Sin ver</button>
                  <button type="button" [attr.aria-pressed]="estadoFiltro() === 'vistos'" (click)="estadoFiltro.set('vistos')">Vistas</button>
                </div>
                <select aria-label="Orden de respuestas" [value]="orden()" (change)="orden.set(valor($event))">
                  <option value="recientes">Más recientes</option><option value="antiguos">Más antiguos</option>
                </select>
                  <div class="panel-vistas" aria-label="Vista de videos">
                    <button type="button" aria-label="Cuadrícula" [attr.aria-pressed]="vista() === 'cuadricula'" (click)="vista.set('cuadricula')">
                      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    </button>
                    <button type="button" aria-label="Lista" [attr.aria-pressed]="vista() === 'lista'" (click)="vista.set('lista')">
                      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                    </button>
                  </div>
              </div>
              <div class="respuestas-layout" [class.respuestas-lista]="vista() === 'lista'">
                @for (fila of filasVisibles(); track fila.id) {
                  @let descarga = fila.id ? descargas()[fila.id] : undefined;
                  @let url = descarga?.url || (!enWeb && fila.video ? '/api/intentos/' + fila.id + '/video' : '');
                  <article class="respuesta-item" [class.respuesta-reproducible]="!!url" (click)="url && abrir(fila)">
                      <div class="respuesta-media">
                        @if (url) {
                          <video muted playsinline preload="auto" [src]="url" (loadeddata)="cuadro($event)"></video>
                          <button type="button" class="respuesta-play" [attr.aria-label]="'Reproducir video de ' + fila.nombre">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z" /></svg>
                          </button>
                          <span class="respuesta-tiempo">{{ fila.duracion }}</span>
                        } @else if (fila.video && !descarga?.error) {
                          <div class="respuesta-descarga">
                            <span>{{ descarga ? 'Descargando el video' : 'En espera de descarga' }}</span>
                            @if (descarga) {
                              <div class="descarga-pista" role="progressbar" aria-label="Descargando el video"
                                [class.indeterminada]="descarga.progreso === undefined" [attr.aria-valuenow]="descarga.progreso ?? null">
                                <span [style.width.%]="descarga.progreso ?? 0"></span>
                              </div>
                              @if (descarga.progreso !== undefined) { <small>{{ descarga.progreso }}%</small> }
                            }
                          </div>
                        } @else if (descarga?.error) {
                          <button type="button" class="descarga-boton" (click)="abrir(fila)">Reintentar descarga</button>
                        } @else {
                          <span class="respuesta-sin-video">
                            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>
                            Sin grabación disponible
                          </span>
                        }
                      </div>
                    <div class="respuesta-detalle">
                      <div class="respuesta-persona">
                        <span class="avatar" aria-hidden="true">{{ iniciales(fila.nombre) }}</span>
                        <div>
                          <h3>{{ fila.nombre }}</h3>
                          <p>{{ fila.fecha ? fechaCompleta(fila.fecha) : fila.cuando }}</p>
                        </div>
                      </div>
                      @if (fila.materia || fila.semestre || fila.profesor) {
                        <p class="respuesta-curso">
                          {{ fila.materia }}@if (fila.materia && fila.semestre) { · }@if (fila.semestre) { Sem. {{ fila.semestre }} }@if (fila.profesor && (fila.materia || fila.semestre)) { · }@if (fila.profesor) { Prof. {{ fila.profesor }} }
                        </p>
                      }
                      <div class="respuesta-etiquetas">
                        <span class="estado-rev" [class.visto]="fila.revision !== 'nueva'">{{ fila.revision === 'nueva' ? 'Sin ver' : 'Visto' }}</span>
                        @for (marca of fila.marcas; track marca) {
                          <span class="etiqueta" [class.grave]="esGrave(marca)">{{ textoMarca(marca) }}</span>
                        }
                      </div>
                    </div>
                    <details class="panel-menu respuesta-menu" (click)="$event.stopPropagation()">
                      <summary [attr.aria-label]="'Acciones de ' + fila.nombre">···</summary>
                      <div>
                        <button type="button" (click)="cerrarMenu($event); pedirBorrar(fila)">Eliminar intento</button>
                      </div>
                    </details>
                  </article>
                } @empty {
                  <div class="respuestas-vacio">
                    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
                    <strong>{{ grupo.filas.length ? 'Nada coincide con los filtros' : 'Todavía no hay respuestas' }}</strong>
                    <p>{{ grupo.filas.length ? 'Prueba con otro nombre o cambia el estado.' : 'Comparte el código o el enlace. Cuando alguien responda, el video aparece aquí.' }}</p>
                  </div>
                }
              </div>
            } @else {
              <div class="detalle-vacio">
                <span class="kpi-icono">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </span>
                @if (filtro()) {
                  <h2>Ninguna pregunta coincide</h2>
                  <p>Revisa el código o busca otra palabra de la pregunta.</p>
                } @else {
                  <h2>Crea tu primera pregunta</h2>
                  <p>Escribe la pregunta, elige el tiempo y comparte el código con tus estudiantes.</p>
                  <button class="panel-crear" type="button" (click)="empezarCreacion()">Crear pregunta</button>
                }
              </div>
            }
          </div>
        </section>
        </div>
        @if (creando()) {
          <div class="velo" (click)="cerrarCreacion()">
            <div class="hoja docente-modal" role="dialog" aria-modal="true" aria-labelledby="docente-modal-titulo" (click)="$event.stopPropagation()">
              <button class="cerrar-hoja" type="button" (click)="cerrarCreacion()" aria-label="Cerrar">
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              @if (codigoNuevo(); as codigo) {
                <header class="docente-modal-cabecera">
                  <h2 id="docente-modal-titulo">Código listo para compartir</h2>
                  <p class="hoja-ayuda">Comparte el código y el enlace de acceso con tus estudiantes.</p>
                </header>
                <div class="docente-codigo">
                  <span>Código de la evaluación</span>
                  <strong>{{ codigo.slice(0, 4) }} {{ codigo.slice(4) }}</strong>
                </div>
                <p class="docente-enlace">{{ enlaceEntrar }}</p>
                <div class="docente-modal-acciones">
                <button class="generar" type="button" (click)="copiar(codigo, 'codigo')">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  {{ avisoCopia() === 'codigo' ? 'Copiado' : 'Copiar código' }}
                </button>
                <button class="generar suave" type="button" (click)="copiar(enlaceEntrar, 'enlace')">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  {{ avisoCopia() === 'enlace' ? 'Copiado' : 'Copiar enlace' }}
                </button>
                </div>
              } @else if (editando()) {
                <form (submit)="guardarEdicion($event)">
                  <h2 id="docente-modal-titulo">Editar pregunta</h2>
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
                  <header class="docente-modal-cabecera">
                    <h2 id="docente-modal-titulo">Nueva pregunta</h2>
                  </header>
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
                  <div class="docente-configuracion">
                  <div class="campo">
                    <span>Duración máxima</span>
                    <div class="tiempos">
                      @for (opcion of sugeridos; track opcion.valor) {
                        <button
                          class="tiempo"
                          type="button"
                          [class.activa]="chipActivo(opcion.valor)"
                          [attr.aria-pressed]="chipActivo(opcion.valor)"
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
                  @if (panel()?.vencimientoCodigos) {
                    <div class="docente-vigencia">
                    <label class="panel-vencimiento">
                      <input type="checkbox" [checked]="activarVencimiento()" (change)="cambiarVencimiento($event)" />
                      Activar vencimiento del código
                    </label>
                    @if (activarVencimiento()) {
                      <div class="docente-vigencia-tiempo">
                        <label class="campo">
                          <span>Tiempo activo</span>
                          <input type="number" min="1" [max]="unidadVencimiento() === 'dias' ? 365 : 8760" step="1" required
                            [value]="cantidadVencimiento()" (input)="cantidadVencimiento.set(valor($event))" />
                        </label>
                        <label class="campo">
                          <span>Unidad</span>
                          <select [value]="unidadVencimiento()" (change)="unidadVencimiento.set(valor($event))">
                            <option value="dias">Días</option><option value="horas">Horas</option>
                          </select>
                        </label>
                      </div>
                    }
                    </div>
                  }
                  </div>
                  <div class="docente-modal-acciones">
                    <button class="generar suave" type="button" (click)="cerrarCreacion()" [disabled]="enviandoCrear()">Cancelar</button>
                    <button class="generar" type="submit" [disabled]="enviandoCrear()">{{ enviandoCrear() ? 'Creando…' : 'Generar código' }}</button>
                  </div>
                </form>
              }
            </div>
          </div>
        }
        @if (confirmar(); as pedido) {
          <div class="velo" (click)="confirmar.set(null)">
            <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-retirar" (click)="$event.stopPropagation()">
              <button class="cerrar-hoja" type="button" (click)="confirmar.set(null)" aria-label="Cerrar">
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <h2 id="titulo-retirar">{{ pedido.tipo === 'video' ? 'Eliminar intento' : '¿Retirar esta pregunta?' }}</h2>
              <p class="hoja-ayuda">
                {{ pedido.tipo === 'video'
                  ? 'Se borra la respuesta de ' + pedido.fila.nombre + '. La pregunta sigue.'
                  : 'Se borrarán la pregunta, todos los intentos y sus videos. Esta acción no se puede deshacer desde SiVI.' }}
              </p>
              @if (errorBorrar()) {
                <p class="fallo">{{ errorBorrar() }}</p>
              }
              <div class="hoja-acciones">
                <button class="generar suave" type="button" (click)="confirmar.set(null)">Cancelar</button>
                <button class="generar" type="button" [disabled]="enviandoBorrar()" (click)="confirmarAccion()">
                  {{ pedido.tipo === 'video' ? 'Eliminar' : 'Sí, retirar y borrar' }}
                </button>
              </div>
            </div>
          </div>
        }
        @if (abierto(); as video) {
          <app-reproductor
            [src]="'/api/intentos/' + video.id + '/video'"
            [archivoLocal]="video.id ? descargas()[video.id]?.url ?? null : null"
            [estimado]="video.segundos"
            [titulo]="video.nombre"
            (cerrar)="cerrar()"
          />
        }
        @if (enviandoBorrar()) {
          <div class="aviso-ancla">
            <p class="aviso-flotante" role="status">
              <span class="aviso-carga" aria-hidden="true"></span>
              Eliminando los videos…
            </p>
          </div>
        } @else {
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
        }
      </app-marco>
    } @else {
      <main class="puerta acceso-docente">
        <app-marca variante="contorno" />
        <section class="acceso-docente-contenido" aria-labelledby="acceso-docente-titulo">
          <header class="acceso-docente-cabecera">
          <h1 id="acceso-docente-titulo">{{ alta() ? 'Crear cuenta docente' : 'Acceso docente' }}</h1>
          <p>
            {{ alta()
              ? 'Regístrate para crear evaluaciones y revisar las respuestas de tus estudiantes.'
              : 'Inicia sesión para gestionar tus preguntas y revisar las respuestas.' }}
          </p>
          </header>
          <form class="acceso-docente-form" (submit)="enviar($event)">
            @if (error()) {
              <p class="acceso-docente-error" role="alert">{{ error() }}</p>
            }
            @if (alta()) {
              <label>
                <span>Nombre</span>
                <input name="nombre" autocomplete="name" placeholder="Nombre completo" required [value]="nombre()" (input)="nombre.set(valor($event))" />
              </label>
            }
            <label>
              <span>{{ enWeb ? 'Correo' : 'Usuario' }}</span>
              <input name="usuario" [type]="enWeb ? 'email' : 'text'" autocomplete="username"
                [placeholder]="enWeb ? 'nombre@ejemplo.com' : 'Tu usuario'" required [value]="usuario()" (input)="alUsuario($event)" />
            </label>
            <label>
              <span>Contraseña</span>
              <input
                name="clave"
                type="password"
                [attr.minlength]="enWeb ? 6 : 4"
                required
                [placeholder]="alta() ? (enWeb ? 'Mínimo 6 caracteres' : 'Mínimo 4 caracteres') : 'Tu contraseña'"
                [attr.autocomplete]="alta() ? 'new-password' : 'current-password'"
                [value]="clave()"
                (input)="clave.set(valor($event))"
              />
            </label>
            <button class="btn solid" type="submit" [disabled]="enviando()" [attr.aria-busy]="enviando()">
              @if (enviando()) {
                <span class="aviso-carga" aria-hidden="true"></span>
                {{ alta() ? 'Creando cuenta…' : 'Entrando…' }}
              } @else {
                {{ alta() ? 'Crear cuenta' : 'Entrar' }}
              }
            </button>
          </form>
          <div class="acceso-docente-alternar">
            <span>{{ alta() ? '¿Ya tienes cuenta?' : '¿Es tu primera vez?' }}</span>
            <button type="button" (click)="cambiar()" [disabled]="enviando()">
              {{ alta() ? 'Iniciar sesión' : 'Crear cuenta' }}
            </button>
          </div>
        </section>
      </main>
    }
  `,
})
export class Profesor implements OnDestroy {
  private readonly api = inject(Api);
  readonly enWeb = this.api.enWeb;
  private readonly router = inject(Router);
  private timer = 0;

  readonly cargando = signal(true);
  readonly errorPanel = signal(false);
  readonly panel = signal<Panel | null>(null);
  readonly alta = signal(false);
  readonly error = signal('');
  readonly enviando = signal(false);
  readonly nombre = signal('');
  readonly usuario = signal('');
  readonly clave = signal('');
  readonly abierto = signal<Fila | null>(null);
  readonly descargas = signal<Record<string, DescargaVideo>>({});
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
  readonly rutaDocente = '/' + RUTA_DOCENTE;
  readonly filtro = signal('');
  readonly filtroEstudiante = signal('');
  readonly estadoFiltro = signal('todos');
  readonly orden = signal('recientes');
  readonly vista = signal<'cuadricula' | 'lista'>('cuadricula');
  readonly seleccion = signal<string | null>(null);
  readonly activarVencimiento = signal(false);
  readonly cantidadVencimiento = signal('1');
  readonly unidadVencimiento = signal('dias');
  readonly gruposVisibles = computed(() => {
    const panel = this.panel();
    return panel ? this.grupos(panel) : [];
  });
  readonly grupoActivo = computed(() =>
    this.gruposVisibles().find(grupo => grupo.codigoPlano === this.seleccion()) ?? this.gruposVisibles()[0],
  );
  readonly filasVisibles = computed(() => {
    const busca = this.filtroEstudiante().trim().toLocaleLowerCase();
    const estado = this.estadoFiltro();
    const direccion = this.orden() === 'antiguos' ? 1 : -1;
    return (this.grupoActivo()?.filas ?? [])
      .filter(fila => fila.nombre.toLocaleLowerCase().includes(busca) &&
        (estado === 'todos' || (estado === 'nuevos') === (fila.revision === 'nueva')))
      .sort((a, b) => direccion * ((a.fecha ?? 0) - (b.fecha ?? 0)));
  });
  private chipTimer = 0;
  private borrarTimer = 0;
  private chipId = 0;
  private descargandoCola = false;
  private destruido = false;
  private versionPanel = 0;
  private pendiente: { tipo: 'video' | 'pregunta'; id: string } | null = null;

  constructor() {
    document.body.classList.add('fondo-blanco');
    void this.cargar(true);
    this.timer = window.setInterval(() => {
      if (this.panel()) void this.cargar(false);
    }, this.enWeb ? 10000 : 4000);
  }


  ngOnDestroy() {
    this.destruido = true;
    this.limpiarDescargas();
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
          profesor: intento.profesor,
          semestre: intento.semestre,
          materia: intento.materia,
          cuando: hace(intento.inicio, this.api.now()),
          fecha: intento.enviado ?? intento.inicio ?? intento.creado,
          codigo: formatoCodigo(examen.codigo),
          codigoPlano: examen.codigo,
          pregunta: examen.pregunta,
          duracion: intento.segundos ? fmt(intento.segundos) : intento.trozos ? fmt(intento.trozos * 4) : '—',
          segundos: intento.segundos || intento.trozos * 4,
          video: intento.trozos > 0 && intento.estado !== 'esperando' &&
            (!this.enWeb || intento.estado !== 'grabando'),
          marcas: intento.videoEliminado
            ? [...(intento.marcas ?? []), 'video_vencido']
            : intento.estado === 'incompleto' && !intento.trozos
            ? [...(intento.marcas ?? []), 'sin_grabacion']
            : intento.marcas ?? [],
          revision: intento.revision || 'nueva',
        }));
      const texto = (examen.codigo + ' ' + formatoCodigo(examen.codigo) + ' ' + examen.pregunta).toLocaleLowerCase();
      if (busca && !texto.includes(busca)) continue;
      grupos.push({
        codigo: formatoCodigo(examen.codigo),
        codigoPlano: examen.codigo,
        pregunta: examen.pregunta,
        minutos: examen.minutos,
        vence: examen.vence,
        filas,
      });
    }
    return grupos;
  }

  readonly estadisticas = computed(() => {
    const ocultos = new Set(this.ocultos());
    const preguntas = new Set(this.preguntasOcultas());
    const examenes = (this.panel()?.examenes ?? []).filter((examen) => !preguntas.has(examen.codigo));
    const intentos = examenes.flatMap((examen) => examen.intentos).filter((intento) => !ocultos.has(intento.id));
    const ahora = this.api.now();
    return {
      preguntas: examenes.length,
      activas: examenes.filter((examen) => !examen.vence || examen.vence > ahora).length,
      respuestas: intentos.length,
      conVideo: intentos.filter((intento) => intento.trozos > 0 && !intento.videoEliminado).length,
      sinVer: intentos.filter((intento) => (intento.revision || 'nueva') === 'nueva').length,
      alertas: intentos.filter((intento) => (intento.marcas ?? []).some((marca) => this.esGrave(marca))).length,
    };
  });

  sinVer(grupo: Grupo) {
    return grupo.filas.filter((fila) => fila.revision === 'nueva').length;
  }

  vencido(grupo: Grupo) {
    return !!grupo.vence && grupo.vence <= this.api.now();
  }

  primerNombre(nombre: string) {
    return nombre.trim().split(/\s+/)[0] || 'docente';
  }

  iniciales(nombre: string) {
    const partes = nombre.trim().split(/\s+/).filter(Boolean);
    const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? '?').slice(0, 2);
    return letras.toLocaleUpperCase();
  }

  cuentaGrupo(grupo: Grupo) {
    const n = grupo.filas.length;
    if (!n) return 'Sin respuestas';
    return n === 1 ? '1 respuesta' : n + ' respuestas';
  }

  seleccionarPregunta(codigo: string) {
    this.seleccion.set(codigo);
    this.filtroEstudiante.set('');
    this.estadoFiltro.set('todos');
  }

  cerrarMenu(event: Event) {
    (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
  }

  ubicarMenu(event: Event, menu: HTMLElement) {
    const boton = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ancho = 184;
    const debajo = boton.bottom + 4;
    menu.style.left = Math.max(8, Math.min(innerWidth - ancho - 8, boton.right - ancho)) + 'px';
    menu.style.top = debajo + 126 <= innerHeight ? debajo + 'px' : 'auto';
    menu.style.bottom = debajo + 126 <= innerHeight ? 'auto' : Math.max(8, innerHeight - boton.top + 4) + 'px';
  }

  fechaCompleta(segundos: number) {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
      .format(new Date(segundos * 1000));
  }

  apiAhora() {
    return this.api.now();
  }

  cambiarVencimiento(event: Event) {
    this.activarVencimiento.set((event.target as HTMLInputElement).checked);
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
    if (this.enWeb && !this.descargas()[fila.id]?.url) {
      if (!this.descargas()[fila.id] || this.descargas()[fila.id].error) {
        void this.descargarEnPanel(fila.id);
      }
      return;
    }
    this.abierto.set(fila);
    if (fila.revision === 'nueva') void this.ponerRevision(fila, 'vista');
  }

  private async descargarEnPanel(id: string) {
    const control = new AbortController();
    const actualizar = (descarga: DescargaVideo) =>
      this.descargas.update((mapa) => ({ ...mapa, [id]: descarga }));
    actualizar({ control });
    try {
      const datos = await this.api.descargarVideo('/api/intentos/' + id + '/video', control.signal, (progreso) => {
        if (!control.signal.aborted) actualizar({ control, progreso });
      });
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 640));
      }
      if (!control.signal.aborted) actualizar({ control, url: URL.createObjectURL(datos) });
    } catch {
      if (!control.signal.aborted) {
        control.abort();
        actualizar({ control, error: true });
      }
    }
  }

  private async descargarPendientes() {
    if (!this.enWeb || this.descargandoCola || this.destruido) return;
    this.descargandoCola = true;
    try {
      while (!this.destruido) {
        const intentos = this.panel()?.examenes.flatMap((examen) => examen.intentos) ?? [];
        const siguiente = intentos.find((intento) =>
          intento.trozos > 0 && !['esperando', 'grabando'].includes(intento.estado) &&
          !this.descargas()[intento.id],
        );
        if (!siguiente) return;
        await this.descargarEnPanel(siguiente.id);
      }
    } finally {
      this.descargandoCola = false;
    }
  }

  private limpiarDescargas(ids = Object.keys(this.descargas())) {
    const mapa = { ...this.descargas() };
    for (const id of ids) {
      const descarga = mapa[id];
      if (!descarga) continue;
      descarga.control.abort();
      if (descarga.url) URL.revokeObjectURL(descarga.url);
      delete mapa[id];
    }
    this.descargas.set(mapa);
  }

  cerrar() {
    this.abierto.set(null);
  }

  empezarCreacion() {
    this.cerrar();
    this.preguntaNueva.set('');
    this.minutosNuevos.set(5);
    this.activarVencimiento.set(false);
    this.cantidadVencimiento.set('1');
    this.unidadVencimiento.set('dias');
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
    if (!pedido || this.enviandoBorrar()) return;
    this.confirmar.set(null);
    if (this.pendiente) await this.cerrarPendiente();
    if (pedido.tipo === 'video') {
      if (!pedido.fila.id) return;
      this.ocultos.update((ids) => [...ids, pedido.fila.id!]);
      this.pendiente = { tipo: 'video', id: pedido.fila.id };
      this.mostrarAviso('Intento eliminado', true);
    } else {
      this.preguntasOcultas.update((codigos) => [...codigos, pedido.fila.codigoPlano]);
      this.pendiente = { tipo: 'pregunta', id: pedido.fila.codigoPlano };
      await this.cerrarPendiente();
      return;
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
    if (pendiente.tipo === 'pregunta') this.enviandoBorrar.set(true);
    try {
      if (pendiente.tipo === 'video') {
        await this.api.request('/api/profesor/intentos/' + pendiente.id, { method: 'DELETE' });
      } else {
        await this.api.request('/api/profesor/examenes/' + pendiente.id, { method: 'DELETE' });
        this.panel.update(panel => panel && {
          ...panel,
          examenes: panel.examenes.filter(examen => examen.codigo !== pendiente.id),
        });
      }
      await this.cargar(false);
      if (pendiente.tipo === 'video') {
        this.ocultos.update((ids) => ids.filter((id) => id !== pendiente.id));
      } else {
        this.preguntasOcultas.update((codigos) => codigos.filter((codigo) => codigo !== pendiente.id));
        this.mostrarAviso('Pregunta y videos eliminados', false);
      }
    } catch (error) {
      if (pendiente.tipo === 'video') {
        this.ocultos.update((ids) => ids.filter((id) => id !== pendiente.id));
      } else {
        this.preguntasOcultas.update((codigos) => codigos.filter((codigo) => codigo !== pendiente.id));
      }
      this.mostrarAviso(error instanceof Error ? error.message : 'No se pudo eliminar', false);
    } finally {
      if (pendiente.tipo === 'pregunta') this.enviandoBorrar.set(false);
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
        sin_grabacion: 'Sin grabación · puede reintentar',
        video_vencido: 'Grabación vencida',
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

  cuadro(event: Event) {
    const video = event.target as HTMLVideoElement;
    video.pause();
    const fin = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
    if (fin > 0.4 && !video.dataset['listo']) video.currentTime = Math.min(0.6, fin);
    video.dataset['listo'] = '1';
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
    if (this.enviandoCrear()) return;
    this.enviandoCrear.set(true);
    this.errorCrear.set('');
    try {
      const data = await this.api.request<{ codigo: string }>('/api/profesor/examenes', {
        method: 'POST',
        body: {
          pregunta: this.preguntaNueva(), minutos: this.minutosNuevos(),
          ...(this.panel()?.vencimientoCodigos && this.activarVencimiento()
            ? { vigenciaHoras: Number(this.cantidadVencimiento()) * (this.unidadVencimiento() === 'dias' ? 24 : 1) } : {}),
        },
      });
      this.codigoNuevo.set(data.codigo);
      this.filtro.set('');
      this.seleccionarPregunta(data.codigo);
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
    const version = this.versionPanel;
    if (inicial) {
      this.cargando.set(true);
      this.errorPanel.set(false);
    }
    try {
      const mostrarTrazo = inicial && this.enviando() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const [panel] = await Promise.all([
        this.api.request<Panel>('/api/profesor'),
        esperar(mostrarTrazo ? 1100 : 0),
      ]);
      if (this.destruido || version !== this.versionPanel) return;
      const vigentes = new Set(panel.examenes.flatMap((examen) =>
        examen.intentos.filter((intento) => !intento.videoEliminado).map((intento) => intento.id)
      ));
      const retirados = Object.keys(this.descargas()).filter((id) => !vigentes.has(id));
      const abierto = this.abierto()?.id;
      if (abierto && retirados.includes(abierto)) this.cerrar();
      if (retirados.length) this.limpiarDescargas(retirados);
      this.panel.set(panel);
      void this.descargarPendientes();
    } catch (error) {
      if (inicial) {
        this.panel.set(null);
        this.errorPanel.set(servicioNoDisponible(error));
      }
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
    const limpio = this.enWeb ? input.value : input.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    this.usuario.set(limpio);
  }

  async enviar(event: Event) {
    event.preventDefault();
    if (this.enviando()) return;
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
      await this.router.navigateByUrl(this.rutaDocente);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo entrar');
    } finally {
      this.enviando.set(false);
    }
  }

  async salir() {
    this.versionPanel += 1;
    this.cerrar();
    this.panel.set(null);
    this.limpiarDescargas();
    await this.api.request('/api/salir', { method: 'POST', body: {} }).catch(() => undefined);
    await this.router.navigateByUrl(this.rutaDocente);
  }
}
