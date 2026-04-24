<?php

use App\Domains\Auth\Http\Controllers\AuthController;
use App\Domains\Notes\Http\Controllers\NotesController;
use App\Domains\Search\Http\Controllers\SearchController;
use App\Domains\Sync\Http\Controllers\SyncController;
use App\Domains\Tags\Http\Controllers\TagsController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Todos los endpoints del Second Brain viven bajo /api (configurado en
| bootstrap/app.php). Los endpoints marcados con auth:sanctum requieren
| un Bearer token personal access token.
|
*/

Route::get('/ping', fn () => response()->json([
    'status' => 'ok',
    'service' => 'secondbrain-api',
    'time' => now()->toIso8601String(),
]));

// ---------- Auth ----------
Route::prefix('auth')->group(function () {
    // Públicos
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);

    // Requieren un token válido
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('refresh', [AuthController::class, 'refresh']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me']);
        Route::post('change-password', [AuthController::class, 'changePassword']);
    });
});

// ---------- Rutas autenticadas ----------
Route::middleware('auth:sanctum')->group(function () {

    // Notes. La ruta /restore se declara antes del apiResource para que
    // el router no intente resolverla como show/{note}.
    Route::post('notes/{id}/restore', [NotesController::class, 'restore']);
    Route::apiResource('notes', NotesController::class);

    // Tags
    Route::get('tags', [TagsController::class, 'index']);
    Route::post('tags', [TagsController::class, 'store']);
    Route::delete('tags/{id}', [TagsController::class, 'destroy']);

    // Search
    Route::get('search', SearchController::class);

    // Sync
    Route::post('sync/push', [SyncController::class, 'push']);
    Route::get('sync/pull', [SyncController::class, 'pull']);
});

// Fallback 404 en formato JSON
Route::fallback(function (Request $request) {
    return response()->json([
        'error' => [
            'code' => 'NOT_FOUND',
            'message' => "Ruta {$request->path()} no existe.",
        ],
    ], 404);
});
