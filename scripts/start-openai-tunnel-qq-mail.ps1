$ErrorActionPreference = "Stop"

$Host.UI.RawUI.WindowTitle = "OpenAI Tunnel - QQ Mail"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "runtime"
$secretDir = Join-Path $runtimeDir "secrets"
$tunnelClientDir = "C:\Tools\tunnel-client-v0.0.13-windows-amd64"
$profile = "qq-mail"

New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

function Get-ProcessSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Prompt
  )
  $secretFile = Join-Path $secretDir "$Name.dpapi"
  if (Test-Path -LiteralPath $secretFile) {
    try {
      $secure = Get-Content -LiteralPath $secretFile | ConvertTo-SecureString
      return (New-Object System.Net.NetworkCredential "ignored", $secure).Password
    } catch {
      Write-Host "Saved value could not be decrypted, so it will be requested again: $secretFile" -ForegroundColor Yellow
      Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue
    }
  }
  $secure = Read-Host $Prompt -AsSecureString
  $save = Read-Host "Save this value securely for future launches? Enter Y to save, or press Enter to skip"
  if (($save -eq "Y") -or ($save -eq "y")) {
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
    Write-Host "Value saved with Windows user DPAPI encryption: $secretFile" -ForegroundColor DarkGray
  }
  return (New-Object System.Net.NetworkCredential "ignored", $secure).Password
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $tunnelClientDir "tunnel-client.exe"))) {
    throw "Cannot find tunnel-client.exe at $tunnelClientDir"
  }

  Set-Location -LiteralPath $tunnelClientDir

  Write-Host "OpenAI Secure MCP Tunnel startup window" -ForegroundColor Cyan
  Write-Host "This connects ChatGPT Web to the local QQ Mail MCP server." -ForegroundColor Yellow
  Write-Host ""

  $env:CONTROL_PLANE_API_KEY = Get-ProcessSecret -Name "openai-runtime-api-key" -Prompt "Paste OpenAI Runtime API Key"
  $tunnelId = Get-ProcessSecret -Name "qq-mail-tunnel-id" -Prompt "Paste QQ Mail tunnel id, for example tunnel_xxx"

  $env:HTTPS_PROXY = "http://127.0.0.1:7897"
  $env:HTTP_PROXY = "http://127.0.0.1:7897"
  $env:NO_PROXY = "127.0.0.1,localhost,::1"

  Write-Host ""
  Write-Host "Checking local QQ Mail MCP health..." -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:3050/healthz" -UseBasicParsing -TimeoutSec 5 | Out-Null
  } catch {
    throw "QQ Mail MCP is not reachable at http://127.0.0.1:3050. Keep the QQ Mail MCP window open and check its error message."
  }

  Write-Host "Initializing tunnel-client profile '$profile'..." -ForegroundColor Cyan
  .\tunnel-client.exe init `
    --sample sample_mcp_remote_no_auth `
    --profile $profile `
    --force `
    --tunnel-id $tunnelId `
    --mcp-server-url "http://127.0.0.1:3050/mcp"

  Write-Host ""
  Write-Host "Running tunnel-client doctor..." -ForegroundColor Cyan
  .\tunnel-client.exe doctor --profile $profile --explain

  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Doctor failed. Fix the errors above before running the tunnel." -ForegroundColor Red
    return
  }

  Write-Host ""
  Write-Host "Starting tunnel-client. Keep this window open while using the ChatGPT QQ Mail plugin." -ForegroundColor Green
  .\tunnel-client.exe run --profile $profile
} catch {
  Write-Host ""
  Write-Host "Tunnel startup failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Press Enter to close this window."
  Read-Host | Out-Null
  exit 1
}
