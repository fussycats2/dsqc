Attribute VB_Name = "Sheet8"
Attribute VB_Base = "0{00020820-0000-0000-C000-000000000046}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = True


' === [Sheet: 작성] ===
Option Explicit

' 원본 서식 보관용(세션 내 유지)
Private origFormats As Object  ' Scripting.Dictionary (cell -> per-cell format array)

' 내부선(범위 단위) 서식 보관: [LineStyle, Weight, Color]
Private mInsideH As Variant
Private mInsideV As Variant

Private Sub Worksheet_Activate()
    Application.MoveAfterReturn = True
    Application.MoveAfterReturnDirection = xlToRight

    If origFormats Is Nothing Then
        CaptureOriginalFormats
    End If
End Sub

Private Sub Worksheet_Deactivate()
    Application.MoveAfterReturn = True
    Application.MoveAfterReturnDirection = xlDown
End Sub

Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
    If Not Intersect(Target, Me.Range("G4:G33")) Is Nothing Then
        Cancel = True
        ShowDatePicker Target
    End If
End Sub

' === 공개: ThisWorkbook에서 호출 가능 ===
Public Sub CaptureOriginalFormats()
    Dim d As Object, c As Range
    Dim rng As Range, arr, bh As Border, bv As Border

    Set d = CreateObject("Scripting.Dictionary")
    Set rng = Me.Range("B4:I33")

    ' 1) 셀 단위(외곽 4면, 글꼴/채우기/표시형식)
    For Each c In rng.Cells
        arr = Array( _
            c.Borders(xlEdgeLeft).LineStyle, c.Borders(xlEdgeLeft).Weight, c.Borders(xlEdgeLeft).Color, _
            c.Borders(xlEdgeTop).LineStyle, c.Borders(xlEdgeTop).Weight, c.Borders(xlEdgeTop).Color, _
            c.Borders(xlEdgeBottom).LineStyle, c.Borders(xlEdgeBottom).Weight, c.Borders(xlEdgeBottom).Color, _
            c.Borders(xlEdgeRight).LineStyle, c.Borders(xlEdgeRight).Weight, c.Borders(xlEdgeRight).Color, _
            c.Font.name, c.Font.Size, c.Font.Bold, c.Font.Italic, c.Interior.Color, c.NumberFormat _
        )
        d(c.Address) = arr
    Next c
    Set origFormats = d

    ' 2) 범위 단위(내부선) ? 테이블 전체에서 한번만 캡처
    Set bh = rng.Borders(xlInsideHorizontal)
    Set bv = rng.Borders(xlInsideVertical)
    mInsideH = Array(bh.LineStyle, bh.Weight, bh.Color)
    mInsideV = Array(bv.LineStyle, bv.Weight, bv.Color)
End Sub

Private Sub Worksheet_Change(ByVal Target As Range)
    On Error GoTo CleanUp

    Dim tbl As Range, hit As Range, area As Range
    Dim r As Range, arr

    Set tbl = Me.Range("B4:I33")
    Set hit = Intersect(Target, tbl)
    If hit Is Nothing Then Exit Sub

    If origFormats Is Nothing Then CaptureOriginalFormats

    Application.EnableEvents = False

    ' 1) 값만 허용(수식도 허용하려면 아래 r.Value = r.Formula 로 교체)
    For Each r In hit.Cells
        r.Value = r.Value
    Next r
    ' 수식 허용 시:
    ' hit.Value = hit.Formula

    ' 2) 셀 단위 외곽 4면 + 글꼴/채우기/표시형식 복원
    For Each r In hit.Cells
        If origFormats.Exists(r.Address) Then
            arr = origFormats(r.Address)

            With r.Borders(xlEdgeLeft)
                .LineStyle = arr(0): .Weight = arr(1): .Color = arr(2)
            End With
            With r.Borders(xlEdgeTop)
                .LineStyle = arr(3): .Weight = arr(4): .Color = arr(5)
            End With
            With r.Borders(xlEdgeBottom)
                .LineStyle = arr(6): .Weight = arr(7): .Color = arr(8)
            End With
            With r.Borders(xlEdgeRight)
                .LineStyle = arr(9): .Weight = arr(10): .Color = arr(11)
            End With

            r.Font.name = arr(12)
            r.Font.Size = arr(13)
            r.Font.Bold = arr(14)
            r.Font.Italic = arr(15)
            r.Interior.Color = arr(16)
            r.NumberFormat = arr(17)
        End If
    Next r

    ' 3) 범위 단위 내부선 복원 ? 붙여넣기된 각 영역(연속 블록)마다 한 번 적용
    For Each area In hit.Areas
        Dim block As Range
        Set block = Intersect(area, tbl)
        If Not block Is Nothing Then
            With block.Borders(xlInsideHorizontal)
                .LineStyle = mInsideH(0): .Weight = mInsideH(1): .Color = mInsideH(2)
            End With
            With block.Borders(xlInsideVertical)
                .LineStyle = mInsideV(0): .Weight = mInsideV(1): .Color = mInsideV(2)
            End With
        End If
    Next area

    Application.CutCopyMode = False

CleanUp:
    Application.EnableEvents = True
End Sub

