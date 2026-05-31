Attribute VB_Name = "Module2"
Option Explicit

' ===== 공통 옵션 =====
Public Const MOVE_INSTEAD_OF_COPY As Boolean = True  ' True=이동(원본 지움), False=복사
Public Const INCLUDE_FORMATS As Boolean = False      ' True=서식 포함, False=값만
Public Const LOG_SHEET As String = "입출로그"        ' 로그 기록 시트명
Public Const SOURCE_SHEET As String = "작성"         ' 원본 시트명

' 동적 범위 설정: B4에서 시작, 최대 20행, B~I 열  ← (B4:I33)
Public Const SOURCE_START_ROW As Long = 4
Public Const SOURCE_MAX_ROWS As Long = 30
Public Const SOURCE_COL_FIRST As String = "B"
Public Const SOURCE_COL_LAST  As String = "I"


' === 모드 선택(입고/출고) : 취소 지원 ===
Public Function AskInboundMode(ByRef isCanceled As Boolean) As Boolean
    Dim r As VbMsgBoxResult
    r = MsgBox("입고로 처리할까요? (예=입고/A~I, 아니오=출고/L~U)", _
               vbQuestion + vbYesNoCancel + vbDefaultButton1, "입고/출고 선택")

    Select Case r
        Case vbYes: AskInboundMode = True      ' 입고
        Case vbNo:  AskInboundMode = False     ' 출고
        Case vbCancel: isCanceled = True       ' 취소(창 닫기/ESC 포함)
    End Select
End Function

' === 지정된 열 블록에서 startRow(기본 13) 이상에서의 "완전 빈 행" 찾기 ===
Private Function NextEmptyRowInBlock(ws As Worksheet, ByVal firstCol As String, ByVal lastCol As String, Optional ByVal startRow As Long = 13) As Long
    Dim r As Long
    If startRow < 1 Then startRow = 1
    r = startRow
    Do While Application.WorksheetFunction.CountA(ws.Range(firstCol & r & ":" & lastCol & r)) > 0
        r = r + 1
    Loop
    NextEmptyRowInBlock = r
End Function


' === 로그 작성 (값: 원본 B:I → 로그 시트 G:O) ===
Private Sub WriteLog( _
    ByVal actionType As String, _
    ByVal sourceSheet As String, _
    ByVal targetSheet As String, _
    ByVal pasteStartRow As Long, _
    ByVal startCol As String, _
    ByVal dataBI As Variant)

    Dim logSht As Worksheet, nextRow As Long
    Dim lbls As Variant, j As Long
    Dim wsSrc As Worksheet
    Dim fixedHeaders As Variant

    On Error Resume Next
    Set logSht = ThisWorkbook.Worksheets(LOG_SHEET)
    On Error GoTo 0
    If logSht Is Nothing Then
        Set logSht = ThisWorkbook.Worksheets.Add
        logSht.name = LOG_SHEET
    End If

    fixedHeaders = Array("날짜시간", "작업유형", "원본시트", "대상시트", "시작열", "붙여넣기 시작행")
    logSht.Range("A1:F1").Value = fixedHeaders

    On Error Resume Next
    Set wsSrc = ThisWorkbook.Worksheets(sourceSheet)
    On Error GoTo 0
    If wsSrc Is Nothing Then
        ReDim lbls(1 To 1, 1 To 8)
        For j = 1 To 8: lbls(1, j) = "": Next j
    Else
        lbls = wsSrc.Range("B2:I2").Value ' 1×8 (헤더가 있다면 기록)
    End If
    logSht.Range("G1").Resize(1, 8).Value = lbls
    logSht.Range("O1").ClearContents

    nextRow = logSht.Cells(logSht.rows.Count, "A").End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2

    With logSht
        .Cells(nextRow, 1).Value = Now
        .Cells(nextRow, 2).Value = actionType
        .Cells(nextRow, 3).Value = sourceSheet
        .Cells(nextRow, 4).Value = targetSheet
        .Cells(nextRow, 5).Value = startCol
        .Cells(nextRow, 6).Value = pasteStartRow

        If IsArray(dataBI) Then
            .Range("G" & nextRow).Resize(1, 8).Value = dataBI
            .Cells(nextRow, "O").ClearContents
        End If
    End With
End Sub

' === 대상시트명 → 약자 알파벳 매핑 ===
Private Function GetSheetAbbrev(ByVal sheetName As String) As String
    Select Case sheetName
        ' === 일반 공정 ===
        Case "기계":            GetSheetAbbrev = "M"
        Case "양장":            GetSheetAbbrev = "Y"
        Case "캐스팅":          GetSheetAbbrev = "C"
        Case "개발":            GetSheetAbbrev = "G"
        Case "컷팅":            GetSheetAbbrev = "T"
        Case "조립14K":         GetSheetAbbrev = "A" ' 파란색
        Case "캐스팅14K":       GetSheetAbbrev = "C" ' 파란색
        Case "컷팅14K":         GetSheetAbbrev = "T" ' 파란색

        ' === 검수 공정(접두어 Q*) ===
        Case "검수(기계)":        GetSheetAbbrev = "QM"
        Case "검수(볼)":          GetSheetAbbrev = "QB"
        Case "검수(양장)":        GetSheetAbbrev = "QY"
        Case "검수(캐스팅)":      GetSheetAbbrev = "QC"
        Case "검수(조립)14K":     GetSheetAbbrev = "QA" ' 파란색
        Case "검수(캐스팅)14K":   GetSheetAbbrev = "QC" ' 파란색

        Case Else
            GetSheetAbbrev = "X" ' 미정
    End Select
End Function

' === 14K 계열은 파란색으로 표기할지 여부 ===
Private Function IsBlueAbbrev(ByVal sheetName As String) As Boolean
    Select Case sheetName
        Case "조립14K", "캐스팅14K", "컷팅14K", _
             "검수(조립)14K", "검수(캐스팅)14K"
            IsBlueAbbrev = True
        Case Else
            IsBlueAbbrev = False
    End Select
End Function

' === 3자리 패딩 ===
Private Function Pad3(ByVal n As Long) As String
    Pad3 = Format$(n, "000")
End Function

' === 일련번호 생성: 약자_YYMMDD_001 ===
Private Function BuildSerial(ByVal abbrev As String, ByVal seq As Long) As String
    BuildSerial = abbrev & "_" & Format(Date, "yymmdd") & "_" & Pad3(seq)
End Function

' === 날짜별(YYMMDD) 연번: 동일 약자+날짜 prefix 최대 연번+1 ===
Private Function NextDailySeq(ByVal tgt As Worksheet, ByVal abbrev As String) As Long
    Dim prefix As String, lastRow As Long, r As Long
    Dim v As String, tail As String, num As Long, maxSeq As Long

    prefix = abbrev & "_" & Format(Date, "yymmdd") & "_"
    lastRow = tgt.Cells(tgt.rows.Count, "A").End(xlUp).Row
    maxSeq = 0

    If lastRow < 2 Then
        NextDailySeq = 1
        Exit Function
    End If

    For r = 2 To lastRow
        v = CStr(tgt.Cells(r, "A").Value)
        If Left$(v, Len(prefix)) = prefix Then
            tail = Mid$(v, Len(prefix) + 1)
            If IsNumeric(tail) Then
                num = CLng(tail)
                If num > maxSeq Then maxSeq = num
            End If
        End If
    Next r

    NextDailySeq = maxSeq + 1
End Function

' === 공용 코어 (선택 범위와 무관하게 항상 SOURCE_SHEET의 B4:I 블록 사용) ===
Public Sub SendFixedRangeToSheet_Core(ByVal targetSheet As String, ByVal isInbound As Boolean)
    Dim wsSrc As Worksheet, tgt As Worksheet, src As Range
    Dim pasteRow As Long, pasteStartRow As Long
    Dim r As Long, lastDataRow As Long, w As Long
    Dim dataBI As Variant
    Dim rowsToPaste As Long
    Dim i As Long, seqStart As Long, seq As Long

    ' 요약 팝업용 변수
    Dim cntDataRows As Long, cntBlankInside As Long
    Dim cntSerial As Long, firstSerial As String, lastSerial As String
    Dim cntKMarked As Long
    Dim srcBlockAddr As String, dstBlockAddr As String
    Dim errMsg As String

    ' ▼ 추가: 입고/출고 공통으로 약자/색상 판단을 쓰기 위해 여기서 선언/계산
    Dim abbrev As String, blue As Boolean, serialText As String

    On Error Resume Next
    Set wsSrc = ThisWorkbook.Worksheets(SOURCE_SHEET)
    On Error GoTo 0
    If wsSrc Is Nothing Then
        MsgBox "원본 시트 '" & SOURCE_SHEET & "' 를 찾을 수 없습니다.", vbCritical
        Exit Sub
    End If

    ' 실제 값이 있는 마지막 행 찾기(수식 "" 는 빈 것으로 취급)
    lastDataRow = 0
    For r = SOURCE_START_ROW To SOURCE_START_ROW + SOURCE_MAX_ROWS - 1
        If Application.WorksheetFunction.CountIf( _
            wsSrc.Range(SOURCE_COL_FIRST & r & ":" & SOURCE_COL_LAST & r), "<>") > 0 Then
            lastDataRow = r
        End If
    Next r

    If lastDataRow = 0 Then
        MsgBox "보낼 데이터가 없습니다. (" & SOURCE_SHEET & "!" & _
               SOURCE_COL_FIRST & SOURCE_START_ROW & ":" & SOURCE_COL_LAST & _
               (SOURCE_START_ROW + SOURCE_MAX_ROWS - 1) & ")", vbExclamation
        Exit Sub
    End If

    Set src = wsSrc.Range(SOURCE_COL_FIRST & SOURCE_START_ROW & ":" & SOURCE_COL_LAST & lastDataRow)
    dataBI = wsSrc.Range(SOURCE_COL_FIRST & SOURCE_START_ROW & ":" & SOURCE_COL_LAST & SOURCE_START_ROW).Value  ' 1×8
    rowsToPaste = src.rows.Count
    w = src.Columns.Count ' 8 (B~I)
    srcBlockAddr = SOURCE_COL_FIRST & SOURCE_START_ROW & ":" & SOURCE_COL_LAST & lastDataRow

    ' 실데이터 행수/빈행 수 계산(중간 빈 행 고려)
    cntDataRows = 0
    For i = 0 To rowsToPaste - 1
        If Application.WorksheetFunction.CountIf( _
            wsSrc.Range(SOURCE_COL_FIRST & (SOURCE_START_ROW + i) & ":" & SOURCE_COL_LAST & (SOURCE_START_ROW + i)), "<>") > 0 Then
            cntDataRows = cntDataRows + 1
        End If
    Next i
    cntBlankInside = rowsToPaste - cntDataRows

    On Error Resume Next
    Set tgt = ThisWorkbook.Worksheets(targetSheet)
    On Error GoTo 0
    If tgt Is Nothing Then
        MsgBox "대상 시트 '" & targetSheet & "' 를 찾을 수 없습니다.", vbCritical
        Exit Sub
    End If

    ' ▼ 추가: 대상 시트 기준 약자/색상 여부를 미리 계산 (출고에서도 사용)
    abbrev = GetSheetAbbrev(targetSheet)
    blue = IsBlueAbbrev(targetSheet)

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error GoTo CleanFail

    If isInbound Then
        ' === 입고 ===
        pasteRow = NextEmptyRowInBlock(tgt, "A", "I")
        pasteStartRow = pasteRow
        dstBlockAddr = "A" & pasteRow & ":I" & (pasteRow + rowsToPaste - 1)

        If INCLUDE_FORMATS Then
            src.Copy Destination:=tgt.Range("B" & pasteRow)
        Else
            tgt.Range("B" & pasteRow).Resize(rowsToPaste, w).Value = src.Value
        End If

        ' ====== 일련번호: 약자_YYMMDD_001 (14K는 파란색) ======
        seqStart = NextDailySeq(tgt, abbrev)
        seq = seqStart
        cntSerial = 0

        For i = 0 To rowsToPaste - 1
            If Application.WorksheetFunction.CountIf( _
                tgt.Range("B" & (pasteRow + i) & ":I" & (pasteRow + i)), "<>") > 0 Then

                serialText = BuildSerial(abbrev, seq)

                With tgt.Cells(pasteRow + i, "A")
                    .Value = serialText
                    If blue Then
                        .Font.Color = vbBlue
                    Else
                        .Font.ColorIndex = xlColorIndexAutomatic
                    End If
                End With

                If cntSerial = 0 Then firstSerial = serialText
                cntSerial = cntSerial + 1
                lastSerial = serialText
                seq = seq + 1
            End If
        Next i

        WriteLog "입고", SOURCE_SHEET, targetSheet, pasteStartRow, "A", dataBI

    Else
        ' === 출고 === (전체 한 칸 우측으로 이동: 상태 L, 데이터 M:T, 탐색 L:U)
        pasteRow = NextEmptyRowInBlock(tgt, "L", "U")
        pasteStartRow = pasteRow
        dstBlockAddr = "L" & pasteRow & ":U" & (pasteRow + rowsToPaste - 1)

        ' 원본(B:I, 8열) → 대상 M:T(8열) 에 값/서식 붙여넣기
        If INCLUDE_FORMATS Then
            src.Copy Destination:=tgt.Range("M" & pasteRow)   ' M:T 채움, U는 비움
        Else
            tgt.Range("M" & pasteRow).Resize(rowsToPaste, w).Value = src.Value ' w=8 → M:T
        End If

        ' 실데이터 있는 행에만 L열 "신규" 표기 (+ 14K면 파란색)
        cntKMarked = 0
        For i = 0 To rowsToPaste - 1
            If Application.WorksheetFunction.CountIf( _
                wsSrc.Range(SOURCE_COL_FIRST & (SOURCE_START_ROW + i) & ":" & SOURCE_COL_LAST & (SOURCE_START_ROW + i)), "<>") > 0 Then

                With tgt.Cells(pasteRow + i, "L")
                    .Value = "신규"
                    ' ▼ 추가: 14K 계열이면 파란색으로 표시
                    If blue Then
                        .Font.Color = vbBlue
                    Else
                        .Font.ColorIndex = xlColorIndexAutomatic
                    End If
                End With

                cntKMarked = cntKMarked + 1
            End If
        Next i

        WriteLog "출고", SOURCE_SHEET, targetSheet, pasteStartRow, "L", dataBI
    End If

    ' 원본 지우기(이동 모드일 때만)
    If MOVE_INSTEAD_OF_COPY Then src.ClearContents

CleanExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    ' === 처리 요약 팝업 ===
    Dim msg As String
    msg = "[전송 결과]" & vbCrLf & _
          "모드 : " & IIf(isInbound, "입고 (A~I)", "출고 (L~U)") & vbCrLf & _
          "원본 : " & SOURCE_SHEET & "!" & srcBlockAddr & vbCrLf & _
          "대상 : " & targetSheet & "!" & dstBlockAddr & vbCrLf & _
          "붙여넣기 시작행 : " & pasteStartRow & " / 총 " & rowsToPaste & "행" & vbCrLf & _
          "실데이터 행수 : " & cntDataRows & IIf(cntBlankInside > 0, "  (빈 행 " & cntBlankInside & "개 포함)", "") & vbCrLf & _
          "동작 : " & IIf(MOVE_INSTEAD_OF_COPY, "이동(원본 삭제)", "복사(원본 보존)")

    If isInbound Then
        msg = msg & vbCrLf & "부여된 일련번호 : " & IIf(cntSerial > 0, firstSerial & " ~ " & lastSerial & "  (총 " & cntSerial & "개)", "없음")
    Else
        msg = msg & vbCrLf & "L열 '신규' 표기 : " & cntKMarked & "개"
    End If

    If Len(errMsg) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "※ 오류: " & errMsg
        MsgBox msg, vbExclamation + vbOKOnly, "전송 완료(일부 오류)"
    Else
        MsgBox msg, vbInformation + vbOKOnly, "전송 완료"
    End If
    Exit Sub

CleanFail:
    errMsg = Err.Description
    Resume CleanExit
End Sub


' === 호출 진입점들 (선택 여부와 무관하게 동작) ===
Public Sub 보내기__기계()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "기계", inbound
End Sub

Public Sub 보내기__양장()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "양장", inbound
End Sub

Public Sub 보내기__캐스팅()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "캐스팅", inbound
End Sub

Public Sub 보내기__개발()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "개발", inbound
End Sub

Public Sub 보내기__컷팅()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "컷팅", inbound
End Sub

Public Sub 보내기__조립14K()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "조립14K", inbound
End Sub

Public Sub 보내기__캐스팅14K()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "캐스팅14K", inbound
End Sub

Public Sub 보내기__컷팅14K()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "컷팅14K", inbound
End Sub

Public Sub 보내기__검수기계()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(기계)", inbound
End Sub

Public Sub 보내기__검수볼()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(볼)", inbound
End Sub

Public Sub 보내기__검수양장()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(양장)", inbound
End Sub

Public Sub 보내기__검수캐스팅()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(캐스팅)", inbound
End Sub

Public Sub 보내기__검수조립14K()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(조립)14K", inbound
End Sub

Public Sub 보내기__검수캐스팅14K()
    Dim Cancel As Boolean, inbound As Boolean
    inbound = AskInboundMode(Cancel): If Cancel Then Exit Sub
    SendFixedRangeToSheet_Core "검수(캐스팅)14K", inbound
End Sub

