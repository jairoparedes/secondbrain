<?php

namespace App\Domains\Notes\Models;

use App\Domains\Tags\Models\Tag;
use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Note extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'user_id',
        'title_ciphertext',
        'content_ciphertext',
        'note_key_wrapped',
        'iv',
        'encryption_version',
        'client_id',
        'client_version',
    ];

    protected $casts = [
        'encryption_version' => 'integer',
        'client_version' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'note_tags');
    }

    public function relatedNotes(): BelongsToMany
    {
        return $this->belongsToMany(
            Note::class,
            'note_relations',
            'note_id',
            'related_note_id'
        );
    }
}
