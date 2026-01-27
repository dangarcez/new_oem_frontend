FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY conf /app/conf
COPY frontend /app/frontend
RUN mkdir -p /app/data

EXPOSE 8173

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8173"]
