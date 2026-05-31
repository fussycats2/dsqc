Attribute VB_Name = "현재_통합_문서"
Attribute VB_Base = "0{00020819-0000-0000-C000-000000000046}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = True
' === [ThisWorkbook] ===
Option Explicit

' 중량오류 팝업 난발 방지 플래그
Private lastAlertState As Boolean

Private Sub Workbook_Open()
    On Error Resume Next

    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True

    ' 메뉴 시트로 이동(있다면)
    ThisWorkbook.Worksheets("메뉴").Activate

    lastAlertState = False

    ' 유저폼/워처가 있는 경우 표시 (없어도 스텁으로 컴파일 에러 안나게 처리됨)
    ShowStockWatch

    ' 모든 시트 UIOnly 재적용
    Dim ws As Worksheet, wasProtected As Boolean
    For Each ws In ThisWorkbook.Worksheets
        wasProtected = ws.ProtectContents
        If wasProtected Then
            ws.Unprotect Password:=""
            ws.Protect Password:="", UserInterfaceOnly:=True, AllowFiltering:=True
            ws.EnableOutlining = True
        End If
    Next ws

    ' "작성" 시트의 원본 서식 캡처(없으면 건너뜀)
    If SheetExists("작성") Then
        Call Worksheets("작성").CaptureOriginalFormats
    End If

    On Error GoTo 0
End Sub

Private Sub Workbook_SheetCalculate(ByVal sh As Object)
    On Error GoTo SafeExit

    ' ====== (A) raw!AB25:AC61 중량오류 팝업 ======
    Dim wsRaw As Worksheet
    Dim rng As Range, cell As Range
    Dim hasIssue As Boolean

    On Error Resume Next
    Set wsRaw = ThisWorkbook.Worksheets("raw")
    On Error GoTo SafeExit

    If Not wsRaw Is Nothing Then
        Set rng = wsRaw.Range("AB25:AC61")
        hasIssue = False
        For Each cell In rng.Cells
            If IsNumeric(cell.Value) Then
                If val(cell.Value) <> 0 Then
                    hasIssue = True
                    Exit For
                End If
            End If
        Next cell

        If hasIssue And Not lastAlertState Then
            MsgBox "공정 내 중량오류가 발견되었습니다." & vbCrLf & _
                   "raw 시트를 확인해주세요.", _
                   vbExclamation, "중량오류 경고"
        End If
        lastAlertState = hasIssue
    End If

    ' ====== (B) 유저폼 실시간 갱신 (raw!AD3 / AD5) ======
    EnsureStockWatch
    UpdateStockWatch

SafeExit:
    ' 아무 것도 안 함 (오류는 조용히 무시)
End Sub

' 유틸: 시트 존재 확인
Private Function SheetExists(ByVal sheetName As String) As Boolean
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(ws.name, sheetName, vbTextCompare) = 0 Then
            SheetExists = True
            Exit Function
        End If
    Next ws
End Function


