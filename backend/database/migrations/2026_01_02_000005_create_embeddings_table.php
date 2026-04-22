<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // pgvector se habilita en infra/postgres/init.sql
        DB::statement('CREATE EXTENSION IF NOT EXISTS vector');

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS embeddings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                model VARCHAR(64) NOT NULL,
                dimensions INTEGER NOT NULL,
                vector vector(1536),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (note_id, model)
            )
        SQL);

        DB::statement('CREATE INDEX IF NOT EXISTS embeddings_note_id_idx ON embeddings(note_id)');

        // IVFFlat cosine index para busqueda semantica rapida
        // (se puede recrear con otro 'lists' cuando haya mas datos)
        DB::statement(<<<'SQL'
            CREATE INDEX IF NOT EXISTS embeddings_vector_idx
            ON embeddings
            USING ivfflat (vector vector_cosine_ops)
            WITH (lists = 100)
        SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('embeddings');
    }
};
