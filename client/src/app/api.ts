import { Injectable } from '@angular/core';

export interface Intento {
  id: string;
  nombre: string;
  estado: string;
  marcas: string[];
  trozos: number;
  inicio: number | null;
  minutos: number;
  dispositivo: string;
  creado: number;
  revision: string;
  segundos: number;
}

export interface Examen {
  codigo: string;
  pregunta: string;
  minutos: number;
  creado: number;
  ahora?: number;
  intentos: Intento[];
}

export interface Panel {
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

  now() {
    return Date.now() / 1000 + this.offset;
  }

  async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
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
      throw new Error(String(data['error'] ?? 'No se pudo completar'));
    }
    if (typeof data['ahora'] === 'number') {
      this.offset = data['ahora'] - Date.now() / 1000;
    }
    return data as T;
  }
}
