<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * EmbeddingService
 *
 * Genera vectores de embedding a partir de texto.
 *
 * Nota: romper zero-knowledge requiere consentimiento explícito del usuario.
 * Cuando el usuario habilita IA, los embeddings se generan en servidor con el
 * texto plano (que el cliente nos envía sólo para este propósito).
 */
class EmbeddingService
{
    public function __construct(
        private readonly string $model = 'text-embedding-3-small',
        private readonly int $dimensions = 1536,
    ) {}

    /**
     * @return array<int, float>
     */
    public function generate(string $text): array
    {
        $apiKey = config('services.openai.api_key');

        if (! $apiKey) {
            // Fallback: devolvemos un vector determinista (para dev sin API key).
            return $this->deterministicFakeEmbedding($text);
        }

        $response = Http::withToken($apiKey)
            ->post('https://api.openai.com/v1/embeddings', [
                'model' => $this->model,
                'input' => $text,
                'dimensions' => $this->dimensions,
            ])
            ->throw();

        return $response->json('data.0.embedding', []);
    }

    /**
     * Embedding falso pero determinista para desarrollo sin OPENAI_API_KEY.
     *
     * @return array<int, float>
     */
    private function deterministicFakeEmbedding(string $text): array
    {
        $seed = crc32($text);
        mt_srand($seed);

        $vector = [];
        for ($i = 0; $i < $this->dimensions; $i++) {
            $vector[] = (mt_rand(0, 2000) - 1000) / 1000.0;
        }

        mt_srand();

        return $vector;
    }
}
