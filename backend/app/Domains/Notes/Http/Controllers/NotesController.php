<?php

namespace App\Domains\Notes\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [],
            'meta' => ['page' => 1, 'per_page' => 25, 'total' => 0],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->notImplemented('Notes::store');
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return $this->notImplemented('Notes::show');
    }

    public function update(Request $request, string $id): JsonResponse
    {
        return $this->notImplemented('Notes::update');
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        return $this->notImplemented('Notes::destroy');
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        return $this->notImplemented('Notes::restore');
    }

    private function notImplemented(string $op): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => "{$op} aún no implementado (fase 1).",
            ],
        ], 501);
    }
}
