Attribute VB_Name = "Module4"
Option Explicit


' === B~J 블록에서 startRow(기본 13) 이상에서의 "완전 빈 행" 찾기 ===
Private Function NextEmptyRowInBlock(ws As Worksheet, ByVal firstCol As String, ByVal lastCol As String, Optional ByVal startRow As Long = 13) As Long
    Dim r As Long
    If startRow < 1 Then startRow = 1
    r = startRow
    Do While Application.WorksheetFunction.CountA(ws.Range(firstCol & r & ":" & lastCol & r)) > 0
        r = r + 1
    Loop
    NextEmptyRowInBlock = r
End Function


' === 행 번호 목록을 예쁘게 요약(앞 N개만 표시 + 총개수) ===
Private Function SummarizeRows(ByVal listStr As String, ByVal totalCount As Long, Optional ByVal maxShow As Long = 20) As String
    Dim arr() As String, i As Long, shown As Long, tmp As String
    listStr = Trim$(listStr)
    If listStr = "" Or totalCount = 0 Then
        SummarizeRows = "-"
        Exit Function
    End If
    If Right$(listStr, 1) = "," Then listStr = Left$(listStr, Len(listStr) - 1)
    arr = Split(listStr, ",")
    shown = IIf(UBound(arr) + 1 < maxShow, UBound(arr) + 1, maxShow)
    For i = 0 To shown - 1
        tmp = tmp & Trim$(arr(i)) & ", "
    Next i
    If tmp <> "" Then tmp = Left$(tmp, Len(tmp) - 2)
    If totalCount > shown Then
        SummarizeRows = tmp & " … (앞 " & shown & "개, 총 " & totalCount & "개)"
    Else
        SummarizeRows = tmp
    End If
End Function

' === 공용 코어: 선택 행들을 지정 시트로 복사 ===
' - 대상 A열: 비워둠
' - 대상 B열: 원본 A열의 "값(.Value) + 폰트색(.Font.Color)"만 복사 (다른 서식 제외)
' - 대상 C:J열: 원본 B:I 값을 그대로 복사(값만, 서식/수식 제외)
' - 대상 K열: 원본 D~F 숫자 합계 기록
' - 대상 L열: 원본 시트명 기록
' - 원본 J열: 타임스탬프 기록 + 원본 A:J 행 색칠
' - 사전검사: (1) 선택범위 A:J 여부 (2) J열 표시 존재 시 전체 취소 (3) A:J 완전빈 행 존재 시 전체 취소
' - 처리 후 요약 팝업
Public Sub 투입_선택행_복사_대상(ByVal destSheetName As String)
    Const SRC_STATUS_COL As String = "J"          ' 원본 표시용 컬럼
    Const SKIP_IF_MARKED As Boolean = True        ' 표시가 있으면 건너뛰기(사전검사에서 전체 취소)
    Const CANCEL_IF_ANY_EMPTY As Boolean = True   ' A:J 완전 빈 행이 하나라도 있으면 전체 작업 취소
    Const CLR_SENT As Long = &HCEEFC6             ' RGB(198,239,206)

    Dim srcWs As Worksheet, dstWs As Worksheet
    Dim dict As Object, area As Range, rr As Range
    Dim rowsArr As Variant
    Dim i As Long, j As Long, r As Long
    Dim dataBI As Variant ' 원본 B:I -> 대상 C:J
    Dim destRow As Long
    Dim tmp As Variant
    Dim nowVal As Date
    Dim dayStr As String, timeStr As String
    Dim txt As String, dayStart As Long


    ' 선택범위 변수
    Dim sel As Range, onlyAJ As Range

    ' 집계용
    Dim createdDest As Boolean
    Dim cntSelected As Long, cntCopied As Long, cntEmpty As Long
    Dim listCopied As String, listEmpty As String
    Dim errMsg As String

    ' 유효한 선택인지
    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set srcWs = Selection.Worksheet
    Set sel = Selection

    ' === 선택 범위를 A:K로 한정 (2단계 체크) ===
Set onlyAJ = Intersect(sel, srcWs.Range("A:K"))
If onlyAJ Is Nothing Then
    MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
           "A~K 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
           "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
    Exit Sub
End If
If onlyAJ.CountLarge <> sel.CountLarge Then
    MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
           "A~K 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
           "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
    Exit Sub
End If

    ' === 끝 ===

    ' 선택 영역에서 "행 번호" 중복 제거
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

    ' 행 번호 정렬(오름차순)
    rowsArr = dict.Keys
    For i = LBound(rowsArr) To UBound(rowsArr) - 1
        For j = i + 1 To UBound(rowsArr)
            If CLng(rowsArr(i)) > CLng(rowsArr(j)) Then
                tmp = rowsArr(i): rowsArr(i) = rowsArr(j): rowsArr(j) = tmp
            End If
        Next j
    Next i

    ' ===== 사전검사 #1: 중복 투입(J열 표시) 감지 시 전체 작업 취소 =====
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
            MsgBox "선택한 행 중 이미 투입된 행이 있어 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & SummarizeRows(listBlocked, cntBlocked, 30), _
                   vbExclamation + vbOKOnly, "투입 중복 감지 - 작업 취소"
            Exit Sub
        End If
    End If
    ' ===== 사전검사 #1 끝 =====

    ' ===== 사전검사 #2: A:J가 전부 빈 행이 하나라도 있으면 전체 작업 취소 =====
    If CANCEL_IF_ANY_EMPTY Then
        Dim cntEmptyPre As Long, listEmptyPre As String
        For i = LBound(rowsArr) To UBound(rowsArr)
            r = CLng(rowsArr(i))
            If Application.WorksheetFunction.CountA(srcWs.Range("A" & r & ":J" & r)) = 0 Then
                cntEmptyPre = cntEmptyPre + 1
                listEmptyPre = listEmptyPre & r & ","
            End If
        Next i

        If cntEmptyPre > 0 Then
            MsgBox "선택한 행 중 A:J가 모두 빈 행이 포함되어 있어 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & SummarizeRows(listEmptyPre, cntEmptyPre, 30), _
                   vbExclamation + vbOKOnly, "빈 행 감지 - 작업 취소"
            Exit Sub
        End If
    End If
    ' ===== 사전검사 #2 끝 =====

    ' 대상 시트 준비(없으면 생성)
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

    For i = LBound(rowsArr) To UBound(rowsArr)
        r = CLng(rowsArr(i))

        ' 복사 대상 여부: 원본 A:I 중 하나라도 값이 있으면 복사
        If Application.WorksheetFunction.CountA(srcWs.Range("A" & r & ":I" & r)) > 0 Then
            Dim sumDFF As Double, hasNum As Boolean  ' D~F 합산

            ' 1) 대상 행 계산
            destRow = NextEmptyRowInBlock(dstWs, "B", "J")

            ' 2) 대상 B열 ← 원본 A열의 "값 + 폰트색" 복사 (다른 서식 제외)
            With dstWs.Cells(destRow, "B")
                .Value = srcWs.Cells(r, "A").Value
                .Font.Color = srcWs.Cells(r, "A").Font.Color
            End With

            ' 3) 대상 C:J ← 원본 B:I 값만 복사
            dataBI = srcWs.Range("B" & r & ":I" & r).Value
            dstWs.Range("C" & destRow).Resize(1, 8).Value = dataBI

            ' 4) 대상 K열에 원본 D~F 합계 기록
            sumDFF = 0: hasNum = False
            If IsNumeric(srcWs.Cells(r, "D").Value) Then sumDFF = sumDFF + CDbl(srcWs.Cells(r, "D").Value): hasNum = True
            If IsNumeric(srcWs.Cells(r, "E").Value) Then sumDFF = sumDFF + CDbl(srcWs.Cells(r, "E").Value): hasNum = True
            If IsNumeric(srcWs.Cells(r, "F").Value) Then sumDFF = sumDFF + CDbl(srcWs.Cells(r, "F").Value): hasNum = True
            If IsNumeric(srcWs.Cells(r, "H").Value) Then sumDFF = sumDFF + CDbl(srcWs.Cells(r, "H").Value): hasNum = True
            If hasNum Then
                dstWs.Cells(destRow, "K").Value = sumDFF
                ' 필요 시: dstWs.Cells(destRow, "K").NumberFormat = "0.00"
            End If

            ' 5) 대상 L열에 "원본 시트명 + 일(굵게) + HH:MM" 기록
            nowVal = Now
            dayStr = CStr(Day(nowVal))                ' 예: 12
            timeStr = Format$(nowVal, "hh:nn")        ' 예: 14:23

            With dstWs.Cells(destRow, "L")
                ' 전체 텍스트: 예) "기계 12 14:23"
                txt = srcWs.name & " " & dayStr & " " & timeStr
                .Value = txt

                ' "일" 부분만 Bold 처리
                dayStart = Len(srcWs.name) + 2        ' 시트명 + 공백 1개 뒤에서 시작
                .Characters(dayStart, Len(dayStr)).Font.Bold = True

                ' 셀 크기에 맞게 글자 자동 축소
                .ShrinkToFit = True
            End With


            ' 6) 원본 J열에 타임스탬프 + 원본 A:K 색칠
            srcWs.Cells(r, "J").Value = Format(Now, "yyyy-mm-dd hh:nn:ss")
            srcWs.Range("A" & r & ":K" & r).Interior.Color = CLR_SENT
            
            ' === 추가: 원본 K열에 대상(상대) 시트명 기록 ===
            srcWs.Cells(r, "K").Value = destSheetName

            cntCopied = cntCopied + 1
            listCopied = listCopied & r & ","
        Else
            cntEmpty = cntEmpty + 1
            listEmpty = listEmpty & r & ","
        End If
    Next i

CleanExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    ' === 요약 팝업 ===
    Dim msg As String
    msg = "[투입 처리 결과]" & vbCrLf & _
          "원본 시트 : " & srcWs.name & vbCrLf & _
          "대상 시트 : " & destSheetName & IIf(createdDest, " (신규 생성)", "") & vbCrLf & _
          "선택 행(중복제거) : " & cntSelected & "개" & vbCrLf & _
          "복사 완료 : " & cntCopied & "개" & vbCrLf & _
          "무시(데이터 없음 A:I) : " & cntEmpty & "개"

    msg = msg & vbCrLf & vbCrLf & _
          "■ 복사된 행: " & SummarizeRows(listCopied, cntCopied, 20) & vbCrLf & _
          "■ 비어있던 행: " & SummarizeRows(listEmpty, cntEmpty, 20)

    If Len(errMsg) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "※ 오류: " & errMsg
        MsgBox msg, vbExclamation + vbOKOnly, "투입 처리(일부 오류)"
    Else
        MsgBox msg, vbInformation + vbOKOnly, "투입 처리 완료"
    End If
    Exit Sub

CleanFail:
    errMsg = Err.Description
    Resume CleanExit
End Sub


' ====== 시트별 래퍼들 ======

' ===== 시트별 래퍼: 연마 =====
Public Sub 투입_선택행_복사__연마조립()
    투입_선택행_복사_대상 "연마(조립)"
End Sub

Public Sub 투입_선택행_복사__연마캐스팅()
    투입_선택행_복사_대상 "연마(캐스팅)"
End Sub

Public Sub 투입_선택행_복사__연마조립14K()
    투입_선택행_복사_대상 "연마(조립)14K"
End Sub

Public Sub 투입_선택행_복사__연마캐스팅14K()
    투입_선택행_복사_대상 "연마(캐스팅)14K"
End Sub

' ===== 시트별 래퍼: 뻥 (기본 + 14K) =====
Public Sub 투입_선택행_복사__뻥기계()
    투입_선택행_복사_대상 "뻥(기계)"
End Sub

Public Sub 투입_선택행_복사__뻥양장()
    투입_선택행_복사_대상 "뻥(양장)"
End Sub

Public Sub 투입_선택행_복사__뻥캐스팅()
    투입_선택행_복사_대상 "뻥(캐스팅)"
End Sub

Public Sub 투입_선택행_복사__뻥개발()
    투입_선택행_복사_대상 "뻥(개발)"
End Sub

Public Sub 투입_선택행_복사__뻥조립14K()
    투입_선택행_복사_대상 "뻥(조립)14K"
End Sub

Public Sub 투입_선택행_복사__뻥캐스팅14K()
    투입_선택행_복사_대상 "뻥(캐스팅)14K"
End Sub


' ===== 시트별 래퍼: 빠우 (기본) =====
Public Sub 투입_선택행_복사__빠우양장볼()
    투입_선택행_복사_대상 "빠우(양장볼)"
End Sub

Public Sub 투입_선택행_복사__빠우할로우()
    투입_선택행_복사_대상 "빠우(할로우)"
End Sub

Public Sub 투입_선택행_복사__빠우기계()
    투입_선택행_복사_대상 "빠우(기계)"
End Sub

Public Sub 투입_선택행_복사__빠우패션반지()
    투입_선택행_복사_대상 "빠우(패션반지)"
End Sub

Public Sub 투입_선택행_복사__빠우캐스팅양장()
    투입_선택행_복사_대상 "빠우(캐스팅양장)"
End Sub

Public Sub 투입_선택행_복사__빠우캐스팅체인()
    투입_선택행_복사_대상 "빠우(캐스팅체인)"
End Sub

Public Sub 투입_선택행_복사__빠우초광조립()
    투입_선택행_복사_대상 "빠우(초광-조립)"
End Sub

Public Sub 투입_선택행_복사__빠우초광캐스팅()
    투입_선택행_복사_대상 "빠우(초광-캐스팅)"
End Sub

Public Sub 투입_선택행_복사__빠우개발()
    투입_선택행_복사_대상 "빠우(개발)"
End Sub

' ===== 시트별 래퍼: 빠우 (14K) =====
Public Sub 투입_선택행_복사__빠우조립14K()
    투입_선택행_복사_대상 "빠우(조립)14K"
End Sub

Public Sub 투입_선택행_복사__빠우패션반지14K()
    투입_선택행_복사_대상 "빠우(패션반지)14K"
End Sub

Public Sub 투입_선택행_복사__빠우캐스팅양장14K()
    투입_선택행_복사_대상 "빠우(캐스팅양장)14K"
End Sub

Public Sub 투입_선택행_복사__빠우캐스팅체인14K()
    투입_선택행_복사_대상 "빠우(캐스팅체인)14K"
End Sub

Public Sub 투입_선택행_복사__빠우초광조립14K()
    투입_선택행_복사_대상 "빠우(초광-조립)14K"
End Sub

Public Sub 투입_선택행_복사__빠우초광캐스팅14K()
    투입_선택행_복사_대상 "빠우(초광-캐스팅)14K"
End Sub

