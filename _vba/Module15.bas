Attribute VB_Name = "Module15"
Option Explicit

Public Sub ShowDatePicker(Optional ByVal Target As Range)
    Dim f As frmDatePicker
    If Target Is Nothing Then Set Target = ActiveCell
    Set f = New frmDatePicker
    Set f.targetCell = Target
    f.Show vbModal
End Sub

