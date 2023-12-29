$buffer = New-Object byte[] 10;
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
[System.BitConverter]::ToString($buffer).Replace("-", "")
