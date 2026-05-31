Attribute VB_Name = "Module16"
Option Explicit

' ==== 색상 상수 ====
' 기본(하늘색): RGB(221,235,247) -> BGR Hex
Private Const CLR_SENT As Long = &HF7EBDD
' 검수 전용(베이비핑크): RGB(255,224,236) -> BGR Hex
Private Const CLR_BABY_PINK As Long = &HECE0FF

' === 지정 블록에서 startRow(기본 13) 이상 "완전 빈 행" 찾기 ===
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

' === 공용 코어: 선택 행들을 지정 시트로 "타부서투입" ===
' - 대상 L:T : 원본 A:I 값을 그대로 복사(값만, 서식/수식 제외)
' - 대상 U열 : 원본 시트명 기록
' - 원본 J열 : 타임스탬프 기록(중복 방지 마킹 유지)
' - 원본 K열 : 받는 시트명 기록
' - 원본 A:K : 투입 표시 색칠(단, 1행은 색 유지)
' - 선택범위 제한(A:K)/중복투입(J열 비어있지 않으면 전체 취소)/A:J 완전빈 행 포함 시 전체 취소 로직 유지
Public Sub 타부서투입_선택행_복사_대상(ByVal destSheetName As String, Optional ByVal markColor As Long = -1)
    Const SRC_STATUS_COL As String = "J"
    Const SKIP_IF_MARKED As Boolean = True
    Const CANCEL_IF_ANY_EMPTY As Boolean = True

    Dim srcWs As Worksheet, dstWs As Worksheet
    Dim dict As Object, area As Range, rr As Range
    Dim rowsArr As Variant
    Dim i As Long, j As Long, r As Long
    Dim dataAI As Variant
    Dim destRow As Long
    Dim tmp As Variant

    ' 색상 결정: 기본(하늘색) 또는 호출자가 전달한 markColor
    Dim effColor As Long
    effColor = IIf(markColor = -1, CLR_SENT, markColor)

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
            ' 1) 대상 행 계산 (대상 L:T 블록의 다음 완전 빈 행)
            destRow = NextEmptyRowInBlock(dstWs, "L", "T")

            ' 2) 대상 L:T ← 원본 A:I "값"만 복사
            dataAI = srcWs.Range("A" & r & ":I" & r).Value
            dstWs.Range("L" & destRow).Resize(1, 9).Value = dataAI

            ' === 추가: 대상(U열)에 원본 시트명 기록 ===
            dstWs.Cells(destRow, "U").Value = srcWs.name

            ' 3) 원본 J열에 타임스탬프 기록 (중복 방지 마킹)
            srcWs.Cells(r, "J").Value = Format(Now, "yyyy-mm-dd hh:nn:ss")

            ' === 추가: 원본(K열)에 받는 시트명 기록 ===
            srcWs.Cells(r, "K").Value = destSheetName

            ' 4) 원본 A:K 행 색칠(단, 1행은 색 유지 - 헤더 보호)
            If r > 1 Then
                srcWs.Range("A" & r & ":K" & r).Interior.Color = effColor
            End If

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
    msg = "[타부서투입 처리 결과]" & vbCrLf & _
          "원본 시트 : " & srcWs.name & vbCrLf & _
          "대상 시트 : " & destSheetName & IIf(createdDest, " (신규 생성)", "") & vbCrLf & _
          "선택 행(중복제거) : " & cntSelected & "개" & vbCrLf & _
          "복사 완료 : " & cntCopied & "개" & vbCrLf & _
          "무시(데이터 없음 A:I) : " & cntEmpty & "개" & vbCrLf & vbCrLf & _
          "■ 복사된 행: " & SummarizeRows(listCopied, cntCopied, 20) & vbCrLf & _
          "■ 비어있던 행: " & SummarizeRows(listEmpty, cntEmpty, 20)

    If Len(errMsg) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "※ 오류: " & errMsg
        MsgBox msg, vbExclamation + vbOKOnly, "타부서투입(일부 오류)"
    Else
        MsgBox msg, vbInformation + vbOKOnly, "타부서투입 완료"
    End If
    Exit Sub

CleanFail:
    errMsg = Err.Description
    Resume CleanExit
End Sub


' ====== 시트별 래퍼들 (타부서투입) ======
Public Sub 타부서투입_선택행_복사__기계()
    타부서투입_선택행_복사_대상 "기계"
End Sub

Public Sub 타부서투입_선택행_복사__양장()
    타부서투입_선택행_복사_대상 "양장"
End Sub

Public Sub 타부서투입_선택행_복사__캐스팅()
    타부서투입_선택행_복사_대상 "캐스팅"
End Sub

Public Sub 타부서투입_선택행_복사__개발()
    타부서투입_선택행_복사_대상 "개발"
End Sub

Public Sub 타부서투입_선택행_복사__컷팅()
    타부서투입_선택행_복사_대상 "컷팅"
End Sub

Public Sub 타부서투입_선택행_복사__조립14K()
    타부서투입_선택행_복사_대상 "조립14K"
End Sub

Public Sub 타부서투입_선택행_복사__캐스팅14K()
    타부서투입_선택행_복사_대상 "캐스팅14K"
End Sub

Public Sub 타부서투입_선택행_복사__컷팅14K()
    타부서투입_선택행_복사_대상 "컷팅14K"
End Sub

' ====== 검수 계열 래퍼들(원본을 베이비핑크로 칠함) ======
Public Sub 타부서투입_선택행_복사__검수기계()
    타부서투입_선택행_복사_대상 "검수(기계)", CLR_BABY_PINK
End Sub

Public Sub 타부서투입_선택행_복사__검수볼()
    타부서투입_선택행_복사_대상 "검수(볼)", CLR_BABY_PINK
End Sub

Public Sub 타부서투입_선택행_복사__검수양장()
    타부서투입_선택행_복사_대상 "검수(양장)", CLR_BABY_PINK
End Sub

Public Sub 타부서투입_선택행_복사__검수캐스팅()
    타부서투입_선택행_복사_대상 "검수(캐스팅)", CLR_BABY_PINK
End Sub

Public Sub 타부서투입_선택행_복사__검수조립14K()
    타부서투입_선택행_복사_대상 "검수(조립)14K", CLR_BABY_PINK
End Sub

Public Sub 타부서투입_선택행_복사__검수캐스팅14K()
    타부서투입_선택행_복사_대상 "검수(캐스팅)14K", CLR_BABY_PINK
End Sub

