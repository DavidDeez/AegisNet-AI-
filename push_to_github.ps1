# Push AegisNet to https://github.com/DavidDeez/AegisNet-AI-
$ErrorActionPreference = "Stop"

Set-Location "C:\Users\HP\Desktop\AEGISNET"

if (-not (Test-Path ".git")) {
    git init
}

git add .
git status

git commit -m "Initial commit: AegisNet AI-Powered Network Intrusion Detection & Threat Intelligence Platform"
git branch -M main

$remotes = git remote
if ($remotes -contains "origin") {
    git remote set-url origin "https://github.com/DavidDeez/AegisNet-AI-.git"
} else {
    git remote add origin "https://github.com/DavidDeez/AegisNet-AI-.git"
}

git push -u origin main
Write-Host "Successfully pushed AegisNet to https://github.com/DavidDeez/AegisNet-AI-" -ForegroundColor Green
