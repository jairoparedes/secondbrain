<?php

namespace Tests\Feature;

use App\Domains\Notes\Models\Note;
use App\Domains\Tags\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotesTest extends TestCase
{
    use RefreshDatabase;

    private function createNote(User $user, array $overrides = []): Note
    {
        return Note::create(array_merge([
            'user_id' => $user->id,
            'title_ciphertext' => 'title-'.uniqid(),
            'content_ciphertext' => 'payload-'.uniqid(),
            'note_key_wrapped' => '',
            'iv' => '',
        ], $overrides));
    }

    public function test_list_requires_auth(): void
    {
        $this->getJson('/api/notes')->assertStatus(401);
    }

    public function test_list_is_scoped_to_user_and_paginates(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        foreach (range(1, 3) as $_) {
            $this->createNote($alice);
        }
        $this->createNote($bob);

        Sanctum::actingAs($alice);

        $res = $this->getJson('/api/notes?per_page=10')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['page', 'per_page', 'total']]);

        $this->assertSame(3, $res->json('meta.total'));
        $this->assertCount(3, $res->json('data'));
    }

    public function test_create_note_with_tags(): void
    {
        $user = User::factory()->create();
        $tag1 = Tag::create(['user_id' => $user->id, 'name' => 'a']);
        $tag2 = Tag::create(['user_id' => $user->id, 'name' => 'b']);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/notes', [
            'title_ciphertext' => 'enc-title',
            'content_ciphertext' => 'enc-content',
            'tag_ids' => [$tag1->id, $tag2->id],
        ])->assertCreated();

        $this->assertCount(2, $res->json('data.tag_ids'));
        $this->assertDatabaseCount('note_tags', 2);
    }

    public function test_create_rejects_tag_of_other_user(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $bobTag = Tag::create(['user_id' => $bob->id, 'name' => 'bob-tag']);

        Sanctum::actingAs($alice);

        $this->postJson('/api/notes', [
            'content_ciphertext' => 'c',
            'tag_ids' => [$bobTag->id],
        ])->assertStatus(422);
    }

    public function test_create_requires_content(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/notes', [])->assertStatus(422);
    }

    public function test_show_only_owner(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $note = $this->createNote($alice);

        Sanctum::actingAs($bob);
        $this->getJson('/api/notes/'.$note->id)->assertStatus(404);

        Sanctum::actingAs($alice);
        $this->getJson('/api/notes/'.$note->id)->assertOk()
            ->assertJsonPath('data.id', $note->id);
    }

    public function test_update_note_and_sync_tags(): void
    {
        $user = User::factory()->create();
        $note = $this->createNote($user);
        $tag = Tag::create(['user_id' => $user->id, 'name' => 'important']);

        Sanctum::actingAs($user);

        $this->putJson('/api/notes/'.$note->id, [
            'content_ciphertext' => 'updated',
            'tag_ids' => [$tag->id],
        ])
            ->assertOk()
            ->assertJsonPath('data.content_ciphertext', 'updated')
            ->assertJsonPath('data.tag_ids.0', $tag->id);
    }

    public function test_destroy_soft_deletes(): void
    {
        $user = User::factory()->create();
        $note = $this->createNote($user);

        Sanctum::actingAs($user);

        $this->deleteJson('/api/notes/'.$note->id)->assertNoContent();

        $this->assertSoftDeleted('notes', ['id' => $note->id]);

        // Por defecto, index no incluye trashed.
        $this->getJson('/api/notes')->assertJsonPath('meta.total', 0);

        // Con ?trashed=1 sí aparece.
        $this->getJson('/api/notes?trashed=1')->assertJsonPath('meta.total', 1);
    }

    public function test_restore_returns_note_to_active(): void
    {
        $user = User::factory()->create();
        $note = $this->createNote($user);
        $note->delete();

        Sanctum::actingAs($user);

        $this->postJson('/api/notes/'.$note->id.'/restore')
            ->assertOk()
            ->assertJsonPath('data.id', $note->id)
            ->assertJsonPath('data.deleted_at', null);

        $this->assertDatabaseHas('notes', ['id' => $note->id, 'deleted_at' => null]);
    }

    public function test_cannot_update_other_users_note(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $note = $this->createNote($alice);

        Sanctum::actingAs($bob);

        $this->putJson('/api/notes/'.$note->id, ['content_ciphertext' => 'hacked'])
            ->assertStatus(404);

        $this->assertDatabaseMissing('notes', ['id' => $note->id, 'content_ciphertext' => 'hacked']);
    }
}
