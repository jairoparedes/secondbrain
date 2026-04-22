#!/usr/bin/env pwsh
# Levanta toda la stack de Second Brain
param(
    [switch]$Build,
    [switch]$Recreate
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (-not (Test-Path ".env")) {
    Write-Host "Creando .env desde .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

$cmd = @("compose", "up", "-d")
if ($Build)     { $cmd += "--build" }
if ($Recreate)  { $cmd += "--force-recreate" }

Write-Host "docker $($cmd -join ' ')" -ForegroundColor Cyan
& docker @cmd
