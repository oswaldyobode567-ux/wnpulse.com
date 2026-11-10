FROM python:3.13-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY editorial.py app.py setup_webhook.py ./
ENV PYTHONUNBUFFERED=1
CMD ["sh","-c","exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --no-access-log"]
