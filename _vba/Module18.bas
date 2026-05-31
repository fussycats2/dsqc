Attribute VB_Name = "Module18"
' === Module: Mod_CloseAndRearrange ===
Option Explicit

' ==== 시작 행(헤더 아래 실제 데이터 시작 행) ====
Private Const START_ROW As Long = 13

' === 메인 진입점 ===
Public Sub 마감_백업_및_재배치()
    ' === 확인 팝업 ===
    Dim resp As VbMsgBoxResult
    resp = MsgBox("마감 처리하시겠습니까?", vbQuestion + vbYesNo + vbDefaultButton2, "마감 확인")
    If resp <> vbYes Then Exit Sub

    Dim appCalc As XlCalculation, scr As Boolean, evt As Boolean
    Dim wb As Workbook
    Set wb = ThisWorkbook
    
    ' 성능/안전 설정
    appCalc = Application.Calculation
    scr = Application.ScreenUpdating
    evt = Application.EnableEvents
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    
    On Error GoTo EH
    
    ' 1) 백업
    SaveBackupCopy wb
    
    ' 2) 시트별 처리
    Process_Group1 wb
    Process_Group2 wb
    Process_Raw wb       ' ← raw 처리(기존 유지)
    Process_Log wb

    MsgBox "마감 작업이 완료되었습니다.", vbInformation

Done:
    Application.ScreenUpdating = scr
    Application.EnableEvents = evt
    Application.Calculation = appCalc
    Exit Sub
EH:
    MsgBox "마감 중 오류: " & Err.Description, vbExclamation
    Resume Done
End Sub

' === 1) 백업 ===
Private Sub SaveBackupCopy(ByVal wb As Workbook)
    Dim base As String, p As String, fn As String
    p = wb.Path
    If Len(p) = 0 Then
        Err.Raise vbObjectError + 101, , "이 통합문서는 아직 저장되지 않았습니다. 먼저 파일을 한 번 저장해주세요."
    End If
    base = Format(Date, "yy.mm.dd") & "마감.xlsm"  ' YY.MM.DD마감.xlsm
    fn = p & Application.PathSeparator & base
    If Dir(fn, vbNormal) <> "" Then
        ' 이미 있으면 시/분/초 붙여 중복 방지
        base = Format(Date, "yy.mm.dd") & "_" & Format(Time, "hhmmss") & "마감.xlsm"
        fn = p & Application.PathSeparator & base
    End If
    wb.SaveCopyAs fn
End Sub

' === 2-1) Group1 처리 ===
' 행1~(START_ROW-1) 보존, A:X 내용 삭제, A:U 채우기색 제거, Y열 이후는 그대로
Private Sub Process_Group1(ByVal wb As Workbook)
    Dim arr, nm As Variant, ws As Worksheet, lastR As Long
    arr = Array("기계", "양장", "캐스팅", "개발", "컷팅", _
                "조립14K", "캐스팅14K", "컷팅14K", _
                "검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)", _
                "검수(조립)14K", "검수(캐스팅)14K")
    For Each nm In arr
        If SheetExists(wb, CStr(nm)) Then
            Set ws = wb.Worksheets(CStr(nm))
            lastR = GetLastRowAll(ws)
            If lastR >= START_ROW Then
                On Error Resume Next
                ws.Range("A" & START_ROW & ":X" & lastR).ClearContents
                ws.Range("A" & START_ROW & ":U" & lastR).Interior.Pattern = xlNone
                On Error GoTo 0
            End If
        End If
    Next nm
End Sub

' === 2-2) Group2 처리 ===
' (연마*, 뻥*, 빠우*) 규칙
' - 헤더(~START_ROW-1) 보존
' - A열이 "완료"가 아닌 행들의 B:L 값을 START_ROW부터 빈행 없이 재배치(값만)
' - A열이 "완료"인 행은 A:L 값/채우기색 삭제
' - M:Z 전부 값/텍스트/채우기색 삭제
'   단, R,S는 "수식만 유지"(상수만 삭제), 채우기색은 제거
Private Sub Process_Group2(ByVal wb As Workbook)
    Dim arr, nm As Variant, ws As Worksheet
    arr = Array( _
        "연마(조립)", "연마(캐스팅)", "연마(조립)14K", "연마(캐스팅)14K", _
        "뻥(기계)", "뻥(양장)", "뻥(캐스팅)", "뻥(개발)", _
        "뻥(조립)14K", "뻥(캐스팅)14K", _
        "빠우(양장볼)", "빠우(할로우)", "빠우(기계)", "빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", "빠우(초광-조립)", "빠우(초광-캐스팅)", "빠우(개발)", _
        "빠우(조립)14K", "빠우(패션반지)14K", "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", "빠우(초광-조립)14K", "빠우(초광-캐스팅)14K" _
    )
    For Each nm In arr
        If SheetExists(wb, CStr(nm)) Then
            Set ws = wb.Worksheets(CStr(nm))
            Compact_And_Clear ws
        End If
    Next nm
End Sub

' === 완료 행 먼저 정리 후 재배치 ===
Private Sub Compact_And_Clear(ByVal ws As Worksheet)
    Dim lastR As Long, r As Long, dest As Long
    Dim dataList As Collection
    Dim v As Variant

    lastR = GetLastRowAll(ws)
    If lastR < START_ROW Then Exit Sub

    Set dataList = New Collection

    ' 1) 스냅샷: A<>"완료" & B:L 중 값 있는 행만 담기
    For r = START_ROW To lastR
        If Trim$(CStr(ws.Cells(r, "A").Value)) <> "완료" Then
            If Application.WorksheetFunction.CountA(ws.Range("B" & r & ":L" & r)) > 0 Then
                dataList.Add ws.Range("B" & r & ":L" & r).Value ' 1x11 배열
            End If
        End If
    Next r

    ' 2) 완료 행 정리
    For r = START_ROW To lastR
        If Trim$(CStr(ws.Cells(r, "A").Value)) = "완료" Then
            ws.Range("A" & r & ":L" & r).ClearContents
            ws.Range("A" & r & ":L" & r).Interior.Pattern = xlNone
        End If
    Next r

    ' 3) B:L 비우고 4) 차곡차곡 붙이기
    ws.Range("B" & START_ROW & ":L" & lastR).ClearContents
    dest = START_ROW
    For Each v In dataList
        ws.Range("B" & dest & ":L" & dest).Value = v
        dest = dest + 1
    Next v

    ' 5) M:Z 정리
    If lastR >= START_ROW Then
        On Error Resume Next
        ws.Range("R" & START_ROW & ":S" & lastR).SpecialCells(xlCellTypeConstants).ClearContents
        On Error GoTo 0
        ws.Range("R" & START_ROW & ":S" & lastR).Interior.Pattern = xlNone

        ws.Range("M" & START_ROW & ":Q" & lastR).ClearContents
        ws.Range("M" & START_ROW & ":Q" & lastR).Interior.Pattern = xlNone
        ws.Range("T" & START_ROW & ":Z" & lastR).ClearContents
        ws.Range("T" & START_ROW & ":Z" & lastR).Interior.Pattern = xlNone
    End If
End Sub

' === 2-3) raw: AC13->Y13, AC15->Y15 (값만) ===
Private Sub Process_Raw(ByVal wb As Workbook)
    If Not SheetExists(wb, "raw") Then Exit Sub
    With wb.Worksheets("raw")
        .Range("Y" & START_ROW).Value = .Range("AC" & START_ROW).Value
        .Range("Y" & (START_ROW + 2)).Value = .Range("AC" & (START_ROW + 2)).Value
    End With
End Sub

' === 2-4) 입출로그: 첫 행(헤더) 빼고 모두 비우기(내용/서식) ===
Private Sub Process_Log(ByVal wb As Workbook)
    If Not SheetExists(wb, "입출로그") Then Exit Sub
    Dim ws As Worksheet, lastR As Long
    Set ws = wb.Worksheets("입출로그")
    lastR = GetLastRowAll(ws)
    If lastR >= 2 Then
        ws.rows("2:" & lastR).Clear ' 내용+서식(채우기색 포함) 제거
    End If
End Sub

' === 유틸: 시트 존재 ===
Private Function SheetExists(ByVal wb As Workbook, ByVal nm As String) As Boolean
    On Error Resume Next
    SheetExists = Not wb.Worksheets(nm) Is Nothing
    On Error GoTo 0
End Function

' === 유틸: 마지막 사용 행 ===
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




