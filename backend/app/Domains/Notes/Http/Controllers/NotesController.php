<?php

namespace App\Domains\Notes\Http\Controllers;

use App\Domains\Notes\Models\Note;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'trashed' => ['nullable', 'boolean'],
        ]);

        $perPage = (int) ($validated['per_page'] ?? 25);
        $trashed = (bool) ($validated['trashed'] ?? false);

        $query = Note::query()
            ->where('user_id', $request->user()->id)
            ->with('tags')
            ->orderByDesc('updated_at');

        if ($trashed) {
            $query->onlyTrashed();
        }

        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => $paginator->getCollection()->map(fn (Note $n) => $this->resource($n))->values(),
            'meta' => [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'title_ciphertext' => ['nullable', 'string'],
            // En Fase 1 aceptamos este campo como opaco. En Fase 2 el cliente
            // mandará aquí el base64 del AES-256-GCM del contenido.
            'content_ciphertext' => ['required', 'string'],
            'note_key_wrapped' => ['nullable', 'string'],
            'iv' => ['nullable', 'string', 'max:32'],
            'client_id' => ['nullable', 'uuid'],
            'client_version' => ['nullable', 'integer', 'min:1'],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['uuid', Rule::exists('tags', 'id')->where(fn ($q) => $q->where('user_id', $userId))],
        ]);

        $note = Note::create([
            'user_id' => $userId,
            'title_ciphertext' => $data['title_ciphertext'] ?? null,
            'content_ciphertext' => $data['content_ciphertext'],
            // Valores placeholder para satisfacer el esquema actual hasta Fase 2.
            'note_key_wrapped' => $data['note_key_wrapped'] ?? '',
            'iv' => $data['iv'] ?? '',
            'client_id' => $data['client_id'] ?? null,
            'client_version' => $data['client_version'] ?? 1,
        ]);

        if (! empty($data['tag_ids'])) {
            $note->tags()->sync($data['tag_ids']);
        }

        $note->load('tags');

        return response()->json(['data' => $this->resource($note)], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $note = $this->findOwnedOrFail($request, $id, withTrashed: true);

        return response()->json(['data' => $this->resource($note)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $userId = $request->user()->id;
        $note = $this->findOwnedOrFail($request, $id);

        $data = $request->validate([
            'title_ciphertext' => ['sometimes', 'nullable', 'string'],
            'content_ciphertext' => ['sometimes', 'string'],
            'note_key_wrapped' => ['sometimes', 'nullable', 'string'],
            'iv' => ['sometimes', 'nullable', 'string', 'max:32'],
            'client_id' => ['sometimes', 'nullable', 'uuid'],
            'client_version' => ['sometimes', 'integer', 'min:1'],
            'tag_ids' => ['sometimes', 'array'],
            'tag_ids.*' => ['uuid', Rule::exists('tags', 'id')->where(fn ($q) => $q->where('user_id', $userId))],
        ]);

        $note->fill(array_filter(
            [
                'title_ciphertext' => $data['title_ciphertext'] ?? null,
                'content_ciphertext' => $data['content_ciphertext'] ?? null,
                'note_key_wrapped' => $data['note_key_wrapped'] ?? null,
                'iv' => $data['iv'] ?? null,
                'client_id' => $data['client_id'] ?? null,
                'client_version' => $data['client_version'] ?? null,
            ],
            fn ($v, $k) => array_key_exists($k, $data),
            ARRAY_FILTER_USE_BOTH
        ));

        $note->save();

        if (array_key_exists('tag_ids', $data)) {
            $note->tags()->sync($data['tag_ids'] ?? []);
        }

        $note->load('tags');

        return response()->json(['data' => $this->resource($note)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $note = $this->findOwnedOrFail($request, $id);
        $note->delete();

        return response()->json(null, 204);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $note = Note::onlyTrashed()
            ->where('user_id', $request->user()->id)
            ->findOrFail($id);

        $note->restore();
        $note->load('tags');

        return response()->json(['data' => $this->resource($note)]);
    }

    private function findOwnedOrFail(Request $request, string $id, bool $withTrashed = false): Note
    {
        $query = Note::query()->where('user_id', $request->user()->id)->with('tags');

        if ($withTrashed) {
            $query->withTrashed();
        }

        return $query->findOrFail($id);
    }

    private function resource(Note $n): array
    {
        return [
            'id' => $n->id,
            'title_ciphertext' => $n->title_ciphertext,
            'content_ciphertext' => $n->content_ciphertext,
            'note_key_wrapped' => $n->note_key_wrapped,
            'iv' => $n->iv,
            'client_id' => $n->client_id,
            'client_version' => $n->client_version,
            'tag_ids' => $n->relationLoaded('tags') ? $n->tags->pluck('id')->values() : [],
            'created_at' => optional($n->created_at)->toIso8601String(),
            'updated_at' => optional($n->updated_at)->toIso8601String(),
            'deleted_at' => optional($n->deleted_at)->toIso8601String(),
        ];
    }
}
