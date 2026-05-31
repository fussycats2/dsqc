Attribute VB_Name = "frmDatePicker"
Attribute VB_Base = "0{F64FE701-9A9D-442D-A74C-2308822D8D8C}{12064676-030D-4892-A025-AB6DBE8EC5E9}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
Option Explicit

Public targetCell As Range

Private curY As Long, curM As Long
Private DayBtns As Collection     ' CBtn 핸들러 모음
Private Btns As Collection        ' 실제 CommandButton 컨트롤 모음(참조 보관용)

' === 고정 공휴일 사전 ===
Private HolidayDict As Object     ' Scripting.Dictionary, key: CLng(Date), val: HolidayName

' 레이아웃 설정(원하면 숫자 조정 가능)
Private Const MARGIN_LEFT As Single = 12
Private Const MARGIN_TOP As Single = 34
Private Const CELL_W As Single = 32
Private Const CELL_H As Single = 24
Private Const gap As Single = 3

Private Sub UserForm_Initialize()
    curY = Year(Date)
    curM = Month(Date)
    Set DayBtns = New Collection
    Set Btns = New Collection

    ' 고정 공휴일 로딩(연도 변경 시에도 호출)
    LoadFixedHolidays curY

    ' 요일 라벨 생성 (일~토)
    Dim i As Long, lbl As MSForms.Label, dayNames As Variant
    dayNames = Array("일", "월", "화", "수", "목", "금", "토")
    For i = 0 To 6
        Set lbl = Me.Controls.Add("Forms.Label.1", "lblW" & i, True)
        With lbl
            .Caption = dayNames(i)
            .Left = MARGIN_LEFT + i * (CELL_W + gap)
            .Top = MARGIN_TOP - CELL_H - 2
            .Width = CELL_W
            .Height = CELL_H - 6
            .TextAlign = fmTextAlignCenter
            If i = 0 Then .ForeColor = RGB(192, 0, 0)      ' 일: 빨간
            If i = 6 Then .ForeColor = RGB(0, 0, 192)      ' 토: 파란
        End With
    Next i

    ' 6행 x 7열 = 42개의 날짜 버튼 생성 (이벤트는 클래스 CBtn 통해 처리)
    Dim r As Long, c As Long, idx As Long
    For r = 0 To 5
        For c = 0 To 6
            idx = r * 7 + c + 1
            Dim cb As MSForms.CommandButton
            Dim h As CBtn
            Set cb = Me.Controls.Add("Forms.CommandButton.1", "d" & idx, True)
            With cb
                .Width = CELL_W
                .Height = CELL_H
                .Left = MARGIN_LEFT + c * (CELL_W + gap)
                .Top = MARGIN_TOP + r * (CELL_H + gap)
                .Caption = ""
                .Enabled = False
                .TakeFocusOnClick = False
            End With
            Set h = New CBtn
            Set h.btn = cb
            Set h.Owner = Me
            DayBtns.Add h
            Btns.Add cb
        Next c
    Next r

    ' 헤더 라벨(폼에 lblMonth 라벨이 있다고 가정)
    lblMonth.Caption = Format(DateSerial(curY, curM, 1), "yyyy-mm")

    RenderCalendar
End Sub

' 달력 그리기/갱신
Private Sub RenderCalendar()
    Dim firstDay As Date, firstDow As Long, daysInMonth As Long
    Dim i As Long, d As Long, colIdx As Long
    firstDay = DateSerial(curY, curM, 1)
    firstDow = Weekday(firstDay, vbSunday)   ' 1=일, 7=토
    daysInMonth = Day(DateSerial(curY, curM + 1, 0))

    lblMonth.Caption = Format(firstDay, "yyyy-mm")

    For i = 1 To 42
        Dim cb As MSForms.CommandButton
        Set cb = Btns(i)

        d = i - (firstDow - 1) ' 달력 시작 오프셋 보정
        If d >= 1 And d <= daysInMonth Then
            cb.Caption = CStr(d)
            cb.Enabled = True
            cb.Tag = CStr(d)
            cb.BackColor = &H8000000F    ' 기본 테마색
            cb.Font.Bold = False
            cb.ControlTipText = ""       ' 툴팁 초기화

            ' 주말 색
            colIdx = ((i - 1) Mod 7) + 1
            If colIdx = 1 Then
                cb.ForeColor = RGB(192, 0, 0)   ' 일
            ElseIf colIdx = 7 Then
                cb.ForeColor = RGB(0, 0, 192)   ' 토
            Else
                cb.ForeColor = RGB(0, 0, 0)
            End If

            ' === 고정 공휴일 반영 ===
            Dim dt As Date, hName As String
            dt = DateSerial(curY, curM, d)
            If Not HolidayDict Is Nothing Then
                If HolidayDict.Exists(CLng(dt)) Then
                    hName = CStr(HolidayDict(CLng(dt)))
                    cb.ForeColor = RGB(192, 0, 0) ' 휴일은 빨간
                    cb.ControlTipText = hName     ' 툴팁에 휴일명
                    ' 오늘이자 휴일이면 더 강조
                    If dt = Date Then
                        cb.BackColor = RGB(255, 230, 230)
                        cb.Font.Bold = True
                    End If
                End If
            End If

            ' 오늘 강조(휴일이 아닌 경우 기본 강조)
            If dt = Date And cb.ControlTipText = "" Then
                cb.BackColor = RGB(255, 255, 204)
                cb.Font.Bold = True
            End If

        Else
            cb.Caption = ""
            cb.Enabled = False
            cb.Tag = ""
            cb.BackColor = &HF0F0F0
            cb.ForeColor = RGB(128, 128, 128)
            cb.Font.Bold = False
            cb.ControlTipText = ""
        End If
    Next i
End Sub

' 날짜 선택 처리(CBtn에서 호출)
Public Sub PickDay(ByVal btn As MSForms.CommandButton)
    If Len(btn.Caption) = 0 Then Exit Sub
    Dim dt As Date
    dt = DateSerial(curY, curM, CLng(btn.Caption))
    If Not targetCell Is Nothing Then
        targetCell.Value = dt
        targetCell.NumberFormat = "mm-dd(aaa)"   ' 필요 시 변경
    End If
    Unload Me
End Sub

' 네비게이션
Private Sub btnPrev_Click()
    curM = curM - 1
    If curM < 1 Then
        curM = 12
        curY = curY - 1
        LoadFixedHolidays curY
    End If
    RenderCalendar
End Sub

Private Sub btnNext_Click()
    curM = curM + 1
    If curM > 12 Then
        curM = 1
        curY = curY + 1
        LoadFixedHolidays curY
    End If
    RenderCalendar
End Sub

Private Sub btnToday_Click()
    curY = Year(Date): curM = Month(Date)
    LoadFixedHolidays curY
    RenderCalendar
End Sub

Private Sub btnClear_Click()
    If Not targetCell Is Nothing Then
        targetCell.ClearContents
    End If
    Unload Me
End Sub

' ===== 고정 공휴일 유틸 =====
Private Sub LoadFixedHolidays(ByVal yearVal As Long)
    Set HolidayDict = CreateObject("Scripting.Dictionary")
    ' 대한민국 대표 고정 공휴일(양력)
    AddHoliday HolidayDict, DateSerial(yearVal, 1, 1), "신정"
    AddHoliday HolidayDict, DateSerial(yearVal, 3, 1), "삼일절"
    AddHoliday HolidayDict, DateSerial(yearVal, 5, 1), "노동절"
    AddHoliday HolidayDict, DateSerial(yearVal, 5, 5), "어린이날"
    AddHoliday HolidayDict, DateSerial(yearVal, 6, 6), "현충일"
    AddHoliday HolidayDict, DateSerial(yearVal, 8, 15), "광복절"
    AddHoliday HolidayDict, DateSerial(yearVal, 10, 3), "개천절"
    AddHoliday HolidayDict, DateSerial(yearVal, 10, 9), "한글날"
    AddHoliday HolidayDict, DateSerial(yearVal, 12, 25), "성탄절"
    ' ※ 노동절(5/1)은 법정 공휴일이 아니므로 제외(필요시 추가해서 쓰세요)
End Sub

Private Sub AddHoliday(ByRef dict As Object, ByVal d As Date, ByVal name As String)
    Dim k As Long: k = CLng(d)
    If Not dict.Exists(k) Then
        dict.Add k, name
    Else
        dict(k) = CStr(dict(k)) & ", " & name
    End If
End Sub

