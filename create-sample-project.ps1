$body = @{
    projectName = "CBT抑郁症评估工程"
    description = "认知行为疗法(CBT)抑郁症初次评估会谈脚本工程，用于演示完整的会谈流程"
    engineVersion = "2.0.0"
    engineVersionMin = "2.0.0"
    author = "LEO"
    tags = @("CBT", "抑郁症", "评估会谈", "示例工程")
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
$project.data.id | Out-File -FilePath "project-id.txt" -NoNewline
