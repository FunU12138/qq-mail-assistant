$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot "start-qq-mail-assistant.cmd"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "QQ邮箱助手.lnk"

if (-not (Test-Path -LiteralPath $target)) {
  throw "Cannot find launcher: $target"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$shortcut.Description = "Start QQ Mail Assistant MCP and OpenAI Tunnel"
$shortcut.Save()

Write-Host "Desktop shortcut created:"
Write-Host $shortcutPath
