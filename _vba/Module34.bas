Attribute VB_Name = "Module34"
Option Explicit

' ====== 시트 스캔: K≠빈 + K색상≠흰색(또는 채우기없음 아님) + A=빈 ======
Public Sub 검증_A없음_하지만_K색칠_및_값존재()
    Dim sheetList As Variant
    sheetList = Array( _
        "연마(조립)", "연마(캐스팅)", "연마(조립)14K", "연마(캐스팅)14K", _
        "뻥(기계)", "뻥(양장)", "뻥(캐스팅)", "뻥(개발)", "뻥(조립)14K", "뻥(캐스팅)14K", _
        "빠우(양장볼)", "빠우(할로우)", "빠우(기계)", "빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", _
        "빠우(초광-조립)", "빠우(초광-캐스팅)", "빠우(개발)", "빠우(조립)14K", "빠우(패션반지)14K", _
        "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", "빠우(초광-조립)14K", "빠우(초광-캐스팅)14K" _
    )
    
    Dim errs As Object: Set errs = CreateObject("Scripting.Dictionary")
    Dim ws As Worksheet, nm As Variant
    Dim lastRow As Long, r As Long
    Dim kCell As Range, aCell As Range
    Dim hasDataInK As Boolean, kIsColored As Boolean, aIsBlank As Boolean
    
    On Error GoTo EH
    
    For Each nm In sheetList
        If SheetExists(CStr(nm)) Then
            Set ws = ThisWorkbook.Worksheets(CStr(nm))
            
            ' A:L 범위를 다루되, 조건이 K열 기반이므로 K열의 마지막 사용행까지 검사
            lastRow = ws.Cells(ws.rows.Count, "K").End(xlUp).Row
            If lastRow < 1 Then GoTo NextSheet
            
            For r = 1 To lastRow
                Set kCell = ws.Cells(r, "K")
                hasDataInK = (LenB(Trim$(CStr(kCell.Value))) > 0)
                
                If hasDataInK Then
                    kIsColored = Not IsWhiteOrNoFill(kCell)
                    If kIsColored Then
                        Set aCell = ws.Cells(r, "A")
                        aIsBlank = (LenB(Trim$(CStr(aCell.Value))) = 0)
                        
                        If aIsBlank Then
                            If Not errs.Exists(ws.name) Then
                                errs.Add ws.name, 1
                            Else
                                errs(ws.name) = errs(ws.name) + 1
                            End If
                        End If
                    End If
                End If
            Next r
        End If
NextSheet:
    Next nm
    
    Dim msg As String, key As Variant
    If errs.Count = 0 Then
        msg = "검증 완료: 오류 없음" & vbCrLf & _
              "조건( K값 존재 + K색상≠흰색/채우기없음 + A값 없음 )에 해당하는 행이 없습니다."
        MsgBox msg, vbInformation, "A:L 처리 검증"
    Else
        msg = "검증 완료: 오류가 존재합니다." & vbCrLf & _
              "아래 시트에서 조건 충족 행이 발견되었습니다." & vbCrLf & vbCrLf
        For Each key In errs.Keys
            msg = msg & " - " & CStr(key) & " : " & errs(key) & "건" & vbCrLf
        Next key
        MsgBox msg, vbExclamation, "A:L 처리 검증"
    End If
    
    Exit Sub
EH:
    MsgBox "검증 중 오류: " & Err.Description, vbCritical, "A:L 처리 검증"
End Sub

' 채우기 없음 또는 '완전 흰색'을 흰색으로 간주
Private Function IsWhiteOrNoFill(ByVal c As Range) As Boolean
    ' 채우기 없음이면 True
    If c.Interior.ColorIndex = xlColorIndexNone Then
        IsWhiteOrNoFill = True
        Exit Function
    End If
    ' 정확히 흰색(#FFFFFF) 채우기면 True
    IsWhiteOrNoFill = (c.Interior.Color = vbWhite)
End Function

Private Function SheetExists(ByVal sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    SheetExists = Not ws Is Nothing
    On Error GoTo 0
End Function


