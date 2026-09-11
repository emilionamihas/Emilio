# Conseguir y preparar el servidor (antes de DEPLOY.md)

No puedo crear la cuenta ni el servidor por vos (necesita tu tarjeta), pero
acá está el camino exacto. Con esto listo, seguís directo con `DEPLOY.md`.

## 1. Elegí proveedor

**DigitalOcean** (recomendado para arrancar: la interfaz es simple y hay
guías para todo).

- Andá a digitalocean.com, creá cuenta.
- Plan sugerido: **Basic Droplet, 1 GB RAM / 1 vCPU, ~6 USD/mes** (el bot es
  liviano, con eso alcanza; si querés margen, el de 2 GB por ~12 USD/mes
  no hace falta pero da tranquilidad).
- Imagen: **Ubuntu 22.04 (LTS) x64**.
- Región: **Singapore** (más cerca de los servidores de Binance; para el
  z-score en segundos que usa este bot no es crítico, pero ayuda un poco).

Alternativa más barata una vez que te sientas cómodo con la terminal:
**Hetzner Cloud**, plan CX22 (2 vCPU / 4 GB por ~4-5 EUR/mes) — más
recursos por menos plata, pero el proceso de alta a veces pide más
verificación.

## 2. Generar una clave SSH (si no tenés una)

En tu computadora (Mac/Linux: Terminal; Windows: PowerShell):

```bash
ssh-keygen -t ed25519 -C "trading-bot"
```

Enter en todo (ubicación por defecto, sin passphrase o con una que
recuerdes). Esto crea `~/.ssh/id_ed25519` (privada, no se comparte) y
`~/.ssh/id_ed25519.pub` (pública, esa sí se sube al proveedor).

Mostrar la pública para copiarla:

```bash
cat ~/.ssh/id_ed25519.pub
```

## 3. Crear el droplet

Al crear el droplet, en la sección de autenticación elegí **SSH Key** (no
password) y pegá el contenido de `id_ed25519.pub`. Confirmá y creá.
DigitalOcean te da una IP pública en 1-2 minutos.

## 4. Conectarte

```bash
ssh root@TU_IP_PUBLICA
```

## 5. Preparación inicial del servidor

Una vez adentro, copiá y pegá esto (crea un usuario sin privilegios de
root para correr todo, instala Docker, y cierra el firewall salvo SSH):

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Usuario no-root para trabajar
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# Firewall: solo SSH por ahora (443 se abre más adelante si exponés el dashboard)
apt install -y ufw
ufw allow OpenSSH
ufw --force enable

# Docker + Docker Compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Desde acá en adelante, conectate como `deploy` en vez de `root`:

```bash
ssh deploy@TU_IP_PUBLICA
```

## 6. Seguir con DEPLOY.md

Con el servidor listo, andá a [`DEPLOY.md`](./DEPLOY.md) sección 3
("Despliegue con Docker"): clonar el repo, completar `.env` con tus API
keys de Binance (recordá: sin permiso de retiro), y `docker compose up -d
--build` con `DRY_RUN=true` para la primera corrida.
