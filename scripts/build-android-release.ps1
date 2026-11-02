#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$KeyStorePath = $(if ($env:MOYRITM_KEYSTORE_PATH) { $env:MOYRITM_KEYSTORE_PATH } else { Join-Path $env:USERPROFILE 'AndroidKeys\MoyRitm\moyritm-release.jks' }),
    [string]$KeyAlias = $(if ($env:MOYRITM_KEY_ALIAS) { $env:MOYRITM_KEY_ALIAS } else { 'moyritm' }),
    [switch]$PrepareUpdateTest,
    [switch]$PrepareOtaTest,
    [switch]$EnrollLocalCredential,
    [switch]$CheckToolsOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$signingNames = @('MOYRITM_KEYSTORE_PATH', 'MOYRITM_KEY_ALIAS', 'MOYRITM_STORE_PASSWORD', 'MOYRITM_KEY_PASSWORD')
$publicEnvironment = @{}
$signingEnvironment = @{}
$secret = $null
$plainPassword = $null
$pointer = [IntPtr]::Zero
$phase = 'Подготовка'
$diagnosticDirectory = $null
$localCredential = $null
. (Join-Path $PSScriptRoot 'local-signing-credential.ps1')

function Quote-LocalArgument([string]$Value) {
    if ($Value.IndexOfAny([char[]]@('"', "`r", "`n")) -ge 0) {
        throw 'Недопустимые символы в параметре локального инструмента.'
    }
    return '"' + $Value + '"'
}

function Invoke-LocalCommand {
    param([string]$File, [string[]]$Arguments, [string]$RawArguments,
        [string]$Directory = $root, [switch]$Signing)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $File
    $start.WorkingDirectory = $Directory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8
    $start.StandardErrorEncoding = [Text.Encoding]::UTF8
    $start.Arguments = if ($RawArguments) { $RawArguments } else {
        ($Arguments | ForEach-Object { Quote-LocalArgument $_ }) -join ' '
    }
    foreach ($name in $signingNames) { $start.EnvironmentVariables.Remove($name) }
    foreach ($name in $publicEnvironment.Keys) { $start.EnvironmentVariables[$name] = $publicEnvironment[$name] }
    if ($Signing) {
        foreach ($name in $signingNames) { $start.EnvironmentVariables[$name] = $signingEnvironment[$name] }
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    $started = $false
    try {
        $started = $process.Start()
        foreach ($name in $signingNames) { $start.EnvironmentVariables.Remove($name) }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $output = $stdout.Result + "`n" + $stderr.Result
        if ($process.ExitCode -ne 0) {
            # Only allowlisted machine codes may leave the signing process. Never log raw output.
            $reason = 'UNCLASSIFIED_TOOL_FAILURE'
            $codes = @('KEYSTORE_FILE_MISSING','PRIVATE_KEY_ALIAS_MISSING','PASSWORD_ENVIRONMENT_MISSING',
                'KEYSTORE_ALGORITHM_UNAVAILABLE','KEYSTORE_CERTIFICATE_INVALID','KEYSTORE_INTEGRITY_OR_DECRYPTION_FAILED',
                'ORIGINAL_RELEASE_CERTIFICATE_MISMATCH','STORE_OPENED_BUT_PRIVATE_KEY_UNLOCK_FAILED',
                'UNEXPECTED_PRIVATE_KEY_TYPE','PRIVATE_KEY_CERTIFICATE_PROOF_FAILED','KEYSTORE_FORMAT_UNREADABLE')
            foreach ($code in $codes) { if ($output -match ('"status"\s*:\s*"' + $code + '"')) { $reason = $code; break } }
            if ($reason -eq 'UNCLASSIFIED_TOOL_FAILURE' -and $output -match 'Cannot find environment variable') { $reason = 'PASSWORD_ENVIRONMENT_MISSING' }
            $facts = [ordered]@{ phase=$phase; tool=[IO.Path]::GetFileName($File); exitCode=$process.ExitCode; reason=$reason; secretLogged=$false }
            if ($diagnosticDirectory) { $facts | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $diagnosticDirectory 'failure.json') -Encoding UTF8 }
            throw "${phase}: инструмент завершился с кодом $($process.ExitCode), диагностика $reason. Это само по себе не доказывает ошибку пароля."
        }
        return $output
    } finally {
        foreach ($name in $signingNames) { $start.EnvironmentVariables.Remove($name) }
        if ($started -and !$process.HasExited) {
            # Limit cancellation to the process tree started by this invocation.
            & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F *> $null
        }
        $process.Dispose()
    }
}

function Confirm-Apk([string]$RelativePath, [int]$Code, [string]$Name, [string]$ExpectedChannel = 'stable') {
    $fullPath = Join-Path $android $RelativePath
    if (!(Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw 'Ожидаемый APK не найден.' }
    $signature = Invoke-LocalCommand -File $java -Arguments @('-jar', $apkSignerJar, 'verify', '--print-certs', $fullPath)
    $digests = [regex]::Matches($signature, 'Signer #[0-9]+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})')
    if ($digests.Count -ne 1 -or $digests[0].Groups[1].Value.ToUpperInvariant() -ne $fingerprint) {
        throw 'Сертификат APK не совпадает с проверенным постоянным ключом.'
    }
    $badging = Invoke-LocalCommand -File $aapt -Directory $android -Arguments @('dump', 'badging', $RelativePath)
    $package = [regex]::Match($badging, "package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
    if (!$package.Success -or $package.Groups[1].Value -ne 'io.github.ddpdantespixel.moyritm' -or
        $package.Groups[2].Value -ne [string]$Code -or $package.Groups[3].Value -ne $Name -or
        $badging -match 'application-debuggable') {
        throw 'Пакет, версия или debug-флаг APK не соответствуют ожидаемому релизу.'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($fullPath)
    try {
        $entry = $archive.GetEntry('assets/capacitor.config.json')
        if (!$entry) { throw 'В APK отсутствует нативная конфигурация.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $nativeConfig = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        $otaKeys = Get-Content -LiteralPath (Join-Path $root 'ota/public-key.json') -Raw | ConvertFrom-Json
        if ($nativeConfig.plugins.MoyRitmOta.channel -ne $ExpectedChannel -or
            $nativeConfig.plugins.MoyRitmOta.publicKey -cne $otaKeys.spki -or
            $nativeConfig.plugins.MoyRitmOta.contractFingerprint -cne $expectedContractFingerprint -or
            $nativeConfig.plugins.CapacitorUpdater.publicKey -cne $otaKeys.capgo -or
            $nativeConfig.plugins.CapacitorUpdater.autoUpdate -ne $false -or
            $nativeConfig.plugins.CapacitorUpdater.statsUrl -ne '') {
            throw 'Канал или криптографическая конфигурация OTA в APK не соответствует ожидаемой.'
        }
    } finally { $archive.Dispose() }
    return [ordered]@{
        path = $fullPath; bytes = (Get-Item -LiteralPath $fullPath).Length
        sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
        versionCode = $Code; versionName = $Name; certificateSha256 = $fingerprint
        packageId = $package.Groups[1].Value; debuggable = $false; signatureVerified = $true; otaChannel = $ExpectedChannel
    }
}

try {
    if ($PrepareOtaTest -and $PrepareUpdateTest) { throw 'Используйте только один режим подготовки тестовых APK.' }
    $keyFile = Get-Item -LiteralPath $KeyStorePath -ErrorAction Stop
    if ($keyFile.PSIsContainer -or $keyFile.FullName.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Keystore должен быть файлом вне репозитория.'
    }
    if ($KeyAlias -notmatch '^[A-Za-z0-9._-]+$') { throw 'Проверьте alias ключа.' }
    $KeyStorePath = $keyFile.FullName
    $javaHome = $env:JAVA_HOME
    if (!$javaHome -or !(Test-Path -LiteralPath (Join-Path $javaHome 'release')) -or
        (Get-Content -LiteralPath (Join-Path $javaHome 'release') -Raw) -notmatch 'JAVA_VERSION="21\.') {
        $javaHome = Join-Path $env:USERPROFILE '.jdks\jbr-21.0.11'
    }
    if ((Get-Content -LiteralPath (Join-Path $javaHome 'release') -Raw) -notmatch 'JAVA_VERSION="21\.') {
        throw 'Для сборки нужен установленный JDK 21. Глобальные настройки Java не изменены.'
    }
    $java = Join-Path $javaHome 'bin\java.exe'
    $keytool = Join-Path $javaHome 'bin\keytool.exe'
    $sdk = $env:ANDROID_HOME
    if (!$sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    $buildTools = Join-Path $sdk 'build-tools\36.0.0'
    $aapt = Join-Path $buildTools 'aapt.exe'
    $apkSignerJar = Join-Path $buildTools 'lib\apksigner.jar'
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $node = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Temp\codex-node\node-v24.19.0-win-x64\node.exe' }
    $nodeDirectory = Split-Path -Parent $node
    $npmCli = Join-Path $nodeDirectory 'node_modules\npm\bin\npm-cli.js'
    if (!(Test-Path -LiteralPath $npmCli -PathType Leaf)) {
        $node = 'C:\Temp\codex-node\node-v24.19.0-win-x64\node.exe'
        $nodeDirectory = Split-Path -Parent $node
        $npmCli = Join-Path $nodeDirectory 'node_modules\npm\bin\npm-cli.js'
    }
    foreach ($tool in @($java, $keytool, $aapt, $apkSignerJar, $node, $npmCli)) {
        if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Не найден инструмент: $tool" }
    }
    $publicEnvironment = @{ JAVA_HOME = $javaHome; ANDROID_HOME = $sdk; PATH = "$nodeDirectory;$env:PATH"; MOYRITM_OTA_CHANNEL = 'stable' }
    $nodeVersion = Invoke-LocalCommand -File $node -Arguments @('--version')
    if ($nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') { throw 'Нужен Node.js 22 или новее.' }
    $version = ConvertFrom-StringData (Get-Content -LiteralPath (Join-Path $android 'version.properties') -Raw)
    $baseCode = [int]$version.versionCode
    $baseName = [string]$version.versionName
    if ($CheckToolsOnly) {
        $null = Invoke-LocalCommand -File $env:ComSpec -Directory $android -RawArguments '/d /c gradlew.bat --version --no-daemon --no-configuration-cache --console=plain'
        Write-Host "Инструменты доступны. Keystore найден; содержимое ещё не проверено. Версия: $baseCode / $baseName."
        return
    }

    $phase = 'Проверка совместимости OTA и нативного кода'
    $expectedContractFingerprint = (Invoke-LocalCommand -File $node -Arguments @('scripts/ota-compatibility.mjs', '--verify')).Trim()
    if ($expectedContractFingerprint -notmatch '^[a-f0-9]{64}$') { throw 'Не подтверждена нативная совместимость OTA.' }
    $session = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $evidenceRelative = 'app/build/outputs/moyritm-release-checks/' + $session
    $evidenceDirectory = Join-Path $android $evidenceRelative
    $null = New-Item -ItemType Directory -Path $evidenceDirectory
    $diagnosticDirectory = $evidenceDirectory
    $keyVerifier = Join-Path $root 'scripts/VerifyReleaseKey.java'
    $null = Invoke-LocalCommand -File $java -Arguments @($keyVerifier, $KeyStorePath, $KeyAlias, '--inspect-only')
    $git = (Get-Command git.exe -ErrorAction Stop).Source
    $sourceCommit = (Invoke-LocalCommand -File $git -Arguments @('rev-parse', 'HEAD')).Trim()
    [ordered]@{ status='AWAITING_LOCAL_UNLOCK'; phase='Public metadata verified'; keystoreSha256=(Get-FileHash -LiteralPath $KeyStorePath -Algorithm SHA256).Hash; alias=$KeyAlias; source=$sourceCommit; secretLogged=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'preflight.json') -Encoding UTF8
    $keyHash = (Get-FileHash -LiteralPath $KeyStorePath -Algorithm SHA256).Hash
    $credentialPath = Join-Path $keyFile.DirectoryName 'moyritm-release.signing.dpapi.json'
    $localCredential = Get-MoyRitmSigningCredential $credentialPath $keyHash $KeyAlias
    if ($null -eq $localCredential -and $env:MOYRITM_STORE_PASSWORD -and $env:MOYRITM_KEY_PASSWORD) {
        $localCredential = [pscustomobject]@{ storePassword=$env:MOYRITM_STORE_PASSWORD; keyPassword=$env:MOYRITM_KEY_PASSWORD }
    }
    if ($null -eq $localCredential) {
        if (!$EnrollLocalCredential) { throw 'LOCAL_CREDENTIAL_NOT_ENROLLED: проверенный доступ ещё не сохранён. Обычная сборка не запрашивает пароль. Нужна одна явная локальная проверка и сохранение доступа.' }
        Write-Host 'Однократная проверка исходного PKCS12. Пароль вводится только здесь; регистр и дефисы сохраняются буквально.'
        $secret = Read-Host 'Введите единственный пароль keystore' -AsSecureString
        if ($secret.Length -eq 0) { throw 'Пароль не введён.' }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $pointer = [IntPtr]::Zero
        $localCredential = [pscustomobject]@{ storePassword=$plainPassword; keyPassword=$plainPassword }
    }
    $signingEnvironment = @{
        MOYRITM_KEYSTORE_PATH = $KeyStorePath; MOYRITM_KEY_ALIAS = $KeyAlias
        MOYRITM_STORE_PASSWORD = $localCredential.storePassword; MOYRITM_KEY_PASSWORD = $localCredential.keyPassword
    }

    $phase = 'Проверка keystore'
    Write-Host "$phase..."
    $keyProof = Invoke-LocalCommand -File $java -Signing -Arguments @($keyVerifier, $KeyStorePath, $KeyAlias) | ConvertFrom-Json
    if ($keyProof.status -ne 'ORIGINAL_RELEASE_KEY_VERIFIED') { throw 'Не подтверждён исходный release-ключ.' }
    $keyProof | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'key-proof.json') -Encoding UTF8
    if ($EnrollLocalCredential -and !(Test-Path -LiteralPath $credentialPath)) {
        Save-MoyRitmSigningCredential $credentialPath $keyHash $KeyAlias $localCredential.storePassword $localCredential.keyPassword
        Write-Host 'Исходный ключ подтверждён. Доступ сохранён в DPAPI Windows CurrentUser вне Git; последующие сборки не спрашивают пароль.'
    }
    # Standard KeyStore API verifies the MAC, decrypts the entry, pins the original APK certificate,
    # and proves possession with a local signature. No localized keytool text parsing is involved.
    $fingerprint = ([string]$keyProof.certificateSha256).ToUpperInvariant()
    $keyFacts = [ordered]@{ type = 'PKCS12'; alias = $KeyAlias; algorithm = 'RSA 3072'; certificateSha256 = $fingerprint
        notBefore = $keyProof.notBefore; notAfter = $keyProof.notAfter }
    Write-Host "Ключ проверен. SHA-256 сертификата: $fingerprint"

    $qaApks = @()
    if ($PrepareOtaTest) {
        $publicEnvironment.MOYRITM_OTA_CHANNEL = 'qa'
        $phase = 'Подготовка изолированной QA OTA-сборки'
        Write-Host "$phase..."
        $null = Invoke-LocalCommand -File $node -Arguments @($npmCli, 'run', 'android:sync')
        $null = Invoke-LocalCommand -File $env:ComSpec -Directory $android -Signing -RawArguments '/d /c gradlew.bat :app:assembleRelease --no-daemon --no-configuration-cache --console=plain --max-workers=2'
        $qaRelative = "$evidenceRelative/qa-ota.apk"
        Copy-Item -LiteralPath (Join-Path $android 'app/build/outputs/apk/release/app-release.apk') -Destination (Join-Path $android $qaRelative)
        $qaApks += Confirm-Apk $qaRelative $baseCode $baseName 'qa'
    }
    $publicEnvironment.MOYRITM_OTA_CHANNEL = 'stable'
    $phase = 'Сборка web-assets и Capacitor sync для постоянной stable APK'
    Write-Host "$phase..."
    $null = Invoke-LocalCommand -File $node -Arguments @($npmCli, 'run', 'android:sync')
    $steps = if ($PrepareUpdateTest) { @($baseCode, ($baseCode + 1), 0) } else { @(0) }
    foreach ($testCode in $steps) {
        $phase = if ($testCode) { "Подписанная QA-сборка $testCode" } else { "Подписанная release-сборка $baseCode / $baseName" }
        Write-Host "$phase... Это может занять несколько минут."
        $command = '/d /c gradlew.bat :app:assembleRelease --no-daemon --no-configuration-cache --console=plain --max-workers=2'
        if ($testCode) { $command += " -PmoyritmTestVersionCode=$testCode" }
        $null = Invoke-LocalCommand -File $env:ComSpec -RawArguments $command -Directory $android -Signing
        if ($testCode) {
            $qaRelative = "$evidenceRelative/qa-$testCode.apk"
            Copy-Item -LiteralPath (Join-Path $android 'app/build/outputs/apk/release/app-release.apk') -Destination (Join-Path $android $qaRelative)
            $qaApks += Confirm-Apk $qaRelative $testCode "$baseName-qa.$testCode"
        } else {
            $official = Confirm-Apk 'app/build/outputs/apk/release/app-release.apk' $baseCode $baseName
        }
    }
    $receipt = [ordered]@{ status = 'SIGNED_BUILDS_ONLY_RUNTIME_CHECK_PENDING'; createdAt = [DateTimeOffset]::Now.ToString('o')
        keystore = $keyFacts; officialApk = $official; qaApks = @($qaApks); installedOnAnyDevice = $false }
    $receiptPath = Join-Path $evidenceDirectory 'verification.json'
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
    Write-Host "Готово. Подпись и версия APK проверены. APK: $($official.path)"
    Write-Host "Размер: $($official.bytes) байт. Отчёт без секретов: $receiptPath"
    Write-Host 'На устройства ничего не устанавливалось. Теперь сообщите Codex: «Скрипт завершился». Не удаляйте debug APK или PWA.'
} catch {
    Write-Host "Остановка: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Не отправляйте пароль или keystore. Установленное приложение не изменялось.'
    exit 1
} finally {
    foreach ($name in $signingNames) { $signingEnvironment.Remove($name) }
    $signingEnvironment.Clear()
    $plainPassword = $null
    $localCredential = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
}
