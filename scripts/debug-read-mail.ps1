$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "runtime"
$secretDir = Join-Path $runtimeDir "secrets"
$healthUrl = "http://127.0.0.1:3050/healthz"
$mcpUrl = "http://127.0.0.1:3050/mcp"

Set-Location -LiteralPath $projectRoot

function Read-SavedSecret {
  param([Parameter(Mandatory = $true)][string]$Name)
  $file = Join-Path $secretDir "$Name.dpapi"
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Missing saved secret: $file. Start the QQ Mail Assistant launcher once and save the value."
  }
  $secure = Get-Content -LiteralPath $file | ConvertTo-SecureString
  return (New-Object System.Net.NetworkCredential "ignored", $secure).Password
}

function Invoke-McpTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [hashtable]$Arguments = @{}
  )
  $body = @{
    jsonrpc = "2.0"
    id = $Name
    method = "tools/call"
    params = @{
      name = $Name
      arguments = $Arguments
    }
  } | ConvertTo-Json -Depth 20

  $response = Invoke-WebRequest -Uri $mcpUrl -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 45
  return $response.Content | ConvertFrom-Json
}

try {
  $env:QQ_MAIL_AUTH_CODE = Read-SavedSecret -Name "qq-mail-auth-code"
  $env:QQ_MAIL_ASSISTANT_HOST = "127.0.0.1"
  $env:QQ_MAIL_ASSISTANT_PORT = "3050"
  $env:QQ_MAIL_CONFIG = Join-Path $projectRoot "config\local.json"
  $env:QQ_MAIL_RUNTIME_DIR = $runtimeDir
  $env:QQ_MAIL_OUTGOING_DIR = Join-Path $projectRoot "outgoing"

  Write-Host "Checking local MCP health..." -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "Existing MCP is running." -ForegroundColor Green
  } catch {
    Write-Host "MCP is not running. Start it with start-qq-mail-assistant.cmd first." -ForegroundColor Red
    throw
  }

  Write-Host ""
  Write-Host "Calling list_emails limit=10..." -ForegroundColor Cyan
  $list = Invoke-McpTool -Name "list_emails" -Arguments @{ limit = 10 }
  $list | ConvertTo-Json -Depth 20

  Write-Host ""
  Write-Host "Calling search_emails query='QQ' limit=10 scan_limit=50..." -ForegroundColor Cyan
  $search = Invoke-McpTool -Name "search_emails" -Arguments @{ query = "QQ"; limit = 10; scan_limit = 50 }
  $search | ConvertTo-Json -Depth 20
} catch {
  Write-Host ""
  Write-Host "Read-mail debug failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
