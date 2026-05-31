Attribute VB_Name = "Module12"
Option Explicit

' 늦은 바인딩 전역(폼을 오브젝트로만 다룸)
Public gHUD As Object

' === HUD 열기(모델리스, 기본 인스턴스 사용 / UserForms.Add 안 씀) ===
Public Sub Open_LossHUD()
    On Error GoTo TryDefault

    ' 1) 이미 떠 있는 인스턴스가 있으면 그걸 사용
    Dim f As Object
    For Each f In VBA.UserForms
        If StrComp(TypeName(f), "ufLossHUD", vbTextCompare) = 0 Then
            Set gHUD = f
            gHUD.Visible = True
            Exit Sub
        End If
    Next f

TryDefault:
    Err.Clear
    On Error GoTo EH

    ' 2) 기본 인스턴스(Predeclared) 직접 사용
    Set gHUD = ufLossHUD
    gHUD.Show vbModeless
    Exit Sub

EH:
    MsgBox "HUD 열기 실패(" & Err.Number & "): " & _
           IIf(Len(Err.Description) > 0, Err.Description, _
           "유저폼 (Name)이 'ufLossHUD'인지, 같은 통합문서에 있는지 확인하세요."), _
           vbCritical
End Sub

Public Sub Close_LossHUD()
    On Error Resume Next
    If Not gHUD Is Nothing Then Unload gHUD
    Set gHUD = Nothing
End Sub

Public Function HUDLoaded() As Boolean
    On Error Resume Next
    HUDLoaded = Not gHUD Is Nothing
End Function


