Attribute VB_Name = "Module25"
Option Explicit

' A11부터 K 열의 마지막 데이터 행까지 인쇄 (세로 출력)
' - 가로폭(열 A:K)을 한 장에 모두 맞춤 (FitToPagesWide=1)
' - 여백 0
' - 기본: 미리보기, 바로 인쇄하려면 Preview:=False
Public Sub 인쇄_A11K_데이터까지(Optional ByVal Preview As Boolean = True)
    Dim ws As Worksheet
    Dim rngData As Range
    Dim lastCell As Range
    Dim lastRow As Long
    Dim oldPrintArea As String
    Dim ps As PageSetup
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
    
    ' --- A11:K(rows) 영역에서 마지막 데이터 행 찾기 ---
    With ws
        Set rngData = .Range("A11:K" & .rows.Count)
        On Error Resume Next
        Set lastCell = rngData.Find(What:="*", LookIn:=xlFormulas, LookAt:=xlPart, _
                                    SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
        On Error GoTo EH
    End With
    
    If lastCell Is Nothing Or lastCell.Row < 11 Then
        MsgBox "A11:K 범위 내에 인쇄할 데이터가 없습니다.", vbInformation
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
    ps.PrintArea = "$A$11:$K$" & lastRow
    
    With ps
        .Zoom = False
        .FitToPagesWide = 1     ' 열 A~K를 가로 한 장에 맞춤
        .FitToPagesTall = False ' 세로는 자동 (줄 수 많으면 여러 장)
        .Orientation = xlPortrait ' ★ 세로(종방향)
        
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

' Alt+F8 목록에 보이도록 인수 없는 래퍼
Public Sub 인쇄_A11K_데이터까지_미리보기()
    인쇄_A11K_데이터까지  ' Preview 기본값(True)
End Sub

Public Sub 인쇄_A11K_데이터까지_바로인쇄()
    인쇄_A11K_데이터까지 False
End Sub


