#!/usr/bin/env pwsh
param([switch]$Volumes)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if ($Volumes) {
    docker compose down -v
} else {
    docker compose down
}
