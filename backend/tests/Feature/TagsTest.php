<?php

namespace Tests\Feature;

use App\Domains\Tags\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TagsTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_tags_requires_auth(): void
    {
        $this->getJson('/api/tags')->assertStatus(401);
    }

    public function test_user_sees_only_their_tags(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        Tag::create(['user_id' => $alice->id, 'name' => 'work']);
        Tag::create(['user_id' => $alice->id, 'name' => 'personal']);
        Tag::create(['user_id' => $bob->id, 'name' => 'private-bob']);

        Sanctum::actingAs($alice);

        $res = $this->getJson('/api/tags')->assertOk();

        $this->assertCount(2, $res->json('data'));
        $this->assertEqualsCanonicalizing(
            ['personal', 'work'],
            collect($res->json('data'))->pluck('name')->all()
        );
    }

    public function test_create_tag(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/tags', ['name' => 'ideas', 'color' => '#ff8800'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'ideas')
            ->assertJsonPath('data.color', '#ff8800');

        $this->assertDatabaseHas('tags', ['name' => 'ideas', 'user_id' => $user->id]);
    }

    public function test_create_tag_rejects_duplicate_name_per_user(): void
    {
        $user = User::factory()->create();
        Tag::create(['user_id' => $user->id, 'name' => 'dup']);

        Sanctum::actingAs($user);

        $this->postJson('/api/tags', ['name' => 'dup'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    public function test_two_users_can_have_same_tag_name(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        Tag::create(['user_id' => $alice->id, 'name' => 'shared']);

        Sanctum::actingAs($bob);
        $this->postJson('/api/tags', ['name' => 'shared'])->assertCreated();
    }

    public function test_delete_tag(): void
    {
        $user = User::factory()->create();
        $tag = Tag::create(['user_id' => $user->id, 'name' => 'tmp']);

        Sanctum::actingAs($user);

        $this->deleteJson('/api/tags/'.$tag->id)->assertNoContent();
        $this->assertDatabaseMissing('tags', ['id' => $tag->id]);
    }

    public function test_cannot_delete_other_users_tag(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $tag = Tag::create(['user_id' => $alice->id, 'name' => 'alice-tag']);

        Sanctum::actingAs($bob);

        $this->deleteJson('/api/tags/'.$tag->id)->assertStatus(404);
        $this->assertDatabaseHas('tags', ['id' => $tag->id]);
    }
}
