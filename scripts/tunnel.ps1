param(
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'start',
    # Stable browser-facing origin when this tunnel is a reverse-proxy backend.
    [string]$PublicUrl = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $projectRoot '.runtime\tunnel'
$statePath = Join-Path $runtime 'state.json'
$dataPath = Join-Path $projectRoot '.runtime\tunnel-data'
$cloudflared = Join-Path $projectRoot '.runtime\bin\cloudflared.exe'
$apiPort = 8081
$gatewayPort = 8090

function Get-OwnedProcess($Entry) {
    if (-not $Entry) { return $null }
    $process = Get-Process -Id $Entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $Entry.started) {
        return $process
    }
    return $null
}

function Read-State {
    if (Test-Path -LiteralPath $statePath) {
        return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }
    return $null
}

function Stop-Owned($State) {
    if (-not $State) { return }
    # Signal only the nginx instance whose recorded parent PID is still ours.
    if (Get-OwnedProcess $State.gateway) {
        & $State.nginx -p (($runtime -replace '\\', '/') + '/') -c nginx.conf -s quit 2>$null
        $gateway = Get-OwnedProcess $State.gateway
        if ($gateway) { $null = $gateway.WaitForExit(5000) }
    }
    foreach ($entry in @($State.cloudflared, $State.api, $State.gateway)) {
        $process = Get-OwnedProcess $entry
        if ($process) { Stop-Process -Id $process.Id -Force }
    }
}

function Save-State($State) {
    $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Start-Owned([string]$FilePath, [string[]]$Arguments, [string]$Name) {
    $options = @{
        FilePath = $FilePath
        WorkingDirectory = $projectRoot
        WindowStyle = 'Hidden'
        PassThru = $true
        RedirectStandardOutput = Join-Path $runtime ($Name + '.stdout.log')
        RedirectStandardError = Join-Path $runtime ($Name + '.stderr.log')
    }
    if ($Arguments.Count) { $options.ArgumentList = $Arguments }
    $process = Start-Process @options
    return @{ id = $process.Id; started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
}

function Wait-Health([string]$Url, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Health check timed out: $Url. Inspect logs in $runtime."
}

$state = Read-State
if ($Action -eq 'stop') {
    Stop-Owned $state
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    Write-Output 'Tunnel stopped. Stored catalog and account data were kept.'
    exit 0
}
if ($Action -eq 'status') {
    if (-not $state) { Write-Output 'Tunnel is stopped.'; exit 0 }
    [pscustomobject]@{
        Url = $state.url
        LocalUrl = "http://127.0.0.1:$gatewayPort"
        CloudflaredRunning = [bool](Get-OwnedProcess $state.cloudflared)
        ApiRunning = [bool](Get-OwnedProcess $state.api)
        GatewayRunning = [bool](Get-OwnedProcess $state.gateway)
    } | Format-List
    exit 0
}
if ($state -and ((Get-OwnedProcess $state.cloudflared) -or (Get-OwnedProcess $state.api) -or (Get-OwnedProcess $state.gateway))) {
    throw 'A tunnel instance is already running. Use scripts/tunnel.ps1 status or stop first.'
}

if (-not (Test-Path -LiteralPath $cloudflared)) {
    throw "Place the official Windows cloudflared binary at $cloudflared first. See README.md."
}
$nginx = if ($env:NGINX_BIN) { $env:NGINX_BIN } else { (Get-Command nginx.exe -ErrorAction Stop).Source }
$go = (Get-Command go.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$mime = Join-Path (Split-Path -Parent $nginx) 'conf\mime.types'
if (-not (Test-Path -LiteralPath $mime)) { throw "nginx mime.types not found: $mime" }
foreach ($port in @($apiPort, $gatewayPort)) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $listener.Start() } catch { throw "Port $port is already in use." } finally { $listener.Stop() }
}

$null = New-Item -ItemType Directory -Path $runtime, $dataPath, (Join-Path $runtime 'logs'), (Join-Path $runtime 'temp') -Force
$apiBinary = Join-Path $runtime 'playmarket-api.exe'
Push-Location (Join-Path $projectRoot 'backend')
try {
    & $go build -trimpath -o $apiBinary ./cmd/server
    if ($LASTEXITCODE -ne 0) { throw 'Go build failed.' }
} finally { Pop-Location }

$state = @{ url = $null; nginx = $nginx; cloudflared = $null; api = $null; gateway = $null }
try {
    $state.cloudflared = Start-Owned $cloudflared @('--no-autoupdate', 'tunnel', '--url', "http://127.0.0.1:$gatewayPort", '--protocol', 'http2') 'cloudflared'
    Save-State $state
    $deadline = [DateTime]::UtcNow.AddSeconds(80)
    do {
        if (-not (Get-OwnedProcess $state.cloudflared)) { throw 'cloudflared exited. Inspect its logs in .runtime/tunnel.' }
        $logs = @('cloudflared.stdout.log', 'cloudflared.stderr.log') | ForEach-Object {
            Get-Content -LiteralPath (Join-Path $runtime $_) -Raw -ErrorAction SilentlyContinue
        }
        $match = [regex]::Match(($logs -join "`n"), 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { $state.url = $match.Value; break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $state.url) { throw 'Timed out waiting for a Cloudflare Quick Tunnel address.' }
    Save-State $state

    $oldPublicUrl = $env:PUBLIC_URL
    $browserOrigin = if ($PublicUrl) { $PublicUrl.TrimEnd('/') } else { $state.url }
    $env:PUBLIC_URL = $browserOrigin
    Push-Location $projectRoot
    try {
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location; $env:PUBLIC_URL = $oldPublicUrl }

    # Keep user data separate from the local development instance. No .env file is copied.
    $environment = @{
        PM_ADDR = "127.0.0.1:$apiPort"
        PM_DATA_DIR = $dataPath
        PM_SEED = Join-Path $projectRoot 'backend\data\seed.json'
        PM_STUB = Join-Path $projectRoot 'backend\assets\PlayMarket-Setup.exe'
        PM_PUBLIC_URL = $browserOrigin
        PM_ALLOWED_ORIGINS = (@($state.url, $env:PM_ALLOWED_ORIGINS) | Where-Object { $_ }) -join ','
        PM_TRUST_PROXY = 'true'
        PM_TCP_ADDR = ''
    }
    $previous = @{}
    try {
        foreach ($key in $environment.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process')
        }
        $state.api = Start-Owned $apiBinary @() 'api'
    } finally {
        foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    }
    Save-State $state
    Wait-Health "http://127.0.0.1:$apiPort/api/healthz" 20

    # Use the production nginx policy, adjusted only for this loopback tunnel instance.
    $config = Get-Content -LiteralPath (Join-Path $projectRoot 'deploy\nginx.conf') -Raw
    $config = $config.Replace('worker_processes auto;', 'worker_processes 1;')
    $config = $config.Replace('pid /tmp/nginx.pid;', 'pid logs/nginx.pid;')
    $config = $config.Replace('error_log /dev/stderr warn;', 'error_log logs/error.log warn;')
    $config = $config.Replace('include /etc/nginx/mime.types;', ('include "' + ($mime -replace '\\', '/') + '";'))
    $config = $config.Replace('access_log /dev/stdout safe;', 'access_log logs/access.log safe;')
    $config = $config.Replace('/tmp/client_temp', 'temp/client_temp').Replace('/tmp/proxy_temp', 'temp/proxy_temp')
    $config = $config.Replace('server api:8080;', "server 127.0.0.1:$apiPort;")
    $config = $config.Replace('listen 8080;', "listen 127.0.0.1:$gatewayPort;")
    $config = $config.Replace('root /usr/share/nginx/html;', ('root "' + ((Join-Path $projectRoot 'dist') -replace '\\', '/') + '";'))
    $config = $config.Replace('proxy_set_header X-Forwarded-Proto $scheme;', 'proxy_set_header X-Forwarded-Proto https;')
    # Only a loopback cloudflared connection can reach this gateway.
    $config = $config.Replace('server_tokens off;', "server_tokens off;`n  set_real_ip_from 127.0.0.1;`n  real_ip_header CF-Connecting-IP;")
    [System.IO.File]::WriteAllText((Join-Path $runtime 'nginx.conf'), $config, [System.Text.UTF8Encoding]::new($false))
    $prefix = ($runtime -replace '\\', '/') + '/'
    & $nginx -p $prefix -c nginx.conf -t
    if ($LASTEXITCODE -ne 0) { throw 'nginx configuration check failed.' }
    $state.gateway = Start-Owned $nginx @('-p', ('"' + $prefix + '"'), '-c', 'nginx.conf', '-g', '"daemon off;"') 'nginx'
    Save-State $state
    Wait-Health "http://127.0.0.1:$gatewayPort/api/healthz" 15
    Wait-Health ($state.url + '/api/healthz') 60
    Write-Output ("Public URL: " + $state.url)
    Write-Output "Local gateway: http://127.0.0.1:$gatewayPort"
    Write-Output 'Keep this computer awake and connected. Use scripts/tunnel.ps1 stop to stop the tunnel.'
} catch {
    Stop-Owned $state
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    throw
}
