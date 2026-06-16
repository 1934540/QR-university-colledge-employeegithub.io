import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class Organization(models.TextChoices):
    UNIVERSITY = "university", "University"
    PEDCOLLEGE = "pedcollege", "Pedagogical college"
    MEDCOLLEGE = "medcollege", "Medical college"


class EmployeeRole(models.TextChoices):
    TEACHER = "teacher", "Teacher"
    STAFF = "staff", "Staff"
    STUDENT = "student", "Student"


class AttendanceStatus(models.TextChoices):
    NORMAL = "normal", "On time"
    LATE = "late", "Late"
    CRITICAL = "critical", "Critical"
    VIP = "vip", "VIP"
    EXCUSED = "excused", "Excused"


class GateQr(models.Model):
    code = models.CharField(max_length=120, unique=True, default="BOLASHAQ-MAIN-GATE-01")
    title = models.CharField(max_length=160, default="Main gate")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return f"{self.title} ({self.code})"


class Employee(models.Model):
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    public_id = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=16, choices=EmployeeRole.choices, default=EmployeeRole.STAFF)
    organization = models.CharField(max_length=32, choices=Organization.choices, default=Organization.UNIVERSITY)
    department = models.CharField(max_length=255, blank=True)
    student_group = models.CharField(max_length=80, blank=True)
    username = models.CharField(max_length=80, unique=True)
    password_hash = models.CharField(max_length=255)
    avatar = models.URLField(blank=True)
    is_vip = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.public_id})"

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)


class Schedule(models.Model):
    employee = models.ForeignKey(Employee, related_name="schedules", on_delete=models.CASCADE)
    day = models.PositiveSmallIntegerField()
    subject = models.CharField(max_length=255)
    start_time = models.TimeField()
    end_time = models.TimeField()
    group = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["employee__name", "day", "start_time"]

    def __str__(self):
        return f"{self.employee.name}: {self.subject}"


class AttendanceLog(models.Model):
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    employee = models.ForeignKey(Employee, related_name="attendance_logs", on_delete=models.CASCADE)
    gate = models.ForeignKey(GateQr, null=True, blank=True, on_delete=models.SET_NULL)
    date = models.DateField()
    check_in_time = models.TimeField()
    check_out_time = models.TimeField(null=True, blank=True)
    work_duration = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=16, choices=AttendanceStatus.choices, default=AttendanceStatus.NORMAL)
    details = models.TextField(blank=True)
    is_excused = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-check_in_time"]
        constraints = [
            models.UniqueConstraint(fields=["employee", "date"], name="one_attendance_log_per_employee_day"),
        ]

    def __str__(self):
        return f"{self.employee.name} {self.date}"
