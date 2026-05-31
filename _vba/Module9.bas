Attribute VB_Name = "Module9"
Option Explicit

' === 목적지(B:K) 블록에서 다음 "완전 빈 행" 찾기 ===
Private Function NextEmptyRowInBlock(ws As Worksheet, ByVal firstCol As String, ByVal lastCol As String) As Long
    Dim rngBlock As Range, lastCell As Range, r As Long
    Set rngBlock = ws.Range(firstCol & ":" & lastCol)

    On Error Resume Next
    Set lastCell = rngBlock.Find(What:="*", LookIn:=xlFormulas, LookAt:=xlPart, _
                                 SearchOrder:=xlByRows, SearchDirection:=xlPrevious, MatchCase:=False)
    On Error GoTo 0

    If lastCell Is Nothing Then
        r = 1
    Else
        r = lastCell.Row + 1
    End If

    Do While Application.WorksheetFunction.CountA(ws.Range(firstCol & r & ":" & lastCol & r)) > 0
        r = r + 1
    Loop

    NextEmptyRowInBlock = r
End Function
' === 목적지(B:K) 블록에서 startRow 이상에서의 "완전 빈 행" 찾기 ===
Private Function NextEmptyRowInBlockFrom(ws As Worksheet, ByVal firstCol As String, ByVal lastCol As String, ByVal startRow As Long) As Long
    Dim r As Long
    If startRow < 1 Then startRow = 1
    r = startRow
    Do While Application.WorksheetFunction.CountA(ws.Range(firstCol & r & ":" & lastCol & r)) > 0
        r = r + 1
    Loop
    NextEmptyRowInBlockFrom = r
End Function

' === 행 번호 목록 요약 (충돌 방지판) ===
Private Function RowListSummary_(ByVal listStr As String, ByVal totalCount As Long, Optional ByVal maxShow As Long = 20) As String
    Dim items() As String
    Dim i As Long, shown As Long, s As String, n As Long

    listStr = Trim$(listStr)
    If totalCount <= 0 Or Len(listStr) = 0 Then
        RowListSummary_ = "-"
        Exit Function
    End If

    ' 끝의 공백/쉼표/전각쉼표 제거
    Do While Len(listStr) > 0 And (Right$(listStr, 1) = "," Or Right$(listStr, 1) = "，" Or Right$(listStr, 1) = " ")
        listStr = Left$(listStr, Len(listStr) - 1)
        listStr = Trim$(listStr)
    Loop
    If Len(listStr) = 0 Then
        RowListSummary_ = "-"
        Exit Function
    End If

    ' 이중 쉼표 정리
    Do While InStr(listStr, ",,") > 0
        listStr = Replace(listStr, ",,", ",")
    Loop

    items = Split(listStr, ",")
    n = UBound(items) - LBound(items) + 1
    If n < 1 Then
        RowListSummary_ = "-"
        Exit Function
    End If

    If maxShow <= 0 Then maxShow = 20
    If n < maxShow Then shown = n Else shown = maxShow

    For i = 0 To shown - 1
        s = s & Trim$(items(LBound(items) + i)) & ", "
    Next i
    If Len(s) >= 2 Then s = Left$(s, Len(s) - 2)

    If totalCount > shown Then
        RowListSummary_ = s & " … (앞 " & shown & "개, 총 " & totalCount & "개)"
    Else
        RowListSummary_ = s
    End If
End Function

' === 사용 열만 묶은 Range (M,N,O,Q,T,U,V,W,X) ===
Private Function SourceUsedRange(ByVal ws As Worksheet, ByVal r As Long) As Range
    Dim rng As Range
    Set rng = ws.Cells(r, "M")
    Set rng = Union(rng, ws.Cells(r, "N"))
    Set rng = Union(rng, ws.Cells(r, "O"))
    Set rng = Union(rng, ws.Cells(r, "Q"))
    Set rng = Union(rng, ws.Cells(r, "T"))
    Set rng = Union(rng, ws.Cells(r, "U"))
    Set rng = Union(rng, ws.Cells(r, "V"))
    Set rng = Union(rng, ws.Cells(r, "W"))
    Set rng = Union(rng, ws.Cells(r, "X"))
    Set SourceUsedRange = rng
End Function

' === 공용 코어: 선택 행들을 지정 시트로 "이관" ===
' - 원본 데이터 범위: M:Z (선택/빈행검사/색칠), 실제 복사 사용열: M,N,O,Q,T,U,V,W,X  (P/R/S 제외)
' - 매핑:
'     * M,N,O  → 목적지 B,C,D
'     * (목적지 E는 비워둠)
'     * T,U,V,W,X → 목적지 F,G,H,I,J
'     * Q → 목적지 K
'     * L열에는 원본 시트명 기록
' - 목적지의 다음 빈 행 찾기: B:K 블록
' - 상태표시: 원본 Y열(타임스탬프 yy-mm-dd hh:mm), Z열(받는 시트명), 색칠: 원본 M:Z
' - 사전검사:
'     (1) 선택범위가 M:Z 안인지
'     (2) Y열 표시 존재 시 전체 취소
'     (3) M:Z 완전빈 행 존재 시 전체 취소
'     (4) **추가**: 사용열(M,N,O,Q,T,U,V,W,X) 값이 하나도 없는 행이 하나라도 있으면 전체 취소
' - 처리 완료 후 요약 팝업 (※ 이관할 데이터가 하나도 없으면 '작업 취소-데이터 없음' 분기)
Public Sub 이관_선택행_복사_대상(ByVal destSheetName As String)
    Const SRC_STATUS_COL As String = "Y"          ' 상태표시/타임스탬프: Y열
    Const SKIP_IF_MARKED As Boolean = True
    Const CANCEL_IF_ANY_EMPTY As Boolean = True   ' M:Z 완전 빈 행 포함 시 전체 취소
    Const CLR_SENT As Long = &HCEEFC6             ' RGB(198,239,206)

    Dim srcWs As Worksheet, dstWs As Worksheet
    Dim dict As Object, area As Range, rr As Range
    Dim rowsArr As Variant
    Dim i As Long, j As Long, r As Long
    Dim destRow As Long
    Dim tmp As Variant

    Dim sel As Range, onlyMY As Range
    Dim createdDest As Boolean
    Dim cntSelected As Long, cntCopied As Long, cntEmpty As Long
    Dim listCopied As String, listEmpty As String
    Dim errMsg As String
    Dim abortedNoData As Boolean
    Dim nowVal As Date
    Dim dayStr As String, timeStr As String
    Dim txt As String, dayStart As Long


    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set srcWs = Selection.Worksheet
    Set sel = Selection

    ' === 선택 범위를 M:Z로 한정 ===
    Set onlyMY = Intersect(sel, srcWs.Range("M:Z"))
    If onlyMY Is Nothing Then
        MsgBox "M~Z 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    If onlyMY.CountLarge <> sel.CountLarge Then
        MsgBox "M~Z 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If

    ' 행 번호 수집/중복제거
    Set dict = CreateObject("Scripting.Dictionary")
    For Each area In sel.Areas
        For Each rr In area.rows
            dict(CStr(rr.Row)) = True
        Next rr
    Next area
    If dict.Count = 0 Then
        MsgBox "유효한 선택이 없습니다.", vbExclamation
        Exit Sub
    End If
    cntSelected = dict.Count

    ' 행 번호 오름차순 정렬
    rowsArr = dict.Keys
    For i = LBound(rowsArr) To UBound(rowsArr) - 1
        For j = i + 1 To UBound(rowsArr)
            If CLng(rowsArr(i)) > CLng(rowsArr(j)) Then
                tmp = rowsArr(i): rowsArr(i) = rowsArr(j): rowsArr(j) = tmp
            End If
        Next j
    Next i

    ' 중복표시(Y열) 있으면 전체 취소
    If SKIP_IF_MARKED Then
        Dim cntBlocked As Long, listBlocked As String
        For i = LBound(rowsArr) To UBound(rowsArr)
            r = CLng(rowsArr(i))
            If Len(Trim$(srcWs.Cells(r, SRC_STATUS_COL).Value)) > 0 Then
                cntBlocked = cntBlocked + 1
                listBlocked = listBlocked & r & ","
            End If
        Next i
        If cntBlocked > 0 Then
            MsgBox "선택한 행 중 이미 처리표시(Y열)가 있어 이관 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & RowListSummary_(listBlocked, cntBlocked, 30), _
                   vbExclamation + vbOKOnly, "이관 중복 감지 - 작업 취소"
            Exit Sub
        End If
    End If

    ' 빈 행 검사 기준: M:Z
    If CANCEL_IF_ANY_EMPTY Then
        Dim cntEmptyPre As Long, listEmptyPre As String
        For i = LBound(rowsArr) To UBound(rowsArr)
            r = CLng(rowsArr(i))
            If Application.WorksheetFunction.CountA(srcWs.Range("M" & r & ":Z" & r)) = 0 Then
                cntEmptyPre = cntEmptyPre + 1
                listEmptyPre = listEmptyPre & r & ","
            End If
        Next i
        If cntEmptyPre > 0 Then
            MsgBox "선택한 행 중 M:Z가 모두 빈 행이 포함되어 있어 이관 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & RowListSummary_(listEmptyPre, cntEmptyPre, 30), _
                   vbExclamation + vbOKOnly, "빈 행 감지 - 작업 취소"
            Exit Sub
        End If
    End If

    ' === 사전검증 #3: 사용열(M,N,O,Q,T,U,V,W,X)에 값이 하나도 없는 행이 '하나라도' 있으면 전체 취소 ===
    Dim cntNoUsed As Long, listNoUsed As String
    For i = LBound(rowsArr) To UBound(rowsArr)
        r = CLng(rowsArr(i))
        If Application.WorksheetFunction.CountA(SourceUsedRange(srcWs, r)) = 0 Then
            cntNoUsed = cntNoUsed + 1
            listNoUsed = listNoUsed & r & ","
        End If
    Next i
    If cntNoUsed > 0 Then
        MsgBox "선택한 행 중 이관에 사용되는 열(M,N,O,Q,T,U,V,W,X)에 데이터가 없는 행이 포함되어 있어 전체 작업을 취소합니다." & vbCrLf & _
               "시트: " & srcWs.name & vbCrLf & _
               "행: " & RowListSummary_(listNoUsed, cntNoUsed, 30), _
               vbExclamation + vbOKOnly, "사용열 데이터 없음 - 작업 취소"
        Exit Sub
    End If

    ' 대상 시트 준비 (모든 사전검증 통과 후에 생성)
    On Error Resume Next
    Set dstWs = ThisWorkbook.Worksheets(destSheetName)
    On Error GoTo 0
    If dstWs Is Nothing Then
        Set dstWs = ThisWorkbook.Worksheets.Add
        dstWs.name = destSheetName
        createdDest = True
    End If

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error GoTo CleanFail
    Const DEST_OUTPUT_START_ROW As Long = 13  ' 받는행 탐색 시작 행

    ' Y열 표시 포맷 고정 (Excel: 분은 mm)
    srcWs.Columns("Y").NumberFormat = "yy-mm-dd hh:mm"

    For i = LBound(rowsArr) To UBound(rowsArr)
        r = CLng(rowsArr(i))

        ' (여기서는 사전검증으로 모두 통과했으므로 항상 이관)
        Dim arr(1 To 1, 1 To 10) As Variant ' 목적지 B..K (10열)

        ' M,N,O → B,C,D
        arr(1, 1) = srcWs.Cells(r, "M").Value
        arr(1, 2) = srcWs.Cells(r, "N").Value
        arr(1, 3) = srcWs.Cells(r, "O").Value

        ' E 비움
        arr(1, 4) = vbNullString

        ' T,U,V,W,X → F..J
        arr(1, 5) = srcWs.Cells(r, "T").Value
        arr(1, 6) = srcWs.Cells(r, "U").Value
        arr(1, 7) = srcWs.Cells(r, "V").Value
        arr(1, 8) = srcWs.Cells(r, "W").Value
        arr(1, 9) = srcWs.Cells(r, "X").Value

        ' Q → K
        arr(1, 10) = srcWs.Cells(r, "Q").Value

                ' 목적지 B:K의 다음 빈 행 (13행부터 탐색)
        destRow = NextEmptyRowInBlockFrom(dstWs, "B", "K", DEST_OUTPUT_START_ROW)

        ' 쓰기: B~K 값 복사
        dstWs.Range("B" & destRow).Resize(1, 10).Value = arr
        dstWs.Cells(destRow, "B").Font.Color = srcWs.Cells(r, "M").Font.Color

        ' L열: "원본시트명 + 일(굵게) + HH:MM" 기록
        nowVal = Now
        dayStr = CStr(Day(nowVal))              ' 예: 12
        timeStr = Format$(nowVal, "hh:nn")      ' 예: 14:23

        With dstWs.Cells(destRow, "L")
            ' 예: "기계 12 14:23"
            txt = srcWs.name & " " & dayStr & " " & timeStr
            .Value = txt

            ' "일" 부분만 Bold 처리
            dayStart = Len(srcWs.name) + 2      ' 시트명 + 공백 1개 뒤에서 시작
            .Characters(dayStart, Len(dayStr)).Font.Bold = True

            ' 셀 크기에 맞게 글자 자동 축소
            .ShrinkToFit = True
        End With


        ' 원본 Y에 타임스탬프 + Z에 받는시트명 기록 + 색칠(M:Z)
        srcWs.Cells(r, SRC_STATUS_COL).Value = Now
        srcWs.Cells(r, "Z").Value = destSheetName
        srcWs.Range("M" & r & ":Z" & r).Interior.Color = CLR_SENT

        cntCopied = cntCopied + 1
        listCopied = listCopied & r & ","
    Next i

CleanExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    ' 처리 결과 분기: (이상 케이스) 이관할 데이터가 한 건도 없으면 취소 메시지
    abortedNoData = (cntCopied = 0)
    If abortedNoData Then
        If createdDest Then
            On Error Resume Next
            Application.DisplayAlerts = False
            dstWs.Delete
            Application.DisplayAlerts = True
            On Error GoTo 0
        End If

        Dim msgNoData As String
        msgNoData = "선택한 범위에 이관할 데이터가 없어 작업을 취소했습니다." & vbCrLf & _
                    "원본 시트 : " & srcWs.name & vbCrLf & _
                    "대상 시트 : " & destSheetName & vbCrLf & vbCrLf & _
                    "■ 비어있던 행: " & RowListSummary_(listEmpty, cntEmpty, 20)
        MsgBox msgNoData, vbExclamation + vbOKOnly, "이관 취소 - 데이터 없음"
        Exit Sub
    End If

    ' 요약 팝업(정상 처리)
    Dim msg As String
    msg = "[이관 처리 결과]" & vbCrLf & _
          "원본 시트 : " & srcWs.name & vbCrLf & _
          "대상 시트 : " & destSheetName & IIf(createdDest, " (신규 생성)", "") & vbCrLf & _
          "선택 행(중복제거) : " & cntSelected & "개" & vbCrLf & _
          "이관 완료 : " & cntCopied & "개" & vbCrLf & _
          "무시(데이터 없음 사용열) : " & cntEmpty & "개" & vbCrLf & vbCrLf & _
          "■ 이관된 행: " & RowListSummary_(listCopied, cntCopied, 20) & vbCrLf & _
          "■ 비어있던 행: " & RowListSummary_(listEmpty, cntEmpty, 20)

    If Len(errMsg) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "※ 오류: " & errMsg
        MsgBox msg, vbExclamation + vbOKOnly, "이관 처리(일부 오류)"
    Else
        MsgBox msg, vbInformation + vbOKOnly, "이관 처리 완료"
    End If
    Exit Sub

CleanFail:
    errMsg = Err.Description
    Resume CleanExit
End Sub


' ====== 시트별 래퍼들 (이관) ======
' 필요 개수만큼 아래 Sub를 복사하여 시트명만 바꾸고 버튼에 연결하세요.

' ===== 시트별 래퍼: 연마 =====
Public Sub 이관_선택행_복사__연마조립()
    이관_선택행_복사_대상 "연마(조립)"
End Sub

Public Sub 이관_선택행_복사__연마캐스팅()
    이관_선택행_복사_대상 "연마(캐스팅)"
End Sub

Public Sub 이관_선택행_복사__연마조립14K()
    이관_선택행_복사_대상 "연마(조립)14K"
End Sub

Public Sub 이관_선택행_복사__연마캐스팅14K()
    이관_선택행_복사_대상 "연마(캐스팅)14K"
End Sub

' ===== 시트별 래퍼: 뻥 (기본 + 14K) =====
Public Sub 이관_선택행_복사__뻥기계()
    이관_선택행_복사_대상 "뻥(기계)"
End Sub

Public Sub 이관_선택행_복사__뻥양장()
    이관_선택행_복사_대상 "뻥(양장)"
End Sub

Public Sub 이관_선택행_복사__뻥캐스팅()
    이관_선택행_복사_대상 "뻥(캐스팅)"
End Sub

Public Sub 이관_선택행_복사__뻥개발()
    이관_선택행_복사_대상 "뻥(개발)"
End Sub

Public Sub 이관_선택행_복사__뻥조립14K()
    이관_선택행_복사_대상 "뻥(조립)14K"
End Sub

Public Sub 이관_선택행_복사__뻥캐스팅14K()
    이관_선택행_복사_대상 "뻥(캐스팅)14K"
End Sub

' ===== 시트별 래퍼: 빠우 (기본) =====
Public Sub 이관_선택행_복사__빠우양장볼()
    이관_선택행_복사_대상 "빠우(양장볼)"
End Sub

Public Sub 이관_선택행_복사__빠우할로우()
    이관_선택행_복사_대상 "빠우(할로우)"
End Sub

Public Sub 이관_선택행_복사__빠우기계()
    이관_선택행_복사_대상 "빠우(기계)"
End Sub

Public Sub 이관_선택행_복사__빠우패션반지()
    이관_선택행_복사_대상 "빠우(패션반지)"
End Sub

Public Sub 이관_선택행_복사__빠우캐스팅양장()
    이관_선택행_복사_대상 "빠우(캐스팅양장)"
End Sub

Public Sub 이관_선택행_복사__빠우캐스팅체인()
    이관_선택행_복사_대상 "빠우(캐스팅체인)"
End Sub

Public Sub 이관_선택행_복사__빠우초광조립()
    이관_선택행_복사_대상 "빠우(초광-조립)"
End Sub

Public Sub 이관_선택행_복사__빠우초광캐스팅()
    이관_선택행_복사_대상 "빠우(초광-캐스팅)"
End Sub

Public Sub 이관_선택행_복사__빠우개발()
    이관_선택행_복사_대상 "빠우(개발)"
End Sub

' ===== 시트별 래퍼: 빠우 (14K) =====
Public Sub 이관_선택행_복사__빠우조립14K()
    이관_선택행_복사_대상 "빠우(조립)14K"
End Sub

Public Sub 이관_선택행_복사__빠우패션반지14K()
    이관_선택행_복사_대상 "빠우(패션반지)14K"
End Sub

Public Sub 이관_선택행_복사__빠우캐스팅양장14K()
    이관_선택행_복사_대상 "빠우(캐스팅양장)14K"
End Sub

Public Sub 이관_선택행_복사__빠우캐스팅체인14K()
    이관_선택행_복사_대상 "빠우(캐스팅체인)14K"
End Sub

Public Sub 이관_선택행_복사__빠우초광조립14K()
    이관_선택행_복사_대상 "빠우(초광-조립)14K"
End Sub

Public Sub 이관_선택행_복사__빠우초광캐스팅14K()
    이관_선택행_복사_대상 "빠우(초광-캐스팅)14K"
End Sub

