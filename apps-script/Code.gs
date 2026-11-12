const CARPETA_AVIA = 'AVIA – Grabaciones';
function aviaCuentaPropietaria() {
  const correo = PropertiesService.getScriptProperties().getProperty("SIVI_OWNER_EMAIL");
  if (!correo) throw new Error("Configura SIVI_OWNER_EMAIL en las propiedades del script.");
  return correo.toLowerCase();
}
const BYTES_PRUEBA = 41 * 1000 * 1000;
const BYTES_SEGMENTO = 512 * 1024;

function doPost(e) {
  let respuesta = { ok: false, error: 'Solicitud inválida' };
  try {
    const datos = JSON.parse(e.postData.contents);
    if (datos.accion === 'ping') respuesta = { ok: true, servicio: 'AVIA', api: 6 };
    else if (datos.accion === 'api') respuesta = { ok: true, datos: aviaApi(datos) };
  } catch (error) {
    if (!error.avia) console.error('AVIA: ' + error.message);
    respuesta = { ok: false, error: error.avia ? error.message : 'No se pudo completar la operación.' };
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

function probarDriveAVIA() {
  const correo = Session.getEffectiveUser().getEmail();
  if (correo.toLowerCase() !== aviaCuentaPropietaria()) {
    throw new Error('Ejecuta la prueba con ' + aviaCuentaPropietaria());
  }
  const carpetas = DriveApp.getRootFolder().getFoldersByName(CARPETA_AVIA);
  if (!carpetas.hasNext()) throw new Error('No encontré ' + CARPETA_AVIA + ' en Mi unidad.');
  const carpeta = carpetas.next();
  if (carpetas.hasNext()) throw new Error('Hay más de una carpeta con el nombre ' + CARPETA_AVIA);

  const temporal = carpeta.createFolder('Prueba AVIA ' + Utilities.getUuid());
  const inicio = Date.now();
  const segmentos = [];
  try {
    for (let escritos = 0; escritos < BYTES_PRUEBA; escritos += BYTES_SEGMENTO) {
      const longitud = Math.min(BYTES_SEGMENTO, BYTES_PRUEBA - escritos);
      const datos = new Array(longitud).fill(segmentos.length);
      const blob = Utilities.newBlob(datos, 'application/octet-stream', 'segmento-' + segmentos.length);
      segmentos.push({ archivo: temporal.createFile(blob), longitud });
    }
    const segundosEscritura = (Date.now() - inicio) / 1000;
    const inicioLectura = Date.now();
    segmentos.forEach(({ archivo, longitud }, indice) => {
      const datos = archivo.getBlob().getBytes();
      if (datos.length !== longitud || datos[0] !== indice || datos[longitud - 1] !== indice) {
        throw new Error('El segmento ' + indice + ' no coincide con la prueba.');
      }
    });
    console.log(
      'AVIA OK: ' + BYTES_PRUEBA + ' bytes, ' + segmentos.length + ' segmentos, ' +
      segundosEscritura + ' s de escritura y ' + (Date.now() - inicioLectura) / 1000 + ' s de lectura.'
    );
  } finally {
    temporal.setTrashed(true);
  }
}
