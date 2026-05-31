Attribute VB_Name = "Module36"
' === Module: tag_확정작업 ===
Option Explicit

' 여러 기준 열 중 실제 마지막 사용 행을 계산
Private Function LastUsedRowOf(ByVal ws As Worksheet, ParamArray cols()) As Long
    Dim i As Long, c As Variant, lastR As Long, r As Long
    For i = LBound(cols) To UBound(cols)
        c = cols(i)
        r = ws.Cells(ws.rows.Count, c).End(xlUp).Row
        If r > lastR Then lastR = r
    Next i
    If lastR < 13 Then lastR = 13
    LastUsedRowOf = lastR
End Function

' 내부 처리 로직
Private Sub DoTag확정작업(ByVal ws As Worksheet)
    Dim r As Long, lastR As Long
    Dim vO As Variant, vW As Variant, vP As Variant
    Dim filled As Long, skipped As Long

    lastR = LastUsedRowOf(ws, "O", "P", "W")
    If lastR < 13 Then GoTo AfterLoop

    For r = 13 To lastR
        vO = ws.Cells(r, "O").Value
        vW = ws.Cells(r, "W").Value

        ' O에 값이 있고 W가 비었을 때
        If Len(Trim$(CStr(vO))) > 0 And Len(Trim$(CStr(vW))) = 0 Then
            vP = ws.Cells(r, "P").Value
            If Len(Trim$(CStr(vP))) > 0 Then
                If IsNumeric(vP) Then
                    ws.Cells(r, "W").Value = CDbl(vP)
                Else
                    ws.Cells(r, "W").Value = vP
                End If
                filled = filled + 1
            Else
                skipped = skipped + 1
            End If
        End If
    Next r

AfterLoop:
    MsgBox "tag 확정작업 완료" & vbCrLf & _
           "채워넣은 건수: " & filled & vbCrLf & _
           "건너뜀(복사 원본 P가 공백 등): " & skipped, vbInformation
End Sub

' === Alt+F8, 버튼 지정용 메인 진입점 ===
Public Sub tag_확정작업()
    On Error GoTo EH
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    ' 버튼을 누른 그 시트(현재 활성 시트)에 실행
    DoTag확정작업 ActiveSheet

CleanUp:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub

EH:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "오류: " & Err.Number & " - " & Err.Description, vbExclamation
End Sub


