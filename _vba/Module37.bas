Attribute VB_Name = "Module37"
' === Module: Mod_QC_DailyMapping ===
Option Explicit

' === 대상 통합문서 / 시트 설정 ===
Private Const TARGET_FULLPATH As String = "\\192.168.0.70\생산공용폴더\품질관리부\품질결산서.xlsm"
Private Const TARGET_SHEET   As String = "일일결산서"

' === 엔트리: RAW → 품질결산서(일일결산서) 매핑 전송 ===
' - srcWb 생략 시 ThisWorkbook 사용
Public Sub 품질결산서_매핑전송(Optional ByVal srcWb As Workbook)
    Dim rawWs As Worksheet
    Dim tgtWb As Workbook, tgtWs As Worksheet
    Dim wasOpen As Boolean

    On Error GoTo EH

    If srcWb Is Nothing Then Set srcWb = ThisWorkbook

    ' --- 원본 RAW 시트 확보 ---
    If Not SheetExists(srcWb, "raw") Then _
        Err.Raise vbObjectError + 401, , "원본(raw) 시트를 찾을 수 없습니다."
    Set rawWs = srcWb.Worksheets("raw")

    ' --- 대상 통합문서 열기/재사용 ---
    Set tgtWb = Nothing
    On Error Resume Next
    Set tgtWb = GetOpenWorkbookByFullPath(TARGET_FULLPATH)
    On Error GoTo 0

    If tgtWb Is Nothing Then
        If Dir(TARGET_FULLPATH, vbNormal) = "" Then _
            Err.Raise vbObjectError + 402, , "대상 파일이 없습니다: " & TARGET_FULLPATH
        Set tgtWb = Workbooks.Open(Filename:=TARGET_FULLPATH, UpdateLinks:=False, ReadOnly:=False)
        wasOpen = False
    Else
        wasOpen = True
    End If

    ' --- 대상 시트 ---
    On Error Resume Next
    Set tgtWs = tgtWb.Worksheets(TARGET_SHEET)
    On Error GoTo 0
    If tgtWs Is Nothing Then
        If Not wasOpen Then tgtWb.Close SaveChanges:=False
        Err.Raise vbObjectError + 403, , "대상 통합문서에 '" & TARGET_SHEET & "' 시트가 없습니다."
    End If

    ' ====== (A) 순차 매핑: 왼쪽 RAW 범위 → 오른쪽 일일결산서 범위 ======
    ' 주의: 좌우 개수가 다르면 "겹치는 개수만" 채움 (초과분은 건너뜀)

    ' O3~O7 = C5~G5 (원문 주석 B5~G5였지만 실제 전송은 우측 시트 C5~G5)
    MapSeq rawWs, "O3:O7", tgtWs, "C5:G5"
    ' P3~P7 = C6~G6
    MapSeq rawWs, "P3:P7", tgtWs, "C6:G6"

    ' S3 = C29, S4 = D29, S5 = F29
    SetCell tgtWs, "C29", GetVar(rawWs, "S3")
    SetCell tgtWs, "D29", GetVar(rawWs, "S4")
    SetCell tgtWs, "F29", GetVar(rawWs, "S5")

    ' T3 = C30, T4 = D30, T5 = F30
    SetCell tgtWs, "C30", GetVar(rawWs, "T3")
    SetCell tgtWs, "D30", GetVar(rawWs, "T4")
    SetCell tgtWs, "F30", GetVar(rawWs, "T5")

    ' X25 = C9, X26 = F9
    SetCell tgtWs, "C9", GetVar(rawWs, "X25")
    SetCell tgtWs, "F9", GetVar(rawWs, "X26")

    ' X32~X33 = C10~D10, X34~X35 = H10~I10
    MapSeq rawWs, "X32:X33", tgtWs, "C10:D10"
    MapSeq rawWs, "X34:X35", tgtWs, "H10:I10"

    ' X43 = C11, X46 = E11, X49 = G11, X50 = H11, X51 = I11
    SetCell tgtWs, "C11", GetVar(rawWs, "X43")
    SetCell tgtWs, "E11", GetVar(rawWs, "X46")
    SetCell tgtWs, "G11", GetVar(rawWs, "X49")
    SetCell tgtWs, "H11", GetVar(rawWs, "X50")
    SetCell tgtWs, "I11", GetVar(rawWs, "X51")

    '  O49 = F21
    SetCell tgtWs, "F21", GetVar(rawWs, "O49")

    ' X28 = C33, X29 = E33
    SetCell tgtWs, "C33", GetVar(rawWs, "X28")
    SetCell tgtWs, "E33", GetVar(rawWs, "X29")

    ' X37 = C34, X39 = F34   (사용자 지시: RAW가 앞, 수신은 일일결산서)
    SetCell tgtWs, "C34", GetVar(rawWs, "X37")
    SetCell tgtWs, "F34", GetVar(rawWs, "X39")

    ' X53 = C35, X59 = D35, X60 = F35
    SetCell tgtWs, "C35", GetVar(rawWs, "X53")
    SetCell tgtWs, "D35", GetVar(rawWs, "X59")
    SetCell tgtWs, "F35", GetVar(rawWs, "X60")

    ' O59 = E45, O60 = F45
    SetCell tgtWs, "E45", GetVar(rawWs, "O59")
    SetCell tgtWs, "F45", GetVar(rawWs, "O60")

    ' ====== (B) 합산 매핑: RAW 여러 셀 합 → 일일결산서 한 셀 ======
    ' X44+X45 → D11
    SetCell tgtWs, "D11", Nz(rawWs.Range("X44").Value) + Nz(rawWs.Range("X45").Value)
    
    ' X47+X48 → F11
    SetCell tgtWs, "F11", Nz(rawWs.Range("X47").Value) + Nz(rawWs.Range("X48").Value)

    ' K14+K15+K16+K17 → K11
    SetCell tgtWs, "K11", Nz(rawWs.Range("K14").Value) + Nz(rawWs.Range("K15").Value) + Nz(rawWs.Range("K16").Value) + Nz(rawWs.Range("K17").Value)

    ' K19+K20 → K35
    SetCell tgtWs, "K35", Nz(rawWs.Range("K19").Value) + Nz(rawWs.Range("K20").Value)

    ' O44+O45 → C21
    SetCell tgtWs, "C21", Nz(rawWs.Range("O44").Value) + Nz(rawWs.Range("O45").Value) + Nz(rawWs.Range("O32").Value) + Nz(rawWs.Range("O25").Value)
    
    '  → D21
    SetCell tgtWs, "D21", Nz(rawWs.Range("O43").Value) + Nz(rawWs.Range("O33").Value)
    
    ' O46+O47+O48 → E21
    SetCell tgtWs, "E21", Nz(rawWs.Range("O46").Value) + Nz(rawWs.Range("O47").Value) + Nz(rawWs.Range("O48").Value) + Nz(rawWs.Range("O34").Value) + Nz(rawWs.Range("O26").Value)
    
    ' R50+R51 → G21
    SetCell tgtWs, "G21", Nz(rawWs.Range("O50").Value) + Nz(rawWs.Range("O51").Value)

    ' X56+X57+X58 → E35
    SetCell tgtWs, "E35", Nz(rawWs.Range("X56").Value) + Nz(rawWs.Range("X57").Value) + Nz(rawWs.Range("X58").Value)
    
    ' O56+O57+O58 → D45
    SetCell tgtWs, "D45", Nz(rawWs.Range("O56").Value) + Nz(rawWs.Range("O57").Value) + Nz(rawWs.Range("O58").Value) + Nz(rawWs.Range("O39").Value) + Nz(rawWs.Range("O29").Value)
    
    '  → C45
    SetCell tgtWs, "C45", Nz(rawWs.Range("O53").Value) + Nz(rawWs.Range("O37").Value) + Nz(rawWs.Range("O28").Value)

    ' 저장/정리
    tgtWb.Save
    If Not wasOpen Then tgtWb.Close SaveChanges:=False

    MsgBox "품질결산서 매핑 전송 완료", vbInformation
    Exit Sub

EH:
    MsgBox "매핑 전송 오류: " & Err.Description, vbExclamation
    On Error Resume Next
    If Not tgtWb Is Nothing Then
        If Not wasOpen Then tgtWb.Close SaveChanges:=False
    End If
End Sub

' ===== 유틸 (본 모듈 전용, 독립 실행 가능하도록 포함) =====

' 열린 통합문서 풀경로로 찾기
Private Function GetOpenWorkbookByFullPath(ByVal fullPath As String) As Workbook
    Dim wb As Workbook
    For Each wb In Application.Workbooks
        On Error Resume Next
        If StrComp(wb.FullName, fullPath, vbTextCompare) = 0 Then
            Set GetOpenWorkbookByFullPath = wb
            Exit Function
        End If
        On Error GoTo 0
    Next wb
End Function

' 시트 존재
Private Function SheetExists(ByVal wb As Workbook, ByVal nm As String) As Boolean
    On Error Resume Next
    SheetExists = Not wb.Worksheets(nm) Is Nothing
    On Error GoTo 0
End Function

' 값 설정(Variant 그대로 허용)
Private Sub SetCell(ByVal ws As Worksheet, ByVal addr As String, ByVal v As Variant)
    ws.Range(addr).Value = v
End Sub

' Range를 셀 배열(1-based)로 변환
Private Function CellsToArray(ByVal r As Range) As Variant
    Dim arr() As Range
    Dim c As Range, i As Long
    ReDim arr(1 To r.Cells.Count)
    i = 0
    For Each c In r.Cells
        i = i + 1
        Set arr(i) = c
    Next c
    CellsToArray = arr
End Function

' 순차 매핑(좌측 범위 → 우측 범위), 길이 다르면 공통 구간만
Private Sub MapSeq(ByVal srcWs As Worksheet, ByVal srcAddr As String, _
                   ByVal dstWs As Worksheet, ByVal dstAddr As String)
    Dim srcR As Range, dstR As Range
    Dim i As Long, n As Long
    Set srcR = srcWs.Range(srcAddr)
    Set dstR = dstWs.Range(dstAddr)

    Dim srcCells As Variant, dstCells As Variant
    srcCells = CellsToArray(srcR)
    dstCells = CellsToArray(dstR)

    n = Application.WorksheetFunction.Min(UBound(srcCells), UBound(dstCells))
    For i = 1 To n
        dstCells(i).Value = srcCells(i).Value
    Next i
End Sub

' 주소로 값(Variant) 안전 취득
Private Function GetVar(ByVal ws As Worksheet, ByVal addr As String) As Variant
    On Error Resume Next
    GetVar = ws.Range(addr).Value
    On Error GoTo 0
End Function

' 안전 숫자 변환(Nz)
Private Function Nz(ByVal v As Variant, Optional ByVal alt As Double = 0#) As Double
    On Error GoTo Z
    If IsError(v) Or IsEmpty(v) Or Trim$(CStr(v)) = "" Then
        Nz = alt
    ElseIf IsNumeric(v) Then
        Nz = CDbl(v)
    Else
        Nz = alt
    End If
    Exit Function
Z:
    Nz = alt
End Function
' Alt+F8 목록에 뜨는 실행용 래퍼
Public Sub 품질결산서_매핑전송_실행()
    품질결산서_매핑전송  ' 인수 생략 → ThisWorkbook 사용
End Sub

