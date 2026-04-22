#!/bin/sh
set -e

cd /var/www/html

# Instala dependencias si no existen
if [ ! -d "vendor" ] || [ ! -f "vendor/autoload.php" ]; then
    echo "[entrypoint] Instalando dependencias de composer..."
    composer install --no-interaction --prefer-dist --optimize-autoloader
fi

# Genera APP_KEY si no existe
if [ -f ".env" ] && ! grep -q "^APP_KEY=base64:" .env; then
    echo "[entrypoint] Generando APP_KEY..."
    php artisan key:generate --force || true
fi

# Espera Postgres (hasta 30s)
if [ -n "$DB_HOST" ]; then
    echo "[entrypoint] Esperando a Postgres en $DB_HOST:$DB_PORT..."
    for i in $(seq 1 30); do
        if php -r "try { new PDO('pgsql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_DATABASE', '$DB_USERNAME', '$DB_PASSWORD'); exit(0); } catch (Exception \$e) { exit(1); }" 2>/dev/null; then
            echo "[entrypoint] Postgres listo."
            break
        fi
        sleep 1
    done
fi

# Migraciones automaticas solo si APP_ENV=local
if [ "$APP_ENV" = "local" ]; then
    echo "[entrypoint] Ejecutando migraciones..."
    php artisan migrate --force || true
fi

# Permisos de storage y bootstrap/cache
chmod -R ug+rwx storage bootstrap/cache 2>/dev/null || true

exec "$@"
