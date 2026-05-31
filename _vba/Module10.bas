Attribute VB_Name = "Module10"
Option Explicit

' === 목적지(L:T) 블록에서 startRow(기본 13) 이상 "완전 빈 행" 찾기 ===
Private Function NextEmptyRowInBlock(ws As Worksheet, ByVal firstCol As String, ByVal lastCol As String, Optional ByVal startRow As Long = 13) As Long
    Dim r As Long
    If startRow < 1 Then startRow = 1
    r = startRow
    Do While Application.WorksheetFunction.CountA(ws.Range(firstCol & r & ":" & lastCol & r)) > 0
        r = r + 1
    Loop
    NextEmptyRowInBlock = r
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

    Do While Len(listStr) > 0 And (Right$(listStr, 1) = "," Or Right$(listStr, 1) = "，" Or Right$(listStr, 1) = " ")
        listStr = Left$(listStr, Len(listStr) - 1)
        listStr = Trim$(listStr)
    Loop
    If Len(listStr) = 0 Then
        RowListSummary_ = "-"
        Exit Function
    End If

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

' === 숫자 안전 변환 ===
Private Function ToDbl(ByVal v As Variant) As Double
    If IsNumeric(v) Then
        ToDbl = CDbl(v)
    Else
        ToDbl = 0#
    End If
End Function

' === 사용 열만 묶은 Range (M,N,O,P,T,U,V,W,X,Z)  ← Q 제외, P 포함, ★ Z 포함
Private Function SourceUsedRange(ByVal ws As Worksheet, ByVal r As Long) As Range
    Dim rng As Range
    Set rng = ws.Cells(r, "M")
    Set rng = Union(rng, ws.Cells(r, "N"))
    Set rng = Union(rng, ws.Cells(r, "O"))
    Set rng = Union(rng, ws.Cells(r, "P"))
    Set rng = Union(rng, ws.Cells(r, "T"))
    Set rng = Union(rng, ws.Cells(r, "U"))
    Set rng = Union(rng, ws.Cells(r, "V"))
    Set rng = Union(rng, ws.Cells(r, "W"))
    Set rng = Union(rng, ws.Cells(r, "X"))
    Set rng = Union(rng, ws.Cells(r, "Z")) ' ★ Z 포함
    Set SourceUsedRange = rng
End Function

' === 공용 코어: 선택 행들을 지정 시트로 "출고"(검수/현장 공용) ===
' - 원본 데이터 범위: 선택은 M:Z 안에서만 허용(벗어나면 즉시 취소) ★
' - 데이터 유무/개별 처리 판단: (M,N,O,P,T,U,V,W,X,Z) 중 하나라도 값 있으면 처리 ★
' - 목적지: L:T (9열)
'   매핑:
'     L ← M
'     M ← N
'     N ← O
'     O ← (Q - T - U)  ' 계산값 (Q는 계산용이며 "데이터 유무" 판단에는 포함되지 않음)
'     P ← T
'     Q ← U
'     R ← V
'     S ← W
'     T ← X
' - 상태표시: 원본 Y열(yy-mm-dd hh:mm), 색칠: markColor (M:Z) ★
' - 기록: 원본 Z열 ← 보내는 곳(대상 시트명) ★
' - 기록: 목적지 시트 U열 ← 원본 시트명(추적용)
Private Sub 출고_선택행_복사_공용(ByVal destSheetName As String, ByVal labelText As String, ByVal markColor As Long)
    Const SRC_STATUS_COL As String = "Y"
    Const SKIP_IF_MARKED As Boolean = True
    Const CANCEL_IF_ANY_EMPTY As Boolean = True   ' 선택 행 중 "사용열" 완전 빈 행이 있으면 전체 취소

    Dim srcWs As Worksheet, dstWs As Worksheet
    Dim dict As Object, area As Range, rr As Range
    Dim rowsArr As Variant
    Dim i As Long, j As Long, r As Long
    Dim destRow As Long
    Dim tmp As Variant

    Dim sel As Range, onlyMZ As Range
    Dim createdDest As Boolean
    Dim cntSelected As Long, cntCopied As Long, cntEmpty As Long
    Dim listCopied As String, listEmpty As String
    Dim errMsg As String

    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set srcWs = Selection.Worksheet
    Set sel = Selection

    ' === 선택 범위를 M:Z로 한정(벗어나면 즉시 취소) === ★
    Set onlyMZ = Intersect(sel, srcWs.Range("M:Z"))

    ' 1) Intersect 결과 자체가 없음 → 즉시 취소
    If onlyMZ Is Nothing Then
        MsgBox "M~Z 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0) & vbCrLf & _
               "작업을 취소합니다.", vbExclamation, "선택 범위 제한"
        Exit Sub
    End If

    ' 2) Intersect는 생겼지만, 선택 전체와 일치하지 않음(바깥 셀 섞임) → 취소
    If onlyMZ.Cells.CountLarge <> sel.Cells.CountLarge Then
        MsgBox "선택 범위에 M~Z 밖의 셀이 포함되어 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0) & vbCrLf & _
               "M~Z 열 범위만 다시 선택한 뒤 실행하세요.", vbExclamation, "선택 범위 제한"
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
            MsgBox "선택한 행 중 이미 처리표시(Y열)가 있어 '" & labelText & "' 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & RowListSummary_(listBlocked, cntBlocked, 30), _
                   vbExclamation + vbOKOnly, labelText & " 중복 감지 - 작업 취소"
            Exit Sub
        End If
    End If

    ' === 사전 전체취소 검사: (M,N,O,P,T,U,V,W,X,Z)이 모두 빈 행이 하나라도 있으면 전체 취소 === ★
    If CANCEL_IF_ANY_EMPTY Then
        Dim cntEmptyPre As Long, listEmptyPre As String
        For i = LBound(rowsArr) To UBound(rowsArr)
            r = CLng(rowsArr(i))
            If Application.WorksheetFunction.CountA(SourceUsedRange(srcWs, r)) = 0 Then
                cntEmptyPre = cntEmptyPre + 1
                listEmptyPre = listEmptyPre & r & ","
            End If
        Next i
        If cntEmptyPre > 0 Then
            MsgBox "선택한 행 중 (M,N,O,P,T,U,V,W,X,Z)이 모두 빈 행이 포함되어 있어 '" & labelText & "' 작업을 취소합니다." & vbCrLf & _
                   "시트: " & srcWs.name & vbCrLf & _
                   "행: " & RowListSummary_(listEmptyPre, cntEmptyPre, 30), _
                   vbExclamation + vbOKOnly, "빈 행 감지 - 작업 취소"
            Exit Sub
        End If
    End If

    ' 대상 시트 준비
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

    ' Y열 표시 포맷 고정
    srcWs.Columns("Y").NumberFormat = "yy-mm-dd hh:mm"

    For i = LBound(rowsArr) To UBound(rowsArr)
        r = CLng(rowsArr(i))

        ' 개별 처리 여부: (M,N,O,P,T,U,V,W,X,Z) 중 하나라도 값 있으면 처리 ★
        If Application.WorksheetFunction.CountA(SourceUsedRange(srcWs, r)) > 0 Then
            Dim arr(1 To 1, 1 To 9) As Variant ' 목적지 L..T
            Dim vQ As Double, vT As Double, vU As Double, vW As Double

            ' 계산용 Q/T/U는 기존대로 사용
            vQ = ToDbl(srcWs.Cells(r, "Q").Value)
            vT = ToDbl(srcWs.Cells(r, "T").Value)
            vU = ToDbl(srcWs.Cells(r, "U").Value)
            vW = ToDbl(srcWs.Cells(r, "W").Value)

            ' 매핑 (L..T)
            arr(1, 1) = srcWs.Cells(r, "M").Value   ' L
            arr(1, 2) = srcWs.Cells(r, "N").Value   ' M
            arr(1, 3) = srcWs.Cells(r, "O").Value   ' N
            arr(1, 4) = vQ - vT - vU - vW           ' O = Q - T - U - W
            arr(1, 5) = srcWs.Cells(r, "T").Value   ' P
            arr(1, 6) = srcWs.Cells(r, "U").Value   ' Q
            arr(1, 7) = srcWs.Cells(r, "V").Value   ' R
            arr(1, 8) = srcWs.Cells(r, "W").Value   ' S
            arr(1, 9) = srcWs.Cells(r, "X").Value   ' T

            ' 목적지 L:T의 다음 빈 행
            destRow = NextEmptyRowInBlock(dstWs, "L", "T")

            ' 쓰기
            dstWs.Range("L" & destRow).Resize(1, 9).Value = arr

            ' M열 폰트 색상 → L열에 적용
            If srcWs.Cells(r, "M").Font.ColorIndex = xlColorIndexAutomatic Then
                dstWs.Cells(destRow, "L").Font.ColorIndex = xlColorIndexAutomatic
            Else
                dstWs.Cells(destRow, "L").Font.Color = srcWs.Cells(r, "M").Font.Color
            End If

            ' 목적지 시트 U열 ← 원본 시트명 기록(추적용)
            dstWs.Cells(destRow, "U").Value = srcWs.name

            ' 원본 상태표시/색칠/보내는곳 기록
            srcWs.Cells(r, SRC_STATUS_COL).Value = Now                      ' Y열 타임스탬프
            srcWs.Range("M" & r & ":Z" & r).Interior.Color = markColor      ' ★ 색칠 범위 M:Z
            srcWs.Cells(r, "Z").Value = destSheetName                        ' ★ Z열에 “보내는 곳(대상 시트명)” 기록

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

    ' 요약 팝업
    Dim msg As String
    msg = "[" & labelText & " 처리 결과]" & vbCrLf & _
          "원본 시트 : " & srcWs.name & vbCrLf & _
          "대상 시트 : " & destSheetName & IIf(createdDest, " (신규 생성)", "") & vbCrLf & _
          "선택 행(중복제거) : " & cntSelected & "개" & vbCrLf & _
          "출고 완료 : " & cntCopied & "개" & vbCrLf & _
          "무시(데이터 없음 사용열) : " & cntEmpty & "개" & vbCrLf & vbCrLf & _
          "■ 출고된 행: " & RowListSummary_(listCopied, cntCopied, 20) & vbCrLf & _
          "■ 비어있던 행: " & RowListSummary_(listEmpty, cntEmpty, 20)

    If Len(errMsg) > 0 Then
        msg = msg & vbCrLf & vbCrLf & "※ 오류: " & errMsg
        MsgBox msg, vbExclamation + vbOKOnly, labelText & " 처리(일부 오류)"
    Else
        MsgBox msg, vbInformation + vbOKOnly, labelText & " 처리 완료"
    End If
    Exit Sub

CleanFail:
    errMsg = Err.Description
    Resume CleanExit
End Sub

' ======================
' 래퍼 (검수출고 / 현장출고)
' ======================

' ? 검수출고(핑크: &HDCD1FF)
Public Sub 검수출고__기계():       출고_선택행_복사_공용 "검수(기계)", "검수출고", &HDCD1FF: End Sub
Public Sub 검수출고__볼():         출고_선택행_복사_공용 "검수(볼)", "검수출고", &HDCD1FF: End Sub
Public Sub 검수출고__양장():       출고_선택행_복사_공용 "검수(양장)", "검수출고", &HDCD1FF: End Sub
Public Sub 검수출고__캐스팅():     출고_선택행_복사_공용 "검수(캐스팅)", "검수출고", &HDCD1FF: End Sub
Public Sub 검수출고__조립14K():    출고_선택행_복사_공용 "검수(조립)14K", "검수출고", &HDCD1FF: End Sub
Public Sub 검수출고__캐스팅14K():  출고_선택행_복사_공용 "검수(캐스팅)14K", "검수출고", &HDCD1FF: End Sub

' ? 현장출고(표시색: &HF7EBDD)
Public Sub 현장출고__기계():       출고_선택행_복사_공용 "기계", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__양장():       출고_선택행_복사_공용 "양장", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__캐스팅():     출고_선택행_복사_공용 "캐스팅", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__개발():       출고_선택행_복사_공용 "개발", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__컷팅():       출고_선택행_복사_공용 "컷팅", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__조립14K():    출고_선택행_복사_공용 "조립14K", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__캐스팅14K():  출고_선택행_복사_공용 "캐스팅14K", "현장출고", &HF7EBDD: End Sub
Public Sub 현장출고__컷팅14K():    출고_선택행_복사_공용 "컷팅14K", "현장출고", &HF7EBDD: End Sub

