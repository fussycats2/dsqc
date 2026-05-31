Attribute VB_Name = "Module3"
Sub FillRight3Cells()
    Dim rng As Range
    Dim cell As Range
    Dim inputValue As Variant
    
    ' 입력할 값 받기
    inputValue = InputBox("기입할 숫자를 입력하세요:", "값 입력")
    If inputValue = "" Then Exit Sub
    
    ' 선택한 범위 가져오기
    Set rng = Selection
    
    ' 각 셀의 오른쪽 2칸에 값 입력
    For Each cell In rng
        cell.Offset(0, 2).Value = inputValue
    Next cell
End Sub

