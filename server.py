import json
import struct
import os
import re
import secrets
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

from drive_videos import DriveVideos

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
DATA = os.path.join(ROOT, "data")
VIDEOS = os.path.join(DATA, "videos")
DB_PATH = os.path.join(DATA, "db.json")
DRIVE_CONFIG = os.environ.get("AVIA_DRIVE_CONFIG") or os.path.join(DATA, "drive-connection.json")
FIRESTORE_DOC = os.environ.get("AVIA_FIRESTORE_DOC")
CLOUD_PORT = os.environ.get("PORT")
SESSION_COOKIE = "__session" if CLOUD_PORT else "sesion"
_firestore = None

GAP_SECONDS = 25
CHUNK_MAX = 8 * 1024 * 1024
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
USER_RE = re.compile(r"^[a-z0-9]{3,20}$")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
GRAVES = {"tab", "camara", "fullscreen", "virtual"}
MARCAS_OK = GRAVES | {"hueco", "segunda_pantalla", "copiar", "pegar", "menu", "silencio", "imagen"}
LOCK = threading.Lock()

EXT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webp": "image/webp",
}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def now():
    return time.time()


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


class CloudDatabase(dict):
    def __init__(self, snapshot):
        super().__init__(snapshot.to_dict() or {})
        self.snapshot = snapshot


def cloud_document():
    global _firestore
    if _firestore is None:
        from google.cloud import firestore

        _firestore = firestore.Client()
    return _firestore.document(FIRESTORE_DOC)


def load_db():
    db = CloudDatabase(cloud_document().get()) if FIRESTORE_DOC else read_json(DB_PATH, {})
    db.setdefault("examenes", [])
    db.setdefault("intentos", [])
    db.setdefault("profesores", [])
    db.setdefault("sesiones", [])
    return db


def save_db(db):
    if FIRESTORE_DOC:
        from google.api_core.exceptions import AlreadyExists, FailedPrecondition

        try:
            if db.snapshot.exists:
                option = _firestore.write_option(last_update_time=db.snapshot.update_time)
                db.snapshot.reference.update(dict(db), option=option)
            else:
                db.snapshot.reference.create(dict(db))
        except (AlreadyExists, FailedPrecondition) as error:
            raise ApiError(503, "La evaluación cambió. Vuelve a intentarlo.") from error
        return
    write_json(DB_PATH, db)


def hash_clave(clave, salt):
    import hashlib
    return hashlib.sha256(f"{salt}:{clave}".encode("utf-8")).hexdigest()


def clean_text(value, min_len, max_len, empty_msg):
    text = " ".join(str(value or "").split())
    if len(text) < min_len or len(text) > max_len:
        raise ApiError(400, empty_msg)
    return text


def nuevo_codigo(db):
    usados = {item["codigo"] for item in db["examenes"]}
    for _ in range(20):
        codigo = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if codigo not in usados:
            return codigo
    raise ApiError(500, "No se pudo crear un código")


def buscar_examen(db, codigo):
    codigo = (codigo or "").upper()
    for examen in db["examenes"]:
        if examen["codigo"].upper() == codigo:
            return examen
    return None


def buscar_intento(db, intento_id):
    for intento in db["intentos"]:
        if intento["id"] == intento_id:
            return intento
    return None


def _segundos(intento):
    inicio = intento.get("inicio") or 0
    ultimo = intento.get("ultimoTrozo") or 0
    if not inicio or ultimo <= inicio:
        return 0
    return int(round(ultimo - inicio))


def tiempo_agotado(intento, momento):
    if not intento.get("inicio"):
        return False
    minutos = intento.get("minutos") or 0
    if minutos <= 0:
        return False
    return momento > intento["inicio"] + minutos * 60


def evaluar(intento, momento):
    if any(marca in GRAVES for marca in intento["marcas"]):
        intento["estado"] = "sospechoso"
        return
    if "hueco" in intento["marcas"]:
        intento["estado"] = "incompleto"
        return
    if intento["estado"] in ("completo", "incompleto", "sospechoso"):
        return
    if intento["estado"] != "grabando" or not intento.get("inicio"):
        return
    if intento.get("ultimoTrozo") and momento - intento["ultimoTrozo"] > GAP_SECONDS:
        if "hueco" not in intento["marcas"]:
            intento["marcas"].append("hueco")
        intento["estado"] = "incompleto"
        return
    minutos = intento.get("minutos") or 0
    if minutos > 0 and momento > intento["inicio"] + minutos * 60 + 8:
        intento["estado"] = "completo" if intento["trozos"] else "incompleto"


def puede_ver_pregunta(intento, momento):
    return (
        intento["estado"] == "grabando"
        and intento.get("inicio")
        and intento["trozos"] > 0
        and not tiempo_agotado(intento, momento)
        and not any(marca in GRAVES or marca == "hueco" for marca in intento["marcas"])
    )


def publico_intento(intento):
    return {
        "id": intento["id"],
        "nombre": intento["nombre"],
        "enviado": intento.get("enviado"),
        "profesor": intento.get("profesor", ""),
        "semestre": intento.get("semestre", ""),
        "materia": intento.get("materia", ""),
        "estado": intento["estado"],
        "marcas": intento["marcas"],
        "trozos": intento["trozos"],
        "inicio": intento.get("inicio"),
        "minutos": intento["minutos"],
        "dispositivo": intento.get("dispositivo") or "",
        "creado": intento["creado"],
        "revision": intento.get("revision") or "nueva",
        "segundos": _segundos(intento),
    }


def carpeta_intento(intento_id):
    if not TOKEN_RE.match(intento_id):
        raise ApiError(400, "Intento inválido")
    return os.path.join(VIDEOS, intento_id)


def borrar_carpeta(intento_id):
    drive = drive_videos()
    if drive:
        drive.borrar(intento_id)
    folder = os.path.join(VIDEOS, intento_id)
    if not os.path.isdir(folder):
        return
    for name in os.listdir(folder):
        os.remove(os.path.join(folder, name))
    os.rmdir(folder)


def drive_videos():
    if os.environ.get("AVIA_DRIVE_CONFIG") or os.path.isfile(DRIVE_CONFIG):
        return DriveVideos(DRIVE_CONFIG)
    return None


def clave_valida(clave):
    text = str(clave or "")
    if len(text) < 4 or len(text) > 80:
        raise ApiError(400, "La clave necesita entre 4 y 80 caracteres")
    return text


def usuario_valido(usuario):
    text = str(usuario or "").strip().lower()
    if not USER_RE.match(text):
        raise ApiError(400, "El usuario va en minúsculas, de 3 a 20 letras o números")
    return text


def profesor_de_sesion(token):
    if not token or not TOKEN_RE.match(token):
        raise ApiError(401, "Entra con tu cuenta")
    db = load_db()
    momento = now()
    sesion = next((item for item in db["sesiones"] if item["token"] == token), None)
    if not sesion or sesion["vence"] < momento:
        raise ApiError(401, "Entra con tu cuenta")
    profesor = next((item for item in db["profesores"] if item["id"] == sesion["profesorId"]), None)
    if not profesor:
        raise ApiError(401, "Entra con tu cuenta")
    return profesor


def crear_cuenta(body):
    nombre = clean_text(body.get("nombre"), 2, 60, "Escribe tu nombre")
    usuario = usuario_valido(body.get("usuario"))
    clave = clave_valida(body.get("clave"))
    db = load_db()
    if any(item["usuario"] == usuario for item in db["profesores"]):
        raise ApiError(409, "Ese usuario ya existe")
    salt = secrets.token_hex(8)
    profesor = {
        "id": secrets.token_urlsafe(12),
        "nombre": nombre,
        "usuario": usuario,
        "salt": salt,
        "claveHash": hash_clave(clave, salt),
        "creado": now(),
    }
    db["profesores"].append(profesor)
    token = abrir_sesion(db, profesor["id"])
    save_db(db)
    return {"token": token, "nombre": nombre, "usuario": usuario}


def entrar_cuenta(body):
    usuario = usuario_valido(body.get("usuario"))
    clave = str(body.get("clave") or "")
    db = load_db()
    profesor = next((item for item in db["profesores"] if item["usuario"] == usuario), None)
    if not profesor or hash_clave(clave, profesor["salt"]) != profesor["claveHash"]:
        raise ApiError(401, "Usuario o clave incorrectos")
    token = abrir_sesion(db, profesor["id"])
    save_db(db)
    return {"token": token, "nombre": profesor["nombre"], "usuario": profesor["usuario"]}


def abrir_sesion(db, profesor_id):
    token = secrets.token_urlsafe(24)
    db["sesiones"] = [item for item in db["sesiones"] if item["vence"] > now()]
    db["sesiones"].append({
        "token": token,
        "profesorId": profesor_id,
        "vence": now() + 30 * 24 * 3600,
    })
    return token


def cerrar_sesion(token):
    db = load_db()
    db["sesiones"] = [item for item in db["sesiones"] if item["token"] != token]
    save_db(db)
    return {"ok": True}


def pregunta_valida(texto):
    pregunta = str(texto or "").strip()
    if len(pregunta) < 4 or len(pregunta) > 2000:
        raise ApiError(400, "Escribe la pregunta")
    return pregunta


def minutos_validos(valor):
    if valor == 0 or valor == "0" or str(valor).lower() == "libre":
        return 0
    try:
        minutos = int(valor or 5)
    except (TypeError, ValueError):
        raise ApiError(400, "Minutos inválidos")
    if minutos < 1 or minutos > 30:
        raise ApiError(400, "Los minutos van de 1 a 30")
    return minutos


def examen_del_profesor(db, profesor_id, codigo):
    if not codigo or len(codigo) != 8:
        raise ApiError(404, "No está esa pregunta")
    examen = buscar_examen(db, codigo=codigo.upper())
    if not examen or examen.get("profesorId") != profesor_id:
        raise ApiError(404, "No está esa pregunta")
    return examen


def intentos_de(db, examen, momento):
    cambio = False
    intentos = []
    for intento in db["intentos"]:
        if intento["codigo"] != examen["codigo"]:
            continue
        antes = (intento["estado"], tuple(intento["marcas"]))
        evaluar(intento, momento)
        if (intento["estado"], tuple(intento["marcas"])) != antes:
            cambio = True
        intentos.append(publico_intento(intento))
    intentos.sort(key=lambda item: item["inicio"] or item["creado"], reverse=True)
    return intentos, cambio


def ficha_examen(db, examen, momento):
    intentos, cambio = intentos_de(db, examen, momento)
    return {
        "codigo": examen["codigo"],
        "pregunta": examen["pregunta"],
        "minutos": examen["minutos"],
        "creado": examen["creado"],
        "vence": examen.get("vence"),
        "intentos": intentos,
    }, cambio


def panel_profesor(profesor):
    db = load_db()
    momento = now()
    cambio = False
    examenes = []
    for examen in db["examenes"]:
        if examen.get("profesorId") != profesor["id"]:
            continue
        ficha, toco = ficha_examen(db, examen, momento)
        cambio = cambio or toco
        examenes.append(ficha)
    if cambio:
        save_db(db)
    examenes.sort(key=lambda item: item["creado"], reverse=True)
    return {
        "nombre": profesor["nombre"],
        "usuario": profesor["usuario"],
        "ahora": momento,
        "examenes": examenes,
        "vencimientoCodigos": True,
    }


def crear_examen(profesor, body):
    pregunta = pregunta_valida(body.get("pregunta"))
    minutos = minutos_validos(body.get("minutos"))
    horas = body.get("vigenciaHoras")
    if horas is not None and (type(horas) is not int or not 1 <= horas <= 8760):
        raise ApiError(400, "La vigencia debe ser de 1 a 8760 horas")
    db = load_db()
    examen = {
        "codigo": nuevo_codigo(db),
        "profesorId": profesor["id"],
        "pregunta": pregunta,
        "minutos": minutos,
        "creado": now(),
    }
    if horas is not None:
        examen["vence"] = examen["creado"] + horas * 3600
    db["examenes"].append(examen)
    save_db(db)
    return {"codigo": examen["codigo"], "minutos": minutos}


def editar_examen(profesor, codigo, body):
    db = load_db()
    examen = examen_del_profesor(db, profesor["id"], codigo)
    examen["pregunta"] = pregunta_valida(body.get("pregunta"))
    save_db(db)
    return {"ok": True, "pregunta": examen["pregunta"]}


REVISIONES = {"nueva", "vista", "lista"}


def guardar_ficha(profesor, intento_id, body):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    examen = buscar_examen(db, codigo=intento["codigo"]) if intento else None
    if not intento or not examen or examen.get("profesorId") != profesor["id"]:
        raise ApiError(404, "No está ese intento")
    if "revision" in body:
        revision = body.get("revision")
        if revision not in REVISIONES:
            raise ApiError(400, "Revisión inválida")
        intento["revision"] = revision
    save_db(db)
    return {"ok": True, "revision": intento.get("revision") or "nueva"}


def borrar_examen(profesor, codigo):
    db = load_db()
    examen = examen_del_profesor(db, profesor["id"], codigo)
    ids = [item["id"] for item in db["intentos"] if item["codigo"] == examen["codigo"]]
    db["examenes"] = [item for item in db["examenes"] if item.get("codigo") != examen["codigo"]]
    db["intentos"] = [item for item in db["intentos"] if item["codigo"] != examen["codigo"]]
    for intento_id in ids:
        borrar_carpeta(intento_id)
    save_db(db)
    return {"ok": True}


def abrir_intento(body):
    if body.get("autorizacion") != "sivi-evaluacion-v1":
        raise ApiError(400, "Autoriza el tratamiento de datos para continuar.")
    codigo = clean_text(body.get("codigo"), 8, 8, "El código tiene 8 caracteres").upper()
    if any(char not in CODE_ALPHABET for char in codigo):
        raise ApiError(400, "Ese código no existe")
    nombre = clean_text(body.get("nombre"), 2, 60, "Escribe tu nombre")
    contexto = {}
    if any(campo in body for campo in ("profesor", "semestre", "materia")):
        contexto = {
            "profesor": clean_text(body.get("profesor"), 2, 100, "Escribe el nombre del profesor"),
            "semestre": clean_text(body.get("semestre"), 1, 40, "Escribe el semestre"),
            "materia": clean_text(body.get("materia"), 2, 100, "Escribe la materia"),
        }
    clave_nombre = nombre.casefold()
    db = load_db()
    examen = buscar_examen(db, codigo=codigo)
    if not examen:
        raise ApiError(404, "Ese código no existe")
    if examen.get("vence") and now() >= examen["vence"]:
        raise ApiError(400, "Este código ya venció")
    for intento in db["intentos"]:
        if intento["codigo"] == examen["codigo"] and intento["nombreKey"] == clave_nombre:
            if intento["estado"] == "incompleto" and not intento["trozos"]:
                continue
            if intento["estado"] == "esperando" and not intento.get("autorizacion"):
                if not intento.get("profesor"):
                    intento.update(contexto)
                intento["autorizacion"] = {"version": body["autorizacion"], "fecha": now()}
                save_db(db)
            return {
                "id": intento["id"],
                "estado": intento["estado"],
                "nombre": intento["nombre"],
                "minutos": intento["minutos"],
                "ahora": now(),
            }
    intento = {
        "id": secrets.token_urlsafe(12),
        "codigo": examen["codigo"],
        "nombre": nombre,
        "nombreKey": clave_nombre,
        "autorizacion": {"version": body["autorizacion"], "fecha": now()},
        **contexto,
        "minutos": examen["minutos"],
        "estado": "esperando",
        "marcas": [],
        "trozos": 0,
        "inicio": None,
        "ultimoTrozo": None,
        "dispositivo": "",
        "creado": now(),
        "revision": "nueva",
    }
    db["intentos"].append(intento)
    save_db(db)
    return {
        "id": intento["id"],
        "estado": intento["estado"],
        "nombre": intento["nombre"],
        "minutos": intento["minutos"],
        "ahora": now(),
    }


def sala(intento_id):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    if not intento:
        raise ApiError(404, "No está ese intento")
    momento = now()
    evaluar(intento, momento)
    save_db(db)
    examen = buscar_examen(db, codigo=intento["codigo"])
    visible = puede_ver_pregunta(intento, momento)
    return {
        "id": intento["id"],
        "nombre": intento["nombre"],
        "estado": intento["estado"],
        "marcas": intento["marcas"],
        "inicio": intento.get("inicio"),
        "minutos": intento["minutos"],
        "trozos": intento["trozos"],
        "ahora": momento,
        "pregunta": examen["pregunta"] if visible and examen else None,
    }


def guardar_trozo(intento_id, index, data, dispositivo):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    if index < 0 or index > 5000:
        raise ApiError(400, "Trozo inválido")
    if not data or len(data) > CHUNK_MAX:
        raise ApiError(400, "El trozo de video no sirve")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    if not intento:
        raise ApiError(404, "No está ese intento")
    momento = now()
    evaluar(intento, momento)
    folder = carpeta_intento(intento_id)
    contenedor = intento.get("contenedor") or _contenedor(data)
    nombre = f"{index:04d}.{contenedor}"
    path = os.path.join(folder, nombre)
    if index == intento["trozos"] - 1 and (
        os.path.exists(path) or drive_videos() is not None
    ):
        pass
    elif index != intento["trozos"]:
        raise ApiError(409, "El video llegó fuera de orden")
    else:
        drive = drive_videos()
        if drive:
            drive.guardar(intento_id, nombre, data)
        else:
            os.makedirs(folder, exist_ok=True)
            with open(path, "wb") as handle:
                handle.write(data)
        intento["contenedor"] = contenedor
        intento["trozos"] += 1
        intento["ultimoTrozo"] = momento
        if dispositivo and not intento.get("dispositivo"):
            intento["dispositivo"] = dispositivo[:120]
        if intento["estado"] == "esperando":
            intento["estado"] = "grabando"
            intento["inicio"] = momento
    evaluar(intento, momento)
    save_db(db)
    examen = buscar_examen(db, codigo=intento["codigo"])
    visible = puede_ver_pregunta(intento, momento)
    return {
        "ok": True,
        "estado": intento["estado"],
        "trozos": intento["trozos"],
        "inicio": intento.get("inicio"),
        "minutos": intento["minutos"],
        "ahora": momento,
        "pregunta": examen["pregunta"] if visible and examen else None,
    }


def marcar(intento_id, body):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    tipo = str(body.get("tipo") or "")
    if tipo not in MARCAS_OK:
        raise ApiError(400, "Marca inválida")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    if not intento:
        raise ApiError(404, "No está ese intento")
    detalle = str(body.get("detalle") or "")[:120]
    if detalle and not intento.get("dispositivo"):
        intento["dispositivo"] = detalle
    if tipo not in intento["marcas"]:
        intento["marcas"].append(tipo)
    evaluar(intento, now())
    save_db(db)
    return {"ok": True, "estado": intento["estado"]}


def cerrar(intento_id):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    if not intento:
        raise ApiError(404, "No está ese intento")
    momento = now()
    evaluar(intento, momento)
    if intento["estado"] == "grabando":
        intento["estado"] = "completo" if intento["trozos"] else "incompleto"
    elif intento["estado"] == "esperando":
        intento["estado"] = "incompleto"
    if intento["trozos"] and not intento.get("enviado"):
        intento["enviado"] = momento
    save_db(db)
    return {"ok": True, "estado": intento["estado"]}


def autorizar_video(profesor, intento_id):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese video")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    examen = buscar_examen(db, codigo=intento["codigo"]) if intento else None
    if not examen or examen.get("profesorId") != profesor["id"]:
        raise ApiError(404, "No está ese video")


def borrar_intento(profesor, intento_id):
    if not TOKEN_RE.match(intento_id or ""):
        raise ApiError(404, "No está ese intento")
    db = load_db()
    intento = buscar_intento(db, intento_id)
    examen = buscar_examen(db, codigo=intento["codigo"]) if intento else None
    if not intento or not examen or examen.get("profesorId") != profesor["id"]:
        raise ApiError(404, "No está ese intento")
    db["intentos"] = [item for item in db["intentos"] if item["id"] != intento_id]
    borrar_carpeta(intento_id)
    save_db(db)
    return {"ok": True}


def _ebml_id(data, i):
    primero = data[i]
    largo = 1
    marca = 0x80
    while primero & marca == 0:
        marca >>= 1
        largo += 1
        if largo > 4:
            raise ValueError("id")
    return int.from_bytes(data[i:i + largo], "big"), i + largo


def _ebml_tam(data, i):
    primero = data[i]
    largo = 1
    marca = 0x80
    while primero & marca == 0:
        marca >>= 1
        largo += 1
        if largo > 8:
            raise ValueError("tam")
    crudo = int.from_bytes(data[i:i + largo], "big")
    bits = 7 * largo
    valor = crudo & ((1 << bits) - 1)
    return valor, i + largo, valor == (1 << bits) - 1


def _vint(numero):
    for largo in range(1, 9):
        limite = (1 << (7 * largo)) - 1
        if numero < limite:
            return (numero | (1 << (7 * largo))).to_bytes(largo, "big")
    raise ValueError("vint")


def _eid(ident):
    largo = max(1, (ident.bit_length() + 7) // 8)
    return ident.to_bytes(largo, "big")


def _elem(ident, carga):
    return _eid(ident) + _vint(len(carga)) + carga


def _uint(numero):
    if numero <= 0:
        return b"\x00"
    return numero.to_bytes((numero.bit_length() + 7) // 8, "big")


def _tiempo_bloque(blob, inicio, fin):
    if fin - inicio < 4:
        return None, None
    _, despues, desconocido = _ebml_tam(blob, inicio)
    if desconocido or despues + 3 > fin:
        return None, None
    salto = int.from_bytes(blob[despues:despues + 2], "big", signed=True)
    return salto, despues + 2


def _grupo_bloque(blob, inicio, fin):
    relativo = 0
    bandera = 0
    pendiente = None
    cursor = inicio
    while cursor < fin - 3:
        cid, cinicio = _ebml_id(blob, cursor)
        ctam, cdata, desconocido = _ebml_tam(blob, cinicio)
        if desconocido or cdata + ctam > fin:
            break
        if cid == 0xA1:
            salto, punta = _tiempo_bloque(blob, cdata, cdata + ctam)
            if salto is not None:
                pendiente = salto
                if salto > relativo:
                    relativo = salto
            if not bandera and punta:
                bandera = punta
        elif cid == 0x9B and ctam and pendiente is not None:
            relativo = max(relativo, pendiente + int.from_bytes(blob[cdata:cdata + ctam], "big"))
        cursor = cdata + ctam
    return relativo, bandera


def _cabecera_busqueda(posicion):
    ident = (0x1C53BB6B).to_bytes(4, "big")
    entrada = _elem(0x53AB, ident) + _elem(0x53AC, _uint(max(0, posicion)))
    return _elem(0x114D9B74, _elem(0x4DBB, entrada))


def _indexar_webm(blob):
    if len(blob) < 64 or blob[:4] != b"\x1a\x45\xdf\xa3":
        return blob
    ident, cursor = _ebml_id(blob, 0)
    tam, cursor, desconocido = _ebml_tam(blob, cursor)
    if ident != 0x1A45DFA3 or desconocido:
        return blob
    cursor += tam
    ident, cursor = _ebml_id(blob, cursor)
    if ident != 0x18538067:
        return blob
    campo_segmento = cursor
    _, segmento, _ = _ebml_tam(blob, cursor)
    ancho_segmento = segmento - campo_segmento
    info = None
    pos = segmento
    while pos < len(blob) - 8:
        ident, inicio_tam = _ebml_id(blob, pos)
        tam, carga, desconocido = _ebml_tam(blob, inicio_tam)
        if ident == 0x1F43B675:
            break
        if ident == 0x1549A966 and not desconocido:
            info = (inicio_tam, blob[carga:carga + tam], carga + tam)
        if desconocido:
            return blob
        pos = carga + tam
    if info is None or pos >= len(blob):
        return blob
    grupos = []
    hijos = {0xE7, 0xAB, 0xA3, 0xA0, 0xA7, 0x58D7, 0x5854}
    while pos < len(blob) - 4:
        ident, inicio_tam = _ebml_id(blob, pos)
        if ident != 0x1F43B675:
            break
        _, carga, _ = _ebml_tam(blob, inicio_tam)
        marca = 0
        relativo = 0
        bandera = 0
        hijo = carga
        while hijo < len(blob) - 4:
            cid, cinicio = _ebml_id(blob, hijo)
            if cid == 0x1F43B675:
                break
            ctam, cdata, cdesc = _ebml_tam(blob, cinicio)
            if cdesc:
                break
            if cid not in hijos:
                hijo = cdata + ctam
                continue
            if cid == 0xE7:
                marca = int.from_bytes(blob[cdata:cdata + ctam], "big")
            elif cid == 0xA3 and ctam >= 4:
                salto, punta = _tiempo_bloque(blob, cdata, cdata + ctam)
                if salto is not None and salto > relativo:
                    relativo = salto
                if not bandera and punta:
                    bandera = punta
            elif cid == 0xA0:
                extra, punta = _grupo_bloque(blob, cdata, cdata + ctam)
                if extra > relativo:
                    relativo = extra
                if not bandera and punta:
                    bandera = punta
            hijo = cdata + ctam
        grupos.append((pos, marca, relativo, bandera))
        pos = hijo
    if not grupos:
        return blob
    arreglo = bytearray(blob)
    for indice, (origen, _marca, _rel, bandera) in enumerate(grupos):
        _, campo = _ebml_id(arreglo, origen)
        _, carga, _ = _ebml_tam(arreglo, campo)
        if carga - campo == 8:
            siguiente = grupos[indice + 1][0] if indice + 1 < len(grupos) else len(arreglo)
            arreglo[campo:carga] = (siguiente - carga | (1 << 56)).to_bytes(8, "big")
        if bandera:
            arreglo[bandera] = arreglo[bandera] | 0x80
    blob = bytes(arreglo)
    duracion_ms = grupos[-1][1] + max(0, grupos[-1][2]) + 80
    inicio_tam, carga_info, fin_info = info
    ancho = fin_info - len(carga_info) - inicio_tam
    extra = b""
    nuevo = b""
    if b"\x44\x89" not in carga_info:
        extra = _elem(0x4489, struct.pack(">d", float(duracion_ms)))
        nuevo = _vint(len(carga_info) + len(extra))
        if len(nuevo) != ancho:
            extra = b""
    primero = grupos[0][0]
    cues = b""
    busca = b""
    for _ in range(6):
        puntos = b""
        for origen, marca, _rel, _bandera in grupos:
            lugar = origen + len(extra) + len(busca) + len(cues) - segmento
            posiciones = _elem(0xF7, _uint(1)) + _elem(0xF1, _uint(max(0, lugar)))
            punto = _elem(0xB3, _uint(marca)) + _elem(0xB7, posiciones)
            puntos += _elem(0xBB, punto)
        nuevo_cues = _elem(0x1C53BB6B, puntos)
        nuevo_busca = _cabecera_busqueda(primero + len(extra) + len(busca) - segmento)
        if nuevo_cues == cues and nuevo_busca == busca:
            break
        cues = nuevo_cues
        busca = nuevo_busca
    if extra:
        blob = blob[:inicio_tam] + nuevo + carga_info + extra + blob[fin_info:]
        primero += len(extra)
    final = blob[:primero] + busca + cues + blob[primero:]
    if ancho_segmento == 8:
        arreglo = bytearray(final)
        arreglo[campo_segmento:segmento] = (len(final) - segmento | (1 << 56)).to_bytes(8, "big")
        final = bytes(arreglo)
    return final


def _contenedor(data):
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if len(data) > 8 and data[4:8] == b"ftyp":
        return "mp4"
    return "webm"


def archivos_video(intento_id):
    folder = os.path.join(VIDEOS, intento_id)
    if not os.path.isdir(folder):
        return []
    names = [name for name in os.listdir(folder) if name.endswith(".webm") or name.endswith(".mp4")]
    names.sort()
    return [os.path.join(folder, name) for name in names]


class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, urlparse(self.path).path))

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self.route_get(parsed.path)
            else:
                self.static(parsed.path)
        except ApiError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Error interno"})

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length > CHUNK_MAX + 1024:
                raise ApiError(413, "El archivo es demasiado grande")
            raw = self.rfile.read(length) if length else b""
            self.route_post(parsed.path, raw)
        except ApiError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Error interno"})

    def token_sesion(self):
        directo = (self.headers.get("X-Sesion") or "").strip()
        if directo:
            return directo
        for part in (self.headers.get("Cookie") or "").split(";"):
            part = part.strip()
            if part.startswith(SESSION_COOKIE + "="):
                return unquote(part.split("=", 1)[1])
        return ""

    def do_DELETE(self):
        try:
            parsed = urlparse(self.path)
            parts = [part for part in parsed.path.split("/") if part]
            with LOCK:
                profesor = profesor_de_sesion(self.token_sesion())
                if len(parts) == 4 and parts[:3] == ["api", "profesor", "examenes"]:
                    self.send_json(200, borrar_examen(profesor, parts[3]))
                elif len(parts) == 4 and parts[:3] == ["api", "profesor", "intentos"]:
                    self.send_json(200, borrar_intento(profesor, parts[3]))
                else:
                    raise ApiError(404, "No está")
        except ApiError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Error interno"})

    def route_get(self, path):
        parts = [part for part in path.split("/") if part]
        with LOCK:
            if parts == ["api", "profesor"]:
                profesor = profesor_de_sesion(self.token_sesion())
                self.send_json(200, panel_profesor(profesor))
                return
            if len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "sala":
                self.send_json(200, sala(parts[2]))
                return
            if len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "video":
                profesor = profesor_de_sesion(self.token_sesion())
                autorizar_video(profesor, parts[2])
        if len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "video":
            self.send_video(parts[2])
            return
        raise ApiError(404, "No está")

    def route_post(self, path, raw):
        parts = [part for part in path.split("/") if part]
        if len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "trozo":
            try:
                index = int(self.headers.get("X-Chunk-Index", "-1"))
            except ValueError:
                raise ApiError(400, "Trozo inválido")
            dispositivo = unquote(self.headers.get("X-Device", "") or "")
            with LOCK:
                payload = guardar_trozo(parts[2], index, raw, dispositivo)
            self.send_json(200, payload)
            return
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            raise ApiError(400, "No se entendió la solicitud")
        with LOCK:
            if parts == ["api", "cuentas"]:
                payload = crear_cuenta(body)
                self.send_json(200, {"nombre": payload["nombre"], "usuario": payload["usuario"]}, cookie=payload["token"])
            elif parts == ["api", "sesion"]:
                payload = entrar_cuenta(body)
                self.send_json(200, {"nombre": payload["nombre"], "usuario": payload["usuario"]}, cookie=payload["token"])
            elif parts == ["api", "salir"]:
                cerrar_sesion(self.token_sesion())
                self.send_json(200, {"ok": True}, clear_cookie=True)
            elif parts == ["api", "profesor", "examenes"]:
                profesor = profesor_de_sesion(self.token_sesion())
                self.send_json(200, crear_examen(profesor, body))
            elif len(parts) == 4 and parts[:3] == ["api", "profesor", "examenes"]:
                profesor = profesor_de_sesion(self.token_sesion())
                self.send_json(200, editar_examen(profesor, parts[3], body))
            elif parts == ["api", "intentos"]:
                self.send_json(200, abrir_intento(body))
            elif len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "marca":
                self.send_json(200, marcar(parts[2], body))
            elif len(parts) == 4 and parts[:2] == ["api", "intentos"] and parts[3] == "cerrar":
                self.send_json(200, cerrar(parts[2]))
            elif len(parts) == 5 and parts[:3] == ["api", "profesor", "intentos"] and parts[4] == "ficha":
                profesor = profesor_de_sesion(self.token_sesion())
                self.send_json(200, guardar_ficha(profesor, parts[3], body))
            else:
                raise ApiError(404, "No está")

    def send_video(self, intento_id):
        files = {os.path.basename(path): path for path in archivos_video(intento_id)}
        drive = drive_videos()
        remotos = drive.listar(intento_id) if drive else {}
        nombres = sorted(files.keys() | remotos.keys())
        if not nombres:
            raise ApiError(404, "Todavía no hay video")
        segmentos = []
        for nombre in nombres:
            if nombre in remotos:
                segmentos.append(drive.leer(remotos[nombre]))
            else:
                with open(files[nombre], "rb") as handle:
                    segmentos.append(handle.read())
        crudo = b"".join(segmentos)
        es_mp4 = nombres[0].endswith(".mp4")
        try:
            data = crudo if es_mp4 else _indexar_webm(crudo)
        except (OSError, ValueError):
            data = crudo
        inicio, fin = 0, len(data) - 1
        parcial = False
        rango = self.headers.get("Range") or ""
        if rango.startswith("bytes=") and len(data):
            spec = rango.split("=", 1)[1].split(",", 1)[0].strip()
            izquierda, _, derecha = spec.partition("-")
            try:
                if izquierda == "":
                    cantidad = int(derecha)
                    inicio = max(0, len(data) - cantidad)
                else:
                    inicio = int(izquierda)
                    fin = int(derecha) if derecha else len(data) - 1
            except ValueError:
                inicio, fin = 0, len(data) - 1
            else:
                fin = min(len(data) - 1, fin)
                if inicio < 0 or inicio >= len(data) or inicio > fin:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % len(data))
                    self.end_headers()
                    return
                parcial = inicio > 0 or fin < len(data) - 1
        trozo = data[inicio:fin + 1]
        self.send_response(206 if parcial else 200)
        self.send_header("Content-Type", "video/mp4" if es_mp4 else "video/webm")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(trozo)))
        if parcial:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (inicio, fin, len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(trozo)
        except (BrokenPipeError, ConnectionResetError):
            return

    def es_pagina(self, path):
        clean = path.split("?")[0]
        if len(clean) > 1 and clean.endswith("/"):
            clean = clean[:-1]
        if clean in ("", "/", "/docentes-sivi-7q4m9x2k", "/profesor", "/profesor/nueva", "/entrar", "/sala"):
            return True
        parts = [part for part in clean.split("/") if part]
        return len(parts) == 3 and parts[0] == "profesor" and parts[1] == "p" and len(parts[2]) == 8

    def static(self, path):
        if self.es_pagina(path):
            rel = "index.html"
        else:
            rel = path.lstrip("/") or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        full = os.path.abspath(os.path.join(WEB, rel))
        web = os.path.abspath(WEB)
        if os.path.commonpath([web, full]) != web or not os.path.isfile(full):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        mime = EXT.get(ext)
        if not mime:
            self.send_error(404)
            return
        with open(full, "rb") as handle:
            data = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, status, payload, cookie=None, clear_cookie=False):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if clear_cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + ("; Secure" if CLOUD_PORT else ""))
        elif cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + ("; Secure" if CLOUD_PORT else ""))
        self.end_headers()
        self.wfile.write(data)


def main():
    if CLOUD_PORT:
        if not FIRESTORE_DOC or not os.environ.get("AVIA_DRIVE_CONFIG") or not os.path.isfile(DRIVE_CONFIG):
            raise SystemExit("Cloud Run requiere AVIA_FIRESTORE_DOC y el secreto AVIA_DRIVE_CONFIG.")
        Server(("0.0.0.0", int(CLOUD_PORT)), Handler).serve_forever()
        return
    os.makedirs(VIDEOS, exist_ok=True)
    server = None
    port = 8787
    for candidate in range(8787, 8797):
        try:
            server = Server(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        print("No hay un puerto libre entre 8787 y 8796")
        return
    print(f"Listo: http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
