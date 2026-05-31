Attribute VB_Name = "Module19"
Option Explicit

' ==== 색상 상수 (현재 모듈에서는 사용 안 함, 필요 시 확장) ====
' 기본(하늘색): RGB(221,235,247) -> BGR Hex
Private Const CLR_SENT As Long = &HF7EBDD
' 검수 전용(베이비핑크): RGB(255,224,236) -> BGR Hex
Private Const CLR_BABY_PINK As Long = &HECE0FF

' ==== 원본 시트의 미완료 데이터 스캔 시작 행 ====
Private Const SRC_START_ROW As Long = 13

Public Sub 미완료_두묶음_인쇄()
    ' === 인쇄 매수: 묻지 않고 기본 1장으로 고정 ===
    ' 필요하면 아래 1을 2,3... 으로 바꾸면 됨
    Dim copies As Long
    copies = 1

    Dim grpChoice As Variant
    Dim parts() As String, tok As Variant, n As Long
    Dim useAll As Boolean
    Dim useGrp(1 To 4) As Boolean
    Dim scr As Boolean, evt As Boolean, calc As XlCalculation
    Dim wb As Workbook
    Dim ok As Boolean, hadAny As Boolean

    ' === 인쇄할 그룹 선택 ===
    grpChoice = Application.InputBox( _
        Prompt:="인쇄할 그룹을 선택하세요." & vbCrLf & _
                "0 또는 빈 값: 모든 그룹 인쇄" & vbCrLf & _
                "1: 18K · 조립" & vbCrLf & _
                "2: 18K · 캐스팅" & vbCrLf & _
                "3: 14K · 조립" & vbCrLf & _
                "4: 14K · 캐스팅" & vbCrLf & _
                "예시) 1,3", _
        Title:="그룹 선택", Type:=2)

    If grpChoice = False Then
        ' 사용자가 취소 누르면 그냥 종료
        Exit Sub
    End If

    grpChoice = Trim$(CStr(grpChoice))
    If grpChoice = "" Or grpChoice = "0" Then
        useAll = True
    Else
        parts = Split(grpChoice, ",")
        For Each tok In parts
            tok = Trim$(CStr(tok))
            If tok <> "" Then
                n = val(tok)
                If n >= 1 And n <= 4 Then
                    useGrp(n) = True
                End If
            End If
        Next tok

        If Not (useGrp(1) Or useGrp(2) Or useGrp(3) Or useGrp(4)) Then
            MsgBox "0, 1, 2, 3, 4 중에서 선택해주세요.", vbExclamation
            Exit Sub
        End If
    End If

    scr = Application.ScreenUpdating: Application.ScreenUpdating = False
    evt = Application.EnableEvents:   Application.EnableEvents = False
    calc = Application.Calculation:   Application.Calculation = xlCalculationManual

    On Error GoTo EH

    Set wb = ThisWorkbook

    ' ====== 4개 그룹 정의 ======
    ' 18K(NO14K) - 조립
    Dim grpNo14K_Asm
    grpNo14K_Asm = Array( _
        "연마(조립)", _
        "뻥(기계)", "뻥(양장)", _
        "빠우(양장볼)", "빠우(할로우)", "빠우(기계)", _
        "빠우(초광-조립)" _
    )

    ' 18K(NO14K) - 캐스팅
    Dim grpNo14K_Cast
    grpNo14K_Cast = Array( _
        "연마(캐스팅)", "뻥(캐스팅)", "뻥(개발)", _
        "빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", _
        "빠우(초광-캐스팅)", "빠우(개발)" _
    )

    ' 14K - 조립
    Dim grp14K_Asm
    grp14K_Asm = Array( _
        "연마(조립)14K", "뻥(조립)14K", _
        "빠우(조립)14K", "빠우(초광-조립)14K" _
    )

    ' 14K - 캐스팅
    Dim grp14K_Cast
    grp14K_Cast = Array( _
        "연마(캐스팅)14K", "뻥(캐스팅)14K", _
        "빠우(패션반지)14K", "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", _
        "빠우(초광-캐스팅)14K" _
    )

    ' === 4개 그룹 각각 인쇄 (선택된 그룹만) ===
    If useAll Or useGrp(1) Then
        ok = BuildGroupPrint(wb, grpNo14K_Asm, "__PrintNo14K_A", "연마/뻥/빠우 (18K · 조립)", copies)
        If ok Then hadAny = True
    End If

    If useAll Or useGrp(2) Then
        ok = BuildGroupPrint(wb, grpNo14K_Cast, "__PrintNo14K_C", "연마/뻥/빠우 (18K · 캐스팅)", copies)
        If ok Then hadAny = True
    End If

    If useAll Or useGrp(3) Then
        ok = BuildGroupPrint(wb, grp14K_Asm, "__Print14K_A", "연마/뻥/빠우 (14K · 조립)", copies)
        If ok Then hadAny = True
    End If

    If useAll Or useGrp(4) Then
        ok = BuildGroupPrint(wb, grp14K_Cast, "__Print14K_C", "연마/뻥/빠우 (14K · 캐스팅)", copies)
        If ok Then hadAny = True
    End If

Done:
    On Error Resume Next

    ' 메뉴로 복귀
    If SheetExists(wb, "메뉴") Then wb.Worksheets("메뉴").Activate

    ' 생성된 임시 시트들 정리
    Application.DisplayAlerts = False
    If SheetExists(wb, "__PrintNo14K_A") Then wb.Worksheets("__PrintNo14K_A").Delete
    If SheetExists(wb, "__PrintNo14K_C") Then wb.Worksheets("__PrintNo14K_C").Delete
    If SheetExists(wb, "__Print14K_A") Then wb.Worksheets("__Print14K_A").Delete
    If SheetExists(wb, "__Print14K_C") Then wb.Worksheets("__Print14K_C").Delete
    Application.DisplayAlerts = True

    Application.ScreenUpdating = scr
    Application.EnableEvents = evt
    Application.Calculation = calc

    ' === 선택한 그룹에서 실제 인쇄된 게 하나도 없을 때 알림 ===
    If hadAny Then
        MsgBox "작업이 완료되었습니다.", vbInformation
    Else
        MsgBox "선택한 그룹에서 인쇄할 데이터가 없습니다.", vbInformation
    End If
    Exit Sub

EH:
    MsgBox "오류: " & Err.Description, vbExclamation
    Resume Done
End Sub



' === 열 인덱스를 "문자"로 (D, E, ...) 바꾸는 유틸 ===
Private Function ColLetter(ByVal c As Long) As String
    ColLetter = Split(Cells(1, c).Address(False, False), "$")(0)
End Function

' === 한 묶음(여러 시트) 합쳐서 바로 인쇄 ===
Private Function BuildGroupPrint(ByVal wb As Workbook, ByVal arrNames As Variant, _
                                 ByVal tmpName As String, ByVal titleText As String, _
                                 ByVal copies As Long) As Boolean
    Dim tmp As Worksheet: Set tmp = EnsureTmpSheet(wb, tmpName)
    tmp.Visible = xlSheetVisible

    Dim refWs As Worksheet
    Dim nm As Variant, ws As Worksheet
    Dim dest As Long: dest = 3
    Dim lastR As Long, r As Long
    Dim hasAnyData As Boolean: hasAnyData = False

    ' 1) 참조 시트(첫 존재 시트) 찾기
    For Each nm In arrNames
        If SheetExists(wb, CStr(nm)) Then
            Set refWs = wb.Worksheets(CStr(nm))
            Exit For
        End If
    Next nm
    If refWs Is Nothing Then Exit Function

    ' === 전역 헤더: 원본 12행을 1행에 복사, 컬럼폭 동기화 ===
    tmp.Range("A1:K1").Value = refWs.Range("B12:L12").Value
    refWs.Range("B12:L12").Copy
    tmp.Range("A1").PasteSpecial xlPasteColumnWidths
    Application.CutCopyMode = False

    With tmp.Range("A1:K1")
        .Font.Bold = True
        .Interior.Color = RGB(242, 242, 242)
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With

    ' 머리글 텍스트(페이지 상단)
    Dim hdrLeft As String
    hdrLeft = "&""맑은 고딕,Bold"" " & titleText
    If InStr(1, titleText, "14K", vbTextCompare) > 0 Then hdrLeft = "&K0000FF" & hdrLeft
    With tmp.PageSetup
        .LeftHeader = hdrLeft
        .CenterHeader = ""
        .RightHeader = Format(Now, "yyyy-mm-dd HH:nn")
    End With

    ' 2) 각 시트 스캔
    For Each nm In arrNames
        If SheetExists(wb, CStr(nm)) Then
            Set ws = wb.Worksheets(CStr(nm))
            lastR = GetLastRowAll(ws)
            If lastR >= SRC_START_ROW Then
                Dim hasData As Boolean: hasData = False
                ' 미완료 데이터 존재 확인(13행부터)
                For r = SRC_START_ROW To lastR
                    If Trim$(CStr(ws.Cells(r, "A").Value)) = "" Then
                        If Application.WorksheetFunction.CountA(ws.Range("B" & r & ":L" & r)) > 0 Then
                            hasData = True: Exit For
                        End If
                    End If
                Next r

                If hasData Then
                    ' 섹션 타이틀(시트명)
                    tmp.Range("A" & dest & ":K" & dest).Merge
                    With tmp.Range("A" & dest)
                        .Value = "▶ " & ws.name
                        .Font.Bold = True
                        .Interior.Color = RGB(242, 242, 242)
                        .HorizontalAlignment = xlCenter
                        .VerticalAlignment = xlCenter
                    End With
                    dest = dest + 1

                    ' === 11행 자리: "출력범위 소계" (값) ===
                    Dim subtotalRow As Long
                    subtotalRow = dest
                    With tmp.Range("A" & subtotalRow & ":K" & subtotalRow)
                        .ClearContents
                        .Font.Bold = True
                        .Interior.Color = RGB(255, 250, 205) ' 연한 노랑
                        .HorizontalAlignment = xlCenter
                        .VerticalAlignment = xlCenter
                    End With
                    tmp.Cells(subtotalRow, 1).Value = "소계(출력범위)"   ' A열 라벨
                    dest = dest + 1

                    ' === 12행 자리: 원본 헤더 그대로 ===
                    tmp.Range("A" & dest & ":K" & dest).Value = ws.Range("B12:L12").Value
                    With tmp.Range("A" & dest & ":K" & dest)
                        .Font.Bold = True
                        .Interior.Color = RGB(234, 241, 221) ' 연한 초록톤
                        .HorizontalAlignment = xlCenter
                        .VerticalAlignment = xlCenter
                    End With
                    dest = dest + 1

                    ' === 13행~ 데이터 복사 시작 ===
                    Dim dataStart As Long: dataStart = dest
                    For r = SRC_START_ROW To lastR
                        If Trim$(CStr(ws.Cells(r, "A").Value)) = "" Then
                            If Application.WorksheetFunction.CountA(ws.Range("B" & r & ":L" & r)) > 0 Then
                                tmp.Range("A" & dest & ":K" & dest).Value = ws.Range("B" & r & ":L" & r).Value
                                ' 원본 H(문자)를 임시시트 G열에 강제 텍스트로
                                With tmp.Cells(dest, "G")
                                    .NumberFormat = "@"
                                    .Value = ws.Cells(r, "H").Text
                                End With
                                dest = dest + 1
                                hasAnyData = True
                            End If
                        End If
                    Next r
                    Dim dataEnd As Long: dataEnd = dest - 1

                    ' === 11행(소계)에 실제 출력 데이터의 합(값) 채우기 ===
                    ' 대상 열: 3,4,5,6,8,10 (C,D,E,F,H,J)
                    Dim sumCols As Variant: sumCols = Array(3, 4, 5, 6, 8, 10)
                    Dim i As Long, c As Long
                    Dim rngSum As Range, s As Double
                    If dataEnd >= dataStart Then
                        For i = LBound(sumCols) To UBound(sumCols)
                            c = CLng(sumCols(i))
                            Set rngSum = tmp.Range(tmp.Cells(dataStart, c), tmp.Cells(dataEnd, c))
                            On Error Resume Next
                            s = Application.WorksheetFunction.Sum(rngSum)
                            On Error GoTo 0
                            tmp.Cells(subtotalRow, c).Value = s
                            tmp.Cells(subtotalRow, c).NumberFormat = IIf(c = 3, "0", "0.00")
                        Next i
                    Else
                        For i = LBound(sumCols) To UBound(sumCols)
                            c = CLng(sumCols(i))
                            tmp.Cells(subtotalRow, c).Value = 0
                            tmp.Cells(subtotalRow, c).NumberFormat = IIf(c = 3, "0", "0.00")
                        Next i
                    End If

                    ' === 11행(소계) K열 = J - H - F - E (빨간 굵은 글씨, 값으로 입력) ===
                    Dim vE As Double, vF As Double, vH As Double, vJ As Double, vK As Double
                    vE = 0: vF = 0: vH = 0: vJ = 0
                    On Error Resume Next
                    vJ = CDbl(tmp.Cells(subtotalRow, 10).Value) ' J열(10)
                    vH = CDbl(tmp.Cells(subtotalRow, 8).Value)  ' H열(8)
                    vF = CDbl(tmp.Cells(subtotalRow, 6).Value)  ' F열(6)
                    vE = CDbl(tmp.Cells(subtotalRow, 5).Value)  ' E열(5)
                    On Error GoTo 0

                    vK = vJ - vH - vF - vE
                    With tmp.Cells(subtotalRow, 11)             ' K열(11)
                        .Value = vK
                        .NumberFormat = "0.00"
                        .Font.Bold = True
                        .Font.Color = RGB(255, 0, 0)
                    End With

                    ' 섹션 간 여백
                    dest = dest + 1
                End If
            End If
        End If
    Next nm

    If Not hasAnyData Then
        BuildGroupPrint = False
        Exit Function
    End If

    ' 6) 페이지/표시 포맷 + 인쇄
    Dim lastDataRow As Long
    lastDataRow = Application.Max(1, dest - 1)

    With tmp.PageSetup
        .PrintArea = "A1:K" & lastDataRow
        .Orientation = xlPortrait
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .TopMargin = Application.InchesToPoints(0.5)
        .BottomMargin = Application.InchesToPoints(0.5)
        .LeftMargin = Application.InchesToPoints(0.3)
        .RightMargin = Application.InchesToPoints(0.3)
        .HeaderMargin = Application.InchesToPoints(0.25)
        .FooterMargin = Application.InchesToPoints(0.25)
        .PrintTitleRows = "$1:$1"   ' 전역 헤더 반복
    End With

    With tmp.Range("A1:K" & lastDataRow)
        .Font.Size = 10
        .ShrinkToFit = True
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
    If lastDataRow >= 3 Then
        tmp.Range("C3:C" & lastDataRow).NumberFormat = "0"       ' 3
        tmp.Range("D3:D" & lastDataRow).NumberFormat = "0.00"    ' 4
        tmp.Range("E3:E" & lastDataRow).NumberFormat = "0.00"    ' 5
        tmp.Range("F3:F" & lastDataRow).NumberFormat = "0.00"    ' 6
        tmp.Range("H3:H" & lastDataRow).NumberFormat = "0.00"    ' 8
        tmp.Range("J3:J" & lastDataRow).NumberFormat = "0.00"    ' 10
        tmp.Range("G3:G" & lastDataRow).NumberFormat = "@"       ' 원본 H 텍스트
        tmp.Range("J3:J" & lastDataRow).Font.Bold = True         ' J 열 강조
    End If

    tmp.PrintOut copies:=copies, Collate:=True
    BuildGroupPrint = True
End Function

' === 임시 시트 보장 ===
Private Function EnsureTmpSheet(ByVal wb As Workbook, ByVal nm As String) As Worksheet
    If SheetExists(wb, nm) Then
        Set EnsureTmpSheet = wb.Worksheets(nm)
        EnsureTmpSheet.Cells.Clear
    Else
        Set EnsureTmpSheet = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
        EnsureTmpSheet.name = nm
    End If
End Function

' === 유틸 ===
Private Function SheetExists(ByVal wb As Workbook, ByVal nm As String) As Boolean
    On Error Resume Next
    SheetExists = Not wb.Worksheets(nm) Is Nothing
    On Error GoTo 0
End Function

Private Function GetLastRowAll(ByVal ws As Worksheet) As Long
    Dim f As Range
    On Error Resume Next
    Set f = ws.Cells.Find(What:="*", LookIn:=xlFormulas, LookAt:=xlPart, _
                          SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
    On Error GoTo 0
    If f Is Nothing Then
        GetLastRowAll = 1
    Else
        GetLastRowAll = f.Row
    End If
End Function


