$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$Host.UI.RawUI.WindowTitle = "QQ Mail MCP - Safe Secret Input"

$runtimeDir = Join-Path $projectRoot "runtime"
$secretDir = Join-Path $runtimeDir "secrets"
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
      Write-Host "Saved secret could not be decrypted, so it will be requested again: $secretFile" -ForegroundColor Yellow
      Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue
    }
  }
  $secure = Read-Host $Prompt -AsSecureString
  $save = Read-Host "Save this secret securely for future launches? Enter Y to save, or press Enter to skip"
  if (($save -eq "Y") -or ($save -eq "y")) {
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
    Write-Host "Secret saved with Windows user DPAPI encryption: $secretFile" -ForegroundColor DarkGray
  }
  return (New-Object System.Net.NetworkCredential "ignored", $secure).Password
}

try {
  Write-Host "QQ Mail MCP startup window" -ForegroundColor Cyan
  Write-Host "Paste the QQ Mail authorization code only after the hidden-input prompt appears." -ForegroundColor Yellow
  Write-Host "The code will not be shown while you type or paste." -ForegroundColor Yellow
  Write-Host ""

  $env:QQ_MAIL_AUTH_CODE = Get-ProcessSecret -Name "qq-mail-auth-code" -Prompt "Paste QQ Mail authorization code"
  $env:QQ_MAIL_ASSISTANT_HOST = "127.0.0.1"
  $env:QQ_MAIL_ASSISTANT_PORT = "3050"
  $env:QQ_MAIL_CONFIG = Join-Path $projectRoot "config\local.json"
  $env:QQ_MAIL_RUNTIME_DIR = $runtimeDir
  $env:QQ_MAIL_OUTGOING_DIR = Join-Path $projectRoot "outgoing"
  $env:QQ_MAIL_MCP_BEARER_TOKEN = ""

  Write-Host ""
  Write-Host "Starting QQ Mail MCP on http://127.0.0.1:3050/mcp" -ForegroundColor Green
  Write-Host "Keep this window open while using the ChatGPT QQ Mail plugin." -ForegroundColor Green
  Write-Host ""

  npm start
} catch {
  Write-Host ""
  Write-Host "Startup failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "Press Enter to close this window."
  Read-Host | Out-Null
  exit 1
}
