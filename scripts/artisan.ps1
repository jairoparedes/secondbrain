#!/usr/bin/env pwsh
# Wrapper para artisan dentro del contenedor backend
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
docker compose exec backend php artisan @args
