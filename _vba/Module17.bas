Attribute VB_Name = "Module17"
' === [표준 모듈: modStockWatch] 코드 ===
Option Explicit

Public Sub ShowStockWatch()
    EnsureStockWatch
    UpdateStockWatch
End Sub

Public Sub EnsureStockWatch()
    If Not IsFormOpen("frmStockWatch") Then
        ' 로드만 되어 있고 숨김일 수 있으니 Show로 보이게
        frmStockWatch.Show vbModeless
    Else
        ' 이미 로드되어 있지만 숨겨졌다면 보여주기
        If frmStockWatch.Visible = False Then frmStockWatch.Show vbModeless
    End If
End Sub

Public Sub UpdateStockWatch()
    On Error GoTo EH
    Dim ws As Worksheet
    Dim v18, v14

    Set ws = ThisWorkbook.Worksheets("raw")
    v18 = ws.Range("AD3").Value
    v14 = ws.Range("AD5").Value

    If IsFormOpen("frmStockWatch") Then
        frmStockWatch.UpdateStatus v18, v14
    End If
    Exit Sub
EH:
    ' raw 시트가 없거나 오류시 조용히 무시
End Sub

Public Function IsFormOpen(ByVal formName As String) As Boolean
    Dim uf As Object
    For Each uf In VBA.UserForms
        If StrComp(uf.name, formName, vbTextCompare) = 0 Then
            IsFormOpen = True
            Exit Function
        End If
    Next uf
End Function

