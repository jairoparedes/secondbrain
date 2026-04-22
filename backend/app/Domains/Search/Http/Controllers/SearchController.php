<?php

namespace App\Domains\Search\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:500'],
        ]);

        return response()->json([
            'data' => [],
            'meta' => [
                'query' => $request->string('q'),
                'mode' => 'blind_index',
                'note' => 'Fase 3: búsqueda full-text. Fase 4: búsqueda semántica.',
            ],
        ]);
    }
}
