<?php

namespace Tests\Feature;

use App\Domains\Notes\Models\Note;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cobertura de los ajustes de Fase 2 en el backend:
 *  - Las notas aceptan y devuelven el discriminante encryption_version.
 *  - La rotación de password re-escribe kdf_salt + master_key_wrapped
 *    sin tocar las notas existentes y revoca otras sesiones.
 */
class EncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_note_accepts_and_returns_encryption_version(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/notes', [
            'title_ciphertext' => 'Y2lwaGVyZWQtdGl0bGU=',
            'content_ciphertext' => 'Y2lwaGVyZWQtYm9keQ==',
            'note_key_wrapped' => 'd3JhcHBlZC1ub3RlLWtleQ==',
            'encryption_version' => 1,
        ])->assertCreated();

        $res->assertJsonPath('data.encryption_version', 1);

        $this->assertDatabaseHas('notes', [
            'id' => $res->json('data.id'),
            'encryption_version' => 1,
        ]);
    }

    public function test_legacy_notes_default_to_version_zero(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/notes', [
            'content_ciphertext' => 'plain-text-legacy',
        ])->assertCreated();

        $res->assertJsonPath('data.encryption_version', 0);
    }

    public function test_change_password_rotates_kek_metadata_and_revokes_other_tokens(): void
    {
        $user = User::factory()->create();
        $current = $user->createToken('current')->plainTextToken;
        $other = $user->createToken('other')->plainTextToken;

        $this->assertDatabaseCount('personal_access_tokens', 2);

        $this->withHeader('Authorization', 'Bearer '.$current)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'password', // valor por default del factory
                'new_password' => 'new-super-secret-456',
                'new_kdf_salt' => 'bmV3LXNhbHQ=',
                'new_master_key_wrapped' => 'bmV3LXdyYXBwZWQtbWFzdGVyLWtleQ==',
            ])->assertOk();

        $user->refresh();
        $this->assertSame('bmV3LXNhbHQ=', $user->kdf_salt);
        $this->assertSame('bmV3LXdyYXBwZWQtbWFzdGVyLWtleQ==', $user->master_key_wrapped);

        // Solo debe sobrevivir el token usado para el cambio.
        $this->assertDatabaseCount('personal_access_tokens', 1);

        $currentId = (int) explode('|', $current, 2)[0];
        $otherId = (int) explode('|', $other, 2)[0];
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentId]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $otherId]);

        // La password nueva funciona para login.
        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'new-super-secret-456',
        ])->assertOk();
    }

    public function test_change_password_rejects_wrong_current_password(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/change-password', [
            'current_password' => 'incorrect',
            'new_password' => 'new-super-secret-456',
            'new_kdf_salt' => 'bmV3LXNhbHQ=',
            'new_master_key_wrapped' => 'bmV3LXdyYXBwZWQ=',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_change_password_preserves_existing_notes(): void
    {
        $user = User::factory()->create();
        $note = Note::create([
            'user_id' => $user->id,
            'title_ciphertext' => 'secret-title-blob',
            'content_ciphertext' => 'secret-content-blob',
            'note_key_wrapped' => 'wrapped-with-old-master',
            'iv' => '',
            'encryption_version' => 1,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/auth/change-password', [
            'current_password' => 'password',
            'new_password' => 'new-super-secret-456',
            'new_kdf_salt' => 'bmV3LXNhbHQ=',
            'new_master_key_wrapped' => 'bmV3LXdyYXBwZWQ=',
        ])->assertOk();

        // Las notas quedan idénticas: la master_key real no cambia,
        // solo cambia cómo se la wrappea con la nueva KEK.
        $this->assertDatabaseHas('notes', [
            'id' => $note->id,
            'title_ciphertext' => 'secret-title-blob',
            'note_key_wrapped' => 'wrapped-with-old-master',
            'encryption_version' => 1,
        ]);
    }
}
