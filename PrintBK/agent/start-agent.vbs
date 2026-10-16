Set oShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
oShell.CurrentDirectory = currentDir
If fso.FileExists(currentDir & "\dist\src\index.js") Then
  oShell.Run "node dist\src\index.js", 0, False
Else
  oShell.Run "node dist\index.js", 0, False
End If
