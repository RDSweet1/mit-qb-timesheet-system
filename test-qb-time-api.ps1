# Test if existing QB token works with QB Time API
$qbToken = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..bLyVnmKBgBEcsJai2-BZgg.dHDkug0kX5YmQnfgt1VF7UjZ3erD87mCGv1_7Qg8UuZyCCES3IE26qBEM7n-vFbimjprUke1APIkXuAjjwNI_jdT0RJ9GZYC3dAStCZ55qexoaGSV682Whw19RJS4Gd84Me9ut7cJZpNYlSK2m8wPr2R4S2QvuntnJMdcQN2Ls24u0bopGHf67D8Ejbs7lGU_er22SelDNByVQCVjV-wJ3wgwHycMyn91kCW_bWK0Zx3d99mSHQA8IO1DLTay2qxdKujUxgrWvohGmvu8pdN0PW61cXD1xI88gKkyarbwOJzL8rX87mSTZ2xwYJKlpO3U3Yf0_G0zmZ3OArGtD4CXiQjuJggUxnz4YnsVXFMRu6SblC9LYuAo5D4bcXj2ulp8jROM6_BdN8krVjuiwnGKhAIfye5lXHKUeFGYjXdCwin_F42MTvdF9rLsj6Q_NSRDs7YRg-IRNjo-fFhGLnewf4tTi4XaxnSOk3yUL6b633gHFCZjN0g7A9VeAc2jMiej4V3zpgWoz-sSN6DIyUKHeGh0FRT_tLEDqW0vXOt8QUv8QL1Nngh9-zWxSZAB1FC-JA-UvBoAvrDR_kXrQXl3I7iCl9M16tY3Oc3fFc-wVrz9qxdd1hAlze6-0tLbAON.GkEmM-swLnnxjEv_MsR7ug"

Write-Host "`nTESTING QB TIME API ACCESS`n" -ForegroundColor Cyan

# Test QB Time API with existing token
$url = "https://rest.tsheets.com/api/v1/timesheets?start_date=2025-12-01&end_date=2025-12-31&limit=5"

Write-Host "Calling QB Time API..." -ForegroundColor Yellow
Write-Host "URL: $url`n" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri $url `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $qbToken"
        }

    Write-Host "SUCCESS! QB Time API Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5

    # Check if we got timesheets
    $timesheets = $response.results.timesheets
    if ($timesheets) {
        $count = ($timesheets | Get-Member -MemberType NoteProperty).Count
        Write-Host "`nFound $count timesheets!" -ForegroundColor Green

        # Show first timesheet with times
        $firstId = ($timesheets | Get-Member -MemberType NoteProperty)[0].Name
        $first = $timesheets.$firstId
        Write-Host "`nSample Timesheet:" -ForegroundColor Cyan
        Write-Host "  ID: $($first.id)" -ForegroundColor Gray
        Write-Host "  Date: $($first.date)" -ForegroundColor Gray
        Write-Host "  Start: $($first.start)" -ForegroundColor Green
        Write-Host "  End: $($first.end)" -ForegroundColor Green
        Write-Host "  Duration: $($first.duration) seconds" -ForegroundColor Gray
    }

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nResponse:" -ForegroundColor Yellow
    Write-Host $_.Exception.Response

    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "`nToken might be QB Online only, not QB Time" -ForegroundColor Yellow
        Write-Host "Need separate QB Time OAuth" -ForegroundColor Yellow
    }
}
