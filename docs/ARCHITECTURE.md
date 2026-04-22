# Arquitectura

## Visión general

```
                    ┌─────────────┐
                    │   Cliente   │  (Navegador / PWA)
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │    Nginx    │  reverse proxy + TLS
                    └──┬───────┬──┘
                       │       │
                /api   │       │  /  (SSR + assets)
                       │       │
              ┌────────▼─┐   ┌─▼────────┐
              │ Laravel  │   │ Next.js  │
              │ (PHP-FPM)│   │  (Node)  │
              └─────┬────┘   └──────────┘
                    │
      ┌─────────────┼────────────────┐
      │             │                │
┌─────▼─────┐  ┌────▼────┐     ┌─────▼─────┐
│ Postgres  │  │  Redis  │     │   MinIO   │
│ +pgvector │  │ (cache/ │     │  (S3)     │
└───────────┘  │  queue) │     └───────────┘
               └─────────┘
```

## Principios

1. **Zero-knowledge** — el backend nunca ve el contenido plano de las notas. Toda la criptografía vive en el cliente.
2. **Monolito modular** — Laravel organizado por dominios (`app/Domains/*`). Migración a microservicios solo si el dolor lo justifica.
3. **Offline-first** — el frontend es una PWA que funciona sin red y sincroniza cuando hay conexión (IndexedDB + event log).
4. **Search layered** — full-text barato (Postgres `tsvector`) + semántica cara (embeddings en `pgvector`), ambos sirviendo al mismo endpoint.
5. **Todo cifrado en reposo** — Postgres con TDE (producción), MinIO con server-side encryption.

## Dominios del backend

| Dominio  | Responsabilidad                                         |
|----------|---------------------------------------------------------|
| `Auth`   | Registro, login, refresh tokens, 2FA                    |
| `Notes`  | CRUD de notas cifradas, versiones, papelera             |
| `Tags`   | Organización y filtros                                  |
| `Search` | Full-text y búsqueda semántica unificadas               |
| `Sync`   | Event log, push/pull, resolución de conflictos          |

## Decisiones clave (ADRs abreviados)

### ADR-001: PostgreSQL + pgvector (no Elasticsearch todavía)
**Contexto:** Necesitamos full-text y semántica.
**Decisión:** Postgres `tsvector` + `pgvector` cubre MVP y fase 4. Evitamos la complejidad operacional de ES hasta tener > 10M notas o latencia problemática.
**Consecuencia:** Migración futura a ES está contemplada pero no bloqueante.

### ADR-002: Laravel monolito modular, no microservicios
**Contexto:** Tentación de partir en servicios desde el día 1.
**Decisión:** Un solo servicio Laravel con dominios bien separados. Un worker de colas aparte.
**Consecuencia:** Despliegue simple, refactor a servicios es posible si un dominio escala de forma distinta.

### ADR-003: Cifrado en cliente con Web Crypto API
**Contexto:** Zero-knowledge real.
**Decisión:** AES-256-GCM para el contenido, Argon2id para derivación de clave (via `argon2-browser` WASM). Clave maestra nunca sale del dispositivo.
**Consecuencia:** No podemos indexar el contenido en el servidor; la búsqueda se hace sobre índices cifrados (blind index) o localmente en el cliente con el índice descifrado.

### ADR-004: UUID como PK en todas las tablas
Facilita sincronización offline-first sin colisiones.
