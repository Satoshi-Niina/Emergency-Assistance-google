# PowerShell script to kill process using port 8080
$port = 8080
Write-Host "Checking port $port..." -ForegroundColor Cyan

$processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    foreach ($processId in $processes) {
        try {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Stopping process: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                Stop-Process -Id $processId -Force
                Write-Host "Process stopped successfully" -ForegroundColor Green
            }
        } catch {
            Write-Host "Could not stop process: $_" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No process found using port $port" -ForegroundColor Green
}
