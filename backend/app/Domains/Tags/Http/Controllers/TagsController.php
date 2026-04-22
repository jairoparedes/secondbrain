<?php

namespace App\Domains\Tags\Http\Controllers;

use App\Domains\Tags\Models\Tag;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TagsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tags = Tag::query()
            ->where('user_id', $request->user()->id)
            ->orderBy('name')
            ->get()
            ->map(fn (Tag $t) => $this->resource($t));

        return response()->json(['data' => $tags]);
    }

    public function store(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'name' => [
                'required', 'string', 'max:64',
                Rule::unique('tags', 'name')->where(fn ($q) => $q->where('user_id', $userId)),
            ],
            'color' => ['nullable', 'string', 'regex:/^#?[0-9a-fA-F]{3,8}$/', 'max:9'],
        ]);

        $tag = Tag::create([
            'user_id' => $userId,
            'name' => $data['name'],
            'color' => $data['color'] ?? null,
        ]);

        return response()->json(['data' => $this->resource($tag)], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $tag = Tag::query()
            ->where('user_id', $request->user()->id)
            ->findOrFail($id);

        $tag->delete();

        return response()->json(null, 204);
    }

    private function resource(Tag $t): array
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'color' => $t->color,
            'created_at' => optional($t->created_at)->toIso8601String(),
        ];
    }
}
