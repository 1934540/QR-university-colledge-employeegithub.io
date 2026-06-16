from django.core.management import call_command
from django.test import override_settings
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AttendanceLog, Employee


class AttendanceApiTests(TestCase):
    def setUp(self):
        call_command("seed_demo", verbosity=0)
        self.client = APIClient()

    def test_employee_login_returns_unique_uid(self):
        response = self.client.post(
            "/api/auth/employee/",
            {"username": "emp001", "password": "emp001"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["employee"]["id"], "EMP001")
        self.assertTrue(response.data["employee"]["uid"])

    def test_gate_qr_scan_creates_check_in(self):
        employee = Employee.objects.get(public_id="EMP001")

        response = self.client.post(
            "/api/attendance/scan/",
            {"employeeUid": str(employee.uid), "qrPayload": "BOLASHAQ-MAIN-GATE-01"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["eventType"], "in")
        self.assertEqual(AttendanceLog.objects.filter(employee=employee).count(), 1)

    def test_second_gate_qr_scan_creates_check_out(self):
        employee = Employee.objects.get(public_id="EMP001")
        payload = {"employeeId": "EMP001", "qrPayload": "BOLASHAQ-MAIN-GATE-01"}

        self.client.post("/api/attendance/scan/", payload, format="json")
        response = self.client.post("/api/attendance/scan/", payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["eventType"], "out")
        self.assertTrue(response.data["log"]["checkOutTime"])

    def test_invalid_qr_is_rejected(self):
        response = self.client.post(
            "/api/attendance/scan/",
            {"employeeId": "EMP001", "qrPayload": "WRONG"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(BOLASHAQ_REQUIRE_ADMIN_API_KEY=True, BOLASHAQ_ADMIN_API_KEY="test-key")
    def test_employees_list_requires_admin_api_key_when_enabled(self):
        response = self.client.get("/api/employees/")

        self.assertEqual(response.status_code, 401)

    @override_settings(BOLASHAQ_REQUIRE_ADMIN_API_KEY=True, BOLASHAQ_ADMIN_API_KEY="test-key")
    def test_employees_list_accepts_admin_api_key_when_enabled(self):
        response = self.client.get("/api/employees/", HTTP_X_BOLASHAQ_ADMIN_KEY="test-key")

        self.assertEqual(response.status_code, 200)
        self.assertIn("employees", response.data)

    @override_settings(BOLASHAQ_REQUIRE_ADMIN_API_KEY=True, BOLASHAQ_ADMIN_API_KEY="test-key")
    def test_public_scan_still_works_when_admin_api_key_is_enabled(self):
        employee = Employee.objects.get(public_id="EMP001")
        response = self.client.post(
            "/api/attendance/scan/",
            {"employeeUid": str(employee.uid), "qrPayload": "BOLASHAQ-MAIN-GATE-01"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
