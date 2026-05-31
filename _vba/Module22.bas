Attribute VB_Name = "Module22"
Option Explicit

' ===== 메인 =====
Public Sub 선택행_BK_단순집계_한행작성_원본삭제__AL한정()
    Dim ws As Worksheet
    Dim sel As Range, area As Range
    Dim rowsUnion As Range, r As Range
    Dim onlyAL As Range
    Dim j As Long, idx As Long
    Dim arr As Variant, v As Variant, s As String

    ' 숫자 합/텍스트 결합용 (B~L = 11칸, 단 E 제외)
    Dim numSum(1 To 11) As Double
    Dim numericOnly(1 To 11) As Boolean
    Dim nonEmptyCnt(1 To 11) As Long
    Dim joinText(1 To 11) As String

    ' 항상 텍스트 취급 열: C(2), H(7), J(9), L(11)  ※ I(8)은 숫자 합산
    Dim dict(1 To 11) As Object
    Dim textAlways(1 To 11) As Boolean

    ' B열 전용 구조
    Dim bGroups As Object, bOthers As Object

    Dim oldCalc As XlCalculation
    Dim outCol As Long

    ' 삭제/삽입을 위한 행 번호 수집
    Dim minRow As Long, maxRow As Long
    Dim rowArr() As Long, rowCnt As Long
    Dim rr As Range, k As Long

    ' 출력값 버퍼(열번호 → 값)
    Dim outValues As Object

    ' 출력행(삽입 위치)
    Dim outRow As Long

    On Error GoTo EH

    If Not TypeOf ActiveSheet Is Worksheet Then
        MsgBox "워크시트에서 실행하세요.", vbExclamation: Exit Sub
    End If
    Set ws = ActiveSheet

    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation: Exit Sub
    End If
    Set sel = Selection

    ' ===== 선택 범위 A:L 한정 =====
    Set onlyAL = Intersect(sel, ws.Range("A:L"))
    If onlyAL Is Nothing Or onlyAL.CountLarge <> sel.CountLarge Then
        MsgBox "A~L 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If

    ' 선택된 모든 영역의 "행 전체" 합집합
    For Each area In sel.Areas
        If rowsUnion Is Nothing Then
            Set rowsUnion = area.EntireRow
        Else
            Set rowsUnion = Union(rowsUnion, area.EntireRow)
        End If
    Next area
    If rowsUnion Is Nothing Then
        MsgBox "유효한 선택이 없습니다.", vbExclamation: Exit Sub
    End If

    ' ===== 사전 점검 #1: A열에 값 있는 행 포함 시 취소 =====
    For Each r In rowsUnion.rows
        If LenB(CStr(ws.Cells(r.Row, "A").Value2)) > 0 Then
            MsgBox "A열에 값이 있는 행이 포함되어 있어 작업을 취소합니다." & vbCrLf & _
                   "예: " & r.Row & "행 (A='" & CStr(ws.Cells(r.Row, "A").Value) & "')", vbExclamation
            Exit Sub
        End If
    Next r

    ' ===== 사전 점검 #2: A:J 전부 빈 행이 하나라도 있으면 취소 =====
    Dim cntEmptyPre As Long, listShow As String, showLimit As Long, shown As Long
    showLimit = 30: shown = 0
    For Each r In rowsUnion.rows
        If Application.WorksheetFunction.CountA(ws.Range("A" & r.Row & ":J" & r.Row)) = 0 Then
            cntEmptyPre = cntEmptyPre + 1
            If shown < showLimit Then
                listShow = listShow & r.Row & ", "
                shown = shown + 1
            End If
        End If
    Next r
    If cntEmptyPre > 0 Then
        If Len(listShow) > 2 Then listShow = Left$(listShow, Len(listShow) - 2)
        MsgBox "선택한 행 중 A:J 범위가 모두 빈 행이 포함되어 있어 작업을 취소합니다." & vbCrLf & _
               "총 " & cntEmptyPre & "개" & IIf(cntEmptyPre > showLimit, " (앞 " & showLimit & "개만 표시)", "") & vbCrLf & _
               "행: " & listShow, vbExclamation
        Exit Sub
    End If

    ' ===== 본 처리 시작 =====
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    oldCalc = Application.Calculation
    Application.Calculation = xlCalculationManual

    ' 초기화
    For idx = 1 To 11
        numericOnly(idx) = True
    Next idx

    ' 항상 텍스트 취급 열: C, H, J, L
    textAlways(2) = True ' C
    textAlways(7) = True ' H
    textAlways(9) = True ' J
    textAlways(11) = True ' L  ' ★ L은 텍스트로 취급(중복 제거 → 콤마)
    For idx = 1 To 11
        If textAlways(idx) Then
            Set dict(idx) = CreateObject("Scripting.Dictionary")
            dict(idx).CompareMode = vbTextCompare
        End If
    Next idx

    ' B열 전용 구조체
    Set bGroups = CreateObject("Scripting.Dictionary")
    bGroups.CompareMode = vbTextCompare
    Set bOthers = CreateObject("Scripting.Dictionary")
    bOthers.CompareMode = vbTextCompare

    ' === 집계: 선택된 각 행의 B~L (E 제외) ===
    For Each r In rowsUnion.rows
        arr = ws.Cells(r.Row, "B").Resize(1, 11).Value  ' B~L

        For j = 1 To 11
            If j = 4 Then GoTo NextJ  ' E 제외

            v = arr(1, j)
            If Not IsError(v) Then
                s = Trim$(CStr(v))
                If s <> "" Then
                    nonEmptyCnt(j) = nonEmptyCnt(j) + 1

                    If j = 1 Then
                        ' === B: "부서_날짜_접미" 패턴 ===
                        Dim pf As String, suf As String, subDict As Object
                        If ExtractDeptDatePrefixSuffix(s, pf, suf) Then
                            If Not bGroups.Exists(pf) Then
                                Set subDict = CreateObject("Scripting.Dictionary")
                                subDict.CompareMode = vbTextCompare
                                bGroups.Add pf, subDict
                            Else
                                Set subDict = bGroups(pf)
                            End If
                            If Not subDict.Exists(suf) Then subDict.Add suf, True
                        Else
                            If Not bOthers.Exists(s) Then bOthers.Add s, True
                        End If

                    ElseIf textAlways(j) Then
                        ' C,H,J,L : 텍스트 중복 제거 후 콤마 나열
                        If Not dict(j).Exists(s) Then dict(j).Add s, True

                    Else
                        ' D, F, G, I, K : 전부 숫자면 합계, 섞이면 콤마 결합
                        If joinText(j) <> "" Then
                            joinText(j) = joinText(j) & "," & s
                        Else
                            joinText(j) = s
                        End If
                        If IsNumeric(v) Then
                            If numericOnly(j) Then numSum(j) = numSum(j) + CDbl(v)
                        Else
                            numericOnly(j) = False
                        End If
                    End If
                End If
            End If
NextJ:
        Next j
    Next r

    ' === 출력값 준비(원본 열 1:1 쓰기) ===
    Set outValues = CreateObject("Scripting.Dictionary")
    For idx = 1 To 11
        If idx <> 4 Then ' E 제외
            outCol = OutColByIndex_Mapping_1to1(idx) ' B→B, …, L→L
            If outCol > 0 Then
                If idx = 1 Then
                    Dim resultB As String
                    resultB = BuildBOutput_Grouped(bGroups, bOthers)
                    If resultB <> "" Then outValues(outCol) = resultB

                ElseIf textAlways(idx) Then
                    If Not dict(idx) Is Nothing Then
                        Dim joined As String
                        joined = DictKeysJoined(dict(idx))
                        If joined <> "" Then outValues(outCol) = joined
                    End If

                Else
                    If nonEmptyCnt(idx) > 0 Then
                        If numericOnly(idx) Then
                            outValues(outCol) = numSum(idx)
                        Else
                            outValues(outCol) = joinText(idx)
                        End If
                    End If
                End If
            End If
        End If
    Next idx

    ' === 삭제/삽입 대상 행 번호 수집 & min/max 계산 ===
    rowCnt = 0: maxRow = 0: minRow = 0
    For Each rr In rowsUnion.Areas
        For k = rr.Row To rr.Row + rr.rows.Count - 1
            rowCnt = rowCnt + 1
            ReDim Preserve rowArr(1 To rowCnt)
            rowArr(rowCnt) = k
            If minRow = 0 Then
                minRow = k
            ElseIf k < minRow Then
                minRow = k
            End If
            If k > maxRow Then maxRow = k
        Next k
    Next rr
    If rowCnt > 1 Then QuickSortLongDesc rowArr, 1, rowCnt  ' 내림차순

    ' === (1) 출력 행을 "선택 끝 바로 아래"에 A:L로 먼저 삽입 ===
    If maxRow >= rows.Count Then
        MsgBox "선택의 마지막 행이 시트 마지막 행입니다. 아래에 새 행(A:L)을 삽입할 수 없습니다.", vbExclamation
        GoTo TidyExit
    End If
    outRow = maxRow + 1
    With ws.Range("A" & outRow & ":L" & outRow)
        .Insert Shift:=xlDown, CopyOrigin:=xlFormatFromRightOrBelow
        .ClearFormats        ' 새 행 서식 초기화
        .ClearContents
    End With

    ' === (2) 결과 먼저 쓰기 (outValues는 열 번호 기준; 2=B … 12=L)
    Dim key As Variant
    For Each key In outValues.Keys
        ws.Cells(outRow, CLng(key)).Value = outValues(key)
    Next key

    ' === (3) 원본 삭제: A:L 범위를 행 단위로 아래→위 삭제 ===
    Dim delRow As Long
    Dim k2 As Long
    For k2 = 1 To rowCnt
        delRow = rowArr(k2)
        ws.Range("A" & delRow & ":L" & delRow).Delete Shift:=xlUp
    Next k2

    ' === (4) 마무리 청소: A:L이 전부 빈 "중간 빈 행" 압축 삭제 ===
    '     - 삭제 전후로 생길 수 있는 구멍을 한 번에 제거
    '     - 스윕 범위: minRow ~ (outRow + rowCnt + 여유)
    Dim sweepEnd As Long
    sweepEnd = Application.Min(ws.rows.Count, outRow + rowCnt + 10)
    Call CompactEmptyRowsAL(ws, minRow, sweepEnd)

TidyExit:
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    MsgBox "단순 집계 완료." & vbCrLf & _
           "- 원본 행은 A:L 범위만 행 단위로 삭제되었습니다." & vbCrLf & _
           "- 결괏값은 A:L로 삽입된 새 행에 기록되었으며, 최종 위치는 " & minRow & "행입니다." & vbCrLf & _
           "- 중간에 남은 A:L 빈 행은 추가로 압축 삭제했습니다.", vbInformation
    Exit Sub

EH:
    On Error Resume Next
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "오류: " & Err.Description, vbExclamation
End Sub

' ===== B~L 인덱스(1~11 = B~L) → "원본과 동일 열" 1:1 매핑 =====
Private Function OutColByIndex_Mapping_1to1(ByVal idx As Long) As Long
    Select Case idx
        Case 1: OutColByIndex_Mapping_1to1 = 2   ' B
        Case 2: OutColByIndex_Mapping_1to1 = 3   ' C
        Case 3: OutColByIndex_Mapping_1to1 = 4   ' D
        Case 4: OutColByIndex_Mapping_1to1 = 0   ' (E 제외)
        Case 5: OutColByIndex_Mapping_1to1 = 6   ' F
        Case 6: OutColByIndex_Mapping_1to1 = 7   ' G
        Case 7: OutColByIndex_Mapping_1to1 = 8   ' H
        Case 8: OutColByIndex_Mapping_1to1 = 9   ' I (숫자 합산)
        Case 9: OutColByIndex_Mapping_1to1 = 10  ' J
        Case 10: OutColByIndex_Mapping_1to1 = 11 ' K
        Case 11: OutColByIndex_Mapping_1to1 = 12 ' L (텍스트 중복 제거)
        Case Else
            OutColByIndex_Mapping_1to1 = 0
    End Select
End Function

' ===== 사전 키들을 콤마로 이어 반환(정렬) =====
Private Function DictKeysJoined(ByVal d As Object) As String
    Dim k As Variant, arr() As String, i As Long
    If d Is Nothing Then Exit Function
    If d.Count = 0 Then Exit Function
    ReDim arr(0 To d.Count - 1)
    i = 0
    For Each k In d.Keys
        arr(i) = CStr(k)
        i = i + 1
    Next k
    SortStrings arr
    DictKeysJoined = Join(arr, ",")
End Function

' ===== 문자열 배열 오름차순 정렬 =====
Private Sub SortStrings(ByRef arr As Variant)
    Dim i As Long, j As Long, t As String
    For i = LBound(arr) To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            If StrComp(arr(i), arr(j), vbTextCompare) > 0 Then
                t = arr(i): arr(i) = arr(j): arr(j) = t
            End If
        Next j
    Next i
End Sub

' ===== 접미 정렬(3자리 숫자 → 그 뒤 문자열 사전식) =====
Private Sub SortSuffixes(ByRef arr As Variant)
    Dim i As Long, j As Long, a As String, b As String
    Dim pa As Long, pb As Long, ra As String, RB As String
    For i = LBound(arr) To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            a = CStr(arr(i)): b = CStr(arr(j))
            pa = CLng(Left$(a, 3)): pb = CLng(Left$(b, 3))
            ra = Mid$(a, 4): RB = Mid$(b, 4)
            If (pa > pb) Or (pa = pb And StrComp(ra, RB, vbTextCompare) > 0) Then
                arr(i) = b: arr(j) = a
            End If
        Next j
    Next i
End Sub

' ===== B 패턴 추출 =====
Private Function ExtractDeptDatePrefixSuffix(ByVal s As String, ByRef prefix_ As String, ByRef suffix_ As String) As Boolean
    Dim p As Long
    s = Trim$(s)
    p = InStrRev(s, "_")
    If p = 0 Then Exit Function
    suffix_ = Mid$(s, p + 1)
    If Not IsValidSuffixPattern(suffix_) Then Exit Function
    prefix_ = Left$(s, p) ' 접두부는 끝 '_' 포함
    ExtractDeptDatePrefixSuffix = True
End Function

' 3자리 숫자 + ("-" + 한 자리 숫자) 반복
Private Function IsValidSuffixPattern(ByVal suf As String) As Boolean
    Dim i As Long
    If Len(suf) < 3 Then Exit Function
    For i = 1 To 3
        If Mid$(suf, i, 1) < "0" Or Mid$(suf, i, 1) > "9" Then Exit Function
    Next i
    i = 4
    Do While i <= Len(suf)
        If Mid$(suf, i, 1) <> "-" Then Exit Function
        If i + 1 > Len(suf) Then Exit Function
        If Mid$(suf, i + 1, 1) < "0" Or Mid$(suf, i + 1, 1) > "9" Then Exit Function
        i = i + 2
    Loop
    IsValidSuffixPattern = True
End Function

' ===== B열 그룹 출력 =====
Private Function BuildBOutput_Grouped(ByVal bGroups As Object, ByVal bOthers As Object) As String
    Dim parts As String
    Dim pfArr() As String, i As Long
    Dim sufArr() As String, t As Long
    Dim k As Variant, groupStr As String

    If bGroups.Count > 0 Then
        ReDim pfArr(0 To bGroups.Count - 1)
        i = 0
        For Each k In bGroups.Keys
            pfArr(i) = CStr(k): i = i + 1
        Next k
        SortStrings pfArr

        For i = LBound(pfArr) To UBound(pfArr)
            With bGroups(pfArr(i))
                If .Count = 1 Then
                    groupStr = pfArr(i) & CStr(.Keys()(0))
                ElseIf .Count > 1 Then
                    ReDim sufArr(0 To .Count - 1)
                    t = 0
                    For Each k In .Keys
                        sufArr(t) = CStr(k): t = t + 1
                    Next k
                    SortSuffixes sufArr
                    groupStr = pfArr(i) & "(" & Join(sufArr, ",") & ")"
                End If
            End With
            If groupStr <> "" Then
                If parts <> "" Then parts = parts & ";"
                parts = parts & groupStr
            End If
        Next i
    End If

    If bOthers.Count > 0 Then
        Dim oArr() As String
        ReDim oArr(0 To bOthers.Count - 1)
        i = 0
        For Each k In bOthers.Keys
            oArr(i) = CStr(k): i = i + 1
        Next k
        SortStrings oArr
        For i = LBound(oArr) To UBound(oArr)
            If parts <> "" Then parts = parts & ";"
            parts = parts & oArr(i)
        Next i
    End If

    BuildBOutput_Grouped = parts
End Function

' ===== Long 배열 내림차순 퀵소트(행 삭제 안전) =====
Private Sub QuickSortLongDesc(ByRef a() As Long, ByVal L As Long, ByVal r As Long)
    Dim i As Long, j As Long, pivot As Long, tmp As Long
    i = L: j = r
    pivot = a((L + r) \ 2)
    Do While i <= j
        Do While a(i) > pivot: i = i + 1: Loop
        Do While a(j) < pivot: j = j - 1: Loop
        If i <= j Then
            tmp = a(i): a(i) = a(j): a(j) = tmp
            i = i + 1: j = j - 1
        End If
    Loop
    If L < j Then QuickSortLongDesc a, L, j
    If i < r Then QuickSortLongDesc a, i, r
End Sub

' ===== 마무리 청소: A:L 완전 빈 행을 위로 당기며 제거 =====
Private Sub CompactEmptyRowsAL(ByVal ws As Worksheet, ByVal startRow As Long, ByVal endRow As Long)
    Dim r As Long, lastRow As Long
    If startRow < 1 Then startRow = 1
    If endRow > ws.rows.Count Then endRow = ws.rows.Count

    r = startRow
    Do While r <= endRow
        If Application.WorksheetFunction.CountA(ws.Range("A" & r & ":L" & r)) = 0 Then
            ws.Range("A" & r & ":L" & r).Delete Shift:=xlUp
            ' 삭제로 아래가 한 칸 올라왔으니 같은 r을 다시 검사
            endRow = endRow - 1
        Else
            r = r + 1
        End If
    Loop
End Sub


