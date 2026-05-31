Attribute VB_Name = "frmStockWatch"
Attribute VB_Base = "0{F40C5CA8-4896-40DE-A68D-C0B67C4B75E7}{63E79791-715B-4F43-8813-396932F5EAC1}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
' === [frmStockWatch] (컴팩트: W=340, H=36) ===
Option Explicit

Private lbl18K As MSForms.Label, lbl18KStatus As MSForms.Label
Private lbl14K As MSForms.Label, lbl14KStatus As MSForms.Label

Private Sub UserForm_Initialize()
    Me.Caption = "재고 모니터"
    Me.StartUpPosition = 2     ' 화면 중앙
    Me.Width = 340             ' 가로 절반 수준
    Me.Height = 50             ' 세로 1/3 수준

    Dim h As Single: h = 18    ' 컨트롤 높이 (얇게)
    Dim Y As Single: Y = 8     ' 수직 중앙에 보이도록 상단 여백
    Dim gap As Single: gap = 6

    ' 18K 라벨 (왼쪽)
    Set lbl18K = Me.Controls.Add("Forms.Label.1", "lbl18K")
    With lbl18K
        .Caption = "18K"
        .Font.Size = 10
        .Font.Bold = True
        .Left = 8
        .Top = Y
        .Width = 36
        .Height = h
        .TextAlign = fmTextAlignCenter
    End With

    ' 18K 상태 (가운데 정렬, 문구만 표시)
    Set lbl18KStatus = Me.Controls.Add("Forms.Label.1", "lbl18KStatus")
    With lbl18KStatus
        .Caption = "확인 중..."
        .Font.Size = 10
        .Left = lbl18K.Left + lbl18K.Width + gap
        .Top = Y
        .Width = 110
        .Height = h
        .BackStyle = fmBackStyleOpaque
        .TextAlign = fmTextAlignCenter
    End With

    ' 14K 라벨
    Set lbl14K = Me.Controls.Add("Forms.Label.1", "lbl14K")
    With lbl14K
        .Caption = "14K"
        .Font.Size = 10
        .Font.Bold = True
        .Left = lbl18KStatus.Left + lbl18KStatus.Width + (gap * 2)
        .Top = Y
        .Width = 36
        .Height = h
        .TextAlign = fmTextAlignCenter
    End With

    ' 14K 상태
    Set lbl14KStatus = Me.Controls.Add("Forms.Label.1", "lbl14KStatus")
    With lbl14KStatus
        .Caption = "확인 중..."
        .Font.Size = 10
        .Left = lbl14K.Left + lbl14K.Width + gap
        .Top = Y
        .Width = 110
        .Height = h
        .BackStyle = fmBackStyleOpaque
        .TextAlign = fmTextAlignCenter
    End With
End Sub

' 외부에서 raw!AD3, AD5 값 갱신
Public Sub UpdateStatus(ByVal ad3 As Variant, ByVal ad5 As Variant)
    UpdateOne lbl18KStatus, ad3
    UpdateOne lbl14KStatus, ad5
End Sub

' "재고 정상 / 재고 불일치"만 표시
Private Sub UpdateOne(ByVal statusLabel As MSForms.Label, ByVal v As Variant)
    Dim isOk As Boolean
    isOk = (IsNumeric(v) And val(v) = 0)

    If isOk Then
        statusLabel.Caption = "재고 정상"
        statusLabel.BackColor = RGB(46, 204, 113)   ' 초록
        statusLabel.ForeColor = RGB(0, 0, 0)
    Else
        statusLabel.Caption = "재고 불일치"
        statusLabel.BackColor = RGB(231, 76, 60)    ' 빨강
        statusLabel.ForeColor = RGB(255, 255, 255)
    End If
End Sub

Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    If CloseMode = vbFormControlMenu Then
        Cancel = True
        Me.Hide
    End If
End Sub


