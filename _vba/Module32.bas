Attribute VB_Name = "Module32"
Option Explicit

' 선택된 셀의 "행"에 대해:
' 1) A열 값만 지움 (서식은 유지)
' 2) A:L 범위 배경(Interior) 색상을 흰색으로 변경
Public Sub 작업취소_AL_초기화()
    Dim ws As Worksheet
    Dim sel As Range, area As Range
    Dim rowsUnion As Range, Target As Range, rngA As Range
    Dim onlyAL As Range
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
    
    ' === 선택 범위를 A:L로 한정 (2단계 체크) ===
    Set onlyAL = Intersect(sel, ws.Range("A:L"))
    If onlyAL Is Nothing Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~L 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    If onlyAL.CountLarge <> sel.CountLarge Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~L 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    ' === 끝 ===
    
    ' 선택 영역들의 전체 행을 합집합으로 수집
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
    
    ' 대상: (선택된 행들) ∩ (A:L)
    Set Target = Intersect(rowsUnion, ws.Columns("A:L"))
    If Target Is Nothing Then
        MsgBox "선택된 행에 A~L 범위가 없습니다.", vbInformation
        Exit Sub
    End If
    
    ' === 실행 전 사용자 확인 ===
    resp = MsgBox( _
        "작업을 취소할까요?" & vbCrLf & _
        "대상: " & rowCnt & "개 행의 A:L" & vbCrLf & _
        "동작: A열 값 지우기 + A:L 배경 흰색으로 초기화", _
        vbQuestion + vbYesNo + vbDefaultButton2, _
        "작업취소 (A값 지움 / A:L 흰색)")
    If resp <> vbYes Then
        MsgBox "작업취소를 취소했습니다.", vbInformation
        Exit Sub
    End If
    
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    oldCalc = Application.Calculation
    Application.Calculation = xlCalculationManual
    
    ' 1) A열 값만 지움 (서식 유지)
    Set rngA = Intersect(rowsUnion, ws.Columns("A"))
    If Not rngA Is Nothing Then
        rngA.ClearContents
    End If
    
    ' 2) A:L 배경색 흰색으로 초기화 (글꼴색/테두리/조건부서식은 건드리지 않음)
    Target.Interior.Color = vbWhite
    
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    
    MsgBox rowCnt & "개 행에 대해" & vbCrLf & _
          " - A열 값 지우기" & vbCrLf & _
          " - A:L 배경 흰색 초기화" & vbCrLf & _
          "를 완료했습니다.", vbInformation
    Exit Sub

EH:
    On Error Resume Next
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "오류: " & Err.Description, vbExclamation
End Sub


