$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\QuickStack.lnk")
$Shortcut.TargetPath = "C:\Users\ASUS\AppData\Local\agy\bin\quickstack\src-tauri\target\release\quickstack.exe"
$Shortcut.WorkingDirectory = "C:\Users\ASUS\AppData\Local\agy\bin\quickstack\src-tauri\target\release"
$Shortcut.Description = "QuickStack - Akıllı Pano ve Dosya Yönetimi"
$Shortcut.Save()
Write-Host "Shortcut created successfully at: $DesktopPath\QuickStack.lnk"
