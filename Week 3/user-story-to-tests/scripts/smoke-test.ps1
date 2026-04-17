$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "[SMOKE] $message" -ForegroundColor Cyan
}

function Read-EnvValue([string]$key) {
  if (-not (Test-Path ".env")) {
    return $null
  }

  $line = Get-Content ".env" | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line -replace "^$key=", '')
}

try {
  $port = Read-EnvValue "PORT"
  if (-not $port) { $port = "8091" }

  $projectKey = Read-EnvValue "JIRA_PROJECT_KEY"
  if (-not $projectKey) { $projectKey = "DCSSTM" }

  $baseUrl = "http://localhost:$port/api"

  Write-Step "Checking health endpoint: $baseUrl/health"
  $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
  if ($health.status -ne "OK") {
    throw "Health check failed: unexpected status '$($health.status)'"
  }
  Write-Host "  PASS health" -ForegroundColor Green

  Write-Step "Checking JIRA stories endpoint"
  $stories = Invoke-RestMethod -Uri "$baseUrl/jira/stories?projectKey=$projectKey&issueTypes=Task,Story&startAt=0&maxResults=1" -Method Get
  if ($null -eq $stories.stories) {
    throw "JIRA stories check failed: 'stories' property missing"
  }
  Write-Host "  PASS jira stories (count=$($stories.stories.Count))" -ForegroundColor Green

  Write-Step "Checking generate-tests endpoint"
  $payload = @{
    storyTitle = "Smoke test story"
    acceptanceCriteria = "User can submit valid details and receive success confirmation"
    description = "Lightweight smoke validation"
    additionalInfo = ""
  } | ConvertTo-Json

  $generated = Invoke-RestMethod -Uri "$baseUrl/generate-tests" -Method Post -ContentType "application/json" -Body $payload
  if ($null -eq $generated.cases -or $generated.cases.Count -lt 1) {
    throw "Generate tests check failed: no cases returned"
  }
  Write-Host "  PASS generate-tests (cases=$($generated.cases.Count))" -ForegroundColor Green

  Write-Host "`nSmoke test completed successfully." -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "`nSmoke test failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
