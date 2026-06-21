"""
apps/radio/admin.py
───────────────────
Django admin registrations for the radio app.
Add your Frequencies and Shows here after running migrations.
"""

from django.contrib import admin
from .models import Frequency, Show, RadioSlot


@admin.register(Frequency)
class FrequencyAdmin(admin.ModelAdmin):
    list_display  = ["name", "frequency_mhz", "band", "is_active", "created_at"]
    list_filter   = ["band", "is_active"]
    search_fields = ["name"]
    ordering      = ["band", "frequency_mhz"]


@admin.register(Show)
class ShowAdmin(admin.ModelAdmin):
    list_display  = ["name", "show_type", "is_active", "created_at"]
    list_filter   = ["show_type", "is_active"]
    search_fields = ["name"]
    ordering      = ["name"]


@admin.register(RadioSlot)
class RadioSlotAdmin(admin.ModelAdmin):
    list_display  = [
        "show_name", "frequency_name", "presenter_name",
        "start_datetime", "end_datetime", "status", "reminded_30min",
    ]
    list_filter   = ["status", "frequency", "show__show_type"]
    search_fields = ["show_name", "presenter_name", "frequency_name"]
    ordering      = ["-start_datetime"]
    readonly_fields = [
        "show_name", "frequency_name", "presenter_name",
        "show_type", "duration_minutes", "created_at", "updated_at",
    ]
    date_hierarchy = "start_datetime"

    @admin.display(description="Duration (min)")
    def duration_minutes(self, obj):
        return obj.duration_minutes
