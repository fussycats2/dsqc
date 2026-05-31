Attribute VB_Name = "Module21"
' === modCalcTools.bas ===
Option Explicit

' 지연/표시 꼬임이 느껴질 때 실행하면
' - 계산모드: 자동으로 전환
' - 통합문서 전체 Full Rebuild 재계산
' - 작업 전/후 Excel 상태를 안전하게 복구
Public Sub 전체재계산_풀리빌드()
    Dim t As Double
    Dim prevCalc As XlCalculation
    Dim prevScr As Boolean, prevEvt As Boolean
    Dim prevStatus As Variant

    On Error GoTo EH

    ' 현재 상태 저장
    prevCalc = Application.Calculation
    prevScr = Application.ScreenUpdating
    prevEvt = Application.EnableEvents
    prevStatus = Application.StatusBar

    ' 재계산 준비(성능/안정)
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationAutomatic

    ' 진행 표시
    Application.StatusBar = "전체 재계산(Full Rebuild) 실행 중..."
    t = Timer

    ' ★ 핵심: 전체 재계산
    Application.CalculateFullRebuild

    ' 완료 표시(경과 시간)
    Application.StatusBar = "완료! 경과 " & Format(Timer - t, "0.0") & "초"

Done:
    ' 상태 복구
    Application.ScreenUpdating = prevScr
    Application.EnableEvents = prevEvt
    Application.Calculation = prevCalc
    Application.StatusBar = False
    Exit Sub

EH:
    MsgBox "전체 재계산 중 오류: " & Err.Description, vbExclamation
    Resume Done
End Sub

