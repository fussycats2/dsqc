Attribute VB_Name = "Module5"
Option Explicit

' ===== 사용자 설정 =====
Const MENU_SHEET As String = "메뉴"            ' 메뉴 시트 이름
Const TABLE_TOP_LEFT As String = "A1"          ' 매핑표 좌상단 (데이터는 A2:B..)
Const SPECIAL_SHEET_NAME_CELL As String = "A1" ' 특별케이스: 이동 대상 시트명 (예: 작성)
Const SPECIAL_BUTTON_NAME_CELL As String = "B1" ' 특별케이스: 버튼 표시명 (예: 주문작성)
Const SPECIAL_CATEGORIES_CELL As String = "C1"  ' 특별케이스: 작성 시트가 포함될 카테고리(예: 운영, 생산)
Const SPECIAL_EXTRA_SHEETS As String = "기계,양장,캐스팅,개발,컷팅,검수(기계),검수(볼),검수(양장),검수(캐스팅),조립14K,캐스팅14K,컷팅14K,검수(조립)14K,검수(캐스팅)14K" ' 주문작성 버튼 누를 때 함께 표시할 시트들"
' =======================

' ─────────────────────────────────────────────────────────────────
' 유틸: 문자열을 토큰들로 분해 (쉼표/세미콜론/슬래시/파이프/공백)
Private Function SplitTokens(ByVal s As String) As Collection
    Dim work As String, arr As Variant, i As Long, tok As String
    Set SplitTokens = New Collection
    
    work = Trim$(CStr(s))
    If Len(work) = 0 Then Exit Function
    
    work = Replace(work, ";", ",")
    work = Replace(work, "/", ",")
    work = Replace(work, "|", ",")
    work = Application.WorksheetFunction.Trim(work) ' 다중 공백 정리
    work = Replace(work, " ", ",")                  ' 공백 → 쉼표
    
    Do While InStr(work, ",,") > 0
        work = Replace(work, ",,", ",")
    Loop
    If Left$(work, 1) = "," Then work = Mid$(work, 2)
    If Right$(work, 1) = "," Then work = Left$(work, Len(work) - 1)
    If Len(work) = 0 Then Exit Function
    
    arr = Split(work, ",")
    On Error Resume Next
    For i = LBound(arr) To UBound(arr)
        tok = Trim$(CStr(arr(i)))
        If Len(tok) > 0 Then SplitTokens.Add tok
    Next i
    On Error GoTo 0
End Function

' 유틸: 특정 열 마지막 행
Private Function LastRowIn(ByVal ws As Worksheet, ByVal col As Long) As Long
    With ws
        If Application.WorksheetFunction.CountA(.Columns(col)) = 0 Then
            LastRowIn = 1
        Else
            LastRowIn = .Cells(.rows.Count, col).End(xlUp).Row
        End If
    End With
End Function
' ─────────────────────────────────────────────────────────────────

' 카테고리/특별케이스 버튼 자동 생성
Public Sub BuildMenu()
    Dim menuWs As Worksheet
    Dim lastRow As Long, rng As Range
    Dim dict As Object                  ' 카테고리 집합 (Scripting.Dictionary)
    Dim r As Long, i As Long
    Dim shp As Shape
    Dim leftPos As Single, topPos As Single, btnW As Single, btnH As Single
    
    Dim specialSheet As String, specialBtn As String
    Dim specialCats As Collection, c As Variant
    
    On Error Resume Next
    Set menuWs = ThisWorkbook.Worksheets(MENU_SHEET)
    On Error GoTo 0
    If menuWs Is Nothing Then Exit Sub
    
    lastRow = LastRowIn(menuWs, menuWs.Range(TABLE_TOP_LEFT).Column)
    If lastRow < 1 Then Exit Sub
    
    ' 기존 버튼 제거
    For Each shp In menuWs.Shapes
        If Left$(shp.name, 10) = "CAT_BTN__" Or Left$(shp.name, 11) = "SHEET_BTN__" Then
            shp.Delete
        End If
    Next shp
    
    ' 버튼 배치 기준
    leftPos = menuWs.Range("D2").Left
    topPos = menuWs.Range("D2").Top
    btnW = 120
    btnH = 28
    
    ' ── [특별케이스 버튼] A1=작성, B1=주문작성 → 작성으로 점프
    specialSheet = Trim$(CStr(menuWs.Range(SPECIAL_SHEET_NAME_CELL).Value))
    specialBtn = Trim$(CStr(menuWs.Range(SPECIAL_BUTTON_NAME_CELL).Value))
    If Len(specialSheet) > 0 And Len(specialBtn) > 0 Then
        Set shp = menuWs.Shapes.AddShape(msoShapeRoundedRectangle, leftPos, topPos, btnW, btnH)
        shp.name = "SHEET_BTN__" & specialBtn
        shp.TextFrame.Characters.Text = specialBtn
        shp.TextFrame.HorizontalAlignment = xlHAlignCenter
        shp.TextFrame.VerticalAlignment = xlVAlignCenter
        shp.OnAction = "'" & ThisWorkbook.name & "'!ClickSheetJump"
        topPos = topPos + btnH + 6
    End If
    
    ' ── 카테고리 버튼 생성 (데이터 범위: A2:B(lastRow)) + C1 카테고리 포함
    Set dict = CreateObject("Scripting.Dictionary")
    
    ' 1) 일반 매핑 표 수집
    If lastRow >= 2 Then
        Set rng = menuWs.Range("A2:B" & lastRow)
        For r = 1 To rng.rows.Count
            Dim bVal As String, cats As Collection
            bVal = CStr(rng.Cells(r, 2).Value)
            Set cats = SplitTokens(bVal)
            If Not cats Is Nothing Then
                For i = 1 To cats.Count
                    If Len(cats(i)) > 0 Then
                        If Not dict.Exists(cats(i)) Then dict.Add cats(i), 1
                    End If
                Next i
            End If
        Next r
    End If
    
    ' 2) [특별케이스] C1에 적은 '작성'의 추가 카테고리도 버튼 목록에 포함
    If Len(Trim$(menuWs.Range(SPECIAL_CATEGORIES_CELL).Value)) > 0 Then
        Set specialCats = SplitTokens(menuWs.Range(SPECIAL_CATEGORIES_CELL).Value)
        If Not specialCats Is Nothing Then
            For Each c In specialCats
                If Len(c) > 0 Then
                    If Not dict.Exists(c) Then dict.Add c, 1
                End If
            Next c
        End If
    End If
    
    ' 카테고리 버튼 생성
    For Each c In dict.Keys
        Set shp = menuWs.Shapes.AddShape(msoShapeRoundedRectangle, leftPos, topPos, btnW, btnH)
        shp.name = "CAT_BTN__" & CStr(c)
        shp.TextFrame.Characters.Text = CStr(c)
        shp.TextFrame.HorizontalAlignment = xlHAlignCenter
        shp.TextFrame.VerticalAlignment = xlVAlignCenter
        shp.OnAction = "'" & ThisWorkbook.name & "'!ClickCategory"
        topPos = topPos + btnH + 6
    Next c
    
    ' ── [전체 보기] 버튼
    Set shp = menuWs.Shapes.AddShape(msoShapeRoundedRectangle, leftPos, topPos + 6, btnW, btnH)
    shp.name = "CAT_BTN____ALL__"
    shp.TextFrame.Characters.Text = "전체 보기"
    shp.TextFrame.HorizontalAlignment = xlHAlignCenter
    shp.TextFrame.VerticalAlignment = xlVAlignCenter
    shp.OnAction = "'" & ThisWorkbook.name & "'!ShowAll"
End Sub

' 카테고리 버튼 클릭 → 버튼 텍스트(카테고리)로 필터 (화면은 메뉴 유지)
Public Sub ClickCategory()
    Dim menuWs As Worksheet
    Dim callerShape As Shape
    Dim cat As String
    
    Set menuWs = ThisWorkbook.Worksheets(MENU_SHEET)
    On Error Resume Next
    Set callerShape = menuWs.Shapes(Application.Caller)
    On Error GoTo 0
    If callerShape Is Nothing Then Exit Sub
    
    cat = Trim$(callerShape.TextFrame.Characters.Text)
    If Len(cat) = 0 Then Exit Sub
    
    ShowCategory cat
End Sub

' [특별케이스] "주문작성" 버튼 → 작성 시트로 이동 + 작성/입출고/입출고14K/메뉴만 표시
Public Sub ClickSheetJump()
    Dim menuWs As Worksheet
    Dim targetSheet As String
    Dim visibleSet As Object ' Dictionary
    Dim extra As Collection, i As Long
    Dim ws As Worksheet
    
    Set menuWs = ThisWorkbook.Worksheets(MENU_SHEET)
    targetSheet = Trim$(CStr(menuWs.Range(SPECIAL_SHEET_NAME_CELL).Value)) ' A1=작성
    If Len(targetSheet) = 0 Then Exit Sub
    
    Set visibleSet = CreateObject("Scripting.Dictionary")
    visibleSet.Add MENU_SHEET, 1          ' 메뉴는 항상 보이게
    visibleSet.Add targetSheet, 1         ' 작성
    
    ' 추가로 항상 보일 시트들 (입출고, 입출고14K 등)
    Set extra = SplitTokens(SPECIAL_EXTRA_SHEETS)
    If Not extra Is Nothing Then
        For i = 1 To extra.Count
            If Not visibleSet.Exists(extra(i)) Then visibleSet.Add extra(i), 1
        Next i
    End If
    
    ' 표시/숨기기 적용
    Application.ScreenUpdating = False
    For Each ws In ThisWorkbook.Worksheets
        If visibleSet.Exists(ws.name) Then
            ws.Visible = xlSheetVisible
        Else
            ws.Visible = xlSheetHidden
        End If
    Next ws
    Application.ScreenUpdating = True
    
    ' 작성 시트로 이동
    On Error Resume Next
    ThisWorkbook.Worksheets(targetSheet).Activate
    On Error GoTo 0
End Sub

' 해당 카테고리의 시트만 보이기 (메뉴 시트는 항상 보이게, 화면은 메뉴 유지)
Public Sub ShowCategory(ByVal category As String)
    Dim menuWs As Worksheet
    Dim lastRow As Long
    Dim rng As Range
    Dim r As Long, i As Long
    Dim targetSheets As Object            ' Dictionary
    Dim sName As String
    Dim ws As Worksheet
    Dim cats As Collection
    Dim specialSheet As String
    Dim specialCats As Collection, c As Variant
    
    If Len(Trim$(category)) = 0 Then Exit Sub
    
    Set menuWs = ThisWorkbook.Worksheets(MENU_SHEET)
    lastRow = LastRowIn(menuWs, menuWs.Range(TABLE_TOP_LEFT).Column)
    If lastRow < 1 Then Exit Sub
    
    Set targetSheets = CreateObject("Scripting.Dictionary")
    targetSheets.Add MENU_SHEET, 1 ' 메뉴는 항상 보이게
    
    ' 1) 일반 매핑 표(A2:B..)에서 매칭되는 시트 수집
    If lastRow >= 2 Then
        Set rng = menuWs.Range("A2:B" & lastRow)
        For r = 1 To rng.rows.Count
            sName = Trim$(CStr(rng.Cells(r, 1).Value))
            If Len(sName) > 0 Then
                Set cats = SplitTokens(CStr(rng.Cells(r, 2).Value))
                If Not cats Is Nothing Then
                    For i = 1 To cats.Count
                        If StrComp(cats(i), category, vbTextCompare) = 0 Then
                            If Not targetSheets.Exists(sName) Then targetSheets.Add sName, 1
                            Exit For
                        End If
                    Next i
                End If
            End If
        Next r
    End If
    
    ' 2) [특별케이스] C1에 적은 카테고리가 눌렸다면 A1의 시트(작성)도 포함
    specialSheet = Trim$(CStr(menuWs.Range(SPECIAL_SHEET_NAME_CELL).Value)) ' 작성
    If Len(Trim$(menuWs.Range(SPECIAL_CATEGORIES_CELL).Value)) > 0 And Len(specialSheet) > 0 Then
        Set specialCats = SplitTokens(menuWs.Range(SPECIAL_CATEGORIES_CELL).Value)
        If Not specialCats Is Nothing Then
            For Each c In specialCats
                If StrComp(CStr(c), category, vbTextCompare) = 0 Then
                    If Not targetSheets.Exists(specialSheet) Then targetSheets.Add specialSheet, 1
                    Exit For
                End If
            Next c
        End If
    End If
    
    ' 표시/숨기기
    Application.ScreenUpdating = False
    For Each ws In ThisWorkbook.Worksheets
        If targetSheets.Exists(ws.name) Then
            ws.Visible = xlSheetVisible
        Else
            ws.Visible = xlSheetHidden
        End If
    Next ws
    Application.ScreenUpdating = True
    
    ' 메뉴 시트로 화면 고정
    menuWs.Activate
End Sub

' 모든 시트를 표시 (화면은 메뉴 유지)
Public Sub ShowAll()
    Dim ws As Worksheet
    Dim menuWs As Worksheet
    Set menuWs = ThisWorkbook.Worksheets(MENU_SHEET)
    
    Application.ScreenUpdating = False
    For Each ws In ThisWorkbook.Worksheets
        ws.Visible = xlSheetVisible
    Next ws
    Application.ScreenUpdating = True
    
    menuWs.Activate
End Sub

