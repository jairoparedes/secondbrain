<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * SearchService
 *
 * Unifica dos modos de búsqueda:
 *  - blind_index: exact-match sobre HMACs generados en cliente (zero-knowledge).
 *  - semantic:    similaridad coseno sobre pgvector (requiere opt-in de IA).
 */
class SearchService
{
    public function __construct(
        private readonly EmbeddingService $embeddings,
    ) {}

    /**
     * @return Collection<int, object>
     */
    public function byBlindIndex(string $userId, string $hmacToken, int $limit = 50): Collection
    {
        // TODO (fase 3): JOIN con tabla note_blind_indexes.
        return collect();
    }

    /**
     * @return Collection<int, object>
     */
    public function bySemantic(string $userId, string $query, int $limit = 20): Collection
    {
        // TODO (fase 4): pgvector cosine similarity.
        // $vector = $this->embeddings->generate($query);
        // SELECT ... FROM embeddings ORDER BY vector <=> :v LIMIT :limit
        return collect();
    }
}
