<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // API puro con Bearer tokens de Sanctum; no usamos auth por cookie/sesión.
        // Si en el futuro se añade SPA con Next.js usando cookies, habilitar
        // $middleware->statefulApi() y configurar SANCTUM_STATEFUL_DOMAINS.
        $middleware->throttleApi();
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Todos los errores bajo /api/* se devuelven en formato { error: { code, message } }.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson()
        );

        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'VALIDATION_FAILED',
                    'message' => $e->getMessage(),
                    'fields' => $e->errors(),
                ],
            ], 422);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'UNAUTHENTICATED',
                    'message' => 'Se requiere autenticación.',
                ],
            ], 401);
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'FORBIDDEN',
                    'message' => $e->getMessage() ?: 'Acción no permitida.',
                ],
            ], 403);
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'Recurso no encontrado.',
                ],
            ], 404);
        });

        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'Ruta no encontrada.',
                ],
            ], 404);
        });

        $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'METHOD_NOT_ALLOWED',
                    'message' => 'Método HTTP no permitido para esta ruta.',
                ],
            ], 405);
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'error' => [
                    'code' => 'HTTP_'.$e->getStatusCode(),
                    'message' => $e->getMessage() ?: 'Error HTTP.',
                ],
            ], $e->getStatusCode());
        });
    })->create();
