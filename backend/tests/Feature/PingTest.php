<?php

namespace Tests\Feature;

use Tests\TestCase;

class PingTest extends TestCase
{
    public function test_api_ping_returns_ok(): void
    {
        $this->getJson('/api/ping')
            ->assertOk()
            ->assertJson(['status' => 'ok', 'service' => 'secondbrain-api']);
    }
}
