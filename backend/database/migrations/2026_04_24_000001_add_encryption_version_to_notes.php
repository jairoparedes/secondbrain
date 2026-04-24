<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Añade un discriminante de versión de cifrado a la tabla notes.
 *
 *   0 = texto plano (notas creadas en Fase 1 antes del cifrado E2E)
 *   1 = AES-256-GCM con note_key wrappeada por master_key (Fase 2)
 *
 * Permite coexistencia de notas legadas y cifradas, y deja espacio para
 * futuros formatos de cifrado (v2, v3, ...).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->unsignedSmallInteger('encryption_version')->default(0)->after('iv');
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropColumn('encryption_version');
        });
    }
};
