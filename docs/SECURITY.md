# Seguridad — Zero-Knowledge

## Modelo de amenazas

Asumimos que el servidor puede ser **totalmente comprometido** (DB leak, sysadmin malicioso, subpoena). El diseño debe garantizar que un atacante con acceso completo al backend no puede leer ninguna nota.

## Flujo de claves

```
password (solo memoria del cliente)
    │
    ▼  Argon2id (salt = user_id, t=3, m=64MB, p=1)
master_key  (32 bytes, nunca sale del cliente)
    │
    ├──► encripta note_keys (una por nota, AES-256-GCM)
    │
    └──► encripta contenido de notas (AES-256-GCM + IV aleatorio)
```

### Qué guarda el servidor

| Campo                    | Contenido                                     |
|--------------------------|-----------------------------------------------|
| `users.password_hash`    | Argon2id de `password + server_pepper`        |
| `users.kdf_salt`         | Salt pública (server-generated) para derivar `master_key` en cliente |
| `notes.title_ciphertext` | AES-GCM(title, note_key)                      |
| `notes.content_ciphertext` | AES-GCM(content, note_key)                  |
| `notes.note_key_wrapped` | AES-GCM(note_key, master_key)                 |
| `notes.iv`               | IV del cifrado de contenido                   |

### Qué NO guarda el servidor

- La contraseña
- `master_key`
- `note_key` en claro
- Contenido de las notas

## Autenticación

- **Password** viaja al servidor solo para el **hash Argon2id** (autenticación), nunca se usa para decrypt en el servidor.
- El servidor devuelve `kdf_salt` y metadatos; el cliente deriva `master_key` localmente.
- JWT de sesión (15 min) + refresh token (7 días, rotante).
- **2FA** (TOTP) opcional en Fase 2.

## Búsqueda sobre datos cifrados

Tres estrategias, combinables:

1. **Blind index** (rápido, parcial): el cliente genera `HMAC(token, master_key)` por cada palabra y lo envía; el servidor guarda el índice HMAC y puede hacer `WHERE blind_index = ?`. Sirve para exact match.
2. **Índice local** (completo): el cliente mantiene un índice invertido en IndexedDB, cifrado en reposo. Full-text real, cero fuga.
3. **Semántica cifrada** (futuro): embeddings generados en cliente, búsqueda por similitud se hace comparando vectores cifrados con técnicas de CKKS o similar. Fase >5.

MVP: **(1) + (2)**. Semántica inicial en servidor **solo** con opt-in explícito del usuario (sacrifica zero-knowledge por conveniencia).

## Rotación de claves

- Cambio de password: el cliente descifra `master_key` con la vieja, re-encripta con la nueva, envía `master_key_wrapped` nuevo. Las `note_keys` no cambian.
- Compromiso: re-encriptar todas las `note_keys` (operación O(n) en el cliente).

## Transporte

- TLS 1.3 obligatorio en producción.
- HSTS, CSP estricta, `X-Frame-Options: DENY`.
- CORS whitelist por dominio.
- Rate limiting por IP + por usuario (Laravel RateLimiter + Redis).

## Auditoría

- Log de eventos de seguridad (login, cambio de password, creación de device) en tabla `audit_log` con hash en cadena (append-only, tamper-evident).
