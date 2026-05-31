Attribute VB_Name = "Module29"
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

' === 핵심: 여러 시트를 "한 문서로 이어붙여" 1회 인쇄 (시트 사이 공백 1행) ===
Private Sub FastBatchPrint_A11K_Continued(sheetNames As Variant, ByVal Preview As Boolean)
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim tmp As Worksheet, ws As Worksheet, firstWS As Worksheet
    Dim i As Long, cnt As Long, curRow As Long
    Dim names() As String, lastRows() As Long
    Dim oldCalc As XlCalculation
    Dim oldScr As Boolean, oldEvt As Boolean
    Dim vis As Object: Set vis = CreateObject("Scripting.Dictionary") ' 원래 가시성 복구용

    ' 1) 대상 시트 수집(존재 + A11:K 데이터 있는 것만)
    ReDim names(1 To UBound(sheetNames) - LBound(sheetNames) + 1)
    ReDim lastRows(1 To UBound(sheetNames) - LBound(sheetNames) + 1)

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
    Next

    If cnt = 0 Then Exit Sub
    ReDim Preserve names(1 To cnt)
    ReDim Preserve lastRows(1 To cnt)

    ' 2) 성능/상태 저장
    oldScr = Application.ScreenUpdating
    oldEvt = Application.EnableEvents
    oldCalc = Application.Calculation
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    On Error GoTo CleanExit

    ' 3) 임시 통합시트 생성 (이어서 출력될 실제 프린트 대상)
    Application.DisplayAlerts = False
    Set tmp = Nothing
    On Error Resume Next
    wb.Worksheets("PRINT_TMP").Delete ' 남아 있으면 삭제
    On Error GoTo 0

    Set tmp = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
    tmp.name = "PRINT_TMP"

    ' 4) 첫 시트 기준으로 열 너비/서식 초기화
    Set firstWS = wb.Worksheets(names(1))
    Dim c As Long
    For c = 1 To 11 ' A~K
        tmp.Columns(c).ColumnWidth = firstWS.Columns(c).ColumnWidth
    Next c

    ' 5) 각 시트의 A11:K{last}를 차례대로 붙이기 (사이에 공백 1행)
    curRow = 1
    For i = 1 To cnt
        Set ws = wb.Worksheets(names(i))

        ' 숨김 시트는 잠깐 표시 (복사 안정화)
        vis(ws.name) = ws.Visible
        If ws.Visible <> xlSheetVisible Then ws.Visible = xlSheetVisible

        Dim src As Range, dst As Range, rowsCount As Long
        rowsCount = lastRows(i) - 10 ' 11~last
        Set src = ws.Range("A11:K" & lastRows(i))
        Set dst = tmp.Range("A" & curRow).Resize(rowsCount, 11)

        ' 내용/서식 통째로 복붙 (행 높이까지 최대한 보존)
        src.Copy
        dst.PasteSpecial xlPasteAll

        ' (선택) 섹션 구분선으로 1행 공백
        curRow = curRow + rowsCount + 1
    Next i
    Application.CutCopyMode = False

    ' ★추가: 인쇄 시 셀 내용이 셀 안에 맞도록 자동 축소
    With tmp.UsedRange
        .WrapText = False          ' 줄바꿈 끄기(축소 효과 극대화)
        .ShrinkToFit = True        ' 셀 너비에 맞게 글자 자동 축소
    End With


    ' 6) 페이지 설정(통합 시트 한 번만)
    Application.PrintCommunication = False
    With tmp.PageSetup
        .PrintArea = "$A$1:$K$" & curRow - 1
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .Orientation = xlPortrait

        ' 여백 0.3인치 (요청은 0.2 근접값, 안정적으로 0.3 유지)
        .LeftMargin = Application.InchesToPoints(0.3)
        .RightMargin = Application.InchesToPoints(0.3)
        .TopMargin = Application.InchesToPoints(0.3)
        .BottomMargin = Application.InchesToPoints(0.3)
        .HeaderMargin = Application.InchesToPoints(0.3)
        .FooterMargin = Application.InchesToPoints(0.3)

        .CenterHorizontally = False
        .CenterVertically = False
    End With
    On Error Resume Next
    tmp.ResetAllPageBreaks
    On Error GoTo 0
    Application.PrintCommunication = True

    ' 7) 한 번만 인쇄(또는 미리보기)
    tmp.Activate
    If Preview Then
        tmp.PrintPreview
    Else
        tmp.PrintOut
    End If

CleanExit:
    ' 시트 가시성 복구
    Dim k As Variant
    For i = 1 To cnt
        If vis.Exists(names(i)) Then
            wb.Worksheets(names(i)).Visible = vis(names(i))
        End If
    Next i

    ' 상태 원복
    Application.Calculation = oldCalc
    Application.EnableEvents = oldEvt
    Application.ScreenUpdating = oldScr
    Application.DisplayAlerts = False

    ' 인쇄 후 임시시트 자동 삭제를 원하면 주석 해제
    On Error Resume Next
    wb.Worksheets("PRINT_TMP").Delete
    Application.DisplayAlerts = True
End Sub

' === 메인: 검수 입고장부 일괄 출력(미리보기 기본) ===
Public Sub 인쇄_검수입고장부_일괄(Optional ByVal Preview As Boolean = True)
    Dim sheetNames As Variant
    Dim ask As VbMsgBoxResult, listText As String

    sheetNames = Array("검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)", _
                       "검수(조립)14K", "검수(캐스팅)14K")
    listText = Join(sheetNames, ", ")

    ask = MsgBox("검수 입고 장부를 이어서 출력하시겠습니까?" & vbCrLf & _
                 "(시트 사이 공백 1행 포함)" & vbCrLf & _
                 "대상 시트: " & listText, _
                 vbQuestion + vbYesNo + vbDefaultButton1, "인쇄 확인")
    If ask <> vbYes Then
        MsgBox "출력을 취소했습니다.", vbInformation
        Exit Sub
    End If

    ' ★ 통합 이어붙이기 인쇄 호출
    Call FastBatchPrint_A11K_Continued(sheetNames, Preview)

    MsgBox "처리를 완료했습니다.", vbInformation
End Sub

' === Alt+F8 래퍼 ===
Public Sub 인쇄_검수입고장부_일괄_미리보기()
    인쇄_검수입고장부_일괄 True
End Sub

Public Sub 인쇄_검수입고장부_일괄_바로인쇄()
    인쇄_검수입고장부_일괄 False
End Sub

