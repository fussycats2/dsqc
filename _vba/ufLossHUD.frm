Attribute VB_Name = "ufLossHUD"
Attribute VB_Base = "0{3A7DF0A8-7FD4-416A-80A9-31E66A36B8DB}{04353E90-6523-42DA-8851-A62F556E7602}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
Option Explicit

Private mBefore As Double ' 작업 전(=K열 선택 합계)

Private Sub UserForm_Initialize()
    Me.Caption = "로스 계산 HUD"
    ' lblTitle.Caption = "로스 계산 HUD"  ' ← 필요 시 사용

    ' 초기 표시
    lblBefore.Caption = "0.00"
    txtAfter.Text = "0.00"
    lblLoss.Caption = "0.00"
    lblLossRate.Caption = "0%"

    ' 시작 시 전체 선택
    SelectAll_txtAfter
End Sub

' 시트에서 합계를 갱신할 때 호출
Public Sub UpdateBefore(ByVal sumValue As Double)
    mBefore = sumValue
    lblBefore.Caption = Format(mBefore, "0.00")
    Recalc
End Sub

' ===== txtAfter 입력/편의 =====
Private Sub txtAfter_Change()
    Recalc
End Sub

Private Sub txtAfter_Exit(ByVal Cancel As MSForms.ReturnBoolean)
    Normalize_txtAfter
    Recalc
End Sub

Private Sub txtAfter_AfterUpdate()
    Normalize_txtAfter
    Recalc
End Sub

Private Sub txtAfter_GotFocus()
    SelectAll_txtAfter
End Sub

Private Sub txtAfter_Enter()
    SelectAll_txtAfter
End Sub

Private Sub txtAfter_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)
    ' 마우스 클릭으로 커서가 이동한 뒤에도 강제로 전체 선택
    SelectAll_txtAfter
End Sub

Private Sub txtAfter_KeyDown(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)
    ' ESC로 빠른 지우기 (선택사항)
    If KeyCode = vbKeyEscape Then
        txtAfter.Text = vbNullString
        txtAfter.SetFocus
        SelectAll_txtAfter
    End If
End Sub

Private Sub SelectAll_txtAfter()
    With Me.txtAfter
        .SelStart = 0
        .SelLength = Len(.Text)
    End With
End Sub

Private Sub Normalize_txtAfter()
    Dim s As String, v As Double, dec As String
    dec = Application.International(xlDecimalSeparator)

    s = Trim$(Me.txtAfter.Text)
    If s = "" Then Exit Sub

    ' 지역 소수점 통일 (., , 모두 허용)
    If dec = "," Then
        s = Replace(s, ".", ",")
    Else
        s = Replace(s, ",", ".")
    End If

    If IsNumeric(s) Then
        v = CDbl(s)
        Me.txtAfter.Text = Format$(v, "0.00") ' 항상 소수 둘째자리
    Else
        ' 숫자가 아니면 정책: 0.00으로 보정 (원하면 vbNullString으로 변경)
        Me.txtAfter.Text = "0.00"
    End If
End Sub

' ===== 계산 =====
Private Sub Recalc()
    Dim afterVal As Double
    Dim loss As Double
    Dim rate As Double

    afterVal = ParseOrZero(txtAfter.Text)

    ' 로스 = 작업 전 - 작업 후
    loss = mBefore - afterVal
    lblLoss.Caption = Format(loss, "0.00")   ' 소수 둘째자리

    ' 로스율 = 로스 / 작업 전
    If mBefore <> 0 Then
        rate = loss / mBefore
    Else
        rate = 0
    End If
    lblLossRate.Caption = Format(rate, "0%") ' 정수 % (소수 없음)
End Sub

Private Function ParseOrZero(ByVal s As String) As Double
    Dim dec As String
    dec = Application.International(xlDecimalSeparator)
    s = Trim$(s)
    If s = "" Then Exit Function ' 0 반환

    ' 지역 소수점 통일
    If dec = "," Then
        s = Replace(s, ".", ",")
    Else
        s = Replace(s, ",", ".")
    End If

    If IsNumeric(s) Then
        ParseOrZero = CDbl(s)
    Else
        ParseOrZero = 0#
    End If
End Function

' ===== 버튼/마무리 =====
Private Sub btnClear_Click()
    ' 입력만 지움
    If Len(txtAfter.Text) > 0 Then
        txtAfter.Text = vbNullString
    End If
    txtAfter.SetFocus
    ' 필요 시 즉시 0.00으로 표기하려면 아래 한 줄 주석 해제
    ' Normalize_txtAfter: txtAfter가 빈 문자열이면 그대로 둡니다.
End Sub

Private Sub cmdClose_Click()
    Unload Me
End Sub

Private Sub UserForm_Terminate()
    On Error Resume Next
    Set gHUD = Nothing
End Sub

' 필요 시 다른 라벨/컨트롤 이벤트
Private Sub Label6_Click()
    ' 사용 안 함
End Sub

