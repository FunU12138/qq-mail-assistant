$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot "runtime"
$secretDir = Join-Path $runtimeDir "secrets"
$tunnelClientDir = "C:\Tools\tunnel-client-v0.0.13-windows-amd64"
$profile = "qq-mail"
$mcpUrl = "http://127.0.0.1:3050/mcp"
$healthUrl = "http://127.0.0.1:3050/healthz"
$mcpStdout = Join-Path $runtimeDir "qq-mail-mcp.stdout.log"
$mcpStderr = Join-Path $runtimeDir "qq-mail-mcp.stderr.log"
$script:mcpStartedByLauncher = $false

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null

$Host.UI.RawUI.WindowTitle = "QQ Mail Assistant + OpenAI Tunnel"

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
  $save = Read-Host "Save securely for future launches? Enter Y to save, or press Enter to skip"
  if (($save -eq "Y") -or ($save -eq "y")) {
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
    Write-Host "Saved with Windows DPAPI: $secretFile" -ForegroundColor DarkGray
  }
  return (New-Object System.Net.NetworkCredential "ignored", $secure).Password
}

function Show-RecentLog {
  param([string]$Path, [string]$Title)
  if (Test-Path -LiteralPath $Path) {
    Write-Host ""
    Write-Host $Title -ForegroundColor Yellow
    Get-Content -LiteralPath $Path -Tail 80 -ErrorAction SilentlyContinue
  }
}

function Stop-McpProcess {
  if ($script:mcpStartedByLauncher -and $script:mcpProcess -and -not $script:mcpProcess.HasExited) {
    Write-Host ""
    Write-Host "Stopping QQ Mail MCP..." -ForegroundColor DarkGray
    Stop-Process -Id $script:mcpProcess.Id -Force
  }
}

function Test-McpHealth {
  try {
    Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Show-PortOwnerHint {
  Write-Host ""
  Write-Host "Port 3050 appears to be occupied. Current listeners:" -ForegroundColor Yellow
  netstat -ano | Select-String ":3050" | ForEach-Object { Write-Host $_.Line }
}

try {
  Set-Location -LiteralPath $projectRoot

  Write-Host "QQ Mail Assistant launcher" -ForegroundColor Cyan
  Write-Host "This starts local MCP first, then connects it to ChatGPT Web through OpenAI Secure MCP Tunnel." -ForegroundColor Cyan
  Write-Host ""

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node.exe was not found in PATH."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $tunnelClientDir "tunnel-client.exe"))) {
    throw "Cannot find tunnel-client.exe at $tunnelClientDir"
  }

  $env:QQ_MAIL_AUTH_CODE = Get-ProcessSecret -Name "qq-mail-auth-code" -Prompt "Paste QQ Mail authorization code"
  $env:CONTROL_PLANE_API_KEY = Get-ProcessSecret -Name "openai-runtime-api-key" -Prompt "Paste OpenAI Runtime API Key"
  $tunnelId = Get-ProcessSecret -Name "qq-mail-tunnel-id" -Prompt "Paste QQ Mail tunnel id, for example tunnel_xxx"

  $env:QQ_MAIL_ASSISTANT_HOST = "127.0.0.1"
  $env:QQ_MAIL_ASSISTANT_PORT = "3050"
  $env:QQ_MAIL_CONFIG = Join-Path $projectRoot "config\local.json"
  $env:QQ_MAIL_RUNTIME_DIR = $runtimeDir
  $env:QQ_MAIL_OUTGOING_DIR = Join-Path $projectRoot "outgoing"
  $env:QQ_MAIL_MCP_BEARER_TOKEN = ""

  $env:HTTPS_PROXY = "http://127.0.0.1:7897"
  $env:HTTP_PROXY = "http://127.0.0.1:7897"
  $env:NO_PROXY = "127.0.0.1,localhost,::1"

  if (Test-McpHealth) {
    Write-Host ""
    Write-Host "Reusing existing healthy QQ Mail MCP: $mcpUrl" -ForegroundColor Green
  } else {
    Remove-Item -LiteralPath $mcpStdout, $mcpStderr -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "Starting local QQ Mail MCP: $mcpUrl" -ForegroundColor Green
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $script:mcpProcess = Start-Process -FilePath $nodePath `
      -ArgumentList @("src/server.cjs") `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $mcpStdout `
      -RedirectStandardError $mcpStderr `
      -PassThru
    $script:mcpStartedByLauncher = $true
  }

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if ($script:mcpStartedByLauncher -and $script:mcpProcess.HasExited) {
      Show-RecentLog -Path $mcpStdout -Title "MCP stdout:"
      Show-RecentLog -Path $mcpStderr -Title "MCP stderr:"
      if ((Get-Content -LiteralPath $mcpStderr -Raw -ErrorAction SilentlyContinue) -match "EADDRINUSE") {
        Show-PortOwnerHint
      }
      throw "QQ Mail MCP exited early with code $($script:mcpProcess.ExitCode)."
    }
    if (Test-McpHealth) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    Show-RecentLog -Path $mcpStdout -Title "MCP stdout:"
    Show-RecentLog -Path $mcpStderr -Title "MCP stderr:"
    Show-PortOwnerHint
    throw "QQ Mail MCP did not become healthy at $healthUrl."
  }
  Write-Host "Local QQ Mail MCP is healthy." -ForegroundColor Green

  Set-Location -LiteralPath $tunnelClientDir
  Write-Host ""
  Write-Host "Initializing tunnel-client profile '$profile' for $mcpUrl" -ForegroundColor Cyan
  .\tunnel-client.exe init `
    --sample sample_mcp_remote_no_auth `
    --profile $profile `
    --force `
    --tunnel-id $tunnelId `
    --mcp-server-url $mcpUrl

  Write-Host ""
  Write-Host "Running tunnel-client doctor..." -ForegroundColor Cyan
  .\tunnel-client.exe doctor --profile $profile --explain
  if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client doctor failed. See the messages above."
  }

  Write-Host ""
  Write-Host "Starting tunnel-client. Keep this window open while using the ChatGPT QQ Mail plugin." -ForegroundColor Green
  Write-Host "When you are done, press Ctrl+C. The local MCP process will be stopped." -ForegroundColor Green
  Write-Host ""
  .\tunnel-client.exe run --profile $profile
} catch {
  Write-Host ""
  Write-Host "Launcher failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Show-RecentLog -Path $mcpStdout -Title "MCP stdout:"
  Show-RecentLog -Path $mcpStderr -Title "MCP stderr:"
  Write-Host ""
  Write-Host "This window will stay open. Press Enter to close it." -ForegroundColor Yellow
  Read-Host | Out-Null
  exit 1
} finally {
  Stop-McpProcess
}
