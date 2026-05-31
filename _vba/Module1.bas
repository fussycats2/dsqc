Attribute VB_Name = "Module1"
Option Explicit

' ★ 원본 행 표시 색 (노란색) ? 숫자 상수로 지정(= vbYellow = RGB(255,255,0))
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

' ===== A~K 열만 n행 아래로 삽입 (시트 전체 행 삽입 X) =====
Private Sub InsertDownAtoK(ByVal ws As Worksheet, ByVal baseRow As Long, ByVal n As Long)
    If n <= 0 Then Exit Sub
    Dim r1 As Long, r2 As Long
    r1 = baseRow + 1
    r2 = baseRow + n
    ' ★ 삽입 시 위(=원본 행) 서식을 상속
    ws.Range("A" & r1 & ":K" & r2).Insert Shift:=xlDown, CopyOrigin:=xlFormatFromLeftOrAbove
End Sub

' ===== 메인: 선택 행을 n개로 분할해서 D열로 세로 기입 =====
Public Sub SplitNumberByCount_Vertical()
    Dim ws As Worksheet
    Dim baseRow As Long
    Dim totalVal As Double
    Dim n As Long, i As Long
    Dim inputCount As String, inputParts As String
    Dim arr As Variant
    Dim parts() As Double
    Dim sumInput As Double, lastVal As Double, sumAll As Double, diff As Double, tmp As Double
    Dim baseId As String, newId As String
    Dim jVal As String
    Dim onlyAK As Range   ' 실제 범위는 A:K로 검사

    ' 그대로 복사할 열 목록(B, G, H, I)
    Dim colsToCarry As Variant, colName As Variant
    colsToCarry = Array("B", "G", "H", "I")

    Dim inserted As Boolean: inserted = False
    Dim delFrom As Long, delTo As Long

    ' ★ 원본 A열 폰트 색상 보존용
    Dim srcAIsAuto As Boolean
    Dim srcAColor As Long

    ' ★ 원본 D셀 서식 보존용
    Dim srcD As Range

    ' === 선택 및 범위 검증 ===
    If TypeName(Selection) <> "Range" Then
        MsgBox "셀을 선택한 후 실행하세요.", vbExclamation
        Exit Sub
    End If
    If Selection.Cells.CountLarge <> 1 Then
        MsgBox "A~K 범위의 '단일 셀'만 선택한 뒤 실행하세요." & vbCrLf & _
               "현재 선택: " & Selection.Address(0, 0), vbExclamation, "선택 오류"
        Exit Sub
    End If

    Set ws = Selection.Worksheet
    Set onlyAK = Intersect(Selection, ws.Range("A:K"))

    ' 1) Intersect 결과 없음 → 취소
    If onlyAK Is Nothing Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~K 열 범위 내의 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & Selection.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    ' 2) Intersect는 있지만 선택 전부와 일치하지 않음 → 취소
    If onlyAK.Cells.CountLarge <> Selection.Cells.CountLarge Then
        MsgBox "올바른 셀을 선택하세요." & vbCrLf & _
               "A~K 열 범위 내의 셀만 선택한 상태에서 실행할 수 있습니다." & vbCrLf & _
               "현재 선택: " & Selection.Address(0, 0), vbExclamation, "선택 범위 제한"
        Exit Sub
    End If
    ' === 선택 검증 끝 ===

    On Error GoTo Fail

    ' 1) 대상 행/시트 확정, 값은 **D열**에서만 사용
    baseRow = Selection.Row

    If Not IsNumeric(ws.Cells(baseRow, "D").Value) Then
        MsgBox "선택한 행의 D열 값이 숫자가 아닙니다.", vbExclamation
        Exit Sub
    End If
    totalVal = CDbl(ws.Cells(baseRow, "D").Value)

    ' J열 데이터 존재 시 작업 금지
    jVal = CStr(ws.Cells(baseRow, "J").Value2)
    If LenB(Trim$(jVal)) > 0 Then
        MsgBox "이미 투입 완료된 건입니다. (J열에 값이 있습니다) 작업을 취소합니다.", vbExclamation
        Exit Sub
    End If

    ' ★ 원본 A열 글자색 정보 확보(자동/수동 구분)
    If ws.Cells(baseRow, "A").Font.ColorIndex = xlColorIndexAutomatic Then
        srcAIsAuto = True
    Else
        srcAIsAuto = False
        srcAColor = ws.Cells(baseRow, "A").Font.Color
    End If

    ' ★ 원본 D셀 핸들 저장(서식 복사용)
    Set srcD = ws.Cells(baseRow, "D")

    ' 2) 개수 입력(삽입 전)
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

    ' 3) A:K 범위만 n행 아래로 밀기(삽입)
    Application.ScreenUpdating = False
    InsertDownAtoK ws, baseRow, n
    delFrom = baseRow + 1
    delTo = baseRow + n
    inserted = True

    ' === (중요) 삽입된 행들의 D열에 "원본 D셀의 전체 서식" 복사 ===
    srcD.Copy
    ws.Range("D" & delFrom & ":D" & delTo).PasteSpecial xlPasteFormats
    Application.CutCopyMode = False

    ' 4) (핵심) 삽입된 행들 A열에만 접미사 "-1 ~ -n" 부여 + 글자색 동일 적용
    baseId = Trim$(CStr(ws.Cells(baseRow, "A").Value))  ' 원본 A값 (원본은 변경 안 함)

    ' 새로 생긴 A열을 텍스트로 강제(자동 날짜 변환 방지)
    ws.Range("A" & delFrom & ":A" & delTo).NumberFormat = "@"

    Dim i2 As Long
    For i2 = 1 To n
        If baseId <> "" Then
            newId = baseId & "-" & CStr(i2)
        Else
            newId = CStr(i2)
        End If

        With ws.Cells(baseRow + i2, "A")
            .Value = newId
            ' ★ 원본 A열 글자색 복사
            If srcAIsAuto Then
                .Font.ColorIndex = xlColorIndexAutomatic
            Else
                .Font.Color = srcAColor
            End If
        End With
    Next i2

    ' 4-1) B, G, H, I 열 값 복사: 원본 값을 삽입된 행들에 동일하게
    For i = 1 To n
        For Each colName In colsToCarry
            ws.Cells(baseRow + i, CStr(colName)).Value = ws.Cells(baseRow, CStr(colName)).Value
        Next colName
    Next i

    ' 5) n=1 특례
    If n = 1 Then
        ws.Cells(baseRow + 1, "D").Value = totalVal
        ' ★ 서식 덮어쓰기 금지: NumberFormat 강제 지정하지 않음
        GoTo CLEAN_EXIT
    End If

    ' 6) 앞의 N-1개 값 입력받기
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

    ' 7) 마지막 값 자동 계산 및 반올림 오차 보정
    lastVal = Round(totalVal - sumInput, 2)
    parts(n) = lastVal

    sumAll = 0#
    For i = 1 To n
        sumAll = sumAll + parts(i)
    Next i
    diff = Round(totalVal - sumAll, 2)
    If Abs(diff) > 0 Then parts(n) = Round(parts(n) + diff, 2)

    ' 8) 삽입된 빈 칸(선택행 바로 아래 n행)에 세로 출력 (항상 D열)
    For i = 1 To n
        ws.Cells(baseRow + i, "D").Value = parts(i)
        ' ★ 서식 덮어쓰기 금지: NumberFormat 강제 지정하지 않음
    Next i

CLEAN_EXIT:
    ' ★ 성공적으로 끝난 경우: 원본 행 A:K 전체를 노란색으로 표시
    ws.Range("A" & baseRow & ":K" & baseRow).Interior.Color = CLR_ORG

    Application.ScreenUpdating = True
    Exit Sub

Fail:
    ' 오류/취소 시, 방금 삽입했던 A:K 영역을 롤백 (색칠은 하지 않음)
    On Error Resume Next
    If inserted Then
        ws.Range("A" & delFrom & ":K" & delTo).Delete Shift:=xlUp
    End If
    Application.ScreenUpdating = True
    On Error GoTo 0
End Sub


