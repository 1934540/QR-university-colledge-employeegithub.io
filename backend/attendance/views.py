from django.conf import settings
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import AttendanceLog, Employee, GateQr
from .services import parse_gate_qr, register_scan


def require_admin_api_key(request):
    if not settings.BOLASHAQ_REQUIRE_ADMIN_API_KEY:
        return None

    expected_key = settings.BOLASHAQ_ADMIN_API_KEY
    provided_key = request.headers.get("X-Bolashaq-Admin-Key", "").strip()
    if expected_key and provided_key == expected_key:
        return None

    return Response({"detail": "Admin API key is required."}, status=status.HTTP_401_UNAUTHORIZED)


def employee_to_dict(employee):
    return {
        "id": employee.public_id,
        "uid": str(employee.uid),
        "name": employee.name,
        "role": employee.role,
        "organization": employee.organization,
        "department": employee.department,
        "studentGroup": employee.student_group,
        "username": employee.username,
        "avatar": employee.avatar,
        "isVip": employee.is_vip,
        "isActive": employee.is_active,
        "schedules": [
            {
                "day": schedule.day,
                "subject": schedule.subject,
                "startTime": schedule.start_time.strftime("%H:%M"),
                "endTime": schedule.end_time.strftime("%H:%M"),
                "group": schedule.group,
            }
            for schedule in employee.schedules.all()
        ],
    }


def log_to_dict(log):
    return {
        "id": str(log.uid),
        "employeeId": log.employee.public_id,
        "employeeUid": str(log.employee.uid),
        "employeeName": log.employee.name,
        "role": log.employee.role,
        "organization": log.employee.organization,
        "date": log.date.isoformat(),
        "checkInTime": log.check_in_time.strftime("%H:%M"),
        "checkOutTime": log.check_out_time.strftime("%H:%M") if log.check_out_time else "",
        "workDuration": log.work_duration,
        "status": log.status,
        "details": log.details,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True, "service": "BolashaqQR API"})


@api_view(["GET"])
@permission_classes([AllowAny])
def employees_list(request):
    auth_error = require_admin_api_key(request)
    if auth_error:
        return auth_error

    employees = Employee.objects.filter(is_active=True).prefetch_related("schedules")
    return Response({"employees": [employee_to_dict(employee) for employee in employees]})


@api_view(["GET"])
@permission_classes([AllowAny])
def logs_list(request):
    auth_error = require_admin_api_key(request)
    if auth_error:
        return auth_error

    logs = AttendanceLog.objects.select_related("employee").all()[:300]
    return Response({"logs": [log_to_dict(log) for log in logs]})


@api_view(["POST"])
@permission_classes([AllowAny])
def employee_login(request):
    username = str(request.data.get("username", "")).strip().lower()
    password = str(request.data.get("password", ""))

    if not username or not password:
        return Response({"detail": "Введите логин и пароль."}, status=status.HTTP_400_BAD_REQUEST)

    employee = Employee.objects.filter(username__iexact=username, is_active=True).prefetch_related("schedules").first()
    if not employee or not employee.check_password(password):
        return Response({"detail": "Неверный логин или пароль."}, status=status.HTTP_401_UNAUTHORIZED)

    return Response({"employee": employee_to_dict(employee)})


@api_view(["GET"])
@permission_classes([AllowAny])
def employee_logs(request, public_id):
    auth_error = require_admin_api_key(request)
    if auth_error:
        return auth_error

    employee = Employee.objects.filter(public_id=public_id, is_active=True).first()
    if not employee:
        return Response({"detail": "Сотрудник не найден."}, status=status.HTTP_404_NOT_FOUND)

    logs = employee.attendance_logs.select_related("employee").all()[:100]
    return Response({"logs": [log_to_dict(log) for log in logs]})


@api_view(["GET"])
@permission_classes([AllowAny])
def gate_qr(request):
    gate = GateQr.objects.filter(is_active=True).first()
    if not gate:
        gate = GateQr.objects.create(code="BOLASHAQ-MAIN-GATE-01", title="Main gate")
    return Response({"code": gate.code, "title": gate.title})


@api_view(["POST"])
@permission_classes([AllowAny])
def attendance_scan(request):
    employee_id = str(request.data.get("employeeId") or request.data.get("employee_id") or "").strip()
    employee_uid = str(request.data.get("employeeUid") or request.data.get("employee_uid") or "").strip()
    qr_payload = str(request.data.get("qrPayload") or request.data.get("qr_payload") or "").strip()
    scanned_at_raw = request.data.get("scannedAt") or request.data.get("scanned_at")

    employee_query = Employee.objects.filter(is_active=True)
    employee = None
    if employee_uid:
        employee = employee_query.filter(uid=employee_uid).first()
    if not employee and employee_id:
        employee = employee_query.filter(public_id=employee_id).first()

    if not employee:
        return Response({"detail": "Сотрудник не найден."}, status=status.HTTP_404_NOT_FOUND)

    gate = parse_gate_qr(qr_payload)
    if not gate:
        return Response({"detail": "Неверный QR входа."}, status=status.HTTP_400_BAD_REQUEST)

    scanned_at = parse_datetime(scanned_at_raw) if scanned_at_raw else None
    log, event_type = register_scan(employee, gate, scanned_at=scanned_at)
    return Response({
        "eventType": event_type,
        "employee": employee_to_dict(employee),
        "log": log_to_dict(log),
    })
