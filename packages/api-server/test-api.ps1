# API Test Script - PowerShell Version
# Usage: .\test-api.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "REST API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Create Session
Write-Host "[Step 1] Create Session" -ForegroundColor Yellow
Write-Host ""

$createBody = @'
{
  "userId": "test_user",
  "scriptId": "550e8400-e29b-41d4-a716-446655440001"
}
'@

try {
    $response1 = curl.exe -X POST "http://localhost:8000/api/sessions" `
        -H "Content-Type: application/json" `
        -d $createBody `
        -s

    $session = $response1 | ConvertFrom-Json
    
    Write-Host "Success: Session created" -ForegroundColor Green
    Write-Host "   SessionId: $($session.sessionId)"
    Write-Host "   Status: $($session.status)"
    Write-Host "   AI Message: $($session.aiMessage)"
    Write-Host ""
    
    # 2. Send Message
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[Step 2] Send Message - Reply Name" -ForegroundColor Yellow
    Write-Host ""
    
    $chatBody = @"
{
  "sessionId": "$($session.sessionId)",
  "message": "My name is LEO"
}
"@

    $response2 = curl.exe -X POST "http://localhost:8000/api/chat" `
        -H "Content-Type: application/json" `
        -d $chatBody `
        -s
    
    $chat = $response2 | ConvertFrom-Json
    
    Write-Host "Success: Chat response" -ForegroundColor Green
    Write-Host "   AI Message: $($chat.aiMessage)"
    Write-Host "   Status: $($chat.executionStatus)"
    Write-Host "   Variables: $($chat.extractedVariables | ConvertTo-Json -Compress)"
    Write-Host ""
    
    # 3. Send Another Message
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[Step 3] Send Message - Reply Age" -ForegroundColor Yellow
    Write-Host ""
    
    $chatBody2 = @"
{
  "sessionId": "$($session.sessionId)",
  "message": "I am 49 years old"
}
"@

    $response3 = curl.exe -X POST "http://localhost:8000/api/chat" `
        -H "Content-Type: application/json" `
        -d $chatBody2 `
        -s
    
    $chat2 = $response3 | ConvertFrom-Json
    
    Write-Host "Success: Chat response" -ForegroundColor Green
    Write-Host "   AI Message: $($chat2.aiMessage)"
    Write-Host "   Status: $($chat2.executionStatus)"
    Write-Host "   Variables: $($chat2.extractedVariables | ConvertTo-Json -Compress)"
    Write-Host ""
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "API Test Passed!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Session ID: $($session.sessionId)" -ForegroundColor Cyan
    Write-Host "You can continue this session in Web UI" -ForegroundColor Gray
    
} catch {
    Write-Host "Test Failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "  1. API service is running on port 8000 (pnpm dev)" -ForegroundColor Gray
    Write-Host "  2. Database is started (docker-compose -f docker-compose.dev.yml up -d)" -ForegroundColor Gray
    Write-Host "  3. Script is imported (pnpm tsx import-script.ts)" -ForegroundColor Gray
}
