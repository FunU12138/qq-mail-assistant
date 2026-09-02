$ErrorActionPreference = "Stop"

try {
  Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

  if (-not $env:QQ_MAIL_AUTH_CODE) {
    $secure = Read-Host "QQ Mail authorization code" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $env:QQ_MAIL_AUTH_CODE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }

  Write-Host ""
  Write-Host "QQ Mail Assistant is starting..."
  Write-Host "MCP URL: http://127.0.0.1:3050/mcp"
  Write-Host "Keep this window open. Press Ctrl+C to stop."
  Write-Host ""

  npm start
} catch {
  Write-Host ""
  Write-Host "Startup failed:"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Press Enter to close this window."
  Read-Host | Out-Null
  exit 1
}
