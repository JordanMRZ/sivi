export function formatoCodigo(codigo: string) {
  return codigo.slice(0, 4) + ' ' + codigo.slice(4);
}

export function fmt(total: number) {
  const seguro = Math.max(0, total);
  const minutos = String(Math.floor(seguro / 60)).padStart(2, '0');
  const segundos = String(seguro % 60).padStart(2, '0');
  return minutos + ':' + segundos;
}

export function hace(ts: number | null, ahora: number) {
  if (!ts) return 'todavía no graba';
  const delta = Math.max(0, ahora - ts);
  if (delta < 60) return 'hace unos segundos';
  if (delta < 3600) return 'hace ' + Math.floor(delta / 60) + ' min';
  return new Date(ts * 1000).toLocaleString('es');
}

export function etiquetaEstado(estado: string) {
  return (
    {
      esperando: 'Abrió el código',
      grabando: 'Grabando',
      completo: 'Entregado',
      sospechoso: 'Para revisar',
      incompleto: 'Incompleto',
    }[estado] ?? estado
  );
}

export function etiquetaMarca(marca: string) {
  return (
    {
      tab: 'Cambió de pestaña',
      camara: 'Apagó la cámara',
      fullscreen: 'Salió de pantalla completa',
      virtual: 'Cámara virtual',
      hueco: 'Se cortó la subida',
      segunda_pantalla: 'Posible segunda pantalla',
      copiar: 'Copió texto',
      pegar: 'Pegó texto',
      menu: 'Clic derecho',
      silencio: 'Casi no habló',
      imagen: 'Imagen quieta o negra',
    }[marca] ?? marca
  );
}

export function mensajeCorte(tipo: string) {
  return (
    {
      tab: 'La pregunta se cerró porque saliste de la pestaña.',
      camara: 'La pregunta se cerró porque se apagó la cámara.',
      fullscreen: 'La pregunta se cerró porque saliste de pantalla completa.',
      virtual: 'La cámara parece virtual.',
      hueco: 'Se cortó la grabación y la pregunta se cerró.',
      tiempo: 'Se acabó el tiempo.',
      ok: 'Listo. El video quedó guardado.',
    }[tipo] ?? 'La pregunta se cerró.'
  );
}

export function mensajeMedia(error: { name?: string } | null) {
  if (!navigator.mediaDevices) return 'Abre esta página desde el servidor del examen.';
  if (!error || error.name === 'NotAllowedError') return 'Hay que permitir la cámara y el micrófono.';
  if (error.name === 'NotFoundError') return 'No encontré cámara o micrófono.';
  if (error.name === 'NotReadableError') return 'La cámara está en uso en otra aplicación.';
  return 'No se pudo abrir la cámara. Revisa el permiso y vuelve a intentar.';
}

export function esVirtual(label: string) {
  return /virtual|obs|manycam|splitcam|xsplit|droidcam|iriun|epoccam|webcamoid|snap camera|mmhmm/i.test(
    label || '',
  );
}

export function elegirMime() {
  const tipos = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
  return tipos.find((tipo) => window.MediaRecorder && MediaRecorder.isTypeSupported(tipo)) ?? '';
}

export function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const BARRAS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const REGLAS = {
  chunkMs: 4000,
  bitrate: 350000,
  ocultarMs: 400,
};
