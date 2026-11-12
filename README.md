# SiVI

Evaluación oral. El profesor crea la pregunta con su cuenta. El estudiante entra solo a responder.

- http://127.0.0.1:8787/profesor — crear la pregunta y ver los videos de ese código.
- http://127.0.0.1:8787/entrar — responder. Solo pide nombre y código.

## Abrir

```bash
py -3 server.py
```

La interfaz está en Angular, en `client/`. Para volver a generarla después de un cambio:

```bash
cd client
npm run build
```

Los videos de esta versión quedan en `data/videos`, en esta computadora. Cada profesor solo ve los suyos.

## Conectar Google Drive

1. En el proyecto `sivi-derechovirtual` de Google Cloud, habilita Google Drive API.
2. En Google Auth Platform, configura la marca de SiVI y elige el público externo.
   Si la aplicación está en pruebas, añade la cuenta propietaria de Drive
   como usuario de prueba. Google limita a siete días la autorización de Drive
   emitida en ese modo.
3. Crea un cliente OAuth de tipo **Aplicación de escritorio**. Descarga el JSON
   y guárdalo como `data/drive-oauth-client.json`.
4. Desde la raíz del proyecto, instala las dependencias y ejecuta la conexión.

   ```powershell
   py -3 -m pip install -r requirements-drive.txt
   py -3 conectar_drive.py cuenta@example.com
   ```

5. Autoriza con la cuenta propietaria de Drive en el navegador. El script
   crea la carpeta privada **AVIA – Grabaciones** y guarda la autorización en
   `data/drive-connection.json`. Ambos JSON están bajo `data/`, que Git ignora.

Con la conexión configurada, los nuevos segmentos se guardan en Drive y se
reproducen desde el panel del profesor. Los segmentos existentes se siguen leyendo
 desde el disco. El servidor también acepta `AVIA_DRIVE_CONFIG` con la ruta al
archivo de autorización. Guarda ese archivo como secreto al desplegar.

## Publicar con Firebase Spark

- En Apps Script, configura las propiedades `SIVI_OWNER_EMAIL` y
  `SIVI_FIREBASE_KEY` con la cuenta propietaria y la clave web de Firebase.
  Usa los archivos de `apps-script/` para la aplicación web.
- Crea `client/public/sivi-config.json` con el contenido
  `{"api":"https://script.google.com/macros/s/ID_DE_IMPLEMENTACION/exec"}`.
- Ejecuta `npm ci` y `npm run build` desde `client/`. El resultado se genera en
  `web/`. Desde la raíz, publica Hosting con `firebase deploy --only hosting --project sivi-derechovirtual`.
