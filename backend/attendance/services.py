from datetime import datetime, time, timedelta

from django.utils import timezone

from .models import AttendanceLog, AttendanceStatus, EmployeeRole, GateQr


WORKDAY_START = time(9, 0)


def parse_gate_qr(payload):
    text = str(payload or "").strip()
    if not text:
        return None

    accepted = {"BOLASHAQ-MAIN-GATE", "BOLASHAQ-MAIN-GATE-01"}
    if text in accepted:
        return GateQr.objects.filter(code="BOLASHAQ-MAIN-GATE-01", is_active=True).first()

    if text.startswith("BOLASHAQ-MAIN-GATE:"):
        return GateQr.objects.filter(code="BOLASHAQ-MAIN-GATE-01", is_active=True).first()

    return GateQr.objects.filter(code=text, is_active=True).first()


def minutes_since_midnight(value):
    return value.hour * 60 + value.minute


def format_duration(check_in, check_out):
    start = datetime.combine(timezone.localdate(), check_in)
    end = datetime.combine(timezone.localdate(), check_out)
    if end < start:
        end += timedelta(days=1)

    minutes = int((end - start).total_seconds() // 60)
    hours = minutes // 60
    rest = minutes % 60
    return f"{hours} ч. {rest} мин."


def calculate_status(employee, scan_time, scan_date):
    if employee.is_vip:
        return AttendanceStatus.VIP, "VIP сотрудник: проход засчитан без опоздания."

    if employee.role == EmployeeRole.STUDENT:
        group = employee.student_group or employee.department
        return AttendanceStatus.NORMAL, f"Студент {group}: вход зафиксирован."

    scan_minutes = minutes_since_midnight(scan_time)

    active_schedule = employee.schedules.filter(day=scan_date.weekday() + 1).order_by("start_time").first()
    if active_schedule:
        start_minutes = minutes_since_midnight(active_schedule.start_time)
        diff = scan_minutes - start_minutes
        if diff > 10:
            return (
                AttendanceStatus.CRITICAL,
                f"Критическое опоздание на {diff} мин. к занятию {active_schedule.subject}.",
            )
        if diff > 0:
            return AttendanceStatus.LATE, f"Опоздание на {diff} мин. к занятию {active_schedule.subject}."
        return AttendanceStatus.NORMAL, f"Прибыл вовремя к занятию {active_schedule.subject}."

    start_minutes = minutes_since_midnight(WORKDAY_START)
    diff = scan_minutes - start_minutes
    if diff > 0:
        return AttendanceStatus.LATE, f"Опоздание на {diff} мин. относительно начала дня."

    return AttendanceStatus.NORMAL, "Прибыл вовремя к началу рабочего дня."


def register_scan(employee, gate, scanned_at=None):
    scanned_at = scanned_at or timezone.localtime()
    scan_date = scanned_at.date()
    scan_time = scanned_at.time().replace(second=0, microsecond=0)

    log = AttendanceLog.objects.filter(employee=employee, date=scan_date).first()
    if not log:
        status, details = calculate_status(employee, scan_time, scan_date)
        log = AttendanceLog.objects.create(
            employee=employee,
            gate=gate,
            date=scan_date,
            check_in_time=scan_time,
            status=status,
            details=details,
        )
        return log, "in"

    if not log.check_out_time:
        log.check_out_time = scan_time
        log.work_duration = format_duration(log.check_in_time, scan_time)
        if log.gate_id is None:
            log.gate = gate
        log.save(update_fields=["check_out_time", "work_duration", "gate", "updated_at"])
        return log, "out"

    return log, "complete"
