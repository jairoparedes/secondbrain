<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_creates_user_and_returns_token(): void
    {
        $res = $this->postJson('/api/auth/register', [
            'email' => 'alice@sb.test',
            'password' => 'secret1234',
        ]);

        $res->assertCreated()
            ->assertJsonStructure(['data' => ['user' => ['id', 'email'], 'token', 'token_type']]);

        $this->assertDatabaseHas('users', ['email' => 'alice@sb.test']);
    }

    public function test_register_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'dup@sb.test']);

        $this->postJson('/api/auth/register', [
            'email' => 'dup@sb.test',
            'password' => 'secret1234',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_register_rejects_short_password(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'short@sb.test',
            'password' => 'abc',
        ])->assertStatus(422);
    }

    public function test_login_with_valid_credentials_returns_token(): void
    {
        $user = User::factory()->create(['email' => 'bob@sb.test']);

        $this->postJson('/api/auth/login', [
            'email' => 'bob@sb.test',
            'password' => 'password',
        ])
            ->assertOk()
            ->assertJsonStructure(['data' => ['user' => ['id', 'email'], 'token']])
            ->assertJsonPath('data.user.id', $user->id);
    }

    public function test_login_with_invalid_credentials_returns_422(): void
    {
        User::factory()->create(['email' => 'mallory@sb.test']);

        $this->postJson('/api/auth/login', [
            'email' => 'mallory@sb.test',
            'password' => 'wrong-password',
        ])->assertStatus(422);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.email', $user->email);
    }

    public function test_logout_revokes_current_token(): void
    {
        $user = User::factory()->create();
        $plain = $user->createToken('test')->plainTextToken;
        $tokenId = (int) explode('|', $plain, 2)[0];

        // Verificar antes que el token existe.
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $tokenId]);

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/auth/logout')
            ->assertOk();

        // La revocación debe persistirse en la DB (en producción, el siguiente
        // request fallará con 401 porque Sanctum::findToken devolverá null).
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId]);
    }

    public function test_refresh_rotates_token(): void
    {
        $user = User::factory()->create();
        $oldPlain = $user->createToken('test')->plainTextToken;
        $oldId = (int) explode('|', $oldPlain, 2)[0];

        $res = $this->withHeader('Authorization', 'Bearer '.$oldPlain)
            ->postJson('/api/auth/refresh')
            ->assertOk()
            ->assertJsonStructure(['data' => ['token', 'token_type']]);

        $newPlain = $res->json('data.token');
        $this->assertNotSame($oldPlain, $newPlain);

        // El token antiguo debe haber sido eliminado y haber exactamente uno nuevo.
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $oldId]);
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }
}
