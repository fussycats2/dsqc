Attribute VB_Name = "Module35"
Option Explicit

Sub Upload_CopySheets()
Dim srcWb As Workbook, dstWB As Workbook
Dim shtNames As Variant, sName As Variant
Dim srcS As Worksheet, dstS As Worksheet
Dim lastRow As Long, lastCol As Long
Dim rng As Range
Dim dstPath As String, dstName As String
Dim r As Long


Application.ScreenUpdating = False
Application.EnableEvents = False
Application.Calculation = xlCalculationManual


Set srcWb = ThisWorkbook ' 필요시 ActiveWorkbook으로 바꿔도 됨
dstPath = srcWb.Path
If dstPath = "" Then dstPath = Application.DefaultFilePath
If Right(dstPath, 1) <> "\" Then dstPath = dstPath & "\"
dstName = "업로드.xlsm"


' 복사할 시트 이름들 (요청하신 리스트)
shtNames = Array("기계", "양장", "캐스팅", "개발", "조립14K", "컷팅", "조립14K", "캐스팅14K", "컷팅14K", _
"연마(조립)", "연마(캐스팅)", "연마(조립)14K", "연마(캐스팅)14K", _
"뻥(기계)", "뻥(양장)", "뻥(캐스팅)", "뻥(개발)", "뻥(조립)14K", "뻥(캐스팅)14K", _
"빠우(양장볼)", "빠우(할로우)", "빠우(기계)", "빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", _
"빠우(초광-조립)", "빠우(초광-캐스팅)", "빠우(개발)", "빠우(조립)14K", "빠우(패션반지)14K", _
"빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", "빠우(초광-조립)14K", "빠우(초광-캐스팅)14K", _
"검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)", "검수(조립)14K", "검수(캐스팅)14K")


' 목적 통합문서 열기 또는 생성
On Error Resume Next
Set dstWB = Workbooks.Open(dstPath & dstName)
On Error GoTo 0


If dstWB Is Nothing Then
Set dstWB = Workbooks.Add(xlWBATWorksheet)
' 기본 한 시트만 남기고 나머지 삭제
Application.DisplayAlerts = False
Do While dstWB.Sheets.Count > 1
dstWB.Sheets(dstWB.Sheets.Count).Delete
Loop
Application.DisplayAlerts = True
dstWB.SaveAs Filename:=dstPath & dstName, FileFormat:=xlOpenXMLWorkbook
End If


' 각 시트 처리
For Each sName In shtNames
On Error Resume Next
Set srcS = srcWb.Worksheets(CStr(sName))
On Error GoTo 0


If Not srcS Is Nothing Then
' 대상 시트가 있으면 비우고, 없으면 새로 생성
On Error Resume Next
Set dstS = dstWB.Worksheets(CStr(sName))
On Error GoTo 0


If dstS Is Nothing Then
Set dstS = dstWB.Worksheets.Add(After:=dstWB.Sheets(dstWB.Sheets.Count))
dstS.name = CStr(sName)
Else
' 기존: dstS.Cells.Clear

' 변경: 13행부터 아래만 초기화하여 1~12행 서식을 보존
With dstS
    If .rows.Count >= 13 Then
        .rows("13:" & .rows.Count).Clear  ' 서식 포함 모두 지우고 싶으면 Clear, 내용만 지우려면 ClearContents 사용
    End If
End With

End If


' 원본의 마지막 사용 행/열 찾기
On Error Resume Next
lastRow = 0: lastCol = 0
If Application.WorksheetFunction.CountA(srcS.Cells) > 0 Then
lastRow = srcS.Cells.Find("*", SearchOrder:=xlByRows, SearchDirection:=xlPrevious).Row
lastCol = srcS.Cells.Find("*", SearchOrder:=xlByColumns, SearchDirection:=xlPrevious).Column
End If
On Error GoTo 0


If lastRow >= 13 And lastCol >= 1 Then
Set rng = srcS.Range(srcS.Cells(13, 1), srcS.Cells(lastRow, lastCol))
rng.Copy
dstS.Range("A13").PasteSpecial Paste:=xlPasteAll


' 행 높이도 복사
For r = 13 To lastRow
dstS.rows(r).RowHeight = srcS.rows(r).RowHeight
Next r


' 열 너비 복사
Dim c As Long
For c = 1 To lastCol
dstS.Columns(c).ColumnWidth = srcS.Columns(c).ColumnWidth
Next c


Else
' 13행부터 데이터가 없으면 아무 작업도 하지 않음
End If


Else
' 원본에 시트가 없는 경우 무시
End If


Set srcS = Nothing
Set dstS = Nothing
Next sName


' 저장 및 정리
On Error Resume Next
dstWB.Save
On Error GoTo 0


Application.CutCopyMode = False
Application.ScreenUpdating = True
Application.EnableEvents = True
Application.Calculation = xlCalculationAutomatic


MsgBox "업로드: 지정한 시트들의 13행부터 데이터 복사가 완료되었습니다.", vbInformation
End Sub
