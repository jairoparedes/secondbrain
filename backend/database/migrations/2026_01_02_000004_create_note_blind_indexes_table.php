<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_blind_indexes', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('note_id')->constrained('notes')->cascadeOnDelete();
            // HMAC(token, master_key) en base64
            $table->string('token_hmac', 64);
            $table->timestamp('created_at')->nullable();

            $table->index('token_hmac');
            $table->index('note_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_blind_indexes');
    }
};
