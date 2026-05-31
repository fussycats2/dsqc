Attribute VB_Name = "Module7"
Option Explicit

' ===== 설정값 =====
Const OUTPUT_START_ROW As Long = 13   ' ← 2에서 13으로 변경 (받는행 탐색 시작)
Const FILL_COLOR As Long = &HCCF2FF   ' RGB(255,242,204)


' 선택행들의 B~K(단 E 제외) 집계 후
' M~P, T~X에 기록하되, 항상 OUTPUT_START_ROW부터 아래로 내려가며
' 해당 행의 M:P 또는 T:X에 값이 하나라도 있으면 다음 행으로 이동,
' 둘 다 비어있는 첫 행에만 기록(덮어쓰기 없음).
' 규칙 요약:
' - B: "부서_날짜_숫자세자리[-숫자...]" 형식이면 접두부(부서_날짜_)로 묶음
'       · 고유 접미가 1개뿐이면 괄호 없이 원본 그대로 출력 (중복도 1개로)
'       · 고유 접미가 2개 이상이면 "접두부(접미,접미,…)" 형식으로 출력
'       · 그룹 간은 세미콜론(;)로 구분, 괄호 안은 콤마(,)로 구분
'       · 형식 불일치 값은 개별 항목으로 세미콜론으로 연결
' - C,H,I,J : 텍스트 중복 제거 → 콤마(공백 없음)
' - D,F,G,K : 전부 숫자면 합계, 섞이면 콤마 결합
' - K는 P열에 기록
' 보호:
' - 선택 범위는 반드시 A:L 안이어야 함(그 외 열 포함 시 취소)
' - 선택된 원본 행 중 A="완료"가 하나라도 있으면 전체 취소
' - 선택된 원본 행 중 **A:J**가 전부 빈 행이 하나라도 있으면 전체 취소
' 성공 시 원본 A="완료" 및 A:L 배경색 적용
Public Sub 선택행_BK_집계_차곡적재__MtoX출력_완료표시_TopDown()
    Dim ws As Worksheet
    Dim sel As Range, area As Range
    Dim rowsUnion As Range, r As Range
    Dim onlyAL As Range
    Dim outRow As Long
    Dim j As Long, idx As Long
    Dim arr As Variant, v As Variant, s As String

    ' 숫자 합/텍스트 결합용 (B~K = 10칸)
    Dim numSum(1 To 10) As Double
    Dim numericOnly(1 To 10) As Boolean
    Dim nonEmptyCnt(1 To 10) As Long
    Dim joinText(1 To 10) As String

    ' 항상 텍스트 취급 열(C=2, H=7, I=8, J=9) 중복 제거  ※B는 특별 처리
    Dim dict(1 To 10) As Object
    Dim textAlways(1 To 10) As Boolean

    ' === B열 전용 구조(접두부 그룹핑) ===
    ' bGroups(prefixWithUnderscore) = dict of suffix (e.g., "123" or "123-1-2") -> True
    ' bOthers(value)  = True (패턴 불일치 원본 값)
    Dim bGroups As Object, bOthers As Object

    Dim oldCalc As XlCalculation
    Dim outCol As Long

    ' === 원본 B열 색상 보존용 ===
    Dim hasBColor As Boolean
    Dim bIsAuto As Boolean
    Dim bColor As Long

    On Error GoTo EH

    If Not TypeOf ActiveSheet Is Worksheet Then
        MsgBox "워크시트에서 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set ws = ActiveSheet

    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    Set sel = Selection

    ' ===== 선택 범위 A:L 한정(2단계 체크) =====
    Set onlyAL = Intersect(sel, ws.Range("A:L"))
    If onlyAL Is Nothing Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~L 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    If onlyAL.CountLarge <> sel.CountLarge Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~L 열 범위 내 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & sel.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    ' ===== 선택 범위 검사 끝 =====

    ' 선택된 모든 영역의 "행 전체" 합집합
    For Each area In sel.Areas
        If rowsUnion Is Nothing Then
            Set rowsUnion = area.EntireRow
        Else
            Set rowsUnion = Union(rowsUnion, area.EntireRow)
        End If
    Next area

    If rowsUnion Is Nothing Then
        MsgBox "유효한 선택이 없습니다.", vbExclamation
        Exit Sub
    End If

    ' ===== 사전 점검 #1: A열 '완료' 포함 시 작업 취소 =====
    For Each r In rowsUnion.rows
        If Trim$(CStr(ws.Cells(r.Row, "A").Value)) = "완료" Then
            MsgBox "이미 작업된 행이 포함되어 있어 작업을 취소합니다." & vbCrLf & _
                   "예: " & r.Row & "행 (A열='완료')", vbExclamation
            Exit Sub
        End If
    Next r

    ' ===== 사전 점검 #2: A:J가 전부 빈 행이 하나라도 있으면 전량 취소 =====
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
    ' ===== 사전 점검 끝 =====

    ' ===== 본 처리 =====
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    oldCalc = Application.Calculation
    Application.Calculation = xlCalculationManual

    ' 초기화
    For idx = 1 To 10
        numericOnly(idx) = True
    Next idx

    ' 항상 텍스트 취급 열 지정: C, H, I, J  (B는 별도 처리)
    textAlways(2) = True ' C
    textAlways(7) = True ' H
    textAlways(8) = True ' I
    textAlways(9) = True ' J
    ' 중복 제거용 딕셔너리
    For idx = 1 To 10
        If textAlways(idx) Then
            Set dict(idx) = CreateObject("Scripting.Dictionary")
            On Error Resume Next
            dict(idx).CompareMode = vbTextCompare
            On Error GoTo EH
        End If
    Next idx

    ' B열 전용 구조체 초기화
    Set bGroups = CreateObject("Scripting.Dictionary")
    bGroups.CompareMode = vbTextCompare
    Set bOthers = CreateObject("Scripting.Dictionary")
    bOthers.CompareMode = vbTextCompare

    ' === 집계: 선택된 각 행의 B~K (E 제외) ===
    For Each r In rowsUnion.rows
        arr = ws.Cells(r.Row, "B").Resize(1, 10).Value  ' B~K

        For j = 1 To 10
            If j = 4 Then GoTo NextJ  ' E열 제외

            v = arr(1, j)
            If Not IsError(v) Then
                s = Trim$(CStr(v))
                If s <> "" Then
                    nonEmptyCnt(j) = nonEmptyCnt(j) + 1

                    If j = 1 Then
                        ' --- 첫 번째로 만나는 B의 글자색 캡처 ---
                        If Not hasBColor Then
                            If ws.Cells(r.Row, "B").Font.ColorIndex = xlColorIndexAutomatic Then
                                bIsAuto = True
                            Else
                                bIsAuto = False
                                bColor = ws.Cells(r.Row, "B").Font.Color
                            End If
                            hasBColor = True
                        End If

                        ' === B열: "부서_날짜_접미" 패턴 추출 ===
                        Dim pf As String, suf As String
                        If ExtractDeptDatePrefixSuffix(s, pf, suf) Then
                            Dim subDict As Object
                            If Not bGroups.Exists(pf) Then
                                Set subDict = CreateObject("Scripting.Dictionary")
                                subDict.CompareMode = vbTextCompare
                                bGroups.Add pf, subDict
                            Else
                                Set subDict = bGroups(pf)
                            End If
                            If Not subDict.Exists(suf) Then subDict.Add suf, True  ' 고유 접미만
                        Else
                            If Not bOthers.Exists(s) Then bOthers.Add s, True       ' 패턴 불일치 원본값
                        End If

                    ElseIf textAlways(j) Then
                        ' C,H,I,J : 텍스트 중복 제거
                        If Not dict(j).Exists(s) Then dict(j).Add s, True

                    Else
                        ' D, F, G, K : 전부 숫자면 합계, 아니면 콤마 결합
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

    ' === 출력 행 결정: 항상 OUTPUT_START_ROW부터 아래로, 비어있는 첫 행 ===
    outRow = NextFreeOutputRowFromTop(ws, OUTPUT_START_ROW)

    ' === 쓰기: B~K(1~10) → 매핑 위치 (E 제외, K→P) ===
    For idx = 1 To 10
        If idx <> 4 Then ' E 제외
            outCol = OutColByIndex_Mapping(idx)
            If outCol > 0 Then

                If idx = 1 Then
                    ' ----- B → M : 접두부 그룹핑 규칙 출력 -----
                    Dim resultB As String
                    resultB = BuildBOutput_Grouped(bGroups, bOthers)  ' 규칙 반영
                    If resultB <> "" Then
                        ws.Cells(outRow, outCol).Value = resultB
                        ' --- 원본 B의 색상을 M에 적용 ---
                        If hasBColor Then
                            If bIsAuto Then
                                ws.Cells(outRow, outCol).Font.ColorIndex = xlColorIndexAutomatic
                            Else
                                ws.Cells(outRow, outCol).Font.Color = bColor
                            End If
                        End If
                    End If

                ElseIf textAlways(idx) Then
                    If Not dict(idx) Is Nothing Then
                        Dim joined As String
                        joined = DictKeysJoined(dict(idx))
                        If joined <> "" Then ws.Cells(outRow, outCol).Value = joined
                    End If

                Else
                    If nonEmptyCnt(idx) > 0 Then
                        If numericOnly(idx) Then
                            ws.Cells(outRow, outCol).Value = numSum(idx)
                        Else
                            ws.Cells(outRow, outCol).Value = joinText(idx)
                        End If
                    End If
                End If

            End If
        End If
    Next idx

    ' === 완료 표시 & 색상 적용 ===
    For Each r In rowsUnion.rows
        ws.Cells(r.Row, "A").Value = "완료"
        ws.Cells(r.Row, "A").Resize(1, 12).Interior.Color = FILL_COLOR ' A~L
    Next r

    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    MsgBox "집계 및 적재 완료." & vbCrLf & _
           "- 출력 행: " & outRow & "행 (OUTPUT_START_ROW부터 위→아래 순서로 적재)" & vbCrLf & _
           "- Q~S는 기존 데이터 유지", vbInformation
    Exit Sub

EH:
    On Error Resume Next
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "오류: " & Err.Description, vbExclamation
End Sub

' =============== 보조 함수들 ===============

' 인덱스(1~10 = B~K) → 출력 열 번호
' 매핑: B→M(13), C→N(14), D→O(15), (E 제외), F→T(20), G→U(21),
'       H→V(22), I→W(23), J→X(24), K→P(16)
Private Function OutColByIndex_Mapping(ByVal idx As Long) As Long
    Select Case idx
        Case 1: OutColByIndex_Mapping = 13  ' M
        Case 2: OutColByIndex_Mapping = 14  ' N
        Case 3: OutColByIndex_Mapping = 15  ' O
        Case 4: OutColByIndex_Mapping = 0   ' (E 제외)
        Case 5: OutColByIndex_Mapping = 20  ' T
        Case 6: OutColByIndex_Mapping = 21  ' U
        Case 7: OutColByIndex_Mapping = 22  ' V
        Case 8: OutColByIndex_Mapping = 23  ' W
        Case 9: OutColByIndex_Mapping = 24  ' X
        Case 10: OutColByIndex_Mapping = 16 ' P (K는 P)
        Case Else
            OutColByIndex_Mapping = 0
    End Select
End Function

' 해당 행의 M:P, T:X 값이 전부 "비어있는지" 검사
Private Function IsOutputRowFree(ByVal ws As Worksheet, ByVal r As Long) As Boolean
    Dim rng As Range, c As Range
    Set rng = Union(ws.Range(ws.Cells(r, "M"), ws.Cells(r, "P")), _
                    ws.Range(ws.Cells(r, "T"), ws.Cells(r, "X")))
    For Each c In rng.Cells
        If LenB(CStr(c.Value2)) > 0 Then
            IsOutputRowFree = False
            Exit Function
        End If
    Next
    IsOutputRowFree = True
End Function

' OUTPUT_START_ROW부터 아래로 내려가며 둘 다 빈 첫 행
Private Function NextFreeOutputRowFromTop(ByVal ws As Worksheet, ByVal startFrom As Long) As Long
    Dim r As Long
    r = startFrom
    Do While Not IsOutputRowFree(ws, r)
        r = r + 1
    Loop
    NextFreeOutputRowFromTop = r
End Function

' 사전 키들을 콤마로 이어 반환(가나다/알파 정렬)
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

' 문자열 배열 오름차순 정렬
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

' 접미(예: "123" 또는 "123-1-2")들 정렬: 3자리 숫자 → 그 뒤 문자열 사전식
Private Sub SortSuffixes(ByRef arr As Variant)
    Dim i As Long, j As Long, a As String, b As String
    Dim pa As Long, pb As Long, ra As String, RB As String
    For i = LBound(arr) To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            a = CStr(arr(i)): b = CStr(arr(j))
            pa = CLng(Left$(a, 3)): pb = CLng(Left$(b, 3))
            ra = Mid$(a, 4): RB = Mid$(b, 4)  ' 예: "", "-1-2"
            If (pa > pb) Or (pa = pb And StrComp(ra, RB, vbTextCompare) > 0) Then
                arr(i) = b: arr(j) = a
            End If
        Next j
    Next i
End Sub

' s가 "부서_날짜_접미" 형식인지 검사하여 접두부/접미 반환
' 접미는 "숫자세자리" + 선택적 반복(" - 숫자한자리")
Private Function ExtractDeptDatePrefixSuffix(ByVal s As String, ByRef prefix_ As String, ByRef suffix_ As String) As Boolean
    Dim p As Long, i As Long
    s = Trim$(s)
    p = InStrRev(s, "_")
    If p = 0 Then Exit Function              ' '_'가 최소 1개 있어야 함
    suffix_ = Mid$(s, p + 1)
    If Not IsValidSuffixPattern(suffix_) Then Exit Function
    prefix_ = Left$(s, p)                    ' 접두부는 '…_'까지 포함
    ExtractDeptDatePrefixSuffix = True
End Function

' 접미 패턴: 3자리 숫자 + ( - 1자리 숫자 ) 반복
Private Function IsValidSuffixPattern(ByVal suf As String) As Boolean
    Dim i As Long
    If Len(suf) < 3 Then Exit Function
    ' 처음 3자리는 모두 숫자
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

' B열 집계 결과를 규칙대로 문자열 생성
' · 접두부별 고유 접미가 1개 → 괄호 없이 "접두부 & 접미" 원본 형태
' · 2개 이상 → "접두부(접미,접미,…)"
' · 패턴 불일치 값은 세미콜론으로 이어붙임
Private Function BuildBOutput_Grouped(ByVal bGroups As Object, ByVal bOthers As Object) As String
    Dim parts As String
    Dim pfArr() As String, i As Long
    Dim sufArr() As String, j As Long
    Dim k As Variant

    ' 1) 접두부 그룹 출력
    If bGroups.Count > 0 Then
        ReDim pfArr(0 To bGroups.Count - 1)
        i = 0
        For Each k In bGroups.Keys
            pfArr(i) = CStr(k)
            i = i + 1
        Next k
        SortStrings pfArr

        For i = LBound(pfArr) To UBound(pfArr)
            Dim groupStr As String
            With bGroups(pfArr(i))
                If .Count = 1 Then
                    ' 고유 접미 하나 → 괄호 없이 원본 그대로
                    groupStr = pfArr(i) & CStr(.Keys()(0))
                ElseIf .Count > 1 Then
                    ' 여러 개 → 괄호 안에 접미들을 정렬하여 콤마 나열
                    Dim t As Long
                    ReDim sufArr(0 To .Count - 1)
                    t = 0
                    For Each k In .Keys
                        sufArr(t) = CStr(k)
                        t = t + 1
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

    ' 2) 패턴 불일치 값들(그대로) 사전식으로 뒤에 추가
    If bOthers.Count > 0 Then
        Dim oArr() As String: ReDim oArr(0 To bOthers.Count - 1)
        i = 0
        For Each k In bOthers.Keys
            oArr(i) = CStr(k)
            i = i + 1
        Next k
        SortStrings oArr
        For i = LBound(oArr) To UBound(oArr)
            If parts <> "" Then parts = parts & ";"
            parts = parts & oArr(i)
        Next i
    End If

    BuildBOutput_Grouped = parts
End Function


