"""Autoriza la cuenta de Drive y prepara la carpeta privada de AVIA."""

import argparse
import json
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


DATA = Path(__file__).resolve().parent / "data"
CLIENTE = DATA / "drive-oauth-client.json"
CONEXION = DATA / "drive-connection.json"
CARPETA = "AVIA – Grabaciones"
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("correo", help="Correo de la cuenta propietaria de Drive")
    correo = parser.parse_args().correo.strip().lower()
    if CONEXION.exists():
        raise SystemExit("Ya existe una conexión de Drive en data/drive-connection.json.")
    if not CLIENTE.is_file():
        raise SystemExit("Guarda el cliente OAuth de escritorio en data/drive-oauth-client.json.")

    flow = InstalledAppFlow.from_client_secrets_file(
        str(CLIENTE), SCOPES, autogenerate_code_verifier=True
    )
    credentials = flow.run_local_server(
        host="127.0.0.1", port=0, prompt="consent", login_hint=correo
    )
    identity = build("oauth2", "v2", credentials=credentials).userinfo().get().execute()
    if identity.get("email", "").lower() != correo or not identity.get("verified_email"):
        raise SystemExit(f"Autoriza la aplicación con {correo}.")
    if not credentials.refresh_token:
        raise SystemExit("Google no entregó un token de renovación. Repite la autorización.")

    drive = build("drive", "v3", credentials=credentials)
    folders = drive.files().list(
        q="'root' in parents and trashed = false and "
        "mimeType = 'application/vnd.google-apps.folder' and "
        "appProperties has { key='avia' and value='grabaciones' }",
        fields="files(id),nextPageToken",
        pageSize=2,
    ).execute()
    matches = folders.get("files", [])
    if len(matches) > 1 or folders.get("nextPageToken"):
        raise SystemExit("Hay varias carpetas de grabaciones de AVIA. Revisa Drive.")
    if matches:
        folder = matches[0]
    else:
        folder = drive.files().create(
            body={
                "name": CARPETA,
                "mimeType": "application/vnd.google-apps.folder",
                "appProperties": {"avia": "grabaciones"},
            },
            fields="id",
        ).execute()

    connection = {"folder_id": folder["id"], "credentials": json.loads(credentials.to_json())}
    with CONEXION.open("x", encoding="utf-8") as handle:
        json.dump(connection, handle, indent=2)
    print(f"Drive conectado con {correo}. Carpeta: {CARPETA}.")


if __name__ == "__main__":
    main()
