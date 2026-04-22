<?php

namespace App\Domains\Sync\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function push(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Sync::push (fase 5).',
            ],
        ], 501);
    }

    public function pull(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [],
            'meta' => [
                'since' => $request->query('since'),
                'note' => 'Fase 5: sincronización offline-first.',
            ],
        ]);
    }
}
