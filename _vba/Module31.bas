Attribute VB_Name = "Module31"
Option Explicit

' === 유틸: 프린터 준비 확인 (PDF/XPS는 "인쇄 준비 안 됨"으로 간주) ===
Private Function EnsurePrinterReady(Optional ByVal preferNamePart As String = "") As Boolean
    On Error Resume Next
    Dim cur As String: cur = Application.ActivePrinter
    Dim ok As Boolean: ok = (Len(cur) > 0)

    ' PDF/XPS면 물리 프린터로 강제 유도
    If ok Then
        If InStr(1, cur, "PDF", vbTextCompare) > 0 Or InStr(1, cur, "XPS", vbTextCompare) > 0 Then
            ok = False
        End If
    End If

    If Not ok Then
        Application.Dialogs(xlDialogPrinterSetup).Show
        cur = Application.ActivePrinter
        ok = (Len(cur) > 0 And InStr(1, cur, "PDF", vbTextCompare) = 0 And InStr(1, cur, "XPS", vbTextCompare) = 0)
    End If

    ' 이름 일부로 자동 선택 시도 (가능한 버전 한정)
    If Not ok And preferNamePart <> "" Then
        Dim i As Long, p As String
        For i = 1 To 64
            p = Application.Printers(i)  ' 미지원 버전이면 에러 무시
            If Len(p) = 0 Then Exit For
            If InStr(1, p, "PDF", vbTextCompare) = 0 And InStr(1, p, "XPS", vbTextCompare) = 0 Then
                If InStr(1, p, preferNamePart, vbTextCompare) > 0 Then
                    Application.ActivePrinter = p
                    ok = True
                    Exit For
                End If
            End If
        Next i
    End If

    EnsurePrinterReady = ok
    On Error GoTo 0
End Function

' === 유틸: 안전한 PageSetup 적용 (그대로) ===
Private Sub ApplyPageSetupOneShot(ws As Worksheet, ByVal rngAddress As String, _
                                  Optional ByVal landscape As Boolean = False)
    Dim ps As PageSetup
    Set ps = ws.PageSetup

    On Error Resume Next
    Application.PrintCommunication = False
    ps.PrintArea = rngAddress
    ps.Zoom = False
    ps.FitToPagesWide = 1
    ps.FitToPagesTall = 1
    ps.Orientation = IIf(landscape, xlLandscape, xlPortrait)
    ps.LeftMargin = Application.InchesToPoints(0.2)
    ps.RightMargin = Application.InchesToPoints(0.2)
    ps.TopMargin = Application.InchesToPoints(0.2)
    ps.BottomMargin = Application.InchesToPoints(0.2)
    ps.HeaderMargin = Application.InchesToPoints(0.2)
    ps.FooterMargin = Application.InchesToPoints(0.2)
    ps.CenterHorizontally = True
    ps.CenterVertically = True
    Application.PrintCommunication = True
    On Error GoTo 0

    On Error Resume Next
    ws.ResetAllPageBreaks
    On Error GoTo 0
End Sub

' === 유틸: 선택 인쇄 (명시적 매개변수로 실패율 ↓) ===
Private Function SafeSelectAndPrint(ws As Worksheet, ByVal previewMode As Boolean) As Boolean
    Dim prev As Worksheet, origVisible As XlSheetVisibility
    On Error GoTo Fail
    Set prev = ws.Parent.ActiveSheet
    origVisible = ws.Visible
    If ws.Visible <> xlSheetVisible Then ws.Visible = xlSheetVisible

    ws.Parent.Activate
    ws.Activate                 ' ← 워크북 다음에 워크시트까지 확실히 활성화
    ws.Select
    DoEvents

    If previewMode Then
        ActiveWindow.SelectedSheets.PrintPreview
    Else
        ActiveWindow.SelectedSheets.PrintOut From:=1, To:=1, copies:=1, Collate:=True, IgnorePrintAreas:=False
    End If

    SafeSelectAndPrint = True

CleanUp:
    On Error Resume Next
    If Not prev Is Nothing Then prev.Select
    ws.Visible = origVisible
    Exit Function
Fail:
    SafeSelectAndPrint = False
    Resume CleanUp
End Function

' === 진단 메시지 헬퍼 ===
Private Sub ShowPrintDiag(ByVal where As String, ByVal extra As String)
    On Error Resume Next
    Dim ap As String: ap = Application.ActivePrinter
    MsgBox "[인쇄 진단] " & where & vbCrLf & _
           "ActivePrinter = " & ap & vbCrLf & _
           IIf(InStr(1, ap, "PDF", vbTextCompare) Or InStr(1, ap, "XPS", vbTextCompare), _
               "※ 현재 PDF/XPS 프린터가 기본으로 잡혀 있으면 저장창이 뒤에 숨어 '무반응'처럼 보일 수 있습니다.", _
               "") & vbCrLf & extra, vbInformation
End Sub

' "sum" 시트 A1:H38을 한 장에
Public Sub 인쇄_sum_A1H38_한장(Optional ByVal Preview As Boolean = True, _
                            Optional ByVal PreferPrinterNamePart As String = "")
    Dim ws As Worksheet, ps As PageSetup
    Dim oldPrintArea As String, oldZoom As Variant
    Dim oldFitW As Long, oldFitH As Long
    Dim oldOrient As XlPageOrientation
    Dim oldLM As Double, oldRM As Double, oldTM As Double, oldBM As Double
    Dim oldHM As Double, oldFM As Double
    Dim oldCenterH As Boolean, oldCenterV As Boolean

    On Error GoTo EH
    Set ws = ThisWorkbook.Worksheets("sum")  ' 이름 정확히 "sum"

    Set ps = ws.PageSetup
    ' 보존
    oldPrintArea = ps.PrintArea
    oldZoom = ps.Zoom
    oldFitW = ps.FitToPagesWide
    oldFitH = ps.FitToPagesTall
    oldOrient = ps.Orientation
    oldLM = ps.LeftMargin: oldRM = ps.RightMargin
    oldTM = ps.TopMargin:  oldBM = ps.BottomMargin
    oldHM = ps.HeaderMargin: oldFM = ps.FooterMargin
    oldCenterH = ps.CenterHorizontally
    oldCenterV = ps.CenterVertically

    ' 적용
    ApplyPageSetupOneShot ws, "$A$1:$H$38", False

    If Preview Then
        Call SafeSelectAndPrint(ws, True)
        GoTo RestoreAndExit
    End If

    ' 프린터 준비
    If Not EnsurePrinterReady(PreferPrinterNamePart) Then
        ShowPrintDiag "프린터 선택 필요", "프린터 설정창에서 물리 프린터를 선택하세요."
        GoTo RestoreAndExit
    End If

    ' 인쇄 (1차: 선택 인쇄, 2차: 표준, 3차: 설정창 유도)
    Dim attempt As Long, ok As Boolean, lastErr As String
    For attempt = 1 To 3
        Err.Clear
        Select Case attempt
            Case 1
                ok = SafeSelectAndPrint(ws, False)
                If ok Then Exit For
                lastErr = "선택 인쇄 실패"
            Case 2
                On Error Resume Next
                ws.PrintOut From:=1, To:=1, copies:=1, Collate:=True, IgnorePrintAreas:=False
                lastErr = Err.Description
                On Error GoTo 0
                ok = (Err.Number = 0)
                If ok Then Exit For
            Case 3
                Application.Dialogs(xlDialogPrinterSetup).Show
                On Error Resume Next
                ws.PrintOut From:=1, To:=1, copies:=1, Collate:=True, IgnorePrintAreas:=False
                lastErr = Err.Description
                On Error GoTo 0
                ok = (Err.Number = 0)
        End Select
        DoEvents
        Application.Wait Now + TimeSerial(0, 0, 1)
    Next

    If Not ok Then
        ' PDF 폴백
        Dim pdfPath As String
        pdfPath = ThisWorkbook.Path & "\sum_A1H38_" & Format(Now, "yyyymmdd_hhnnss") & ".pdf"
        On Error Resume Next
        Err.Clear
        ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=pdfPath, _
            Quality:=xlQualityStandard, IncludeDocProperties:=True, _
            IgnorePrintAreas:=False, OpenAfterPublish:=True
        If Err.Number = 0 Then
            ShowPrintDiag "인쇄 실패 → PDF로 대체", "파일: " & pdfPath & vbCrLf & "원인: " & lastErr
        Else
            MsgBox "인쇄 실패: " & lastErr & vbCrLf & "PDF 내보내기도 실패: " & Err.Description, vbCritical
        End If
    End If

    GoTo RestoreAndExit

EH:
    MsgBox "오류: " & Err.Description, vbExclamation

RestoreAndExit:
    On Error Resume Next
    With ps
        .PrintArea = oldPrintArea
        .Zoom = oldZoom
        .FitToPagesWide = oldFitW
        .FitToPagesTall = oldFitH
        .Orientation = oldOrient
        .LeftMargin = oldLM: .RightMargin = oldRM
        .TopMargin = oldTM:  .BottomMargin = oldBM
        .HeaderMargin = oldHM: .FooterMargin = oldFM
        .CenterHorizontally = oldCenterH
        .CenterVertically = oldCenterV
    End With
    On Error GoTo 0
End Sub

Public Sub 인쇄_sum_A1H38_한장_미리보기()
    인쇄_sum_A1H38_한장 True
End Sub

Public Sub 인쇄_sum_A1H38_한장_바로인쇄()
    인쇄_sum_A1H38_한장 False
End Sub

