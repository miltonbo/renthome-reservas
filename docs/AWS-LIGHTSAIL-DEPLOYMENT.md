# Despliegue de DeptosBO en AWS Lightsail

## Arquitectura inicial

- **Región:** América del Sur (São Paulo), `sa-east-1`.
- **Instancia:** Ubuntu 24.04 LTS, Linux con IPv4 pública, 2 GB de RAM y 60 GB SSD.
- **Aplicación:** Next.js 16 ejecutada por `systemd` como el usuario sin privilegios `app`.
- **Base de datos:** SQLite persistente en `/home/app/deptosbo/data/prod.db`.
- **Proxy y TLS:** nginx + Let's Encrypt en el origen; Cloudflare en modo `Full (strict)`.
- **Dominio:** `app.deptosbo.com`.
- **Sincronización:** cron local cada 10 minutos.
- **Respaldo:** copia SQLite consistente diaria + snapshots automáticos de Lightsail.

La instancia con IPv4 y 2 GB tiene un precio de referencia de USD 12/mes. Los
snapshots se cobran por almacenamiento utilizado; AWS publica USD 0,05 por
GB-mes. Confirmar ambos importes en la consola antes de crear recursos porque
pueden variar por región.

## 1. Crear los recursos de AWS

1. En Lightsail, seleccionar `South America (São Paulo)`.
2. Crear una instancia Linux/Unix con **OS only → Ubuntu 24.04 LTS**.
3. Elegir el plan con **2 GB RAM y IPv4 pública**.
4. Nombrarla `deptosbo-prod`.
5. Crear y adjuntar una IP estática llamada `deptosbo-prod-ip`.
6. En Networking, permitir únicamente SSH (22), HTTP (80) y HTTPS (443).
7. Activar snapshots automáticos diarios, preferentemente a las 04:00 UTC.

No crear un balanceador ni una base de datos administrada en la fase inicial.
Para dos administradores y 23 departamentos añadirían costo sin aportar una
mejora proporcional. La migración futura a PostgreSQL seguirá siendo posible.

## 2. Preparar Cloudflare

Crear este registro después de obtener la IP estática:

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| A | `app` | IP estática de Lightsail | Primero DNS only |

Mantenerlo en **DNS only** mientras Certbot emite el certificado. Cuando HTTPS
responda correctamente, activar el proxy naranja y configurar SSL/TLS como
`Full (strict)`. La raíz `deptosbo.com` puede redirigirse a
`https://app.deptosbo.com` mediante una Redirect Rule de Cloudflare.

## 3. Inicializar el servidor

Conectarse por SSH como `ubuntu`, copiar `scripts/server-bootstrap.sh` y ejecutar:

```bash
sudo bash server-bootstrap.sh
```

Después clonar el repositorio:

```bash
sudo -u app git clone https://github.com/miltonbo/renthome-reservas.git /home/app/deptosbo
cd /home/app/deptosbo
sudo -u app npm ci --no-audit --no-fund
```

## 4. Configurar secretos

Crear `/home/app/deptosbo/.env.production` con permisos `600`. Como mínimo:

```dotenv
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://app.deptosbo.com
DATABASE_URL=file:./data/prod.db
JWT_SECRET=<64 caracteres hexadecimales>
CRON_SECRET=<64 caracteres hexadecimales distintos>
```

Generar cada secreto en el servidor con:

```bash
openssl rand -hex 32
```

No copiar `.env.local` al repositorio ni guardar secretos en GitHub. Las claves
de Google, Resend, Gemini y Sentry son opcionales y se incorporan únicamente
cuando cada integración se habilite.

## 5. Transferir la base de pruebas

Antes de la transferencia, detener escrituras locales y crear una copia
consistente con `sqlite3 .backup`. Subir la copia directamente por SSH a:

```text
/home/app/deptosbo/data/prod.db
```

Luego verificar:

```bash
sudo chown app:app /home/app/deptosbo/data/prod.db
sudo -u app sqlite3 /home/app/deptosbo/data/prod.db 'PRAGMA integrity_check;'
```

El resultado debe ser `ok`. El archivo contiene datos operativos y enlaces
privados, por lo que nunca debe pasar por GitHub ni por almacenamiento público.

## 6. Instalar y arrancar DeptosBO

```bash
cd /home/app/deptosbo
sudo -u app npm run db:push
sudo -u app npm run build
sudo install -m 644 deploy/systemd/deptosbo.service /etc/systemd/system/deptosbo.service
sudo systemctl daemon-reload
sudo systemctl enable --now deptosbo
curl --fail http://127.0.0.1:3000/api/health
```

## 7. Instalar nginx y HTTPS

Primero obtener el certificado mientras el DNS está sin proxy:

```bash
sudo certbot certonly --nginx -d app.deptosbo.com
sudo install -m 644 deploy/nginx/deptosbo.conf /etc/nginx/sites-available/deptosbo.conf
sudo ln -sfn /etc/nginx/sites-available/deptosbo.conf /etc/nginx/sites-enabled/deptosbo.conf
sudo install -m 644 deploy/nginx/maintenance.html /etc/nginx/html/maintenance.html
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://app.deptosbo.com/api/health
```

## 8. Cron, respaldos y logs

```bash
sudo chmod +x /home/app/deptosbo/scripts/*.sh
sudo -u app crontab /home/app/deptosbo/deploy/cron/deptosbo.cron
sudo install -m 644 deploy/logrotate/deptosbo /etc/logrotate.d/deptosbo
sudo install -m 644 deploy/systemd/journald.d/deptosbo-caps.conf /etc/systemd/journald.conf.d/deptosbo-caps.conf
sudo systemctl restart systemd-journald
sudo -u app /home/app/deptosbo/scripts/backup-db.sh
```

Verificar que existen `/home/app/backups/latest` y un archivo válido bajo
`/home/app/backups/daily/`.

## 9. Despliegues posteriores

El workflow `.github/workflows/deploy.yml` construye en GitHub Actions y copia
el artefacto por SSH. Configurar:

- Variable `DROPLET_HOST`: IP estática de Lightsail.
- Variable `DROPLET_USER`: `app`.
- Variable `DROPLET_KNOWN_HOSTS`: salida verificada de `ssh-keyscan`.
- Secret `DEPLOY_KEY`: clave privada dedicada exclusivamente al despliegue.

El nombre histórico de estas variables puede mantenerse; apuntarán a la
instancia Lightsail. El workflow permanece inactivo mientras `DROPLET_HOST`
esté vacío.

## 10. Lista de aceptación

- `https://app.deptosbo.com/api/health` responde `status: ok`.
- El inicio de sesión funciona en una ventana privada.
- El calendario maestro carga los 23 departamentos.
- Una sincronización manual de Airbnb termina sin error.
- Una reserva de prueba se crea, modifica y cancela correctamente.
- El cron aparece con `sudo -u app crontab -l`.
- Existe un respaldo íntegro y un snapshot automático de Lightsail.
- Cloudflare está en `Full (strict)` y el proxy está habilitado.
- Los puertos públicos se limitan a 22, 80 y 443.

