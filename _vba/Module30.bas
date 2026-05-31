Attribute VB_Name = "Module30"
Option Explicit

' === 내부 유틸: 마지막 데이터 행(L11:U 기준, V:Y 무시) ===
Private Function LastDataRow_L11U(ws As Worksheet) As Long
    Dim rngData As Range, lastCell As Range
    LastDataRow_L11U = 0
    On Error GoTo ExitFunc
    With ws
        Set rngData = .Range("L11:U" & .rows.Count)
        On Error Resume Next
        Set lastCell = rngData.Find(What:="*", LookIn:=xlValues, LookAt:=xlPart, _
                                    SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
        On Error GoTo 0
    End With
    If Not lastCell Is Nothing Then
        If lastCell.Row >= 11 Then LastDataRow_L11U = lastCell.Row
    End If
ExitFunc:
End Function


' === 핵심: 여러 시트를 "한 문서로 이어붙여" 1회 인쇄 (시트 사이 공백 1행)
Private Sub FastBatchPrint_L11Y_Continued(sheetNames As Variant, ByVal Preview As Boolean)
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim tmp As Worksheet, ws As Worksheet, firstWS As Worksheet
    Dim i As Long, cnt As Long, curRow As Long
    Dim names() As String, lastRows() As Long
    Dim oldCalc As XlCalculation
    Dim oldScr As Boolean, oldEvt As Boolean
    Dim vis As Object: Set vis = CreateObject("Scripting.Dictionary")

    ' 1) 대상 시트 수집
    ReDim names(1 To UBound(sheetNames) - LBound(sheetNames) + 1)
    ReDim lastRows(1 To UBound(sheetNames) - LBound(sheetNames) + 1)

    For i = LBound(sheetNames) To UBound(sheetNames)
        On Error Resume Next
        Set ws = wb.Worksheets(CStr(sheetNames(i)))
        On Error GoTo 0
        If Not ws Is Nothing Then
            Dim lr As Long: lr = LastDataRow_L11U(ws)
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
    oldScr = Application.ScreenUpdating
    oldEvt = Application.EnableEvents
    oldCalc = Application.Calculation
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    On Error GoTo CleanExit

    ' 3) 임시 시트 생성
    Application.DisplayAlerts = False
    On Error Resume Next
    wb.Worksheets("PRINT_TMP_OUT").Delete
    On Error GoTo 0
    Application.DisplayAlerts = True

    Set tmp = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
    tmp.name = "PRINT_TMP_OUT"

    ' 4) 열 너비 복제 (L~Y → A~N)
    Set firstWS = wb.Worksheets(names(1))
    Dim c As Long
    For c = 12 To 25
        tmp.Columns(c - 11).ColumnWidth = firstWS.Columns(c).ColumnWidth
    Next c

    ' 5) 데이터 이어붙이기
    curRow = 1
    Dim rowsCount As Long
    For i = 1 To cnt
        Set ws = wb.Worksheets(names(i))
        vis(ws.name) = ws.Visible
        If ws.Visible <> xlSheetVisible Then ws.Visible = xlSheetVisible

        rowsCount = lastRows(i) - 10
        If rowsCount > 0 Then
            Dim src As Range, dst As Range
            Set src = ws.Range("L11:Y" & lastRows(i))
            Set dst = tmp.Range("A" & curRow).Resize(rowsCount, 14)
            src.Copy
            dst.PasteSpecial xlPasteAll
            curRow = curRow + rowsCount + 1
        End If
    Next i
    Application.CutCopyMode = False
    

    ' ★추가: 인쇄 시 셀 내용이 셀 안에 맞도록 자동 축소
    With tmp.UsedRange
        .WrapText = False          ' 줄바꿈 끄기(축소 효과 극대화)
        .ShrinkToFit = True        ' 셀 너비에 맞게 글자 자동 축소
    End With


    ' 6) 페이지 설정
    Application.PrintCommunication = False
    With tmp.PageSetup
        .PrintArea = "$A$1:$N$" & Application.Max(1, curRow - 1)
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .Orientation = xlPortrait
        .LeftMargin = Application.InchesToPoints(0.2)
        .RightMargin = Application.InchesToPoints(0.2)
        .TopMargin = Application.InchesToPoints(0.2)
        .BottomMargin = Application.InchesToPoints(0.2)
        .HeaderMargin = Application.InchesToPoints(0.2)
        .FooterMargin = Application.InchesToPoints(0.2)
        .CenterHorizontally = False
        .CenterVertically = False
    End With
    On Error Resume Next
    tmp.ResetAllPageBreaks
    On Error GoTo 0
    Application.PrintCommunication = True

    ' 7) 인쇄
    tmp.Activate
    If Preview Then
        tmp.PrintPreview
    Else
        tmp.PrintOut
    End If

CleanExit:
    ' 시트 가시성 복원
    Dim j As Long
    For j = 1 To cnt
        If vis.Exists(names(j)) Then
            wb.Worksheets(names(j)).Visible = vis(names(j))
        End If
    Next j

    ' 자동삭제 추가 부분 ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
    On Error Resume Next
    Application.DisplayAlerts = False
    wb.Worksheets("PRINT_TMP_OUT").Delete
    Application.DisplayAlerts = True
    On Error GoTo 0
    ' ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

    ' 상태 복원
    Application.Calculation = oldCalc
    Application.EnableEvents = oldEvt
    Application.ScreenUpdating = oldScr
End Sub


' === 메인: 검수 출고장부 일괄 인쇄(미리보기 기본) ===
Public Sub 인쇄_검수출고장부_일괄(Optional ByVal Preview As Boolean = True)
    Dim sheetNames As Variant
    Dim ask As VbMsgBoxResult, listText As String

    sheetNames = Array("검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)", _
                       "검수(조립)14K", "검수(캐스팅)14K")
    listText = Join(sheetNames, ", ")

    ask = MsgBox("검수 출고 장부를 이어서 출력하시겠습니까?" & vbCrLf & _
                 "(시트 사이 공백 1행 포함)" & vbCrLf & _
                 "대상 시트: " & listText, _
                 vbQuestion + vbYesNo + vbDefaultButton1, "인쇄 확인")
    If ask <> vbYes Then
        MsgBox "출력을 취소했습니다.", vbInformation
        Exit Sub
    End If

    Call FastBatchPrint_L11Y_Continued(sheetNames, Preview)
    MsgBox "처리를 완료했습니다.", vbInformation
End Sub


' === Alt+F8용 래퍼 ===
Public Sub 인쇄_검수출고장부_일괄_미리보기()
    인쇄_검수출고장부_일괄 True
End Sub

Public Sub 인쇄_검수출고장부_일괄_바로인쇄()
    인쇄_검수출고장부_일괄 False
End Sub


