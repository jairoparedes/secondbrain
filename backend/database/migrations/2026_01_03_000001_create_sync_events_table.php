<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('client_id');
            $table->string('type', 64);        // note.created, note.updated, tag.created, ...
            $table->uuid('entity_id');
            $table->jsonb('payload')->nullable();
            $table->unsignedBigInteger('server_seq'); // cursor monotónico por usuario
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'server_seq']);
            $table->index(['user_id', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_events');
    }
};
