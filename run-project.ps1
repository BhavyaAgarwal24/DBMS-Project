param(
    [string]$DbHost = "localhost",
    [int]$DbPort = 3306,
    [string]$DbUser = "root",
    [string]$DbPassword = "",
    [string]$DbName = "pollution_monitoring",
    [switch]$SkipSchemaLoad
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $projectRoot "app"
$createScript = Join-Path $projectRoot "01_create_tables.sql"
$insertScript = Join-Path $projectRoot "02_insert_data.sql"
$plsqlScript = Join-Path $projectRoot "04_plsql.sql"

function Test-CommandExists {
    param([string]$Name)

    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-MySqlFile {
    param(
        [string]$ScriptPath,
        [string]$User,
        [string]$Password,
        [string]$DbHostName,
        [int]$Port
    )

    if ($Password) {
        & mysqlsh --sql --user=$User --password=$Password --host=$DbHostName --port=$Port --file=$ScriptPath
    }
    else {
        & mysqlsh --sql --user=$User --host=$DbHostName --port=$Port --file=$ScriptPath
    }
}

if (-not (Test-CommandExists "mysqlsh")) {
    throw "mysqlsh was not found. Install MySQL Shell or add it to PATH."
}

if (-not (Test-Path $appDir)) {
    throw "App directory not found: $appDir"
}

if (-not $SkipSchemaLoad) {
    Write-Host "Loading MySQL schema and project SQL scripts..."
    Invoke-MySqlFile -ScriptPath $createScript -User $DbUser -Password $DbPassword -DbHostName $DbHost -Port $DbPort
    Invoke-MySqlFile -ScriptPath $insertScript -User $DbUser -Password $DbPassword -DbHostName $DbHost -Port $DbPort
    Invoke-MySqlFile -ScriptPath $plsqlScript -User $DbUser -Password $DbPassword -DbHostName $DbHost -Port $DbPort
}

$env:DB_HOST = $DbHost
$env:DB_PORT = [string]$DbPort
$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:DB_NAME = $DbName

Write-Host "Starting app with MySQL schema '$DbName'..."
Set-Location $appDir
npm start
