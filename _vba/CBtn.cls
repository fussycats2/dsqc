Attribute VB_Name = "CBtn"
Attribute VB_Base = "0{FCFB3D2A-A0FA-1068-A738-08002B3371B5}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
'=== Class Module: CBtn ===
Option Explicit
Public WithEvents btn As MSForms.CommandButton
Attribute btn.VB_VarHelpID = -1
Public Owner As frmDatePicker

Private Sub Btn_Click()
    If Not Owner Is Nothing Then Owner.PickDay btn
End Sub
