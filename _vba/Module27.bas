Attribute VB_Name = "Module27"
Option Explicit

' === 내부 유틸: 마지막 데이터 행(A11:K 기준) ===
Private Function LastDataRow_A11K(ws As Worksheet) As Long
    Dim rngData As Range, lastCell As Range
    LastDataRow_A11K = 0
    On Error GoTo ExitFunc
    With ws
        Set rngData = .Range("A11:K" & .rows.Count)
        On Error Resume Next
        Set lastCell = rngData.Find(What:="*", LookIn:=xlFormulas, LookAt:=xlPart, _
                                    SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
        On Error GoTo 0
    End With
    If Not lastCell Is Nothing Then
        If lastCell.Row >= 11 Then LastDataRow_A11K = lastCell.Row
    End If
ExitFunc:
End Function


' === 빠른 배치 인쇄(A11:K{last}) : 여러 시트를 한 번에 인쇄 (선택 로직 안정화) ===
Private Sub FastBatchPrint_A11K(sheetNames As Variant, ByVal Preview As Boolean)
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim ws As Worksheet, prev As Worksheet
    Dim i As Long, cnt As Long
    Dim names() As String, lastRows() As Long
    Dim oldCalc As XlCalculation
    Dim vis As Object ' sheetName -> original Visible
    Set vis = CreateObject("Scripting.Dictionary")

    ReDim names(1 To UBound(sheetNames) - LBound(sheetNames) + 1)
    ReDim lastRows(1 To UBound(sheetNames) - LBound(sheetNames) + 1)

    ' 1) 대상 시트 수집(존재 + A11:K에 데이터 있는 것만)
    For i = LBound(sheetNames) To UBound(sheetNames)
        On Error Resume Next
        Set ws = wb.Worksheets(CStr(sheetNames(i)))
        On Error GoTo 0
        If Not ws Is Nothing Then
            Dim lr As Long: lr = LastDataRow_A11K(ws)
            If lr >= 11 Then
                cnt = cnt + 1
                names(cnt) = ws.name
                lastRows(cnt) = lr
            End If
        End If
        Set ws = Nothing
    Next i

    If cnt = 0 Then Exit Sub
    ReDim Preserve names(1 To cnt)
    ReDim Preserve lastRows(1 To cnt)

    ' 2) 성능 옵션
    Set prev = ActiveSheet
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    oldCalc = Application.Calculation
    Application.Calculation = xlCalculationManual

    On Error GoTo CleanExit

    ' 3) PageSetup 일괄 적용 (여백 0.2")
    Application.PrintCommunication = False
    For i = 1 To cnt
        Set ws = wb.Worksheets(names(i))

        ' 숨김이면 잠시 표시(다중 선택 시 숨김 시트가 섞이면 실패)
        vis(ws.name) = ws.Visible
        If ws.Visible <> xlSheetVisible Then ws.Visible = xlSheetVisible

        With ws.PageSetup
            .PrintArea = "$A$11:$K$" & lastRows(i)
            .Zoom = False
            .FitToPagesWide = 1
            .FitToPagesTall = False
            .Orientation = xlPortrait

            ' === 여백 0.2 인치(안정성 ↑) ===
            .LeftMargin = Application.InchesToPoints(0.2)
            .RightMargin = Application.InchesToPoints(0.2)
            .TopMargin = Application.InchesToPoints(0.2)
            .BottomMargin = Application.InchesToPoints(0.2)
            .HeaderMargin = Application.InchesToPoints(0.2)
            .FooterMargin = Application.InchesToPoints(0.2)

            .CenterHorizontally = False
            .CenterVertically = False
        End With

        ' 깨진 페이지 나누기 정리(간헐 오류 예방)
        On Error Resume Next
        ws.ResetAllPageBreaks
        On Error GoTo 0
    Next i
    Application.PrintCommunication = True

    ' 4) 워크북 활성화 후 안정적 다중 선택 → 1회 Print
    wb.Activate
    If cnt = 1 Then
        If Preview Then
            wb.Worksheets(names(1)).PrintPreview
        Else
            wb.Worksheets(names(1)).PrintOut
        End If
    Else
        wb.Worksheets(names(1)).Select
        For i = 2 To cnt
            wb.Worksheets(names(i)).Select Replace:=False
        Next i

        If Preview Then
            ActiveWindow.SelectedSheets.PrintPreview
        Else
            ActiveWindow.SelectedSheets.PrintOut
        End If
    End If

CleanExit:
    On Error Resume Next
    ' 시트 가시성 원복
    For i = 1 To cnt
        If vis.Exists(names(i)) Then
            wb.Worksheets(names(i)).Visible = vis(names(i))
        End If
    Next i
    ' 그룹 해제/복귀
    If Not prev Is Nothing Then prev.Select
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub


' === 메인: 입고 장부 일괄 출력(미리보기 기본) ===
Public Sub 인쇄_입고장부_일괄(Optional ByVal Preview As Boolean = True)
    Dim sheetNames As Variant
    Dim ask As VbMsgBoxResult, listText As String

    ' 요청 시트 세트
    sheetNames = Array("기계", "양장", "캐스팅", "개발", "컷팅", _
                       "조립14K", "캐스팅14K", "컷팅14K")
    listText = Join(sheetNames, ", ")

    ask = MsgBox("입고 장부를 출력하시겠습니까?" & vbCrLf & _
                 "대상 시트: " & listText, _
                 vbQuestion + vbYesNo + vbDefaultButton1, "인쇄 확인")
    If ask <> vbYes Then
        MsgBox "출력을 취소했습니다.", vbInformation
        Exit Sub
    End If

    ' ★ 빠른 배치 인쇄
    Call FastBatchPrint_A11K(sheetNames, Preview)

    MsgBox "처리를 완료했습니다.", vbInformation
End Sub


' === Alt+F8 목록용 래퍼 ===
Public Sub 인쇄_입고장부_일괄_미리보기()
    인쇄_입고장부_일괄 True
End Sub

Public Sub 인쇄_입고장부_일괄_바로인쇄()
    인쇄_입고장부_일괄 False
End Sub

