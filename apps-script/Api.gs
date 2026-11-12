const AVIA_CODIGOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AVIA_LOTE_VIDEO = 4;
const AVIA_MARGEN_CIERRE = 120;
const AVIA_MARGEN_SUBIDA = 60;
const AVIA_RETENCION_VIDEO = 20 * 86400;
const AVIA_GRAVES = ['tab', 'camara', 'fullscreen', 'virtual', 'hueco'];
const AVIA_MARCAS = [...AVIA_GRAVES, 'segunda_pantalla', 'copiar', 'pegar', 'menu', 'silencio', 'imagen'];

// Ejecutar una vez desde el editor con la cuenta propietaria de Drive.
function prepararAVIA() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== aviaCuentaPropietaria()) {
    throw new Error('Ejecuta esta función con ' + aviaCuentaPropietaria());
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('AVIA_ESTADO')) return;
    const carpetas = DriveApp.getRootFolder().getFoldersByName(CARPETA_AVIA);
    if (!carpetas.hasNext()) throw new Error('No se encontró la carpeta de grabaciones.');
    const carpeta = carpetas.next();
    if (carpetas.hasNext()) throw new Error('Hay varias carpetas con ese nombre.');
    const estado = carpeta.createFile('avia-estado-web.json', JSON.stringify({
      profesores: {}, sesiones: {}, examenes: {}, intentos: {},
    }), MimeType.PLAIN_TEXT);
    props.setProperties({ AVIA_ESTADO: estado.getId(), AVIA_CARPETA: carpeta.getId() });
    console.log('AVIA lista para la implementación web.');
  } finally {
    lock.releaseLock();
  }
}

// Ejecutar una vez desde el editor para activar la limpieza diaria.
function activarRetencionAVIA() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== aviaCuentaPropietaria()) {
    throw new Error('Ejecuta esta función con ' + aviaCuentaPropietaria());
  }
  limpiarGrabacionesAVIA();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'limpiarGrabacionesAVIA')) {
    ScriptApp.newTrigger('limpiarGrabacionesAVIA').timeBased().everyDays(1).create();
  }
  console.log('AVIA: limpieza diaria de grabaciones activada.');
}

function aviaVideoVencido(intento, ahora) {
  const enviado = intento.enviado || intento.ultimoTrozo;
  return Boolean(enviado && ahora >= enviado + AVIA_RETENCION_VIDEO);
}

function limpiarGrabacionesAVIA() {
  const estadoId = PropertiesService.getScriptProperties().getProperty('AVIA_ESTADO');
  if (!estadoId) throw new Error('La API todavía no está configurada.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const archivo = DriveApp.getFileById(estadoId);
    const db = JSON.parse(archivo.getBlob().getDataAsString('UTF-8'));
    const ahora = Date.now() / 1000;
    for (const intento of Object.values(db.intentos)) {
      if (!intento.archivos.length || !aviaVideoVencido(intento, ahora)) continue;
      try {
        if (intento.carpeta) DriveApp.getFolderById(intento.carpeta).setTrashed(true);
        intento.videoEliminado = true;
        intento.archivos = [];
        delete intento.carpeta;
        archivo.setContent(JSON.stringify(db));
      } catch (error) {
        console.error('AVIA: no se pudo retirar una grabación vencida: ' + error.message);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function aviaFallar(mensaje) {
  const error = new Error(mensaje);
  error.avia = true;
  throw error;
}

function aviaToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function aviaTexto(valor, min, max, mensaje) {
  const texto = String(valor || '').trim();
  if (texto.length < min || texto.length > max) aviaFallar(mensaje);
  return texto;
}

function aviaIdentidad(ruta, datos) {
  const alta = ruta === '/api/cuentas';
  const email = aviaTexto(datos.usuario, 5, 254, 'Escribe tu correo.').toLowerCase();
  const password = String(datos.clave || '');
  if (password.length < 6 || password.length > 128) aviaFallar('La contraseña debe tener entre 6 y 128 caracteres.');
  const nombre = alta ? aviaTexto(datos.nombre, 2, 60, 'Escribe tu nombre.') : '';
  const claveFirebase = PropertiesService.getScriptProperties().getProperty("SIVI_FIREBASE_KEY");
  if (!claveFirebase) aviaFallar("La autenticación de SiVI todavía no está configurada.");
  const accion = alta ? 'signUp' : 'signInWithPassword';
  const respuesta = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:' + accion + '?key=' + encodeURIComponent(claveFirebase),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ email, password, returnSecureToken: true }),
      muteHttpExceptions: true,
    }
  );
  if (respuesta.getResponseCode() !== 200) {
    const codigo = JSON.parse(respuesta.getContentText()).error?.message;
    if (codigo === 'EMAIL_EXISTS') aviaFallar('Ese correo ya tiene cuenta.');
    if (codigo === 'OPERATION_NOT_ALLOWED') aviaFallar('El acceso por correo aún no está habilitado.');
    aviaFallar(alta ? 'No se pudo crear la cuenta. Revisa el correo y la contraseña.' : 'Correo o contraseña incorrectos.');
  }
  const cuenta = JSON.parse(respuesta.getContentText());
  return { id: cuenta.localId, usuario: email, nombre };
}

function aviaEvaluar(intento, ahora) {
  const limite = intento.minutos && intento.inicio ? intento.inicio + intento.minutos * 60 : null;
  if (intento.marcas.some(marca => marca !== 'hueco' && AVIA_GRAVES.includes(marca))) {
    intento.estado = 'sospechoso';
  } else if (intento.marcas.includes('hueco')) {
    intento.estado = 'incompleto';
  } else if (intento.estado === 'grabando' && ahora - intento.ultimoTrozo > AVIA_MARGEN_SUBIDA &&
    (limite === null || ahora < limite || intento.ultimoTrozo < limite - AVIA_MARGEN_SUBIDA)) {
    intento.marcas.push('hueco');
    intento.estado = 'incompleto';
  } else if (intento.estado === 'grabando' && limite !== null && ahora > limite + AVIA_MARGEN_CIERRE) {
    intento.estado = 'completo';
  }
}

function aviaFicha(intento, ahora) {
  const { archivos, carpeta, nombreKey, ultimoTrozo, codigo, contenedor, cerrado, enviado, ...ficha } = intento;
  const videoEliminado = Boolean(intento.videoEliminado || (archivos.length && aviaVideoVencido(intento, ahora)));
  return {
    ...ficha,
    videoEliminado,
    trozos: videoEliminado ? 0 : archivos.length,
    segundos: Math.max(0, Math.round((ultimoTrozo || 0) - (intento.inicio || 0))),
  };
}

function aviaSala(intento, examen, ahora) {
  const ficha = aviaFicha(intento, ahora);
  const vigente = !intento.minutos || ahora <= intento.inicio + intento.minutos * 60;
  return {
    id: ficha.id, nombre: ficha.nombre, estado: ficha.estado, marcas: ficha.marcas,
    inicio: ficha.inicio, minutos: ficha.minutos, trozos: ficha.trozos, ahora,
    pregunta: ficha.estado === 'grabando' && ficha.trozos && vigente ? examen.pregunta : null,
  };
}

function aviaApi(solicitud) {
  const ruta = String(solicitud.ruta || '');
  const metodo = solicitud.metodo;
  const datos = solicitud.datos || {};
  const partes = ruta.split('/').slice(2);
  const identidad = metodo === 'POST' && ['/api/cuentas', '/api/sesion'].includes(ruta)
    ? aviaIdentidad(ruta, datos) : null;
  const props = PropertiesService.getScriptProperties();
  const estadoId = props.getProperty('AVIA_ESTADO');
  if (!estadoId) aviaFallar('La API todavía no está configurada.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let lectura;
  try {
    const archivo = DriveApp.getFileById(estadoId);
    const db = JSON.parse(archivo.getBlob().getDataAsString('UTF-8'));
    const ahora = Date.now() / 1000;
    const guardar = (resultado) => {
      archivo.setContent(JSON.stringify(db));
      return resultado;
    };
    if (identidad) {
      let profesor = db.profesores[identidad.id];
      if (!profesor) {
        profesor = {
          nombre: identidad.nombre || identidad.usuario.split('@')[0],
          usuario: identidad.usuario,
        };
        db.profesores[identidad.id] = profesor;
      }
      for (const [token, sesion] of Object.entries(db.sesiones)) {
        if (sesion.vence <= ahora) delete db.sesiones[token];
      }
      const token = aviaToken();
      db.sesiones[token] = { id: identidad.id, vence: ahora + 30 * 86400 };
      return guardar({ token, ...profesor });
    }
    const token = String(solicitud.token || '');
    const sesion = /^[a-f0-9]{64}$/.test(token) ? db.sesiones[token] : null;
    if (ruta === '/api/salir' && metodo === 'POST') {
      if (sesion) {
        delete db.sesiones[token];
        return guardar({ ok: true });
      }
      return { ok: true };
    }
    const profesorId = sesion && sesion.vence > ahora ? sesion.id : null;
    if (partes[0] === 'profesor') {
      if (!profesorId) aviaFallar('Entra con tu cuenta.');
      if (ruta === '/api/profesor' && metodo === 'GET') {
        const examenes = Object.values(db.examenes)
          .filter(examen => examen.profesorId === profesorId)
          .sort((a, b) => b.creado - a.creado)
          .map(({ profesorId, ...examen }) => ({
            ...examen,
            intentos: Object.values(db.intentos).filter(i => i.codigo === examen.codigo)
              .sort((a, b) => (b.inicio || b.creado) - (a.inicio || a.creado))
              .map(i => { aviaEvaluar(i, ahora); return aviaFicha(i, ahora); }),
          }));
        return { ...db.profesores[profesorId], ahora, examenes };
      }
      if (partes[1] === 'examenes') {
        if (ruta === '/api/profesor/examenes' && metodo === 'POST') {
          const pregunta = aviaTexto(datos.pregunta, 4, 2000, 'Escribe la pregunta.');
          const minutos = Number(datos.minutos ?? 5);
          if (!Number.isInteger(minutos) || minutos < 0 || minutos > 30) aviaFallar('Minutos inválidos.');
          let codigo;
          do {
            codigo = Array.from({ length: 8 }, () => AVIA_CODIGOS[Math.floor(Math.random() * AVIA_CODIGOS.length)]).join('');
          } while (db.examenes[codigo]);
          db.examenes[codigo] = { codigo, pregunta, minutos, profesorId, creado: ahora };
          return guardar({ codigo, minutos });
        }
        const examen = db.examenes[String(partes[2] || '').toUpperCase()];
        if (!examen || examen.profesorId !== profesorId) aviaFallar('No está esa pregunta.');
        if (metodo === 'POST' && partes.length === 3) {
          examen.pregunta = aviaTexto(datos.pregunta, 4, 2000, 'Escribe la pregunta.');
          return guardar({ ok: true, pregunta: examen.pregunta });
        }
        if (metodo === 'DELETE' && partes.length === 3) {
          for (const intento of Object.values(db.intentos).filter(i => i.codigo === examen.codigo)) {
            if (intento.carpeta) DriveApp.getFolderById(intento.carpeta).setTrashed(true);
            delete db.intentos[intento.id];
          }
          delete db.examenes[examen.codigo];
          return guardar({ ok: true });
        }
      }
      if (partes[1] === 'intentos') {
        const intento = db.intentos[partes[2]];
        if (!intento || db.examenes[intento.codigo]?.profesorId !== profesorId) aviaFallar('No está ese intento.');
        if (metodo === 'DELETE' && partes.length === 3) {
          if (intento.carpeta) DriveApp.getFolderById(intento.carpeta).setTrashed(true);
          delete db.intentos[intento.id];
          return guardar({ ok: true });
        }
        if (metodo === 'POST' && partes[3] === 'ficha') {
          if (!['nueva', 'vista', 'lista'].includes(datos.revision)) aviaFallar('Revisión inválida.');
          intento.revision = datos.revision;
          return guardar({ ok: true, revision: intento.revision });
        }
      }
    }
    if (ruta === '/api/intentos' && metodo === 'POST') {
      const codigo = String(datos.codigo || '').trim().toUpperCase();
      const nombre = aviaTexto(datos.nombre, 2, 60, 'Escribe tu nombre.');
      const examen = db.examenes[codigo];
      if (!examen || !/^[A-Z0-9]{8}$/.test(codigo)) aviaFallar('Ese código no existe.');
      const contexto = {};
      if (['profesor', 'semestre', 'materia'].some(campo => campo in datos)) {
        contexto.profesor = aviaTexto(datos.profesor, 2, 100, 'Escribe el nombre del profesor.');
        contexto.semestre = aviaTexto(datos.semestre, 1, 40, 'Escribe el semestre.');
        contexto.materia = aviaTexto(datos.materia, 2, 100, 'Escribe la materia.');
      }
      const nombreKey = nombre.toLowerCase();
      let intento = Object.values(db.intentos).find(i =>
        i.codigo === codigo && i.nombreKey === nombreKey &&
        !(i.estado === 'incompleto' && !i.archivos.length && !i.videoEliminado)
      );
      if (intento) {
        const respuesta = { id: intento.id, estado: intento.estado, nombre, minutos: intento.minutos, ahora };
        if (intento.estado === 'esperando' && !intento.profesor && contexto.profesor) {
          Object.assign(intento, contexto);
          return guardar(respuesta);
        }
        return respuesta;
      }
      const id = aviaToken();
      intento = {
        id, codigo, nombre, nombreKey, minutos: examen.minutos, estado: 'esperando',
        ...contexto,
        marcas: [], archivos: [], inicio: null, ultimoTrozo: null,
        dispositivo: '', creado: ahora, revision: 'nueva',
      };
      db.intentos[id] = intento;
      return guardar({ id, estado: intento.estado, nombre, minutos: intento.minutos, ahora });
    }
    if (partes[0] !== 'intentos' || !/^[a-f0-9]{64}$/.test(partes[1] || '')) aviaFallar('No está.');
    const intento = db.intentos[partes[1]];
    const examen = intento && db.examenes[intento.codigo];
    if (!examen) aviaFallar('No está ese intento.');
    aviaEvaluar(intento, ahora);
    if (metodo === 'GET' && partes[2] === 'sala') return aviaSala(intento, examen, ahora);
    if (metodo === 'POST' && partes[2] === 'marca') {
      if (!AVIA_MARCAS.includes(datos.tipo)) aviaFallar('Marca inválida.');
      if (!intento.marcas.includes(datos.tipo)) intento.marcas.push(datos.tipo);
      if (!intento.dispositivo && datos.detalle) intento.dispositivo = String(datos.detalle).slice(0, 120);
      aviaEvaluar(intento, ahora);
      return guardar({ ok: true, estado: intento.estado });
    }
    if (metodo === 'POST' && partes[2] === 'cerrar') {
      if (intento.estado === 'grabando') intento.estado = 'completo';
      if (intento.estado === 'esperando') intento.estado = 'incompleto';
      intento.cerrado = true;
      if (intento.archivos.length && !intento.enviado) intento.enviado = ahora;
      return guardar({ ok: true, estado: intento.estado });
    }
    if (metodo === 'POST' && partes[2] === 'trozo') {
      if (intento.videoEliminado || aviaVideoVencido(intento, ahora)) aviaFallar('La grabación venció.');
      const indice = datos.indice;
      if (!Number.isInteger(indice) || indice < 0 || indice > 1000) aviaFallar('Trozo inválido.');
      if (indice === intento.archivos.length - 1) return { ok: true, ...aviaSala(intento, examen, ahora) };
      if (indice !== intento.archivos.length) aviaFallar('El video llegó fuera de orden.');
      if (intento.cerrado) aviaFallar('El servidor ya confirmó el cierre del intento.');
      if (intento.estado === 'incompleto') aviaFallar('El servidor dejó de recibir segmentos a tiempo.');
      if (intento.estado === 'sospechoso') aviaFallar('El intento se cerró por un aviso de supervisión.');
      if (!['esperando', 'grabando'].includes(intento.estado)) aviaFallar('Venció el plazo para guardar los últimos segmentos.');
      if (typeof datos.base64 !== 'string' || !datos.base64 || datos.base64.length > 11200000) aviaFallar('Trozo inválido.');
      let bytes;
      try {
        bytes = Utilities.base64Decode(datos.base64);
      } catch (error) {
        console.error('AVIA: error de decodificación: ' + error.message);
        aviaFallar('El segmento llegó en un formato inválido.');
      }
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) aviaFallar('Trozo inválido.');
      const tipo = intento.contenedor || (datos.tipo === 'mp4' ? 'mp4' : 'webm');
      const nombre = String(indice).padStart(4, '0') + '.' + tipo;
      try {
        if (!intento.carpeta) {
          const raiz = DriveApp.getFolderById(props.getProperty('AVIA_CARPETA'));
          const previas = raiz.getFoldersByName(intento.id);
          intento.carpeta = (previas.hasNext() ? previas.next() : raiz.createFolder(intento.id)).getId();
        }
        const carpeta = DriveApp.getFolderById(intento.carpeta);
        const previos = carpeta.getFilesByName(nombre);
        const segmento = previos.hasNext() ? previos.next() : carpeta.createFile(
          Utilities.newBlob(bytes, 'video/' + tipo, nombre)
        );
        intento.archivos.push(segmento.getId());
      } catch (error) {
        console.error('AVIA: error de escritura de segmento en Drive: ' + error.message);
        aviaFallar('Drive no pudo guardar el segmento.');
      }
      intento.contenedor = tipo;
      intento.ultimoTrozo = ahora;
      if (!intento.dispositivo && datos.dispositivo) intento.dispositivo = String(datos.dispositivo).slice(0, 120);
      if (intento.estado === 'esperando') {
        intento.estado = 'grabando';
        intento.inicio = ahora;
      }
      try {
        return guardar({ ok: true, ...aviaSala(intento, examen, ahora) });
      } catch (error) {
        console.error('AVIA: error al confirmar el segmento: ' + error.message);
        aviaFallar('Drive recibió el segmento, pero no se pudo confirmar el avance.');
      }
    }
    if (metodo !== 'GET' || partes[2] !== 'video' || !profesorId || examen.profesorId !== profesorId) {
      aviaFallar('No está ese video.');
    }
    if (intento.videoEliminado || aviaVideoVencido(intento, ahora)) aviaFallar('La grabación venció.');
    if (!intento.archivos.length) aviaFallar('Todavía no hay video.');
    if (partes.length === 3) return {
      total: intento.archivos.length, tipo: 'video/' + intento.contenedor, lote: AVIA_LOTE_VIDEO,
    };
    const indice = Number(partes[3]);
    if (!Number.isInteger(indice) || indice < 0 || indice >= intento.archivos.length) aviaFallar('No está ese segmento.');
    lectura = intento.archivos.slice(indice, indice + AVIA_LOTE_VIDEO);
  } finally {
    lock.releaseLock();
  }
  return {
    segmentos: lectura.map(id => Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes())),
  };
}
