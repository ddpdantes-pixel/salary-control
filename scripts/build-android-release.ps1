#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$KeyStorePath = (Join-Path $env:USERPROFILE 'AndroidKeys\MoyRitm\moyritm-release.jks'),
    [string]$KeyAlias = 'moyritm',
    [switch]$PrepareUpdateTest,
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
            # Do not echo captured signing-tool output or persist it to a log.
            throw "${phase}: инструмент завершился с кодом $($process.ExitCode). Проверьте пароль и конфигурацию; пароль никому не отправляйте."
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

function Confirm-Apk([string]$RelativePath, [int]$Code, [string]$Name) {
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
    return [ordered]@{
        path = $fullPath; bytes = (Get-Item -LiteralPath $fullPath).Length
        sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
        versionCode = $Code; versionName = $Name; certificateSha256 = $fingerprint
        packageId = $package.Groups[1].Value; debuggable = $false; signatureVerified = $true
    }
}

try {
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
    $publicEnvironment = @{ JAVA_HOME = $javaHome; ANDROID_HOME = $sdk; PATH = "$nodeDirectory;$env:PATH" }
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

    Write-Host 'Пароль вводится только здесь. Символы не показываются; в чат пароль не отправляйте.'
    $secret = Read-Host 'Введите пароль созданного PKCS12 keystore' -AsSecureString
    if ($secret.Length -eq 0) { throw 'Пароль не введён.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $pointer = [IntPtr]::Zero
    $signingEnvironment = @{
        MOYRITM_KEYSTORE_PATH = $KeyStorePath; MOYRITM_KEY_ALIAS = $KeyAlias
        MOYRITM_STORE_PASSWORD = $plainPassword; MOYRITM_KEY_PASSWORD = $plainPassword
    }

    $phase = 'Проверка keystore'
    Write-Host "$phase..."
    $keyArguments = @('-J-Duser.language=en', '-J-Duser.country=US', '-J-Dfile.encoding=UTF-8')
    $listing = Invoke-LocalCommand -File $keytool -Signing -Arguments ($keyArguments + @('-list', '-v', '-keystore', $KeyStorePath, '-storepass:env', 'MOYRITM_STORE_PASSWORD'))
    $entry = [regex]::Match($listing, '(?ms)^Alias name: ' + [regex]::Escape($KeyAlias) + '\r?$.*?(?=^Alias name: |\z)').Value
    if ($listing -notmatch 'Keystore type: PKCS12' -or $entry -notmatch 'Entry type: PrivateKeyEntry') {
        throw 'Не подтверждены тип PKCS12 и private-key entry указанного alias.'
    }
    $pem = Invoke-LocalCommand -File $keytool -Signing -Arguments ($keyArguments + @('-exportcert', '-rfc', '-alias', $KeyAlias, '-keystore', $KeyStorePath, '-storepass:env', 'MOYRITM_STORE_PASSWORD'))
    $certificateBody = [regex]::Match($pem, '(?s)-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----').Groups[1].Value
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($certificateBody))
    $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($certificate)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $fingerprint = ([BitConverter]::ToString($sha.ComputeHash($certificate.RawData))).Replace('-', '')
        if (!$rsa -or $rsa.KeySize -ne 3072 -or ($certificate.NotAfter - $certificate.NotBefore).TotalDays -lt 25 * 365 -or
            $certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date) -or $certificate.Subject -match 'CN=Android Debug') {
            throw 'Сертификат не соответствует ожидаемому действующему RSA 3072 / 25+ лет release-ключу.'
        }
        $keyFacts = [ordered]@{ type = 'PKCS12'; alias = $KeyAlias; algorithm = 'RSA 3072'; certificateSha256 = $fingerprint
            notBefore = $certificate.NotBefore.ToUniversalTime().ToString('o'); notAfter = $certificate.NotAfter.ToUniversalTime().ToString('o') }
    } finally {
        $sha.Dispose()
        if ($rsa) { $rsa.Dispose() }
        $certificate.Dispose()
    }
    $listing = $null; $entry = $null; $pem = $null
    Write-Host "Ключ проверен. SHA-256 сертификата: $fingerprint"

    $phase = 'Сборка web-assets и Capacitor sync'
    Write-Host "$phase..."
    $null = Invoke-LocalCommand -File $node -Arguments @($npmCli, 'run', 'android:sync')
    $session = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $evidenceRelative = 'app/build/outputs/moyritm-release-checks/' + $session
    $evidenceDirectory = Join-Path $android $evidenceRelative
    $null = New-Item -ItemType Directory -Path $evidenceDirectory
    $qaApks = @()
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
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
}
