Attribute VB_Name = "Module26"
Option Explicit

' L11부터 Y 열의 마지막 "데이터" 행까지 인쇄 (세로 출력)
' - 마지막 행 탐색 시 V:W:X:Y 열은 무시하고 L:U 열만 기준으로 계산
' - 가로폭(L:Y)을 한 장에 맞춤 (FitToPagesWide=1)
' - 여백 0
' - 기본: 미리보기, 바로 인쇄하려면 Preview:=False
Public Sub 인쇄_L11Y_데이터까지(Optional ByVal Preview As Boolean = True)
    Dim ws As Worksheet
    Dim rngData As Range
    Dim lastCell As Range
    Dim lastRow As Long
    Dim ps As PageSetup
    
    ' 백업용 기존 설정
    Dim oldPrintArea As String
    Dim oldZoom As Variant
    Dim oldFitW As Long, oldFitH As Long
    Dim oldOrient As XlPageOrientation
    Dim oldLM As Double, oldRM As Double, oldTM As Double, oldBM As Double
    Dim oldHM As Double, oldFM As Double
    Dim oldCenterH As Boolean, oldCenterV As Boolean
    
    On Error GoTo EH
    
    If Not TypeOf ActiveSheet Is Worksheet Then
        MsgBox "워크시트에서 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set ws = ActiveSheet
    Set ps = ws.PageSetup
    
    ' --- 마지막 데이터 행 찾기 (V:Y 무시, L:U만 검사) ---
    With ws
        Set rngData = .Range("L11:U" & .rows.Count)
        On Error Resume Next
        Set lastCell = rngData.Find(What:="*", LookIn:=xlValues, LookAt:=xlPart, _
                                    SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
        On Error GoTo EH
    End With
    
    If lastCell Is Nothing Or lastCell.Row < 11 Then
        MsgBox "L11:U 범위(데이터 기준)에 인쇄할 내용이 없습니다.", vbInformation
        Exit Sub
    End If
    lastRow = lastCell.Row
    
    ' --- 기존 설정 보존 ---
    oldPrintArea = ps.PrintArea
    oldZoom = ps.Zoom
    oldFitW = ps.FitToPagesWide
    oldFitH = ps.FitToPagesTall
    oldOrient = ps.Orientation
    oldLM = ps.LeftMargin: oldRM = ps.RightMargin
    oldTM = ps.TopMargin:  oldBM = ps.BottomMargin
    oldHM = ps.HeaderMargin: oldFM = ps.FooterMargin
    oldCenterH = ps.CenterHorizontally
    oldCenterV = ps.CenterVertically
    
    ' --- 인쇄 범위/페이지 설정 ---
    ps.PrintArea = "$L$11:$Y$" & lastRow
    
    With ps
        .Zoom = False
        .FitToPagesWide = 1      ' L~Y 가로폭 한 장
        .FitToPagesTall = False  ' 세로 페이지 수는 자동
        .Orientation = xlPortrait
        
        ' 여백 0
        .LeftMargin = Application.InchesToPoints(0)
        .RightMargin = Application.InchesToPoints(0)
        .TopMargin = Application.InchesToPoints(0)
        .BottomMargin = Application.InchesToPoints(0)
        .HeaderMargin = Application.InchesToPoints(0)
        .FooterMargin = Application.InchesToPoints(0)
        
        .CenterHorizontally = False
        .CenterVertically = False
    End With
    
    ' --- 인쇄/미리보기 ---
    If Preview Then
        ws.PrintPreview
    Else
        ws.PrintOut
    End If
    
    GoTo RestoreAndExit

EH:
    MsgBox "오류: " & Err.Description, vbExclamation

RestoreAndExit:
    On Error Resume Next
    With ps
        .PrintArea = oldPrintArea
        .Zoom = oldZoom
        .FitToPagesWide = oldFitW
        .FitToPagesTall = oldFitH
        .Orientation = oldOrient
        .LeftMargin = oldLM: .RightMargin = oldRM
        .TopMargin = oldTM:  .BottomMargin = oldBM
        .HeaderMargin = oldHM: .FooterMargin = oldFM
        .CenterHorizontally = oldCenterH
        .CenterVertically = oldCenterV
    End With
    On Error GoTo 0
End Sub

' Alt+F8 목록용 래퍼
Public Sub 인쇄_L11Y_데이터까지_미리보기()
    인쇄_L11Y_데이터까지  ' Preview 기본값(True)
End Sub

Public Sub 인쇄_L11Y_데이터까지_바로인쇄()
    인쇄_L11Y_데이터까지 False
End Sub


