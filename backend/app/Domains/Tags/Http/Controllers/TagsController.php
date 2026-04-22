<?php

namespace App\Domains\Tags\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TagsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => []]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json([
            'error' => ['code' => 'NOT_IMPLEMENTED', 'message' => 'Tags::store (fase 1).'],
        ], 501);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'error' => ['code' => 'NOT_IMPLEMENTED', 'message' => 'Tags::destroy (fase 1).'],
        ], 501);
    }
}
