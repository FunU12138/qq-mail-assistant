$ErrorActionPreference = "Continue"

$tunnelClient = "C:\Tools\tunnel-client-v0.0.13-windows-amd64\tunnel-client.exe"
$profilePath = Join-Path $env:APPDATA "tunnel-client\qq-mail.yaml"

Write-Host "QQ Mail Assistant tunnel readiness check" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Local MCP health" -ForegroundColor Cyan
try {
  $mcp = Invoke-WebRequest -Uri "http://127.0.0.1:3050/healthz" -UseBasicParsing -TimeoutSec 3
  Write-Host "PASS local MCP health: $($mcp.StatusCode) $($mcp.Content)" -ForegroundColor Green
} catch {
  Write-Host "FAIL local MCP health: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. MCP tools/list" -ForegroundColor Cyan
try {
  $body = @{
    jsonrpc = "2.0"
    id = "check-tools"
    method = "tools/list"
    params = @{}
  } | ConvertTo-Json -Depth 10
  $toolsResp = Invoke-WebRequest -Uri "http://127.0.0.1:3050/mcp" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 5
  $json = $toolsResp.Content | ConvertFrom-Json
  $count = $json.result.tools.Count
  Write-Host "PASS tools/list returned $count tools" -ForegroundColor Green
  $json.result.tools | ForEach-Object { Write-Host " - $($_.name)" }
} catch {
  Write-Host "FAIL tools/list: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Tunnel profile" -ForegroundColor Cyan
if (Test-Path -LiteralPath $profilePath) {
  Write-Host "PASS profile exists: $profilePath" -ForegroundColor Green
  Get-Content -LiteralPath $profilePath | Select-String "tunnel_id|url:" | ForEach-Object { Write-Host $_.Line }
} else {
  Write-Host "FAIL profile missing: $profilePath" -ForegroundColor Red
}

Write-Host ""
Write-Host "4. Tunnel health on port 8080" -ForegroundColor Cyan
try {
  & $tunnelClient health --port 8080 --json --require-control-plane-poll
  if ($LASTEXITCODE -eq 0) {
    Write-Host "PASS tunnel-client is healthy and has polled control plane" -ForegroundColor Green
  } else {
    Write-Host "FAIL tunnel-client health exited with $LASTEXITCODE" -ForegroundColor Red
  }
} catch {
  Write-Host "FAIL tunnel-client health: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "5. What to check in ChatGPT" -ForegroundColor Cyan
Write-Host "- Use the exact same ChatGPT workspace/organization as the Platform tunnel."
Write-Host "- Keep this launcher window open while creating the connector."
Write-Host "- Do not upload an icon during first creation."
Write-Host "- Use Tunnel mode, paste the tunnel_id shown above, and keep authentication as None."
Write-Host "- If it still fails, create a new tunnel in the same workspace and restart the launcher with the new tunnel_id."
