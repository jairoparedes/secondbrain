<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tags', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            // name puede ir cifrado o en claro segun feature flag del usuario
            $table->string('name');
            $table->string('color', 16)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });

        Schema::create('note_tags', function (Blueprint $table) {
            $table->foreignUuid('note_id')->constrained('notes')->cascadeOnDelete();
            $table->foreignUuid('tag_id')->constrained('tags')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->primary(['note_id', 'tag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_tags');
        Schema::dropIfExists('tags');
    }
};
