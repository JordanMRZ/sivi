FROM python:3.12-slim
WORKDIR /app
COPY requirements-drive.txt requirements-cloud.txt ./
RUN pip install --no-cache-dir -r requirements-drive.txt -r requirements-cloud.txt
COPY server.py drive_videos.py ./
USER 10001
CMD ["python", "-u", "server.py"]
