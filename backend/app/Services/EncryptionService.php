<?php

namespace App\Services;

/**
 * EncryptionService
 *
 * IMPORTANTE: En la arquitectura zero-knowledge de Second Brain,
 * el SERVIDOR NUNCA cifra ni descifra el contenido de las notas.
 * Toda la criptografía de datos de usuario vive en el cliente.
 *
 * Este servicio sólo existe para:
 *  - validar formato de ciphertext recibido (longitud, base64, magic bytes),
 *  - generar salts públicos (KDF) al registrar usuarios,
 *  - cifrar datos que SÍ son del servidor (tokens, audit log, etc.)
 *    usando las claves de Laravel (APP_KEY).
 */
class EncryptionService
{
    public function generateKdfSalt(int $bytes = 16): string
    {
        return base64_encode(random_bytes($bytes));
    }

    public function isValidCiphertext(?string $ciphertext): bool
    {
        if (! is_string($ciphertext) || $ciphertext === '') {
            return false;
        }

        $decoded = base64_decode($ciphertext, true);

        // AES-GCM: mínimo 12 (iv) + 16 (tag) = 28 bytes; pedimos algo razonable.
        return $decoded !== false && strlen($decoded) >= 28;
    }
}
