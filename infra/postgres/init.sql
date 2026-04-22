-- =========================================
-- Second Brain - inicializacion de PostgreSQL
-- Se ejecuta UNA sola vez al crear el volumen
-- =========================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Configuracion de busqueda full-text en espanol
-- (complementa la default 'simple' y 'english')
-- Se puede usar desde Laravel con to_tsvector('spanish', content)
