Attribute VB_Name = "Module14"
Option Explicit

' 보호 해제/재보호용 비밀번호 (없으면 빈 문자열 유지)
Private Const PROTECT_PW As String = ""

Public Sub Tag_보정_간단()
    Dim ws As Worksheet, rng As Range, c As Range
    Dim rows As Object, r As Variant
    Dim qty As Variant, autoW As Double, resp As VbMsgBoxResult, w As Variant
    Dim wasProt As Boolean
    Dim oldScr As Boolean, oldEvt As Boolean, oldCalc As XlCalculation

    If Not TypeOf ActiveSheet Is Worksheet Then Exit Sub
    Set ws = ActiveSheet
    If TypeName(Selection) <> "Range" Then Exit Sub

    ' 선택 범위: L:Y (기존 K:X에서 1칸 우측 이동)
    Set rng = Intersect(Selection, ws.Columns("L:Y"))
    If rng Is Nothing Then
        MsgBox "L:Y 범위에서 선택 후 실행하세요.", vbExclamation
        Exit Sub
    End If

    ' 퍼포먼스/안전 모드
    oldScr = Application.ScreenUpdating: Application.ScreenUpdating = False
    oldEvt = Application.EnableEvents:    Application.EnableEvents = False
    oldCalc = Application.Calculation:    Application.Calculation = xlCalculationManual

    ' 시트 보호상태 임시 해제
    wasProt = ws.ProtectContents
    On Error Resume Next
    If wasProt Then ws.Unprotect Password:=PROTECT_PW
    On Error GoTo 0

    Set rows = CreateObject("Scripting.Dictionary")
    For Each c In rng.Cells
        If Not rows.Exists(c.Row) Then rows.Add c.Row, True
    Next c

    For Each r In rows.Keys
        ' === 1) 수량 입력 → V열 (그냥 덮어쓰기) ===
        qty = Application.InputBox("잔여 Tag 수량을 입력하세요." & vbCrLf & _
                                   "(행 " & r & " → V열)", _
                                   "수량 입력", Type:=1)
        If VarType(qty) = vbBoolean Then GoTo NextR ' 취소
        If Not IsNumeric(qty) Then GoTo NextR
        With ws.Cells(r, "V")
            .Value = CDbl(qty)
            .NumberFormat = "0"   ' 정수 수량이면 이렇게, 필요시 "0.00"로 변경
        End With

        ' === 2) 자동중량 계산(소수 둘째자리 버림) → W열 (덮어쓰기) ===
        autoW = RoundDown(CDbl(qty) * 0.035, 2)
        resp = MsgBox("이 중량으로 보정하겠습니까?" & vbCrLf & _
                      "자동중량: " & Format(autoW, "0.00"), _
                      vbQuestion + vbYesNo + vbDefaultButton1, "중량 보정 확인")

        If resp = vbYes Then
            With ws.Cells(r, "W")
                .Value = autoW
                .NumberFormat = "0.00"
                .Font.ColorIndex = xlColorIndexAutomatic ' 검정
            End With
        Else
            w = Application.InputBox("수정할 Tag 중량을 입력하세요." & vbCrLf & _
                                     "(행 " & r & " → W열)", _
                                     "중량 직접 입력", Type:=1)
            If VarType(w) = vbBoolean Then GoTo NextR ' 취소
            If Not IsNumeric(w) Then GoTo NextR
            With ws.Cells(r, "W")
                .Value = CDbl(w)
                .NumberFormat = "0.00"
                .Font.Color = vbRed ' 수동 입력은 빨간색
            End With
        End If

        ' === 3) X열 = P열 ? W열 (덮어쓰기) ===
        With ws.Cells(r, "X")
            .Value = NzNum(ws.Cells(r, "P").Value) - NzNum(ws.Cells(r, "W").Value)
            .NumberFormat = "0.00"
        End With

        ' 필요하면 Y열도 이 자리에서 덮어쓰기 로직 추가 가능
        ' ex) ws.Cells(r, "Y").Value = ... : ws.Cells(r, "Y").NumberFormat = "0.00"

NextR:
    Next r

SafeExit:
    ' 시트 재보호 (원래 보호였으면 복원)
    On Error Resume Next
    If wasProt Then
        ws.Protect Password:=PROTECT_PW, UserInterfaceOnly:=True, AllowFiltering:=True
        ws.EnableOutlining = True
    End If
    On Error GoTo 0

    Application.Calculation = oldCalc
    Application.EnableEvents = oldEvt
    Application.ScreenUpdating = oldScr
End Sub

' 소수점 자리수 버림 (엑셀 ROUNDDOWN 동일)
Private Function RoundDown(ByVal val As Double, ByVal num_digits As Long) As Double
    Dim factor As Double
    factor = 10 ^ num_digits
    If val >= 0 Then
        RoundDown = Int(val * factor) / factor
    Else
        RoundDown = -Int(-val * factor) / factor
    End If
End Function

' 에러/비수치 → 0
Private Function NzNum(ByVal v As Variant) As Double
    If IsError(v) Then
        NzNum = 0
    ElseIf IsNumeric(v) Then
        NzNum = CDbl(v)
    Else
        NzNum = 0
    End If
End Function




