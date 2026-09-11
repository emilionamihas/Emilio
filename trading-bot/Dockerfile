FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Directorio de persistencia de la posición abierta (ver persistence.py):
# si el contenedor se reinicia con una posición viva, la recupera acá.
RUN mkdir -p /app/state
VOLUME ["/app/state"]
ENV STATE_FILE_PATH=/app/state/position.json

# Usuario sin privilegios (no correr el bot como root)
RUN useradd --create-home --shell /bin/bash bot \
    && chown -R bot:bot /app
USER bot

# Docker manda SIGTERM al frenar el contenedor; main.py lo captura y hace
# un apagado prolijo (ver signal handlers en main.py). Darle margen con
# stop_grace_period en docker-compose.yml, no solo acá.
STOPSIGNAL SIGTERM

CMD ["python", "main.py"]
