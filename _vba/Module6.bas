Attribute VB_Name = "Module6"
Option Explicit

' 선택된 셀이 포함된 "행"의 A:K 범위를 삭제하고 위로 올립니다.
' 실행 전 "정말 삭제할까요?" 확인 창을 띄워 취소할 수 있게 했습니다.
Public Sub 선택행_AK_삭제_위로올림()
    Dim ws As Worksheet
    Dim sel As Range, area As Range
    Dim rowsUnion As Range, Target As Range
    Dim onlyAJ As Range ' 변수명은 그대로 사용하지만, 실제 범위는 A:K로 검사합니다.
    Dim rowCnt As Long
    Dim oldCalc As XlCalculation
    Dim resp As VbMsgBoxResult
    
    On Error GoTo EH
    
    If Not TypeOf ActiveSheet Is Worksheet Then
        MsgBox "워크시트에서 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set ws = ActiveSheet
    
    If TypeName(Selection) <> "Range" Then
        MsgBox "셀 범위를 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set sel = Selection
    
    ' === 선택 범위를 A:K로 한정 (2단계 체크) ===
    Set onlyAJ = Intersect(sel, ws.Range("A:K"))
    If onlyAJ Is Nothing Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~K 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    If onlyAJ.CountLarge <> sel.CountLarge Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~K 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    ' === 끝 ===
    
    ' 선택된 모든 영역의 전체 행을 합집합으로 수집
    For Each area In sel.Areas
        If rowsUnion Is Nothing Then
            Set rowsUnion = area.EntireRow
        Else
            Set rowsUnion = Union(rowsUnion, area.EntireRow)
        End If
    Next area
    
    If rowsUnion Is Nothing Then
        MsgBox "유효한 선택이 없습니다.", vbExclamation
        Exit Sub
    End If
    rowCnt = rowsUnion.rows.Count
    
    ' 대상: (선택된 행들) ∩ (A:K 열)
    Set Target = Intersect(rowsUnion, ws.Columns("A:K"))
    If Target Is Nothing Then
        MsgBox "선택된 행에 A~K 범위가 없습니다.", vbInformation
        Exit Sub
    End If
    
    ' === 실행 전 사용자 확인 ===
    resp = MsgBox( _
        "정말 삭제할까요?" & vbCrLf & _
        "대상: " & rowCnt & "개 행의 A:K 범위" & vbCrLf & _
        "동작: 삭제 후 위로 올림(되돌릴 수 없습니다).", _
        vbQuestion + vbYesNo + vbDefaultButton2, _
        "A:K 삭제(위로 올림) 확인")
    If resp <> vbYes Then
        MsgBox "삭제를 취소했습니다.", vbInformation
        Exit Sub
    End If
    
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    oldCalc = Application.Calculation
    Application.Calculation = xlCalculationManual
    
    ' A:K 삭제 후 위로 당김
    Target.Delete xlShiftUp
    
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    
    MsgBox rowCnt & "개 행의 A:K를 삭제(위로 올림)했습니다.", vbInformation
    Exit Sub

EH:
    On Error Resume Next
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "오류: " & Err.Description, vbExclamation
End Sub


