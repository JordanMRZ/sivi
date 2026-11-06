# AVIA

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
