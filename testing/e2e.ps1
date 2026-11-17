$ErrorActionPreference = 'Stop'
$env:npm_config_cache = "D:\opencode-npm-cache"
$env:NPM_CONFIG_CACHE = "D:\opencode-npm-cache"
$env:TEMP = "D:\opencode-temp"
$env:TMP = "D:\opencode-temp"

$repo = Split-Path -Parent $PSScriptRoot
$base = "http://127.0.0.1:8080"
if (Test-Path -LiteralPath "$repo\.wrangler\state") { Remove-Item -LiteralPath "$repo\.wrangler\state" -Recurse -Force }

function Check([string]$name, [bool]$condition) {
  if ($condition) { "PASS $name" } else { "FAIL $name" }
}
function Status([string]$path, [string]$cookieFile = "") {
  if ($cookieFile) {
    return (curl.exe -s -b $cookieFile -o NUL -w "%{http_code}" "$base$path")
  }
  return (curl.exe -s -o NUL -w "%{http_code}" "$base$path")
}
function Header([string]$path, [string]$header, [string]$cookieFile = "") {
  if ($cookieFile) {
    return (curl.exe -s -b $cookieFile -D - -o NUL "$base$path" | Select-String -Pattern "$header" | Select-Object -First 1).Line
  }
  return (curl.exe -s -D - -o NUL "$base$path" | Select-String -Pattern "$header" | Select-Object -First 1).Line
}

$wrangler = if ($env:WRANGLER_VERSION) { "wrangler@$env:WRANGLER_VERSION" } else { "wrangler@latest" }
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "$wrangler dev --port 8080 --local" -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\gateway-dev.out.log" -RedirectStandardError "$env:TEMP\gateway-dev.err.log"
Start-Sleep -Seconds 30

try {
  # 1. unauthenticated gate
  Check "unauth root is 401" ((Status "/") -eq "401")
  Check "unauth root no-store" ((Header "/" "Cache-Control") -match "private, no-store")
  Check "unauth api is 401" ((Status "/api/state") -eq "401")
  Check "unauth private project is 401" ((Status "/p/svg-composer") -eq "401")
  Check "login page is 200" ((Status "/login") -eq "200")

  # 2. sign in
  $session = $null
  Invoke-WebRequest -Uri "$base/login" -UseBasicParsing -SessionVariable session -TimeoutSec 15 | Out-Null
  $bad = Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ pin = "0000" } -WebSession $session -UseBasicParsing -TimeoutSec 15
  $badPage = Invoke-WebRequest -Uri $bad.BaseResponse.ResponseUri.AbsoluteUri -WebSession $session -UseBasicParsing -TimeoutSec 15
  Check "bad pin shows visible error" ($badPage.Content -match 'role="alert"')
  Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ pin = "123456" } -WebSession $session -UseBasicParsing -TimeoutSec 15 | Out-Null

  $index = Invoke-WebRequest -Uri "$base/" -WebSession $session -UseBasicParsing -TimeoutSec 15
  Check "gateway loads after login" ($index.StatusCode -eq 200 -and $index.Content -match '/app.js')
  $app = Invoke-WebRequest -Uri "$base/app.js" -WebSession $session -UseBasicParsing -TimeoutSec 15
  Check "app.js loads" ($app.StatusCode -eq 200 -and $app.Content -match 'handleProject|card-link|random-icon')
  $css = Invoke-WebRequest -Uri "$base/styles.css" -WebSession $session -UseBasicParsing -TimeoutSec 15
  Check "styles.css loads" ($css.StatusCode -eq 200 -and $css.Content -match '--accent:\s*#06b6d4')

  # 3. config API
  $config = Invoke-RestMethod -Uri "$base/api/state" -WebSession $session -TimeoutSec 15
  Check "seed has 4 projects" ($config.projects.Count -eq 4)
  Check "seed has 1 group" ($config.groups.Count -eq 1)
  Check "slugs unique" ((@($config.projects.slug | Sort-Object -Unique)).Count -eq 4)

  $newGroup = [ordered]@{ id = "g-test"; name = "Test Group"; order = 2 }
  $config.groups += $newGroup
  $config.projects += [ordered]@{
    id = "p-test"; groupId = "g-test"; name = "Example"; slug = "example-link"
    icon = [ordered]@{ mode = "iconify"; id = "mdi:link"; svgUrl = "https://api.iconify.design/mdi/link.svg"; license = "Apache-2.0" }
    kind = "external"; assetPath = $null; entry = $null; public = $false
    url = "https://example.com"; linkLabel = $null
  }
  $saved = Invoke-RestMethod -Uri "$base/api/config" -Method POST -Body ($config | ConvertTo-Json -Depth 12 -Compress) -ContentType "application/json" -WebSession $session -TimeoutSec 15
  Check "config save ok" ($saved.ok -eq $true)
  $reread = Invoke-RestMethod -Uri "$base/api/state" -WebSession $session -TimeoutSec 15
  Check "saved group persisted" (@($reread.groups | Where-Object id -eq "g-test").Count -eq 1)
  Check "external project persisted" (@($reread.projects | Where-Object slug -eq "example-link").Count -eq 1)

  # 4. random icon
  $icon = Invoke-RestMethod -Uri "$base/api/random-icon" -Method POST -WebSession $session -TimeoutSec 30
  Check "random icon returns svg" ([bool]$icon.svgText -and $icon.svgText.StartsWith("<svg"))
  Check "random icon has license field" ($null -ne $icon.license)

  # 5. hosted project serving
  $entry = Invoke-WebRequest -Uri "$base/p/svg-composer" -WebSession $session -UseBasicParsing -TimeoutSec 20
  Check "directory entry loads" ($entry.StatusCode -eq 200 -and $entry.Content -match "Glyph Studio")
  Check "base tag injected" ($entry.Content -match '<base href="/p/svg-composer/">')
  $projCss = Invoke-WebRequest -Uri "$base/p/svg-composer/css/styles.css" -WebSession $session -UseBasicParsing -TimeoutSec 20
  Check "project css loads" ($projCss.StatusCode -eq 200 -and $projCss.Content.Length -gt 1000)
  $projJs = Invoke-WebRequest -Uri "$base/p/svg-composer/js/vendor/jszip.js" -WebSession $session -UseBasicParsing -TimeoutSec 20
  Check "project js loads" ($projJs.StatusCode -eq 200 -and $projJs.Content.Length -gt 1000)
  $wasm = curl.exe -s -b "projects_session=dummy" -o NUL -w "%{http_code}" "$base/p/svg-composer/js/vendor/harfbuzz/harfbuzz.wasm"
  Check "wasm path is served (status not 404)" ($wasm -ne "404")
  $single = Invoke-WebRequest -Uri "$base/p/boxy-svg-editor" -WebSession $session -UseBasicParsing -TimeoutSec 20
  Check "direct html file loads" ($single.StatusCode -eq 200 -and $single.Content.Length -gt 1000)
  Check "direct file has no base tag" ($single.Content -notmatch '<base href=')

  # 6. public toggle
  $reread.projects[0].public = $true
  Invoke-RestMethod -Uri "$base/api/config" -Method POST -Body ($reread | ConvertTo-Json -Depth 12 -Compress) -ContentType "application/json" -WebSession $session -TimeoutSec 15 | Out-Null
  Check "public project loads without session" ((Status "/p/svg-composer") -eq "200")
  Check "public project asset cacheable" ((Header "/p/svg-composer/css/styles.css" "Cache-Control") -match "public")
  Check "gateway still gated" ((Status "/") -eq "401")
  Check "private sibling still gated" ((Status "/p/boxy-svg-editor") -eq "401")

  # 7. git state
  $gitStatus = & git -C $repo status --short
  Check "working tree clean after commits" ([string]::IsNullOrWhiteSpace(($gitStatus | Out-String)))

} finally {
  if ($proc -and !$proc.HasExited) { taskkill /T /F /PID $proc.Id 2>&1 | Out-Null }
}
