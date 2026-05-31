Attribute VB_Name = "Sheet30"
Attribute VB_Base = "0{00020820-0000-0000-C000-000000000046}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = True
Option Explicit

Private Sub Worksheet_SelectionChange(ByVal Target As Range)
    Dim kSel As Range
    Dim s As Variant

    If Application.CutCopyMode <> False Then Exit Sub
    If Not HUDLoaded() Then Exit Sub

    Set kSel = Intersect(Target, Me.Columns("K"))

    ' 1단계: Nothing만 우선 체크
    If kSel Is Nothing Then
        SafeUpdate 0#
        Exit Sub
    End If

    ' 2단계: CountLarge 평가 (여기서 오류 안 남)
    If kSel.CountLarge >= 1 Then
        s = Application.Sum(kSel)                 ' 숫자만 합계
        If IsError(s) Then s = 0#
        SafeUpdate Round(CDbl(s), 2)              ' 소수 둘째자리
    Else
        SafeUpdate 0#
    End If
End Sub

' ====== 핵심: 안전 호출 래퍼 ======
Private Sub SafeUpdate(ByVal v As Double)
    On Error GoTo Reopen

    ' 늦은 바인딩이므로 CallByName으로 메서드 호출
    CallByName gHUD, "UpdateBefore", VbMethod, v
    Exit Sub

Reopen:
    ' gHUD가 끊어졌거나 메서드 호출 실패 → 한번 재오픈 후 재시도
    Err.Clear
    Open_LossHUD
    If HUDLoaded() Then
        On Error Resume Next
        CallByName gHUD, "UpdateBefore", VbMethod, v
        On Error GoTo 0
    End If
End Sub



