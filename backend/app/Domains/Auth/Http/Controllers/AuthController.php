<?php

namespace App\Domains\Auth\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8)],
            // Opcionales: placeholders zero-knowledge para Fase 2. Si no vienen,
            // se generan en el servidor para no romper el flujo actual.
            'kdf_salt' => ['nullable', 'string', 'max:255'],
            'master_key_wrapped' => ['nullable', 'string'],
        ]);

        $user = User::create([
            'email' => $data['email'],
            'password' => $data['password'],
            'kdf_salt' => $data['kdf_salt'] ?? base64_encode(random_bytes(16)),
            'master_key_wrapped' => $data['master_key_wrapped'] ?? null,
        ]);

        $token = $user->createToken('api', ['*'])->plainTextToken;

        return response()->json([
            'data' => [
                'user' => $this->userResource($user),
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'Credenciales inválidas.',
            ]);
        }

        $token = $user->createToken('api', ['*'])->plainTextToken;

        return response()->json([
            'data' => [
                'user' => $this->userResource($user),
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ]);
    }

    public function refresh(Request $request): JsonResponse
    {
        $user = $request->user();
        $current = $user->currentAccessToken();

        if ($current && isset($current->id)) {
            $user->tokens()->where('id', $current->id)->delete();
        }

        $token = $user->createToken('api', ['*'])->plainTextToken;

        return response()->json([
            'data' => [
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $token = $user->currentAccessToken();

        if ($token && isset($token->id)) {
            $user->tokens()->where('id', $token->id)->delete();
        }

        return response()->json([
            'data' => ['message' => 'Sesión cerrada.'],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->userResource($request->user()),
        ]);
    }

    /**
     * Rotación de password zero-knowledge.
     *
     * El cliente:
     *   1. Descifró master_key con la KEK vieja.
     *   2. Derivó KEK nueva desde la password nueva + kdf_salt nuevo.
     *   3. Re-wrappeó master_key con la KEK nueva → master_key_wrapped nuevo.
     *
     * El servidor:
     *   - Verifica la password actual (Hash::check).
     *   - Re-hashea la password nueva (bcrypt server-side, para Sanctum).
     *   - Actualiza kdf_salt y master_key_wrapped con los valores que trae
     *     el cliente. Las note_keys NO se tocan porque siguen wrappeadas
     *     con la misma master_key.
     *   - Revoca todos los demás tokens del usuario, deja vivo el actual.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', Password::min(8)],
            'new_kdf_salt' => ['required', 'string', 'max:255'],
            'new_master_key_wrapped' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'La contraseña actual no es correcta.',
            ]);
        }

        $user->forceFill([
            'password' => $data['new_password'],
            'kdf_salt' => $data['new_kdf_salt'],
            'master_key_wrapped' => $data['new_master_key_wrapped'],
        ])->save();

        // Revocar todos los tokens excepto el actual.
        $currentId = $request->user()->currentAccessToken()?->id;
        $user->tokens()
            ->when($currentId, fn ($q) => $q->where('id', '!=', $currentId))
            ->delete();

        return response()->json([
            'data' => [
                'message' => 'Contraseña actualizada. Las demás sesiones fueron cerradas.',
            ],
        ]);
    }

    private function userResource(User $user): array
    {
        return [
            'id' => $user->id,
            'email' => $user->email,
            'kdf_salt' => $user->kdf_salt,
            'master_key_wrapped' => $user->master_key_wrapped,
            'created_at' => optional($user->created_at)->toIso8601String(),
        ];
    }
}
