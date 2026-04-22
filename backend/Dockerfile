# syntax=docker/dockerfile:1.6

FROM php:8.3-fpm-alpine AS base

# Dependencias del sistema
RUN apk add --no-cache \
        bash \
        git \
        unzip \
        icu-dev \
        libzip-dev \
        zlib-dev \
        oniguruma-dev \
        postgresql-dev \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
        autoconf \
        g++ \
        make \
        linux-headers

# Extensiones PHP requeridas por Laravel + Postgres + nuestras features
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_pgsql \
        pgsql \
        bcmath \
        intl \
        zip \
        opcache \
        gd \
        exif \
        pcntl \
        sockets

# Redis via PECL
RUN pecl install redis \
 && docker-php-ext-enable redis

# Composer (desde imagen oficial)
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Usuario no root con UID 1000 (para matchear host en Linux; en Windows no hace daño)
RUN addgroup -g 1000 -S app \
 && adduser -u 1000 -S app -G app

WORKDIR /var/www/html

# PHP-FPM escucha en TCP 9000 (ya es el default de la imagen)
EXPOSE 9000

# Entrypoint: instala deps si faltan y corre php-fpm
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm", "-F"]
