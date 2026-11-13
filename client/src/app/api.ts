import { Injectable } from '@angular/core';

const SESION_WEB = 'avia-sesion-web';

function codificar(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error);
    lector.onload = () => {
      const url = String(lector.result);
      const separador = ';base64,';
      const inicio = url.lastIndexOf(separador);
      if (inicio < 0) {
        reject(new Error('El navegador no pudo preparar el segmento para la subida.'));
        return;
      }
      resolve(url.slice(inicio + separador.length));
    };
    lector.readAsDataURL(blob);
  });
}

export interface Intento {
  id: string;
  nombre: string;
  profesor?: string;
  semestre?: string;
  materia?: string;
  videoEliminado?: boolean;
  estado: string;
  marcas: string[];
  trozos: number;
  inicio: number | null;
  minutos: number;
  dispositivo: string;
  creado: number;
  enviado?: number;
  revision: string;
  segundos: number;
}

export interface Examen {
  codigo: string;
  pregunta: string;
  minutos: number;
  creado: number;
  vence?: number;
  ahora?: number;
  intentos: Intento[];
}

export interface Panel {
  vencimientoCodigos?: boolean;
  nombre: string;
  usuario: string;
  ahora: number;
  examenes: Examen[];
}

export interface SalaDto {
  id: string;
  nombre: string;
  estado: string;
  marcas: string[];
  inicio: number | null;
  minutos: number;
  trozos: number;
  ahora: number;
  pregunta: string | null;
}

export class ErrorApi extends Error {
  constructor(mensaje: string, readonly estado: number) {
    super(mensaje);
  }
}

export function servicioNoDisponible(error: unknown) {
  return (error instanceof ErrorApi && error.estado >= 500) ||
    error instanceof TypeError || error instanceof SyntaxError ||
    (error instanceof DOMException && error.name === 'TimeoutError');
}

export interface TrozoDto {
  ok: boolean;
  estado: string;
  trozos: number;
  inicio: number | null;
  minutos: number;
  ahora: number;
  pregunta: string | null;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private offset = 0;
  private endpoint?: string;

  private async urlWeb(): Promise<string> {
    if (this.endpoint) return this.endpoint;
    const respuesta = await fetch("/sivi-config.json");
    if (!respuesta.ok) throw new ErrorApi('No se pudo conectar con SiVI.', 503);
    const configuracion = await respuesta.json();
    const url = new URL(configuracion.api);
    if (url.origin !== "https://script.google.com" || !url.pathname.endsWith("/exec")) {
      throw new ErrorApi('No se pudo conectar con SiVI.', 503);
    }
    return this.endpoint = url.href;
  }
  readonly enWeb = location.hostname.endsWith('.web.app') || location.hostname.endsWith('.firebaseapp.com');

  private async llamadaWeb<T>(ruta: string, metodo: string, datos: unknown, signal?: AbortSignal): Promise<T> {
    const rutaDocente = ruta.startsWith('/api/profesor') || ruta === '/api/salir' || /\/video(?:\/|$)/.test(ruta);
    const token = rutaDocente ? sessionStorage.getItem(SESION_WEB) || '' : '';
    const respuesta = await fetch(await this.urlWeb(), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ accion: 'api', ruta, metodo, datos, token }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : undefined,
    });
    if (!respuesta.ok) throw new ErrorApi('No se pudo conectar con SiVI.', respuesta.status);
    const resultado = await respuesta.json();
    if (!resultado.ok) {
      const mensaje = resultado.error || 'No se pudo completar la operación.';
      if (mensaje === 'No se pudo completar la operación.') throw new ErrorApi(mensaje, 503);
      throw new Error(mensaje);
    }
    return resultado.datos as T;
  }

  async descargarVideo(
    ruta: string,
    signal: AbortSignal,
    avance: (porcentaje: number) => void,
  ): Promise<Blob> {
    if (!this.enWeb) {
      const respuesta = await fetch(ruta, { credentials: 'same-origin', signal });
      if (!respuesta.ok) throw new Error('No se pudo descargar el video.');
      const datos = await respuesta.blob();
      avance(100);
      return datos;
    }
    const { total, tipo, lote } = await this.llamadaWeb<{ total: number; tipo: string; lote: number }>(
      ruta, 'GET', {}, signal,
    );
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(lote) || lote <= 0) {
      throw new Error('El servidor no devolvió la lista de segmentos.');
    }
    const segmentos: Uint8Array<ArrayBuffer>[] = new Array(total);
    let siguiente = 0;
    let recibidosTotal = 0;
    let preparados = 0;
    const descargar = async () => {
      while (siguiente < total) {
        const indice = siguiente;
        siguiente += lote;
        const { segmentos: recibidos } = await this.llamadaWeb<{ segmentos: string[] }>(
          ruta + '/' + indice, 'GET', {}, signal,
        );
        if (recibidos.length !== Math.min(lote, total - indice)) {
          throw new Error('La descarga del video quedó incompleta.');
        }
        recibidosTotal += recibidos.length;
        avance(Math.floor(50 * (recibidosTotal + preparados) / total));
        // Cede al navegador antes de ensamblar el lote para que pueda pintar el avance.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
        signal.throwIfAborted();
        for (const [desplazamiento, base64] of recibidos.entries()) {
          segmentos[indice + desplazamiento] = Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0));
          preparados += 1;
        }
        avance(Math.floor(50 * (recibidosTotal + preparados) / total));
      }
    };
    await Promise.all([descargar(), descargar(), descargar()]);
    return new Blob(segmentos, { type: tipo });
  }

  now() {
    return Date.now() / 1000 + this.offset;
  }

  async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    if (this.enWeb) {
      const datos = opts.body instanceof Blob
        ? {
            base64: await codificar(opts.body),
            indice: Number(opts.headers?.['X-Chunk-Index']),
            dispositivo: decodeURIComponent(opts.headers?.['X-Device'] || ''),
            tipo: opts.headers?.['X-Tipo'],
          }
        : opts.body;
      try {
        const respuesta = await this.llamadaWeb<T & { ahora?: number; token?: string }>(
          path, opts.method ?? (datos ? 'POST' : 'GET'), datos,
        );
        if (respuesta.token && (path === '/api/sesion' || path === '/api/cuentas')) {
          sessionStorage.setItem(SESION_WEB, respuesta.token);
        }
        if (typeof respuesta.ahora === 'number') this.offset = respuesta.ahora - Date.now() / 1000;
        return respuesta;
      } finally {
        if (path === '/api/salir') sessionStorage.removeItem(SESION_WEB);
      }
    }
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: BodyInit | undefined;
    if (opts.body instanceof Blob) {
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const response = await fetch(path, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'same-origin',
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { error: 'Respuesta inválida' };
      }
    }
    if (!response.ok) {
      throw new ErrorApi(String(data['error'] ?? 'No se pudo completar'), response.status);
    }
    if (typeof data['ahora'] === 'number') {
      this.offset = data['ahora'] - Date.now() / 1000;
    }
    return data as T;
  }
}
