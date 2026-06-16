from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("employees/", views.employees_list, name="employees-list"),
    path("logs/", views.logs_list, name="logs-list"),
    path("auth/employee/", views.employee_login, name="employee-login"),
    path("employees/<str:public_id>/logs/", views.employee_logs, name="employee-logs"),
    path("gate-qr/", views.gate_qr, name="gate-qr"),
    path("attendance/scan/", views.attendance_scan, name="attendance-scan"),
]
