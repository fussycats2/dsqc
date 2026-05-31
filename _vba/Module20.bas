Attribute VB_Name = "Module20"
' 상태 저장용
Public SavedCalc As XlCalculation
Public SavedScr As Boolean
Public SavedEvt As Boolean

Public Sub PushAppState(Optional ByVal toManual As Boolean = True)
    SavedCalc = Application.Calculation
    SavedScr = Application.ScreenUpdating
    SavedEvt = Application.EnableEvents

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    If toManual Then Application.Calculation = xlCalculationManual
End Sub

Public Sub PopAppState()
    On Error Resume Next
    Application.Calculation = SavedCalc
    Application.ScreenUpdating = SavedScr
    Application.EnableEvents = SavedEvt
End Sub

