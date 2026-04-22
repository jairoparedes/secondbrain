#!/usr/bin/env pwsh
# Smoke test end-to-end contra el stack real (nginx -> laravel).
# Ejecuta el flujo completo de la UI: register -> tag -> note -> update -> delete -> restore -> logout.

$ErrorActionPreference = 'Continue'

function CallApi($method, $path, $body, $token) {
  $h = @{ 'Accept' = 'application/json' }
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $params = @{ Uri = "http://localhost$path"; Method = $method; Headers = $h; UseBasicParsing = $true; TimeoutSec = 10 }
  if ($body) { $params.Body = $body; $params.ContentType = 'application/json' }
  try { return Invoke-WebRequest @params } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $rdr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      return [PSCustomObject]@{ StatusCode = [int]$resp.StatusCode; Content = $rdr.ReadToEnd() }
    }
    return [PSCustomObject]@{ StatusCode = 0; Content = $_.Exception.Message }
  }
}

$email = "ui$(Get-Random -Maximum 99999)@sb.test"
Write-Host "1) register $email"
$r = CallApi POST "/api/auth/register" (@{ email=$email; password='secret1234' } | ConvertTo-Json)
$token = ($r.Content | ConvertFrom-Json).data.token
Write-Host "   token ok: $($token.Substring(0, 20))..."

Write-Host "2) create tag trabajo"
$t = CallApi POST "/api/tags" (@{ name='trabajo'; color='#3b82f6' } | ConvertTo-Json) $token
$tagId = ($t.Content | ConvertFrom-Json).data.id
Write-Host "   tag id: $tagId"

Write-Host "3) create note with tag"
$LF = [char]10
$md = "# Agenda del lunes" + $LF + $LF + "- Revisar roadmap" + $LF + "- Priorizar Fase 2"
$nBody = @{ title_ciphertext='Reunion lunes'; content_ciphertext=$md; tag_ids=@($tagId) } | ConvertTo-Json
$n = CallApi POST "/api/notes" $nBody $token
$nid = ($n.Content | ConvertFrom-Json).data.id
Write-Host "   note id: $nid"

Write-Host "4) update note"
$u = CallApi PUT "/api/notes/$nid" (@{ content_ciphertext=($md + $LF + "Actualizado") } | ConvertTo-Json) $token
Write-Host "   updated status: $($u.StatusCode)"

Write-Host "5) list notes"
$l = CallApi GET "/api/notes" $null $token
$o = $l.Content | ConvertFrom-Json
Write-Host "   total: $($o.meta.total), first title: $($o.data[0].title_ciphertext)"

Write-Host "6) delete soft"
$d = CallApi DELETE "/api/notes/$nid" $null $token
Write-Host "   delete status: $($d.StatusCode)"

Write-Host "7) list notes again (should be 0)"
$l2 = CallApi GET "/api/notes" $null $token
$o2 = $l2.Content | ConvertFrom-Json
Write-Host "   total: $($o2.meta.total)"

Write-Host "8) list trashed"
$l3 = CallApi GET "/api/notes?trashed=1" $null $token
$o3 = $l3.Content | ConvertFrom-Json
Write-Host "   trashed total: $($o3.meta.total)"

Write-Host "9) restore"
$rs = CallApi POST "/api/notes/$nid/restore" $null $token
Write-Host "   restore status: $($rs.StatusCode)"

Write-Host "10) logout"
$lo = CallApi POST "/api/auth/logout" $null $token
Write-Host "    logout status: $($lo.StatusCode)"

Write-Host "11) me with old token (expect 401)"
$me = CallApi GET "/api/auth/me" $null $token
Write-Host "    me status after logout: $($me.StatusCode)"
