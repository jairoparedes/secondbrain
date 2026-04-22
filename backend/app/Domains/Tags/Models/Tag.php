<?php

namespace App\Domains\Tags\Models;

use App\Domains\Notes\Models\Note;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Tag extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'name',
        'color',
    ];

    public function notes(): BelongsToMany
    {
        return $this->belongsToMany(Note::class, 'note_tags');
    }
}
