FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# rasterio (access step) needs libexpat, which the slim image lacks
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
COPY config ./config
COPY sentinel ./sentinel
COPY data/raw ./data/raw
COPY tests ./tests
EXPOSE 8000
