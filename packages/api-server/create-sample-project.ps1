$body = @{
    projectName = "CBT Depression Assessment Project"
    description = "Cognitive Behavioral Therapy (CBT) initial depression assessment session script project for demonstrating complete consultation workflow"
    engineVersion = "2.0.0"
    engineVersionMin = "2.0.0"
    author = "LEO"
    tags = @("CBT", "Depression", "Assessment", "Sample Project")
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:8000/api/projects" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing

$project = $response.Content | ConvertFrom-Json
Write-Host "工程创建成功！"
Write-Host "工程ID: $($project.data.id)"
Write-Host "工程名称: $($project.data.projectName)"

# 保存工程ID到文件
$project.data.id | Out-File -FilePath "..\..\project-id.txt" -NoNewline
