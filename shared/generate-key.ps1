$buffer = New-Object byte[] 10;
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
Write-Host $($buffer -join ", ")
