<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'service' => 'secondbrain-api',
        'docs' => '/api/ping',
    ]);
});
