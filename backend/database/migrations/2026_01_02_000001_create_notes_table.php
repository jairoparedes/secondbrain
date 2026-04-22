<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();

            // Datos cifrados (zero-knowledge)
            $table->text('title_ciphertext')->nullable();
            $table->text('content_ciphertext');
            $table->text('note_key_wrapped'); // AES-GCM(note_key, master_key)
            $table->string('iv', 32);          // base64 del IV usado en el contenido

            // Metadatos no sensibles
            $table->unsignedBigInteger('client_version')->default(1);
            $table->uuid('client_id')->nullable(); // device que creó/modificó

            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'updated_at']);
            $table->index(['user_id', 'deleted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
