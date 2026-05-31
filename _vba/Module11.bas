Attribute VB_Name = "Module11"
Option Explicit

' 원본 행 강조 색 (노란색)
Private Const CLR_ORG As Long = 65535

' ===== 안전 숫자 변환 유틸 =====
Private Function TryCLngSilent(ByVal s As String, ByRef outVal As Long) As Boolean
    If Trim$(s) = "" Then Exit Function
    If Not IsNumeric(s) Then Exit Function
    If CLng(VBA.val(s)) <> VBA.val(s) Then Exit Function
    outVal = CLng(VBA.val(s))
    TryCLngSilent = True
End Function

Private Function TryCDblSilent(ByVal s As String, ByRef outVal As Double) As Boolean
    If Trim$(s) = "" Then Exit Function
    If Not IsNumeric(s) Then Exit Function
    outVal = CDbl(VBA.val(s))
    TryCDblSilent = True
End Function

' ===== A~L열만 아래로 n행 삽입(시트 전체 행 삽입 X) =====
Private Sub InsertDownAtoL(ByVal ws As Worksheet, ByVal baseRow As Long, ByVal n As Long)
    If n <= 0 Then Exit Sub
    Dim r1 As Long, r2 As Long
    r1 = baseRow + 1
    r2 = baseRow + n
    ' 삽입 시 위(=원본 행) 서식 상속
    ws.Range("A" & r1 & ":L" & r2).Insert Shift:=xlDown, CopyOrigin:=xlFormatFromLeftOrAbove
End Sub

' === v2 (수정): 기준열 K, 삽입범위 A~L, C/E/H/I/J/L 값 복사, 번호 채우기는 B열 ===
Public Sub SplitNumberByCount_Vertical_v2()
    Dim ws As Worksheet
    Dim baseRow As Long
    Dim totalVal As Double
    Dim n As Long, i As Long
    Dim inputCount As String, inputParts As String
    Dim arr As Variant
    Dim parts() As Double
    Dim sumInput As Double, lastVal As Double, sumAll As Double, diff As Double, tmp As Double
    Dim baseId As String, newId As String
    Dim colsToCarry As Variant, colName As Variant
    Dim onlyAL As Range

    Dim inserted As Boolean: inserted = False
    Dim delFrom As Long, delTo As Long

    ' 원본 B열 폰트 색상 보존용
    Dim srcBIsAuto As Boolean
    Dim srcBColor As Long

    ' 원본 K셀 서식 보존용(삽입된 K영역에 복사)
    Dim srcK As Range

    ' === 선택 검증: A~L 내 단일 셀만 허용 ===
    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    If Selection.CountLarge <> 1 Then
        MsgBox "A~L 범위의 '단일 셀'만 선택한 뒤 실행하세요." & vbCrLf & _
               "현재 선택: " & Selection.Address(0, 0), vbExclamation, "선택 오류"
        Exit Sub
    End If

    Set ws = Selection.Worksheet
    Set onlyAL = Intersect(Selection, ws.Range("A:L"))
    If onlyAL Is Nothing Then
        MsgBox "A~L 범위 내의 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & Selection.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If

    On Error GoTo Fail

    baseRow = Selection.Row

    ' === 기준값: K열(숫자 필수) ===
    If Not IsNumeric(ws.Cells(baseRow, "K").Value) Then
        MsgBox "선택한 행의 K열 값이 숫자가 아닙니다.", vbExclamation
        Exit Sub
    End If
    totalVal = CDbl(ws.Cells(baseRow, "K").Value)

    ' 원본 B열 폰트 색 가져오기(자동/수동)
    If ws.Cells(baseRow, "B").Font.ColorIndex = xlColorIndexAutomatic Then
        srcBIsAuto = True
    Else
        srcBIsAuto = False
        srcBColor = ws.Cells(baseRow, "B").Font.Color
    End If

    ' 원본 K셀 핸들(서식 복사용)
    Set srcK = ws.Cells(baseRow, "K")

    ' === 분할 개수 입력 ===
    inputCount = InputBox("몇 개로 나눌까요? (예: 3, 4, 5 ...)", "분할 개수 입력", 3)
    If inputCount = "" Then Exit Sub
    If Not TryCLngSilent(inputCount, n) Then
        MsgBox "올바른 정수를 입력하세요.", vbExclamation
        Exit Sub
    End If
    If n < 1 Then
        MsgBox "개수는 1 이상이어야 합니다.", vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False

    ' === A:L 범위만 n행 삽입 ===
    InsertDownAtoL ws, baseRow, n
    delFrom = baseRow + 1
    delTo = baseRow + n
    inserted = True

    ' === 삽입된 K열에 "원본 K셀의 전체 서식" 복사 (원본 K의 값/서식은 그대로, 새 행만 서식 적용)
    srcK.Copy
    ws.Range("K" & delFrom & ":K" & delTo).PasteSpecial xlPasteFormats
    Application.CutCopyMode = False

    ' === 번호 채우기: B열 (원본 B값 접두 + "-1" ~ "-n")
    baseId = Trim$(CStr(ws.Cells(baseRow, "B").Value))
    ' 새로 생긴 B열 텍스트 형식(자동 날짜 변환 방지)
    ws.Range("B" & delFrom & ":B" & delTo).NumberFormat = "@"

    For i = 1 To n
        If baseId <> "" Then
            newId = baseId & "-" & CStr(i)
        Else
            newId = CStr(i)
        End If

        With ws.Cells(baseRow + i, "B")
            .Value = newId
            If srcBIsAuto Then
                .Font.ColorIndex = xlColorIndexAutomatic
            Else
                .Font.Color = srcBColor
            End If
        End With
    Next i

    ' === 지정 열 값 복사(C, E, H, I, J, L)
    colsToCarry = Array("C", "E", "H", "I", "J", "L")
    For i = 1 To n
        For Each colName In colsToCarry
            ws.Cells(baseRow + i, CStr(colName)).Value = ws.Cells(baseRow, CStr(colName)).Value
        Next colName
    Next i

    ' === n = 1 특례: 전체값 그대로 K에 입력 (서식 덮어쓰기 금지)
    If n = 1 Then
        ws.Cells(baseRow + 1, "K").Value = totalVal
        ' ★ NumberFormat 강제 지정 금지 (K열 서식 유지)
        GoTo CLEAN_EXIT
    End If

    ' === 앞의 N-1개 값 입력
    inputParts = InputBox("앞의 " & (n - 1) & "개 값을 쉼표로 입력하세요." & vbCrLf & _
                          "예) 3,4  (총합 10, 개수 3이면 마지막은 자동 3)", "부분값 입력")
    If Trim$(inputParts) = "" Then GoTo Fail

    arr = Split(inputParts, ",")
    If UBound(arr) - LBound(arr) + 1 <> n - 1 Then
        MsgBox "값의 개수가 " & (n - 1) & "개가 아닙니다.", vbExclamation
        GoTo Fail
    End If

    ReDim parts(1 To n)
    sumInput = 0#
    For i = 1 To n - 1
        If Not TryCDblSilent(Trim$(arr(i - 1)), tmp) Then
            MsgBox "숫자 형식이 올바르지 않습니다: " & Trim$(arr(i - 1)), vbExclamation
            GoTo Fail
        End If
        parts(i) = tmp
        sumInput = sumInput + parts(i)
    Next i

    ' === 마지막 값 자동 계산 + 반올림 오차 보정
    lastVal = Round(totalVal - sumInput, 2)
    parts(n) = lastVal

    sumAll = 0#
    For i = 1 To n
        sumAll = sumAll + parts(i)
    Next i
    diff = Round(totalVal - sumAll, 2)
    If Abs(diff) > 0 Then parts(n) = Round(parts(n) + diff, 2)

    ' === 삽입된 n행의 K열에 세로 출력 (서식 덮어쓰기 금지)
    For i = 1 To n
        ws.Cells(baseRow + i, "K").Value = parts(i)
        ' ★ NumberFormat 강제 지정 금지
    Next i

CLEAN_EXIT:
    ' 원본 행 A:L 전체 노란색
    ws.Range("A" & baseRow & ":L" & baseRow).Interior.Color = CLR_ORG

    Application.ScreenUpdating = True
    Exit Sub

Fail:
    ' 오류/취소 시 롤백
    On Error Resume Next
    If inserted Then
        ws.Range("A" & delFrom & ":L" & delTo).Delete Shift:=xlUp
    End If
    Application.ScreenUpdating = True
    On Error GoTo 0
End Sub



