# Создаёт изолированный ворктри для агента: новая ветка от origin/main.
# Использование: powershell -File scripts/new-agent-worktree.ps1 <agent>/<задача>
#   пример: scripts\new-agent-worktree.ps1 opencode/menu-fixes
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Branch
)

$ErrorActionPreference = "Stop"

if ($Branch -notmatch '^[a-z0-9]+/[a-z0-9-]+$') {
  throw "Имя ветки: <agent>/<задача> — латиница, цифры, дефисы. Пример: opencode/menu-fixes"
}

$repo = (git rev-parse --show-toplevel).Trim()
$root = "D:\fkuss-worktrees"
$name = $Branch -replace '/', '-'
$dir = Join-Path $root $name

git -C $repo fetch origin --quiet

if (git -C $repo rev-parse --verify --quiet "refs/heads/$Branch") {
  throw "Локальная ветка '$Branch' уже существует — выбери другое имя."
}
if (git -C $repo rev-parse --verify --quiet "refs/remotes/origin/$Branch") {
  throw "Ветка '$Branch' уже существует на GitHub — выбери другое имя."
}
if (Test-Path -LiteralPath $dir) {
  throw "Каталог $dir уже существует — разбери вручную."
}

New-Item -ItemType Directory -Path $root -Force | Out-Null
git -C $repo worktree add $dir -b $Branch origin/main | Out-Null
git -C $dir push -u origin $Branch | Out-Null

Write-Host "Ворктри готов: $dir"
Write-Host "Ветка: $Branch (от origin/main), запушена на GitHub."
Write-Host "Работай ТОЛЬКО в этом каталоге. Дальше: правки -> тесты -> PR -> squash-merge ->"
Write-Host "scripts/remove-agent-worktree.ps1 $Branch"
