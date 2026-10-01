# Убирает ворктри агента после мержа PR: удаляет ворктри и ветку (локально и на GitHub).
# Использование: powershell -File scripts/remove-agent-worktree.ps1 <ветка> [-Force]
#   -Force — удалить даже без смёрженного PR (только если точно уверен).
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Branch,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repo = (git rev-parse --show-toplevel).Trim()
$name = $Branch -replace '/', '-'
$dir = "D:\fkuss-worktrees\$name"

if (-not (Test-Path -LiteralPath $dir)) {
  throw "Ворктри $dir не найден."
}

$merged = [int]((gh pr list --head $Branch --state merged --json number --jq "length") 2>$null)
if (-not $Force -and $merged -eq 0) {
  throw "Для ветки '$Branch' нет смёрженного PR. Если работа не нужна — повтори с -Force."
}

git -C $repo worktree remove --force $dir
git -C $repo push origin --delete $Branch | Out-Null
git -C $repo branch -D $Branch | Out-Null

Write-Host "Удалено: ворктри $dir, ветка $Branch (локально и на GitHub)."
