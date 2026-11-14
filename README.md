# SiVI

SiVI permite realizar evaluaciones orales en el navegador. El docente crea una pregunta, genera un código y revisa las respuestas en video desde su panel.

## Uso

- **Estudiantes.** Abre [SiVI](https://sivi.web.app), pega el código, completa los datos de la evaluación y autoriza el tratamiento de datos. Lee las instrucciones y comprueba la cámara y el micrófono antes de empezar. Mantén la ventana abierta hasta que SiVI confirme el guardado.
- **Docentes.** Abre la dirección del panel que te compartieron e inicia sesión. Puedes configurar la duración de la respuesta y el vencimiento del código, editar preguntas y revisar los videos en cuadrícula o lista.

Las grabaciones se usan para la evaluación. Después de 20 días calendario dejan de estar disponibles en el panel y la limpieza diaria las mueve a la papelera de Drive. El registro del intento permanece disponible.

## Desarrollo local

Desde PowerShell, instala las dependencias de Angular y genera la interfaz en `web/`:

```powershell
cd client
npm ci
npm run build
cd ..
py -3 server.py
```

Abre la dirección que indica el servidor, normalmente `http://127.0.0.1:8787`. Para abrir el panel docente local, usa la ruta definida en [ruta-docente.ts](client/src/app/ruta-docente.ts).

El servidor local guarda sus datos en `data/`. Si quieres conectarlo a Drive, instala `requirements-drive.txt`, guarda el JSON de un cliente OAuth de escritorio como `data/drive-oauth-client.json` y ejecuta `py -3 conectar_drive.py cuenta@example.com` con la cuenta propietaria. Los videos existentes en disco siguen disponibles en la instancia local.

## Despliegue web con Firebase Spark

Firebase Hosting sirve el cliente Angular. Firebase Authentication gestiona las cuentas docentes. Apps Script ejecuta la API y guarda los datos de evaluación y los segmentos de video en una carpeta privada de Drive.

1. Habilita **Correo electrónico/contraseña** en Firebase Authentication.
2. Copia [Code.gs](apps-script/Code.gs) y [Api.gs](apps-script/Api.gs) al proyecto de Apps Script. En las propiedades del script, configura `SIVI_OWNER_EMAIL` con el correo propietario y `SIVI_FIREBASE_KEY` con la clave web de Firebase.
3. Crea en **Mi unidad** la carpeta **AVIA – Grabaciones** si aún no existe. Desde el editor de Apps Script, ejecuta `prepararAVIA` para preparar el almacenamiento y `activarRetencionAVIA` para instalar la limpieza diaria.
4. Implementa Apps Script como aplicación web, ejecutada por la cuenta propietaria y accesible para cualquier persona. Al actualizarla, edita la implementación existente para conservar su URL.
5. Crea `client/public/sivi-config.json` con la URL del despliegue:

   ```json
   {
     "api": "https://script.google.com/macros/s/ID_DE_IMPLEMENTACION/exec"
   }
   ```

6. Compila desde `client/` con `npm ci` y `npm run build`. Desde la raíz del repositorio, publica en el proyecto de Firebase con `firebase deploy --only hosting --project sivi-derechovirtual`.

La ruta docente poco común reduce los accesos casuales. La autenticación protege el panel y la API comprueba que el docente sea dueño de la evaluación antes de entregar los videos. Las sesiones docentes duran ocho horas. El propietario puede ejecutar `revocarSesionesDocentes` desde Apps Script para cerrar todas las sesiones.

Git excluye `data/`, `web/` y la configuración local `sivi-config.json`. Mantén los archivos de autorización de Drive en la configuración local.
