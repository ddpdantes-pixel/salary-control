# Windows CurrentUser DPAPI. Only encrypted credentials are written, outside the repository.
function Get-MoyRitmCredentialEntropy([string]$KeyHash, [string]$Alias) {
    return [Text.Encoding]::UTF8.GetBytes("MoyRitm.AndroidRelease.v1|$KeyHash|$Alias")
}

function Get-MoyRitmSigningCredential([string]$Path, [string]$KeyHash, [string]$Alias) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $record = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($record.version -ne 1 -or $record.keystoreSha256 -cne $KeyHash -or $record.alias -cne $Alias) {
        throw 'LOCAL_CREDENTIAL_SCOPE_MISMATCH: сохранённый доступ относится к другому файлу или alias. Пароль не запрашивался.'
    }
    $cipher = [Convert]::FromBase64String($record.protected)
    $clear = $null
    try {
        $clear = [Security.Cryptography.ProtectedData]::Unprotect($cipher,
            (Get-MoyRitmCredentialEntropy $KeyHash $Alias), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        return ([Text.Encoding]::UTF8.GetString($clear) | ConvertFrom-Json)
    } catch {
        throw 'LOCAL_CREDENTIAL_UNAVAILABLE: Windows не открыла локальное защищённое хранилище. Автоматического запроса пароля нет.'
    } finally {
        if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) }
    }
}

function Save-MoyRitmSigningCredential([string]$Path, [string]$KeyHash, [string]$Alias,
        [string]$StorePassword, [string]$KeyPassword) {
    if (Test-Path -LiteralPath $Path) { throw 'LOCAL_CREDENTIAL_ALREADY_EXISTS: существующий файл не заменяется.' }
    $clear = $null; $json = $null
    try {
        $json = @{ storePassword=$StorePassword; keyPassword=$KeyPassword } | ConvertTo-Json -Compress
        $clear = [Text.Encoding]::UTF8.GetBytes($json)
        $cipher = [Security.Cryptography.ProtectedData]::Protect($clear,
            (Get-MoyRitmCredentialEntropy $KeyHash $Alias), [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $record = [ordered]@{ version=1; keystoreSha256=$KeyHash; alias=$Alias; protected=[Convert]::ToBase64String($cipher) }
        $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json))
        $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.SetOwner($owner)
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($owner, 'FullControl', 'Allow'))
        $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', 'Allow'))
        Set-Acl -LiteralPath $Path -AclObject $acl
    } finally {
        if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) }
        $json = $null; $StorePassword = $null; $KeyPassword = $null
    }
}
