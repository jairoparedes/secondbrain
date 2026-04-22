<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_relations', function (Blueprint $table) {
            $table->foreignUuid('note_id')->constrained('notes')->cascadeOnDelete();
            $table->foreignUuid('related_note_id')->constrained('notes')->cascadeOnDelete();
            $table->string('kind', 32)->default('link'); // link | backlink | auto
            $table->float('weight')->default(1.0);
            $table->timestamp('created_at')->nullable();

            $table->primary(['note_id', 'related_note_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_relations');
    }
};
