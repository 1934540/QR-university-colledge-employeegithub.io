from django.contrib import admin

from .models import AttendanceLog, Employee, GateQr, Schedule


class ScheduleInline(admin.TabularInline):
    model = Schedule
    extra = 0


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("public_id", "name", "role", "organization", "username", "is_vip", "is_active")
    list_filter = ("organization", "role", "is_vip", "is_active")
    search_fields = ("public_id", "uid", "name", "username", "department", "student_group")
    readonly_fields = ("uid", "created_at", "updated_at")
    inlines = [ScheduleInline]


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ("employee", "day", "subject", "start_time", "end_time", "group")
    list_filter = ("day", "employee__organization")
    search_fields = ("employee__name", "subject", "group")


@admin.register(GateQr)
class GateQrAdmin(admin.ModelAdmin):
    list_display = ("title", "code", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("title", "code")


@admin.register(AttendanceLog)
class AttendanceLogAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "check_in_time", "check_out_time", "status", "work_duration")
    list_filter = ("date", "status", "employee__organization", "employee__role")
    search_fields = ("uid", "employee__name", "employee__public_id", "details")
    readonly_fields = ("uid", "created_at", "updated_at")
