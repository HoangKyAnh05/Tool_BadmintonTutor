# PowerShell Setup & Git Initialization Script for Badminton Coach Assistant
# Written in unsigned Vietnamese (Tieng Viet khong dau) to avoid Windows PowerShell encoding parsing issues.

Clear-Host
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   BMT TUTOR - SETUP & GIT INITIALIZATION SCRIPT   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

# 1. Check requirements
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host "[ERR] Khong tim thay Node.js! Vui long cai dat Node.js tu https://nodejs.org/" -ForegroundColor Red
    Pause
    Exit
}
Write-Host "[OK] Da phat hien Node.js" -ForegroundColor Cyan

$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "[WARNING] Khong tim thay Git! Vui long cai dat Git de ket noi GitHub." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Da phat hien Git" -ForegroundColor Cyan
}

# 2. Run npm install
Write-Host ""
Write-Host "--> Dang cai dat thu vien Electron (Vui long doi giay lat)..." -ForegroundColor Yellow
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERR] Khong the cai dat cac thu vien. Vui long kiem tra ket noi mang." -ForegroundColor Red
    Pause
    Exit
}
Write-Host "[OK] Da cai dat thu vien thanh cong!" -ForegroundColor Green

# 3. Setup Git and Repository
if ($gitCheck) {
    Write-Host ""
    Write-Host "--> Cau hinh Git & lien ket GitHub..." -ForegroundColor Yellow
    
    # Initialize Git
    if (-not (Test-Path .git)) {
        git init
        Write-Host "Da khoi tao Git repository." -ForegroundColor Gray
    }
    
    # Add/Update Remote Origin
    $remoteCheck = git remote get-url origin 2>$null
    if ($null -eq $remoteCheck) {
        git remote add origin https://github.com/HoangKyAnh05/Tool_BadmintonTutor.git
        Write-Host "Da them GitHub remote origin: https://github.com/HoangKyAnh05/Tool_BadmintonTutor.git" -ForegroundColor Gray
    } else {
        git remote set-url origin https://github.com/HoangKyAnh05/Tool_BadmintonTutor.git
        Write-Host "Da cap nhat GitHub remote origin." -ForegroundColor Gray
    }
    
    # Add and Commit files
    git add .
    git commit -m "Initial commit: Badminton Coach Assistant application" 2>$null
    
    Write-Host "[OK] Da tao ban commit dau tien tren may ca nhan cua ban!" -ForegroundColor Green
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Yellow
    Write-Host "De day (push) ma nguon len GitHub ca nhan cua ban, hay chay lenh:" -ForegroundColor Yellow
    Write-Host "    git push -u origin master  (hoac main)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Yellow
}

# 4. Start App
Write-Host ""
Write-Host "--> Dang khoi chay ung dung Electron..." -ForegroundColor Green
Write-Host "Bam Ctrl+C tai cua so nay neu muon dung ung dung." -ForegroundColor Gray
npm start
