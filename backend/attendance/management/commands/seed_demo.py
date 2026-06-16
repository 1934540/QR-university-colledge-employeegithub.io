from datetime import time

from django.core.management.base import BaseCommand

from attendance.models import Employee, EmployeeRole, GateQr, Organization, Schedule


EMPLOYEES = [
    {
        "public_id": "EMP001",
        "name": "Askarov Daniyar",
        "role": EmployeeRole.TEACHER,
        "organization": Organization.UNIVERSITY,
        "department": "Information Technology Department",
        "username": "emp001",
        "password": "emp001",
        "schedules": [
            {"day": 1, "subject": "Databases", "start_time": time(9, 0), "end_time": time(10, 30)},
            {"day": 1, "subject": "Algorithms", "start_time": time(11, 0), "end_time": time(12, 30)},
        ],
    },
    {
        "public_id": "EMP002",
        "name": "Smagulova Aliya",
        "role": EmployeeRole.TEACHER,
        "organization": Organization.UNIVERSITY,
        "department": "Mathematics Department",
        "username": "emp002",
        "password": "emp002",
        "schedules": [
            {"day": 1, "subject": "Higher Mathematics", "start_time": time(10, 0), "end_time": time(11, 30)},
        ],
    },
    {
        "public_id": "EMP004",
        "name": "Nurlanova Dina",
        "role": EmployeeRole.STAFF,
        "organization": Organization.UNIVERSITY,
        "department": "Registrar office",
        "username": "emp004",
        "password": "emp004",
        "schedules": [],
    },
    {
        "public_id": "EMP005",
        "name": "Kozhakhmetov Bolat",
        "role": EmployeeRole.STAFF,
        "organization": Organization.UNIVERSITY,
        "department": "Rectorate",
        "username": "emp005",
        "password": "emp005",
        "is_vip": True,
        "schedules": [],
    },
]


class Command(BaseCommand):
    help = "Seed demo data for BolashaqQR"

    def handle(self, *args, **options):
        GateQr.objects.update_or_create(
            code="BOLASHAQ-MAIN-GATE-01",
            defaults={"title": "Main gate", "is_active": True},
        )

        for source in EMPLOYEES:
            data = source.copy()
            schedules = data.pop("schedules")
            password = data.pop("password")
            employee, created = Employee.objects.update_or_create(
                public_id=data["public_id"],
                defaults=data,
            )
            if created or not employee.password_hash:
                employee.set_password(password)
                employee.save(update_fields=["password_hash"])

            Schedule.objects.filter(employee=employee).delete()
            for schedule in schedules:
                Schedule.objects.create(employee=employee, **schedule)

        self.stdout.write(self.style.SUCCESS("Seeded BolashaqQR demo data."))
