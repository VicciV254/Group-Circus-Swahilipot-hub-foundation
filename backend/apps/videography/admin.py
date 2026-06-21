from django.contrib import admin
from .models import ShootBooking, Footage


@admin.register(ShootBooking)
class ShootBookingAdmin(admin.ModelAdmin):
    list_display  = ['title', 'requested_by', 'shoot_date', 'status', 'created_at']
    list_filter   = ['status', 'shoot_date']
    search_fields = ['title', 'requested_by__email']
    ordering      = ['-created_at']


@admin.register(Footage)
class FootageAdmin(admin.ModelAdmin):
    list_display = ['filename', 'booking', 'uploaded_by', 'file_size_mb', 'created_at']
    ordering     = ['-created_at']
