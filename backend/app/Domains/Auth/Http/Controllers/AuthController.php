<?php

namespace App\Domains\Auth\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Auth::register aún no implementado (fase 1).',
            ],
        ], 501);
    }

    public function login(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Auth::login aún no implementado (fase 1).',
            ],
        ], 501);
    }

    public function refresh(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Auth::refresh aún no implementado (fase 1).',
            ],
        ], 501);
    }

    public function logout(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Auth::logout aún no implementado (fase 1).',
            ],
        ], 501);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'NOT_IMPLEMENTED',
                'message' => 'Auth::me aún no implementado (fase 1).',
            ],
        ], 501);
    }
}
