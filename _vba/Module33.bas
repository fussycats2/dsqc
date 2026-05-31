Attribute VB_Name = "Module33"
Option Explicit

' === 설정: 필요하면 비밀번호만 바꾸세요 ===
Private Const PWD As String = ""   ' 예: "deoksin123" (빈 문자열이면 무암호)

' 편집모드활성: 모든 워크시트 보호 해제
Public Sub 편집모드활성()
    Dim sh As Object, cnt As Long
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error Resume Next

    For Each sh In ThisWorkbook.Sheets
        If TypeOf sh Is Worksheet Then
            sh.Unprotect Password:=PWD
            cnt = cnt + 1
        End If
    Next sh

    On Error GoTo 0
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox cnt & "개 시트의 보호를 해제했습니다.", vbInformation
End Sub

' 편집모드비활성: 모든 워크시트 보호 (매크로는 편집 가능, 필터/정렬/피벗/그룹 허용)
Public Sub 편집모드비활성()
    Dim sh As Object, ws As Worksheet, cnt As Long
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error Resume Next

    For Each sh In ThisWorkbook.Sheets
        If TypeOf sh Is Worksheet Then
            Set ws = sh

            ' 이미 필터가 켜져 있으면 보호 후에도 사용 가능 (AllowFiltering:=True)
            ' 그룹/윤곽 사용을 위해 EnableOutlining + UserInterfaceOnly 사용
            ws.Protect Password:=PWD, _
                       UserInterfaceOnly:=True, _
                       AllowFiltering:=True, _
                       AllowSorting:=True, _
                       AllowUsingPivotTables:=True, _
                       AllowFormattingCells:=False, _
                       AllowFormattingColumns:=False, _
                       AllowFormattingRows:=False

            ws.EnableOutlining = True    ' 그룹/윤곽 허용
            cnt = cnt + 1
        End If
    Next sh

    On Error GoTo 0
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox cnt & "개 시트에 보호를 설정했습니다." & vbCrLf & _
          "(매크로는 편집 가능 / 필터·정렬·피벗·그룹 허용)", vbInformation
End Sub


