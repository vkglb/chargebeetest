# Trigger a Render deploy without opening the dashboard.
#
# One-time setup:
#   1. Render dashboard -> your service -> Settings -> Deploy Hook -> copy the URL
#      (looks like https://api.render.com/deploy/srv-xxxxx?key=yyyyy)
#   2. Save it in your shell (persists for new terminals):
#        setx RENDER_DEPLOY_HOOK "https://api.render.com/deploy/srv-xxxxx?key=yyyyy"
#      (open a new terminal afterwards so $env:RENDER_DEPLOY_HOOK is set)
#
# Usage:
#   ./scripts/deploy.ps1                 # uses $env:RENDER_DEPLOY_HOOK
#   ./scripts/deploy.ps1 -Hook "<url>"   # or pass the hook explicitly
param(
    [string]$Hook = $env:RENDER_DEPLOY_HOOK
)

if ([string]::IsNullOrWhiteSpace($Hook)) {
    Write-Error "RENDER_DEPLOY_HOOK is not set. Get the URL from Render -> Settings -> Deploy Hook, then: setx RENDER_DEPLOY_HOOK ""<url>"""
    exit 1
}

Write-Host "Triggering Render deploy..." -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Method Post -Uri $Hook -ErrorAction Stop
    Write-Host "Deploy triggered." -ForegroundColor Green
    if ($resp) { $resp | ConvertTo-Json -Depth 5 }
    Write-Host "Watch progress: Render dashboard -> Events / Logs." -ForegroundColor DarkGray
} catch {
    Write-Error "Deploy request failed: $($_.Exception.Message)"
    exit 1
}
