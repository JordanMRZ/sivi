"""Almacenamiento privado de los segmentos de video en Google Drive."""

import io
import json


class DriveVideos:
    def __init__(self, config_path):
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with open(config_path, encoding="utf-8") as handle:
            config = json.load(handle)
        self.folder = config["folder_id"]
        credentials = Credentials.from_authorized_user_info(config["credentials"])
        self.files = build("drive", "v3", credentials=credentials).files()

    def listar(self, intento_id):
        query = (
            f"'{self.folder}' in parents and trashed = false and "
            f"appProperties has {{ key='intento' and value='{intento_id}' }}"
        )
        files = {}
        page_token = None
        while True:
            page = self.files.list(
                q=query, fields="nextPageToken,files(id,name)", pageToken=page_token
            ).execute()
            for item in page.get("files", []):
                files[item["name"]] = item["id"]
            page_token = page.get("nextPageToken")
            if not page_token:
                return files

    def guardar(self, intento_id, nombre, data):
        from googleapiclient.http import MediaIoBaseUpload

        media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/octet-stream")
        existente = self.listar(intento_id).get(nombre)
        if existente:
            self.files.update(fileId=existente, media_body=media, fields="id").execute()
        else:
            self.files.create(
                body={
                    "name": nombre,
                    "parents": [self.folder],
                    "appProperties": {"intento": intento_id},
                },
                media_body=media,
                fields="id",
            ).execute()

    def leer(self, file_id):
        return self.files.get_media(fileId=file_id).execute()

    def borrar(self, intento_id):
        for file_id in self.listar(intento_id).values():
            self.files.update(fileId=file_id, body={"trashed": True}, fields="id").execute()
